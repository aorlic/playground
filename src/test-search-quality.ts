import { ProgramDependencyGraphBuilder } from './ProgramDependencyGraphBuilder';
import { PDGVectorizer } from './vectorization/PDGVectorizer';

/**
 * Test search quality with semantic annotations
 */
async function testSearchQuality() {
  console.log('=== Building PDG with Semantic Annotations ===\n');

  const codebasePath = process.cwd();
  const builder = new ProgramDependencyGraphBuilder(codebasePath);
  const pdg = builder.build();

  console.log(`Built PDG with ${pdg.nodes.size} nodes\n`);

  // Initialize vectorizer
  const vectorizer = new PDGVectorizer();
  await vectorizer.initialize();

  // Vectorize and store
  await vectorizer.vectorizeAndStore(pdg);

  console.log('\n=== Testing Search Queries ===\n');

  // Test queries that previously had poor results
  const testQueries = [
    {
      query: 'code quality metrics and cohesion',
      expectation: 'Should find calculateMetrics, calculateLCOM, metrics-related code'
    },
    {
      query: 'parse TypeScript code and build graph',
      expectation: 'Should find ProgramDependencyGraphBuilder, build method'
    },
    {
      query: 'generate embeddings from text',
      expectation: 'Should find BGEM3Embedder, embed methods'
    },
    {
      query: 'vector database search and indexing',
      expectation: 'Should find VectorStore, search/index methods'
    },
    {
      query: 'calculate complexity of code',
      expectation: 'Should find calculateMetrics with complexity calculations'
    }
  ];

  for (const test of testQueries) {
    console.log(`\n📍 Query: "${test.query}"`);
    console.log(`Expected: ${test.expectation}\n`);

    const results = await vectorizer.search(test.query, 5);

    if (results.length === 0) {
      console.log('❌ No results found\n');
      continue;
    }

    results.forEach((result, i) => {
      const similarity = (1 - result._distance) * 100;
      const relevant = similarity > 20 ? '✅' : '❓';

      console.log(`${i + 1}. ${relevant} ${result.name}`);
      console.log(`   File: ${result.filePath}:${result.startLine}`);
      console.log(`   Similarity: ${similarity.toFixed(1)}%`);

      if (result.cyclomaticComplexity !== null) {
        console.log(`   Complexity: ${result.cyclomaticComplexity}`);
      }
    });

    console.log('');
  }

  await vectorizer.close();
}

testSearchQuality().catch(console.error);
