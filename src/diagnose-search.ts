import { PDGVectorizer } from './vectorization/PDGVectorizer';

/**
 * Diagnose search quality for randevu-backend
 */
async function diagnoseSearch() {
  console.log('=== Search Quality Diagnostics ===\n');

  const vectorizer = new PDGVectorizer(
    'http://127.0.0.1:11434',
    'bge-m3',
    './data/randevu_vectors',
    true  // Enable intent analysis
  );

  await vectorizer.initialize();
  await vectorizer.loadExisting();

  // Test queries with known expected results
  const testCases = [
    {
      query: 'payment processing',
      expected: 'Should find payment-related classes/methods',
    },
    {
      query: 'API gateway routing',
      expected: 'Should find gateway routing logic',
    },
    {
      query: 'cache management',
      expected: 'Should find r-cacher library code',
    },
    {
      query: 'domain models',
      expected: 'Should find r-domain classes',
    },
    {
      query: 'database queries',
      expected: 'Should find database access code',
    },
    {
      query: 'authentication and authorization',
      expected: 'Should find auth-related code',
    },
  ];

  for (const testCase of testCases) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Query: "${testCase.query}"`);
    console.log(`Expected: ${testCase.expected}`);
    console.log('='.repeat(80));

    const results = await vectorizer.search(testCase.query, 10);

    if (results.length === 0) {
      console.log('\n❌ NO RESULTS FOUND\n');
      continue;
    }

    console.log(`\nTop 10 Results:\n`);

    results.forEach((result, i) => {
      const similarity = (1 - result._distance) * 100;
      const icon = similarity > 25 ? '✅' : similarity > 15 ? '⚠️' : '❌';

      console.log(`${i + 1}. ${icon} ${result.name} (${similarity.toFixed(1)}%)`);
      console.log(`   ${result.filePath}:${result.startLine}`);

      if (result.cyclomaticComplexity !== null) {
        console.log(`   CC: ${result.cyclomaticComplexity}, MI: ${result.maintainabilityIndex?.toFixed(1)}`);
      }

      // Show first 150 chars of code
      const preview = result.code.substring(0, 150).replace(/\n/g, ' ');
      console.log(`   Code: ${preview}...`);
    });

    // Analyze similarity distribution
    const avgSimilarity = results.reduce((sum, r) => sum + (1 - r._distance), 0) / results.length * 100;
    const maxSimilarity = Math.max(...results.map(r => (1 - r._distance) * 100));
    const minSimilarity = Math.min(...results.map(r => (1 - r._distance) * 100));

    console.log(`\n📊 Similarity Stats:`);
    console.log(`   Max: ${maxSimilarity.toFixed(1)}%`);
    console.log(`   Avg: ${avgSimilarity.toFixed(1)}%`);
    console.log(`   Min: ${minSimilarity.toFixed(1)}%`);

    // Check if results are good
    if (maxSimilarity < 20) {
      console.log(`\n⚠️  WARNING: Low similarity scores! All results < 20%`);
    }
  }

  console.log(`\n\n${'='.repeat(80)}`);
  console.log('DIAGNOSIS SUMMARY');
  console.log('='.repeat(80));

  // Get database stats
  const dbStats = await vectorizer['store'].getStats();
  console.log(`\nDatabase Info:`);
  console.log(`  Total nodes: ${dbStats.totalNodes}`);
  console.log(`  Avg complexity: ${dbStats.avgComplexity.toFixed(2)}`);
  console.log(`  Avg maintainability: ${dbStats.avgMaintainability.toFixed(2)}`);

  // Sample a few nodes to check their text representation
  console.log(`\n\nSample Node Analysis (checking text quality):\n`);

  const sampleResults = await vectorizer.search('class', 3);

  for (const result of sampleResults) {
    console.log(`\n--- ${result.name} ---`);
    console.log(`File: ${result.filePath}`);
    console.log(`Code length: ${result.code.length} chars`);

    // The 'text' field contains the full serialized representation
    // We can't access it directly from SearchResult, so we'll infer from code
    const hasMetrics = result.cyclomaticComplexity !== null;
    const hasComplexity = result.cyclomaticComplexity !== null && result.cyclomaticComplexity > 0;

    console.log(`Has metrics: ${hasMetrics ? '✓' : '✗'}`);
    console.log(`Complexity value: ${result.cyclomaticComplexity ?? 'none'}`);
  }

  await vectorizer.close();

  console.log(`\n\n${'='.repeat(80)}`);
  console.log('RECOMMENDATIONS');
  console.log('='.repeat(80));
  console.log(`
1. Check if semantic annotations are being extracted properly
2. Verify that BGE-M3 embeddings capture code semantics
3. Consider if the codebase has enough comments/JSDoc
4. Test with more specific technical queries
5. Check if vector index is properly configured
6. Verify that node serialization includes enough context
  `);
}

diagnoseSearch().catch(console.error);
