import { ProgramDependencyGraph, VectorizedNode, SearchResult, IntentAnalysis } from '../types';
import { NodeSerializer } from './NodeSerializer';
import { BGEM3Embedder } from './BGEM3Embedder';
import { VectorStore } from './VectorStore';
import { IntentAnalyzer } from '../IntentAnalyzer';
import { HybridSearcher } from '../HybridSearcher';

/**
 * Main orchestrator for PDG vectorization and semantic search
 *
 * Workflow:
 * 1. Serialize PDG nodes to rich text
 * 2. Generate embeddings using BGE-M3 via Ollama
 * 3. Store vectors in LanceDB for fast search
 * 4. (Optional) Use IntentAnalyzer for query expansion
 * 5. Re-rank with hybrid search (semantic + keyword + metadata)
 */
export class PDGVectorizer {
  private serializer: NodeSerializer;
  private embedder: BGEM3Embedder;
  private store: VectorStore;
  private intentAnalyzer?: IntentAnalyzer;
  private hybridSearcher: HybridSearcher;

  constructor(
    ollamaUrl?: string,
    modelName?: string,
    dbPath?: string,
    enableIntentAnalysis: boolean = true
  ) {
    this.serializer = new NodeSerializer();
    this.embedder = new BGEM3Embedder(ollamaUrl, modelName);
    this.store = new VectorStore(dbPath);
    this.hybridSearcher = new HybridSearcher();

    if (enableIntentAnalysis) {
      this.intentAnalyzer = new IntentAnalyzer(ollamaUrl);
    }
  }

  /**
   * Initialize all components
   */
  async initialize(): Promise<void> {
    console.log('=== Initializing PDG Vectorizer ===\n');

    await this.embedder.initialize();
    await this.store.initialize();

    if (this.intentAnalyzer) {
      await this.intentAnalyzer.initialize();
    }

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

    if (this.intentAnalyzer) {
      await this.intentAnalyzer.initialize();
    }

    console.log('✓ Loaded existing database\n');
  }

  /**
   * Search for code related to a query (with optional intent analysis)
   */
  async search(query: string, limit = 10): Promise<SearchResult[]> {
    console.log(`\nSearching for: "${query}"\n`);

    // If intent analyzer is available, use intent-based search
    if (this.intentAnalyzer) {
      return await this.searchWithIntents(query, limit);
    }

    // Otherwise, use simple search with re-ranking
    const queryEmbedding = await this.embedder.embed(query);
    const results = await this.store.search(new Float32Array(queryEmbedding), limit * 2); // Get more for re-ranking

    // Apply hybrid re-ranking
    const reranked = this.hybridSearcher.rerank(results, query);

    return reranked.slice(0, limit);
  }

  /**
   * Search using intent analysis and query expansion
   */
  async searchWithIntents(query: string, limit = 10): Promise<SearchResult[]> {
    console.log('Analyzing query intent...\n');

    // Analyze the query to extract intents
    const analysis = await this.intentAnalyzer!.analyzeQuery(query);

    if (analysis.intents.length === 0) {
      console.log('⚠ No intents extracted, falling back to simple search\n');
      const queryEmbedding = await this.embedder.embed(query);
      return await this.store.search(new Float32Array(queryEmbedding), limit);
    }

    // Display extracted intents
    console.log(`Extracted ${analysis.intents.length} intent(s):\n`);
    analysis.intents.forEach((intent, i) => {
      console.log(`${i + 1}. ${intent.type.toUpperCase()}: ${intent.description}`);
      console.log(`   Keywords: ${intent.keywords.slice(0, 5).join(', ')}`);
    });
    console.log('');

    // Search for each intent and combine results
    const allResults: Map<string, SearchResult & { score: number }> = new Map();

    for (let i = 0; i < analysis.intents.length; i++) {
      const intent = analysis.intents[i];

      // Create expanded query from intent
      const expandedQuery = this.buildExpandedQuery(intent);

      // Search with expanded query
      const queryEmbedding = await this.embedder.embed(expandedQuery);
      const results = await this.store.search(new Float32Array(queryEmbedding), limit * 2);

      // Add results with weighted scores
      const intentWeight = 1.0 / (i + 1); // First intent gets more weight

      results.forEach(result => {
        const existing = allResults.get(result.nodeId);
        const similarity = 1 - result._distance;
        const weightedScore = similarity * intentWeight;

        if (existing) {
          // If result already exists, boost its score
          existing.score += weightedScore;
        } else {
          // Add new result
          allResults.set(result.nodeId, {
            ...result,
            score: weightedScore,
          });
        }
      });
    }

    // Sort by combined score and take top results
    const rankedResults = Array.from(allResults.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit * 2) // Get more candidates for re-ranking
      .map(({ score, ...result }) => result);

    // Apply hybrid re-ranking
    const reranked = this.hybridSearcher.rerank(rankedResults, query);

    // Return top N after re-ranking
    return reranked.slice(0, limit);
  }

  /**
   * Build expanded query from intent
   */
  private buildExpandedQuery(intent: any): string {
    const parts: string[] = [];

    parts.push(intent.description);

    if (intent.keywords) {
      parts.push(intent.keywords.join(' '));
    }

    if (intent.technicalTerms) {
      parts.push(intent.technicalTerms.join(' '));
    }

    if (intent.relatedConcepts) {
      parts.push(intent.relatedConcepts.join(' '));
    }

    return parts.join(' ');
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

    results.forEach((result: any, i) => {
      const similarity = (1 - result._distance) * 100;
      const icon = similarity > 30 ? '✅' : similarity > 20 ? '⚠️' : '❌';

      console.log(`${i + 1}. ${icon} ${result.name}`);
      console.log(`   File: ${result.filePath}:${result.startLine}-${result.endLine}`);
      console.log(`   Similarity: ${similarity.toFixed(1)}% (distance: ${result._distance.toFixed(3)})`);

      // Show hybrid score if available
      if (result._hybridScore) {
        console.log(`   Hybrid Score: ${(result._hybridScore * 100).toFixed(1)}%`);
      }

      if (result.cyclomaticComplexity !== null) {
        console.log(`   Complexity: ${result.cyclomaticComplexity}, MI: ${result.maintainabilityIndex?.toFixed(1)}`);
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
