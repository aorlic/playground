import { ProgramDependencyGraph, VectorizedNode, SearchResult } from '../types';
import { NodeSerializer } from './NodeSerializer';
import { BGEM3Embedder } from './BGEM3Embedder';
import { VectorStore } from './VectorStore';

/**
 * Main orchestrator for PDG vectorization and semantic search
 *
 * Workflow:
 * 1. Serialize PDG nodes to rich text
 * 2. Generate embeddings using BGE-M3 via Ollama
 * 3. Store vectors in LanceDB for fast search
 */
export class PDGVectorizer {
  private serializer: NodeSerializer;
  private embedder: BGEM3Embedder;
  private store: VectorStore;

  constructor(
    ollamaUrl?: string,
    modelName?: string,
    dbPath?: string
  ) {
    this.serializer = new NodeSerializer();
    this.embedder = new BGEM3Embedder(ollamaUrl, modelName);
    this.store = new VectorStore(dbPath);
  }

  /**
   * Initialize all components
   */
  async initialize(): Promise<void> {
    console.log('=== Initializing PDG Vectorizer ===\n');

    await this.embedder.initialize();
    await this.store.initialize();

    console.log('\n✓ PDG Vectorizer ready\n');
  }

  /**
   * Vectorize and store the entire PDG
   */
  async vectorizeAndStore(pdg: ProgramDependencyGraph): Promise<void> {
    console.log('=== Vectorizing PDG ===\n');

    // Step 1: Serialize nodes
    console.log('Step 1: Serializing nodes...');
    const serialized = this.serializer.serializeAll(pdg);
    console.log(`✓ Serialized ${serialized.length} nodes (classes, methods, functions)\n`);

    if (serialized.length === 0) {
      throw new Error('No nodes to vectorize. PDG may be empty or contain only statements.');
    }

    // Step 2: Generate embeddings
    console.log('Step 2: Generating embeddings with BGE-M3...');
    console.log(`  Processing ${serialized.length} nodes in batches of 4`);

    const startTime = Date.now();

    const embeddings = await this.embedder.embedBatch(
      serialized.map((n) => n.text),
      {
        batchSize: 4,
        onProgress: (current, total) => {
          const percent = ((current / total) * 100).toFixed(1);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          process.stdout.write(`  Progress: ${current}/${total} (${percent}%) - ${elapsed}s\r`);
        },
      }
    );

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✓ Generated ${embeddings.length} embeddings in ${totalTime}s\n`);

    // Step 3: Prepare records for LanceDB
    console.log('Step 3: Preparing vectorized nodes...');
    const vectorized: VectorizedNode[] = serialized.map((node, i) => ({
      nodeId: node.nodeId,
      vector: new Float32Array(embeddings[i]),
      text: node.text,
      name: node.metadata.name,
      code: node.metadata.code,
      filePath: node.metadata.filePath,
      startLine: node.metadata.location.startLine,
      endLine: node.metadata.location.endLine,
      cyclomaticComplexity: node.metadata.metrics?.cyclomaticComplexity ?? null,
      maintainabilityIndex: node.metadata.metrics?.maintainabilityIndex ?? null,
      halsteadVolume: node.metadata.metrics?.halsteadVolume ?? null,
      dependencies: JSON.stringify(node.metadata.dependencies),
      callers: JSON.stringify(node.metadata.callers),
      keywords: JSON.stringify(node.metadata.keywords),
      isPublic: node.metadata.isPublic ? 1 : 0,
      isExported: node.metadata.isExported ? 1 : 0,
    }));

    console.log(`✓ Prepared ${vectorized.length} vectorized nodes\n`);

    // Step 4: Store in LanceDB
    console.log('Step 4: Storing in LanceDB...');
    await this.store.indexPDG(vectorized);

    console.log('\n=== Vectorization Complete ===\n');

    // Show statistics
    const stats = await this.store.getStats();
    console.log('Database Statistics:');
    console.log(`  Total nodes: ${stats.totalNodes}`);
    console.log(`  Avg complexity: ${stats.avgComplexity.toFixed(2)}`);
    console.log(`  Avg maintainability: ${stats.avgMaintainability.toFixed(2)}`);
    console.log('');
  }

  /**
   * Load existing vector database
   */
  async loadExisting(): Promise<void> {
    console.log('Loading existing vector database...');
    await this.embedder.initialize();
    await this.store.initialize();
    await this.store.loadTable();
    console.log('✓ Loaded existing database\n');
  }

  /**
   * Search for code related to a query
   */
  async search(query: string, limit = 10): Promise<SearchResult[]> {
    console.log(`\nSearching for: "${query}"\n`);

    // Generate query embedding
    const queryEmbedding = await this.embedder.embed(query);

    // Search vector store
    const results = await this.store.search(new Float32Array(queryEmbedding), limit);

    return results;
  }

  /**
   * Search with complexity/maintainability filters
   */
  async searchWithFilter(
    query: string,
    filter: {
      maxComplexity?: number;
      minMaintainability?: number;
      filePath?: string;
    },
    limit = 10
  ): Promise<SearchResult[]> {
    console.log(`\nSearching for: "${query}" with filters`);
    console.log(`Filters:`, filter);
    console.log('');

    // Generate query embedding
    const queryEmbedding = await this.embedder.embed(query);

    // Search with filters
    const results = await this.store.searchWithFilter(
      new Float32Array(queryEmbedding),
      filter,
      limit
    );

    return results;
  }

  /**
   * Display search results in a readable format
   */
  displayResults(results: SearchResult[]): void {
    if (results.length === 0) {
      console.log('No results found.\n');
      return;
    }

    console.log(`Found ${results.length} results:\n`);

    results.forEach((result, i) => {
      console.log(`${i + 1}. ${result.name}`);
      console.log(`   File: ${result.filePath}:${result.startLine}-${result.endLine}`);
      console.log(`   Similarity: ${(1 - result._distance).toFixed(4)} (distance: ${result._distance.toFixed(4)})`);

      if (result.cyclomaticComplexity !== null) {
        console.log(`   Complexity: ${result.cyclomaticComplexity}`);
      }

      if (result.maintainabilityIndex !== null) {
        console.log(`   Maintainability: ${result.maintainabilityIndex.toFixed(2)}`);
      }

      // Show code snippet (first 100 chars)
      const codeSnippet = result.code.substring(0, 100).replace(/\n/g, ' ');
      console.log(`   Code: ${codeSnippet}${result.code.length > 100 ? '...' : ''}`);
      console.log('');
    });
  }

  /**
   * Test the embedder
   */
  async test(): Promise<void> {
    await this.embedder.initialize();
    await this.embedder.test();
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    await this.store.close();
  }
}
