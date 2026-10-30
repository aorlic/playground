import { ProgramDependencyGraphBuilder } from './ProgramDependencyGraphBuilder';
import { PDGVectorizer } from './vectorization/PDGVectorizer';
import * as path from 'path';

/**
 * Demo: Build PDG, vectorize it, and perform semantic search
 *
 * Prerequisites:
 * 1. Install Ollama: https://ollama.com
 * 2. Pull BGE-M3 model: ollama pull bge-m3
 * 3. Start Ollama service: ollama serve
 */
async function main() {
  const codebasePath = path.join(__dirname, '..');

  console.log('=== PDG Vectorization Demo ===\n');
  console.log(`Analyzing codebase at: ${codebasePath}\n`);

  try {
    // ========================================
    // Step 1: Build the PDG with metrics
    // ========================================
    console.log('Step 1: Building Program Dependency Graph...\n');

    const builder = new ProgramDependencyGraphBuilder(codebasePath);
    const pdg = builder.build();

    const stats = builder.getStats();
    console.log('PDG Statistics:');
    console.log(`  Total Nodes: ${stats.totalNodes}`);
    console.log(`  Total Edges: ${stats.totalEdges}`);
    console.log('\nNodes by Type:');
    Object.entries(stats.nodesByType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
    console.log('');

    // ========================================
    // Step 2: Vectorize and store in LanceDB
    // ========================================
    console.log('\nStep 2: Vectorizing PDG with BGE-M3...\n');

    const vectorizer = new PDGVectorizer();
    await vectorizer.initialize();
    await vectorizer.vectorizeAndStore(pdg);

    // ========================================
    // Step 3: Semantic search examples
    // ========================================
    console.log('\n=== Semantic Search Examples ===\n');

    // Example 1: Search for embedding-related code
    console.log('Example 1: Search for "embedding generation code"');
    const results1 = await vectorizer.search('embedding generation code', 5);
    vectorizer.displayResults(results1);

    // Example 2: Search for graph building
    console.log('\nExample 2: Search for "build dependency graph"');
    const results2 = await vectorizer.search('build dependency graph', 5);
    vectorizer.displayResults(results2);

    // Example 3: Search for metrics calculation
    console.log('\nExample 3: Search for "calculate code complexity metrics"');
    const results3 = await vectorizer.search('calculate code complexity metrics', 5);
    vectorizer.displayResults(results3);

    // Example 4: Search with complexity filter
    console.log('\nExample 4: Search for "process data" with low complexity (< 10)');
    const results4 = await vectorizer.searchWithFilter(
      'process data',
      { maxComplexity: 10 },
      5
    );
    vectorizer.displayResults(results4);

    // ========================================
    // Cleanup
    // ========================================
    await vectorizer.close();

    console.log('=== Demo Complete ===\n');
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);

    if (error.message.includes('Ollama')) {
      console.error('\nMake sure:');
      console.error('1. Ollama is installed: https://ollama.com');
      console.error('2. BGE-M3 model is pulled: ollama pull bge-m3');
      console.error('3. Ollama service is running: ollama serve');
    }

    process.exit(1);
  }
}

main();
