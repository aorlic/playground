import {
  PDGNode,
  PDGEdge,
  PDGNodeType,
  PDGEdgeType,
  ProgramDependencyGraph,
  SerializedNode,
} from '../types';

/**
 * Serializes PDG nodes into rich text representations for embedding
 */
export class NodeSerializer {
  /**
   * Serialize all relevant nodes (classes, methods, functions)
   */
  serializeAll(pdg: ProgramDependencyGraph): SerializedNode[] {
    const serialized: SerializedNode[] = [];

    for (const [nodeId, node] of pdg.nodes) {
      // Only serialize classes, methods, and functions (skip statements)
      if (
        node.type === PDGNodeType.CLASS ||
        node.type === PDGNodeType.METHOD ||
        node.type === PDGNodeType.FUNCTION
      ) {
        serialized.push(this.serializeNode(node, pdg));
      }
    }

    return serialized;
  }

  /**
   * Serialize a single PDG node into rich text
   */
  serializeNode(node: PDGNode, pdg: ProgramDependencyGraph): SerializedNode {
    const dependencies = this.getDependencyNames(node.id, pdg);
    const callers = this.getCallerNames(node.id, pdg);
    const keywords = this.extractKeywords(node);

    // Build rich text representation (up to 8192 tokens for BGE-M3)
    const text = this.buildTextRepresentation(node, dependencies, callers, keywords);

    return {
      nodeId: node.id,
      type: node.type,
      text,
      metadata: {
        name: node.name,
        filePath: node.filePath,
        location: {
          startLine: node.startLine,
          endLine: node.endLine,
        },
        code: node.code,
        metrics: node.metadata?.metrics,
        dependencies: dependencies.ids,
        callers: callers.ids,
        keywords,
        isPublic: this.isPublic(node),
        isExported: node.metadata?.isExported ?? false,
      },
    };
  }

  /**
   * Build rich text representation for embedding
   */
  private buildTextRepresentation(
    node: PDGNode,
    dependencies: { ids: string[]; names: string[] },
    callers: { ids: string[]; names: string[] },
    keywords: string[]
  ): string {
    const parts: string[] = [];

    // Header
    parts.push(`Type: ${node.type}`);
    parts.push(`Name: ${node.name}`);
    parts.push(`File: ${node.filePath}:${node.startLine}-${node.endLine}`);

    // Add parameters for methods/functions
    if (node.metadata?.parameters && node.metadata.parameters.length > 0) {
      parts.push(`Parameters: ${node.metadata.parameters.join(', ')}`);
    }

    // Add return type if available
    if (node.metadata?.returnType) {
      parts.push(`Returns: ${node.metadata.returnType}`);
    }

    // Async/Static modifiers
    const modifiers: string[] = [];
    if (node.metadata?.isAsync) modifiers.push('async');
    if (node.metadata?.isStatic) modifiers.push('static');
    if (node.metadata?.isExported) modifiers.push('exported');
    if (modifiers.length > 0) {
      parts.push(`Modifiers: ${modifiers.join(', ')}`);
    }

    parts.push('');  // Empty line

    // Full code
    parts.push('Full Code:');
    parts.push(node.code);
    parts.push('');

    // Metrics
    if (node.metadata?.metrics) {
      const m = node.metadata.metrics;
      parts.push('Metrics:');
      if (m.cyclomaticComplexity !== undefined) {
        parts.push(`- Cyclomatic Complexity: ${m.cyclomaticComplexity}`);
      }
      if (m.maintainabilityIndex !== undefined) {
        parts.push(`- Maintainability Index: ${m.maintainabilityIndex.toFixed(2)}`);
      }
      if (m.halsteadVolume !== undefined) {
        parts.push(`- Halstead Volume: ${m.halsteadVolume.toFixed(2)}`);
      }
      if (m.lcom !== undefined) {
        parts.push(`- LCOM: ${m.lcom.toFixed(4)}`);
      }
      if (m.sloc?.logical !== undefined) {
        parts.push(`- SLOC (logical): ${m.sloc.logical}`);
      }
      parts.push('');
    }

    // Dependencies (what this code calls)
    if (dependencies.names.length > 0) {
      parts.push(`Dependencies (calls): ${dependencies.names.join(', ')}`);
    }

    // Callers (what calls this code)
    if (callers.names.length > 0) {
      parts.push(`Called by: ${callers.names.join(', ')}`);
    }

    // Keywords
    if (keywords.length > 0) {
      parts.push(`Keywords: ${keywords.join(', ')}`);
    }

    return parts.join('\n');
  }

  /**
   * Get dependencies (outgoing calls) from this node
   */
  private getDependencyNames(
    nodeId: string,
    pdg: ProgramDependencyGraph
  ): { ids: string[]; names: string[] } {
    const ids: string[] = [];
    const names: string[] = [];

    // Find all CALL edges from this node
    const callEdges = pdg.edges.filter(
      (edge) => edge.source === nodeId && edge.type === PDGEdgeType.CALL
    );

    for (const edge of callEdges) {
      const targetNode = pdg.nodes.get(edge.target);
      if (targetNode) {
        ids.push(edge.target);
        names.push(targetNode.name);
      }
    }

    return { ids, names };
  }

  /**
   * Get callers (incoming calls) to this node
   */
  private getCallerNames(
    nodeId: string,
    pdg: ProgramDependencyGraph
  ): { ids: string[]; names: string[] } {
    const ids: string[] = [];
    const names: string[] = [];

    // Find all CALL edges to this node
    const callEdges = pdg.edges.filter(
      (edge) => edge.target === nodeId && edge.type === PDGEdgeType.CALL
    );

    for (const edge of callEdges) {
      const sourceNode = pdg.nodes.get(edge.source);
      if (sourceNode) {
        ids.push(edge.source);
        names.push(sourceNode.name);
      }
    }

    return { ids, names };
  }

  /**
   * Extract keywords from node name and code
   */
  private extractKeywords(node: PDGNode): string[] {
    const keywords = new Set<string>();

    // Extract from name (split camelCase and snake_case)
    const nameWords = node.name
      .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase
      .replace(/_/g, ' ')                   // snake_case
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);  // Filter short words

    nameWords.forEach((w) => keywords.add(w));

    // Extract from file path
    const pathParts = node.filePath
      .split('/')
      .pop()
      ?.replace(/\.(ts|js|tsx|jsx)$/, '')
      .toLowerCase();

    if (pathParts) {
      pathParts.split(/[_-]/).forEach((w) => {
        if (w.length > 2) keywords.add(w);
      });
    }

    // Extract from parameters
    if (node.metadata?.parameters) {
      node.metadata.parameters.forEach((param) => {
        const words = param
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 2);
        words.forEach((w) => keywords.add(w));
      });
    }

    return Array.from(keywords).slice(0, 20);  // Limit to 20 keywords
  }

  /**
   * Determine if node is public (heuristic)
   */
  private isPublic(node: PDGNode): boolean {
    // Exported nodes are public
    if (node.metadata?.isExported) return true;

    // Methods/functions starting with underscore are private (convention)
    if (node.name.startsWith('_')) return false;

    // Default: assume public if not explicitly private
    return true;
  }
}
