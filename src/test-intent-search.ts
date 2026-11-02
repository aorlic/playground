import { PDGVectorizer } from './vectorization/PDGVectorizer';

/**
 * Test intent-based search with conversational queries
 */
async function testIntentSearch() {
  console.log('=== Testing Intent-Based Search ===\n');

  // Initialize vectorizer with intent analysis enabled
  const vectorizer = new PDGVectorizer(
    'http://127.0.0.1:11434',
    'bge-m3',
    './data/pdg_vectors',  // Correct path
    true  // Enable intent analysis
  );

  await vectorizer.initialize();
  await vectorizer.loadExisting();

  console.log('\n=== Testing Conversational Queries ===\n');

  // Test queries that previously had poor results
  const testQueries = [
    {
      query: 'I want to add a new quality metric related with cohesion',
      expectation: 'Should find calculateMetrics, calculateLCOM, LCOM-related code'
    },
    {
      query: 'add support for payments via PayPal',
      expectation: 'Should identify payment integration needs (even if not in codebase)'
    },
    {
      query: 'calculate complexity of functions and classes',
      expectation: 'Should find calculateMetrics, complexity calculation code'
    },
    {
      query: 'search code using semantic embeddings',
      expectation: 'Should find embedder, vectorizer, search methods'
    },
    {
      query: 'parse TypeScript files and extract information',
      expectation: 'Should find ProgramDependencyGraphBuilder, parsing methods'
    }
  ];

  for (const test of testQueries) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📍 Query: "${test.query}"`);
    console.log(`Expected: ${test.expectation}`);
    console.log('='.repeat(80));

    const results = await vectorizer.search(test.query, 5);

    if (results.length === 0) {
      console.log('❌ No results found\n');
      continue;
    }

    console.log(`\n✓ Found ${results.length} results:\n`);

    results.forEach((result, i) => {
      const similarity = (1 - result._distance) * 100;
      const relevant = similarity > 20 ? '✅' : similarity > 10 ? '⚠️' : '❌';

      console.log(`${i + 1}. ${relevant} ${result.name}`);
      console.log(`   Location: ${result.filePath}:${result.startLine}`);
      console.log(`   Similarity: ${similarity.toFixed(1)}% (distance: ${result._distance.toFixed(3)})`);

      if (result.cyclomaticComplexity !== null) {
        console.log(`   Complexity: ${result.cyclomaticComplexity}`);
      }

      if (result.maintainabilityIndex !== null) {
        console.log(`   Maintainability: ${result.maintainabilityIndex.toFixed(1)}`);
      }

      console.log('');
    });
  }

  await vectorizer.close();

  console.log('\n=== Summary ===\n');
  console.log('Intent-based search completed!');
  console.log('The LLM extracted intents and expanded queries with technical keywords.');
  console.log('This should significantly improve results for conversational queries.\n');
}

testIntentSearch().catch(console.error);
