import * as lancedb from '@lancedb/lancedb';
import { VectorizedNode, SearchResult } from '../types';

/**
 * Vector store using LanceDB for persistent storage and fast ANN search
 */
export class VectorStore {
  private db: any;
  private table: any;
  private dbPath: string;

  constructor(dbPath = './data/pdg_vectors') {
    this.dbPath = dbPath;
  }

  /**
   * Initialize connection to LanceDB
   */
  async initialize(): Promise<void> {
    try {
      this.db = await lancedb.connect(this.dbPath);
      console.log(`✓ LanceDB connected at: ${this.dbPath}`);
    } catch (error: any) {
      throw new Error(`Failed to connect to LanceDB: ${error.message}`);
    }
  }

  /**
   * Index PDG nodes in LanceDB
   */
  async indexPDG(nodes: VectorizedNode[]): Promise<void> {
    if (nodes.length === 0) {
      throw new Error('No nodes to index');
    }

    console.log(`Indexing ${nodes.length} nodes in LanceDB...`);

    try {
      // Create or overwrite table
      this.table = await this.db.createTable('pdg_nodes', nodes, {
        mode: 'overwrite',
      });

      console.log('✓ Table created');

      // Create vector index for fast ANN search
      // IVF-PQ: Inverted File Index with Product Quantization
      await this.table.createIndex('vector', {
        config: lancedb.Index.ivfPq({
          numPartitions: Math.min(256, Math.floor(nodes.length / 10)),
          numSubVectors: 96,
        }),
      });

      console.log('✓ Vector index created');
      console.log(`✓ Indexed ${nodes.length} nodes`);
    } catch (error: any) {
      throw new Error(`Failed to index nodes: ${error.message}`);
    }
  }

  /**
   * Load existing table
   */
  async loadTable(): Promise<void> {
    try {
      this.table = await this.db.openTable('pdg_nodes');
      console.log('✓ Loaded existing PDG table');
    } catch (error: any) {
      throw new Error(`Failed to load table: ${error.message}`);
    }
  }

  /**
   * Search for similar nodes using vector similarity
   */
  async search(queryVector: Float32Array, limit = 10): Promise<SearchResult[]> {
    if (!this.table) {
      throw new Error('Table not loaded. Call indexPDG() or loadTable() first.');
    }

    try {
      const results = await this.table
        .search(Array.from(queryVector))
        .limit(limit)
        .execute();

      return results.map((row: any) => ({
        nodeId: row.nodeId,
        name: row.name,
        filePath: row.filePath,
        startLine: row.startLine,
        endLine: row.endLine,
        code: row.code,
        cyclomaticComplexity: row.cyclomaticComplexity,
        maintainabilityIndex: row.maintainabilityIndex,
        _distance: row._distance,  // Lower = more similar
      }));
    } catch (error: any) {
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  /**
   * Search with metadata filtering
   */
  async searchWithFilter(
    queryVector: Float32Array,
    filter: {
      maxComplexity?: number;
      minMaintainability?: number;
      filePath?: string;
    },
    limit = 10
  ): Promise<SearchResult[]> {
    if (!this.table) {
      throw new Error('Table not loaded. Call indexPDG() or loadTable() first.');
    }

    try {
      let query = this.table.search(Array.from(queryVector));

      // Apply filters
      const filters: string[] = [];

      if (filter.maxComplexity !== undefined) {
        filters.push(`cyclomaticComplexity <= ${filter.maxComplexity}`);
      }

      if (filter.minMaintainability !== undefined) {
        filters.push(`maintainabilityIndex >= ${filter.minMaintainability}`);
      }

      if (filter.filePath) {
        filters.push(`filePath LIKE '%${filter.filePath}%'`);
      }

      if (filters.length > 0) {
        query = query.where(filters.join(' AND '));
      }

      const results = await query.limit(limit).execute();

      return results.map((row: any) => ({
        nodeId: row.nodeId,
        name: row.name,
        filePath: row.filePath,
        startLine: row.startLine,
        endLine: row.endLine,
        code: row.code,
        cyclomaticComplexity: row.cyclomaticComplexity,
        maintainabilityIndex: row.maintainabilityIndex,
        _distance: row._distance,
      }));
    } catch (error: any) {
      throw new Error(`Filtered search failed: ${error.message}`);
    }
  }

  /**
   * Get statistics about the indexed data
   */
  async getStats(): Promise<{
    totalNodes: number;
    avgComplexity: number;
    avgMaintainability: number;
  }> {
    if (!this.table) {
      throw new Error('Table not loaded');
    }

    try {
      const count = await this.table.countRows();

      // Sample nodes to calculate averages (LanceDB doesn't have aggregation yet)
      const sample = await this.table.limit(1000).execute();

      let totalComplexity = 0;
      let totalMaintainability = 0;
      let complexityCount = 0;
      let maintainabilityCount = 0;

      for (const row of sample) {
        if (row.cyclomaticComplexity !== null) {
          totalComplexity += row.cyclomaticComplexity;
          complexityCount++;
        }
        if (row.maintainabilityIndex !== null) {
          totalMaintainability += row.maintainabilityIndex;
          maintainabilityCount++;
        }
      }

      return {
        totalNodes: count,
        avgComplexity: complexityCount > 0 ? totalComplexity / complexityCount : 0,
        avgMaintainability: maintainabilityCount > 0 ? totalMaintainability / maintainabilityCount : 0,
      };
    } catch (error: any) {
      throw new Error(`Failed to get stats: ${error.message}`);
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      // LanceDB doesn't require explicit close in current version
      this.db = null;
      this.table = null;
      console.log('✓ LanceDB connection closed');
    }
  }
}
