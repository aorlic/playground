/**
 * Types of nodes in the Program Dependency Graph
 */
export enum PDGNodeType {
  CLASS = 'class',
  METHOD = 'method',
  FUNCTION = 'function',
  STATEMENT = 'statement',
  VARIABLE_DECLARATION = 'variable_declaration',
  PARAMETER = 'parameter',
}

/**
 * Types of edges (dependencies) in the Program Dependency Graph
 */
export enum PDGEdgeType {
  CONTROL_FLOW = 'control_flow',      // Control dependencies (if, while, for, etc.)
  DATA_FLOW = 'data_flow',            // Data dependencies (variable usage)
  CALL = 'call',                      // Method/function calls
  CONTAINS = 'contains',              // Structural containment (class contains method)
}

/**
 * Code complexity metrics
 */
export interface CodeMetrics {
  cyclomaticComplexity?: number;      // Cyclomatic Complexity (CC)
  maintainabilityIndex?: number;      // Maintainability Index (MI)
  halsteadVolume?: number;            // Halstead Volume
  halsteadDifficulty?: number;        // Halstead Difficulty
  halsteadEffort?: number;            // Halstead Effort
  lcom?: number;                      // Lack of Cohesion of Methods (for classes)
  sloc?: {                            // Source Lines of Code
    physical?: number;
    logical?: number;
  };
}

/**
 * Represents a node in the Program Dependency Graph
 */
export interface PDGNode {
  id: string;
  type: PDGNodeType;
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  code: string;
  metadata?: {
    isAsync?: boolean;
    isStatic?: boolean;
    isExported?: boolean;
    parameters?: string[];
    returnType?: string;
    variables?: string[];  // Variables declared/used in this node
    metrics?: CodeMetrics;  // Code complexity metrics
  };
}

/**
 * Represents an edge (dependency) in the Program Dependency Graph
 */
export interface PDGEdge {
  id: string;
  type: PDGEdgeType;
  source: string;  // Source node ID
  target: string;  // Target node ID
  label?: string;  // Optional label (e.g., variable name for data flow)
}

/**
 * The complete Program Dependency Graph structure
 */
export interface ProgramDependencyGraph {
  nodes: Map<string, PDGNode>;
  edges: PDGEdge[];
}

// ============================================
// Vectorization Types
// ============================================

/**
 * Serialized node for embedding
 */
export interface SerializedNode {
  nodeId: string;
  type: PDGNodeType;
  text: string;  // Rich text representation for embedding
  metadata: {
    name: string;
    filePath: string;
    location: {
      startLine: number;
      endLine: number;
    };
    code: string;
    metrics?: CodeMetrics;
    dependencies: string[];  // Node IDs
    callers: string[];       // Node IDs
    keywords: string[];
    isPublic: boolean;
    isExported: boolean;
  };
}

/**
 * Vectorized node ready for storage
 */
export interface VectorizedNode {
  nodeId: string;
  vector: Float32Array;  // 1024-dim for BGE-M3
  text: string;
  name: string;
  code: string;
  filePath: string;
  startLine: number;
  endLine: number;
  cyclomaticComplexity: number | null;
  maintainabilityIndex: number | null;
  halsteadVolume: number | null;
  dependencies: string;  // JSON stringified
  callers: string;       // JSON stringified
  keywords: string;      // JSON stringified
  isPublic: number;      // 0/1 for SQLite compatibility
  isExported: number;    // 0/1 for SQLite compatibility
}

/**
 * Search result from vector store
 */
export interface SearchResult {
  nodeId: string;
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  code: string;
  cyclomaticComplexity: number | null;
  maintainabilityIndex: number | null;
  _distance: number;  // Similarity score (lower = more similar)
}
