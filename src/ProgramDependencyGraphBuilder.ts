import { Project, SourceFile, Node, SyntaxKind, ts } from 'ts-morph';
import * as path from 'path';
import {
  PDGNode,
  PDGEdge,
  PDGNodeType,
  PDGEdgeType,
  ProgramDependencyGraph,
  CodeMetrics,
} from './types';

// Import typhonjs-escomplex using require for CommonJS compatibility
const escomplex = require('typhonjs-escomplex');

/**
 * Builds a Program Dependency Graph from a TypeScript/JavaScript codebase
 */
export class ProgramDependencyGraphBuilder {
  private project: Project;
  private nodes: Map<string, PDGNode>;
  private edges: PDGEdge[];
  private nodeIdCounter: number;
  private edgeIdCounter: number;
  private variableScope: Map<string, string>; // Maps variable names to node IDs

  constructor(private codebasePath: string) {
    this.project = new Project({
      tsConfigFilePath: path.join(codebasePath, 'tsconfig.json'),
      skipAddingFilesFromTsConfig: false,
    });
    this.nodes = new Map();
    this.edges = [];
    this.nodeIdCounter = 0;
    this.edgeIdCounter = 0;
    this.variableScope = new Map();
  }

  /**
   * Calculate code metrics from a ts-morph AST node
   *
   * Transpiles TypeScript to JavaScript before analysis since typhonjs-escomplex
   * expects JavaScript (ES6), not TypeScript.
   */
  private calculateMetrics(astNode: any): CodeMetrics {
    try {
      const sourceCode = astNode.getText();

      // Transpile TypeScript to JavaScript using the TypeScript compiler
      const jsCode = ts.transpileModule(sourceCode, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.ES2015,
          removeComments: false,
        },
      }).outputText;

      // Analyze the transpiled JavaScript code
      const analysis = escomplex.analyzeModule(jsCode, {
        loc: true,
        newmi: true,
      });

      // Handle different response formats (use any to bypass strict typing)
      const aggregate: any = analysis.aggregate || analysis;
      const maintainability: any = analysis.maintainability !== undefined
        ? analysis.maintainability
        : aggregate.maintainability;

      const metrics: CodeMetrics = {
        cyclomaticComplexity: aggregate.cyclomatic || aggregate.cyclomaticDensity,
        maintainabilityIndex: maintainability,
        halsteadVolume: aggregate.halstead?.volume,
        halsteadDifficulty: aggregate.halstead?.difficulty,
        halsteadEffort: aggregate.halstead?.effort,
        sloc: {
          physical: aggregate.sloc?.physical,
          logical: aggregate.sloc?.logical,
        },
      };

      return metrics;
    } catch (error: any) {
      // If analysis fails, return empty metrics
      // This is expected for isolated methods/statements without full context
      return {};
    }
  }

  /**
   * Calculate LCOM (Lack of Cohesion of Methods) for a class
   */
  private calculateLCOM(classDecl: any): number | undefined {
    try {
      const methods = classDecl.getMethods();
      if (methods.length === 0) return undefined;

      // Track which instance variables each method accesses
      const methodVariableAccess: Map<string, Set<string>> = new Map();
      const instanceVariables = new Set<string>();

      // Collect all instance variables (properties)
      classDecl.getProperties().forEach((prop: any) => {
        if (!prop.isStatic()) {
          instanceVariables.add(prop.getName());
        }
      });

      // For each method, find which instance variables it accesses
      methods.forEach((method: any) => {
        const methodName = method.getName();
        const accessedVars = new Set<string>();

        // Find all property access expressions (this.variable)
        const body = method.getBody();
        if (body) {
          const identifiers = body.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
          identifiers.forEach((propAccess: any) => {
            const expression = propAccess.getExpression();
            if (expression.getText() === 'this') {
              const propName = propAccess.getName();
              if (instanceVariables.has(propName)) {
                accessedVars.add(propName);
              }
            }
          });
        }

        methodVariableAccess.set(methodName, accessedVars);
      });

      // Calculate LCOM using Henderson-Sellers method
      // LCOM = (sum of methods not accessing a variable - sum of methods accessing) / (methods * variables)
      let totalAccess = 0;
      let totalNonAccess = 0;

      instanceVariables.forEach((variable) => {
        let accessCount = 0;
        methodVariableAccess.forEach((accessedVars) => {
          if (accessedVars.has(variable)) {
            accessCount++;
          }
        });
        totalAccess += accessCount;
        totalNonAccess += methods.length - accessCount;
      });

      if (instanceVariables.size === 0 || methods.length === 0) {
        return undefined;
      }

      const lcom = (totalNonAccess - totalAccess) / (methods.length * instanceVariables.size);
      return Math.max(0, lcom); // Normalize to [0, 1]
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Parse the codebase and build the PDG
   */
  public build(): ProgramDependencyGraph {
    const sourceFiles = this.project.getSourceFiles();

    for (const sourceFile of sourceFiles) {
      // Skip node_modules and declaration files
      if (
        sourceFile.getFilePath().includes('node_modules') ||
        sourceFile.isDeclarationFile()
      ) {
        continue;
      }

      this.processSourceFile(sourceFile);
    }

    return {
      nodes: this.nodes,
      edges: this.edges,
    };
  }

  /**
   * Process a single source file
   */
  private processSourceFile(sourceFile: SourceFile): void {
    const filePath = sourceFile.getFilePath();

    // Process all classes in the file
    sourceFile.getClasses().forEach((classDecl) => {
      const classNode = this.createClassNode(classDecl, filePath);
      this.nodes.set(classNode.id, classNode);

      // Process methods within the class
      classDecl.getMethods().forEach((method) => {
        const methodNode = this.createMethodNode(method, filePath);
        this.nodes.set(methodNode.id, methodNode);

        // Add containment edge: class contains method
        this.addEdge(PDGEdgeType.CONTAINS, classNode.id, methodNode.id);

        // Process method body
        this.processMethodBody(method, methodNode.id, filePath);
      });
    });

    // Process standalone functions
    sourceFile.getFunctions().forEach((funcDecl) => {
      const funcNode = this.createFunctionNode(funcDecl, filePath);
      this.nodes.set(funcNode.id, funcNode);

      // Process function body
      this.processFunctionBody(funcDecl, funcNode.id, filePath);
    });
  }

  /**
   * Create a class node
   */
  private createClassNode(classDecl: any, filePath: string): PDGNode {
    const name = classDecl.getName() || '<anonymous>';
    const startLine = classDecl.getStartLineNumber();
    const endLine = classDecl.getEndLineNumber();

    // Calculate metrics using the AST node
    const metrics = this.calculateMetrics(classDecl);

    // Calculate LCOM for classes
    const lcom = this.calculateLCOM(classDecl);
    if (lcom !== undefined) {
      metrics.lcom = lcom;
    }

    return {
      id: this.generateNodeId(),
      type: PDGNodeType.CLASS,
      name,
      filePath,
      startLine,
      endLine,
      code: classDecl.getText(),
      metadata: {
        isExported: classDecl.isExported(),
        metrics,
      },
    };
  }

  /**
   * Create a method node
   */
  private createMethodNode(method: any, filePath: string): PDGNode {
    const name = method.getName();
    const startLine = method.getStartLineNumber();
    const endLine = method.getEndLineNumber();
    const parameters = method.getParameters().map((p: any) => p.getName());

    // Calculate metrics using the AST node
    const metrics = this.calculateMetrics(method);

    return {
      id: this.generateNodeId(),
      type: PDGNodeType.METHOD,
      name,
      filePath,
      startLine,
      endLine,
      code: method.getText(),
      metadata: {
        isAsync: method.isAsync(),
        isStatic: method.isStatic(),
        parameters,
        returnType: method.getReturnType()?.getText(),
        metrics,
      },
    };
  }

  /**
   * Create a function node
   */
  private createFunctionNode(funcDecl: any, filePath: string): PDGNode {
    const name = funcDecl.getName() || '<anonymous>';
    const startLine = funcDecl.getStartLineNumber();
    const endLine = funcDecl.getEndLineNumber();
    const parameters = funcDecl.getParameters().map((p: any) => p.getName());

    // Calculate metrics using the AST node
    const metrics = this.calculateMetrics(funcDecl);

    return {
      id: this.generateNodeId(),
      type: PDGNodeType.FUNCTION,
      name,
      filePath,
      startLine,
      endLine,
      code: funcDecl.getText(),
      metadata: {
        isAsync: funcDecl.isAsync(),
        isExported: funcDecl.isExported(),
        parameters,
        returnType: funcDecl.getReturnType()?.getText(),
        metrics,
      },
    };
  }

  /**
   * Process method body for statements and dependencies
   */
  private processMethodBody(method: any, parentId: string, filePath: string): void {
    const body = method.getBody();
    if (!body) return;

    this.processStatements(body, parentId, filePath);
  }

  /**
   * Process function body for statements and dependencies
   */
  private processFunctionBody(funcDecl: any, parentId: string, filePath: string): void {
    const body = funcDecl.getBody();
    if (!body) return;

    this.processStatements(body, parentId, filePath);
  }

  /**
   * Process statements within a block
   */
  private processStatements(block: any, parentId: string, filePath: string): void {
    const statements = block.getStatements ? block.getStatements() : [block];

    for (const statement of statements) {
      const stmtNode = this.createStatementNode(statement, filePath);
      this.nodes.set(stmtNode.id, stmtNode);

      // Add containment edge: parent contains statement
      this.addEdge(PDGEdgeType.CONTAINS, parentId, stmtNode.id);

      // Detect control flow dependencies
      this.detectControlFlowDependencies(statement, stmtNode.id, filePath);

      // Detect data flow dependencies
      this.detectDataFlowDependencies(statement, stmtNode.id);

      // Detect function/method calls
      this.detectCallDependencies(statement, stmtNode.id);
    }
  }

  /**
   * Create a statement node
   */
  private createStatementNode(statement: any, filePath: string): PDGNode {
    const startLine = statement.getStartLineNumber();
    const endLine = statement.getEndLineNumber();
    const kind = statement.getKindName();
    const text = statement.getText();

    let type = PDGNodeType.STATEMENT;
    let name = kind;

    // Identify variable declarations
    if (statement.getKind() === SyntaxKind.VariableStatement) {
      type = PDGNodeType.VARIABLE_DECLARATION;
      const declarations = statement.getDeclarations();
      if (declarations.length > 0) {
        name = declarations[0].getName();
      }
    }

    return {
      id: this.generateNodeId(),
      type,
      name,
      filePath,
      startLine,
      endLine,
      code: text.length > 100 ? text.substring(0, 100) + '...' : text,
    };
  }

  /**
   * Detect control flow dependencies (if, while, for, etc.)
   */
  private detectControlFlowDependencies(
    statement: any,
    stmtNodeId: string,
    filePath: string
  ): void {
    const kind = statement.getKind();

    // Handle if statements
    if (kind === SyntaxKind.IfStatement) {
      const thenStatement = statement.getThenStatement();
      const elseStatement = statement.getElseStatement();

      if (thenStatement) {
        this.processConditionalBlock(thenStatement, stmtNodeId, filePath);
      }
      if (elseStatement) {
        this.processConditionalBlock(elseStatement, stmtNodeId, filePath);
      }
    }

    // Handle loops (for, while, do-while)
    if (
      kind === SyntaxKind.ForStatement ||
      kind === SyntaxKind.WhileStatement ||
      kind === SyntaxKind.DoStatement
    ) {
      const loopBody = statement.getStatement ? statement.getStatement() : null;
      if (loopBody) {
        this.processConditionalBlock(loopBody, stmtNodeId, filePath);
      }
    }

    // Handle switch statements
    if (kind === SyntaxKind.SwitchStatement) {
      const caseBlock = statement.getCaseBlock();
      if (caseBlock) {
        caseBlock.getClauses().forEach((clause: any) => {
          const statements = clause.getStatements();
          statements.forEach((stmt: any) => {
            const childNode = this.createStatementNode(stmt, filePath);
            this.nodes.set(childNode.id, childNode);
            this.addEdge(PDGEdgeType.CONTROL_FLOW, stmtNodeId, childNode.id, 'switch-case');
          });
        });
      }
    }
  }

  /**
   * Process conditional blocks (if/else bodies, loop bodies)
   */
  private processConditionalBlock(block: any, controlNodeId: string, filePath: string): void {
    if (Node.isBlock(block)) {
      block.getStatements().forEach((stmt: any) => {
        const childNode = this.createStatementNode(stmt, filePath);
        this.nodes.set(childNode.id, childNode);
        this.addEdge(PDGEdgeType.CONTROL_FLOW, controlNodeId, childNode.id);

        // Recursively process nested control structures
        this.detectControlFlowDependencies(stmt, childNode.id, filePath);
        this.detectDataFlowDependencies(stmt, childNode.id);
      });
    } else {
      // Single statement without block
      const childNode = this.createStatementNode(block, filePath);
      this.nodes.set(childNode.id, childNode);
      this.addEdge(PDGEdgeType.CONTROL_FLOW, controlNodeId, childNode.id);
    }
  }

  /**
   * Detect data flow dependencies (variable usage)
   */
  private detectDataFlowDependencies(statement: any, stmtNodeId: string): void {
    // Track variable declarations
    if (statement.getKind() === SyntaxKind.VariableStatement) {
      statement.getDeclarations().forEach((decl: any) => {
        const varName = decl.getName();
        this.variableScope.set(varName, stmtNodeId);
      });
    }

    // Find all identifiers (variable usages) in the statement
    const identifiers = statement.getDescendantsOfKind(SyntaxKind.Identifier);

    identifiers.forEach((identifier: any) => {
      const varName = identifier.getText();

      // Check if this variable was declared elsewhere
      const declarationNodeId = this.variableScope.get(varName);
      if (declarationNodeId && declarationNodeId !== stmtNodeId) {
        // Add data flow edge from declaration to usage
        this.addEdge(PDGEdgeType.DATA_FLOW, declarationNodeId, stmtNodeId, varName);
      }
    });
  }

  /**
   * Detect function/method call dependencies
   */
  private detectCallDependencies(statement: any, stmtNodeId: string): void {
    const callExpressions = statement.getDescendantsOfKind(SyntaxKind.CallExpression);

    callExpressions.forEach((callExpr: any) => {
      const expression = callExpr.getExpression();
      let callName = expression.getText();

      // Try to resolve the called function/method
      // This is a simplified approach - full resolution would require more complex symbol tracking
      const matchingNodes = Array.from(this.nodes.values()).filter(
        (node) =>
          (node.type === PDGNodeType.METHOD || node.type === PDGNodeType.FUNCTION) &&
          (node.name === callName || callName.endsWith(`.${node.name}`))
      );

      if (matchingNodes.length > 0) {
        // Add call edge to the first matching node (simplified)
        this.addEdge(PDGEdgeType.CALL, stmtNodeId, matchingNodes[0].id, callName);
      }
    });
  }

  /**
   * Add an edge to the graph
   */
  private addEdge(
    type: PDGEdgeType,
    sourceId: string,
    targetId: string,
    label?: string
  ): void {
    this.edges.push({
      id: this.generateEdgeId(),
      type,
      source: sourceId,
      target: targetId,
      label,
    });
  }

  /**
   * Generate unique node ID
   */
  private generateNodeId(): string {
    return `node_${this.nodeIdCounter++}`;
  }

  /**
   * Generate unique edge ID
   */
  private generateEdgeId(): string {
    return `edge_${this.edgeIdCounter++}`;
  }

  /**
   * Get the built graph
   */
  public getGraph(): ProgramDependencyGraph {
    return {
      nodes: this.nodes,
      edges: this.edges,
    };
  }

  /**
   * Export graph as JSON
   */
  public toJSON(): string {
    return JSON.stringify(
      {
        nodes: Array.from(this.nodes.values()),
        edges: this.edges,
      },
      null,
      2
    );
  }

  /**
   * Get statistics about the graph
   */
  public getStats(): {
    totalNodes: number;
    totalEdges: number;
    nodesByType: Record<string, number>;
    edgesByType: Record<string, number>;
  } {
    const nodesByType: Record<string, number> = {};
    const edgesByType: Record<string, number> = {};

    this.nodes.forEach((node) => {
      nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
    });

    this.edges.forEach((edge) => {
      edgesByType[edge.type] = (edgesByType[edge.type] || 0) + 1;
    });

    return {
      totalNodes: this.nodes.size,
      totalEdges: this.edges.length,
      nodesByType,
      edgesByType,
    };
  }
}
