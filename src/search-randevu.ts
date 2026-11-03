import { PDGVectorizer } from './vectorization/PDGVectorizer';
import * as readline from 'readline';

/**
 * Interactive search for randevu-backend codebase
 */
async function searchRandevu() {
  console.log('=== Randevu Backend Semantic Search ===\n');

  const vectorizer = new PDGVectorizer(
    'http://127.0.0.1:11434',
    'bge-m3',
    './data/randevu_vectors',
    true  // Enable intent analysis
  );

  await vectorizer.initialize();
  await vectorizer.loadExisting();

  console.log('Database loaded! Ready to search.\n');
  console.log('Type your query or "quit" to exit.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const promptUser = (query: string): Promise<string> => {
    return new Promise((resolve) => rl.question(query, resolve));
  };

  let continueSearching = true;

  while (continueSearching) {
    const query = await promptUser('\n🔍 Search query: ');

    if (query.trim() === '' || query.toLowerCase() === 'quit' || query.toLowerCase() === 'exit') {
      continueSearching = false;
      break;
    }

    const limitInput = await promptUser('Number of results (default 5): ');
    const limit = parseInt(limitInput) || 5;

    try {
      const results = await vectorizer.search(query, limit);

      if (results.length === 0) {
        console.log('\n❌ No results found.\n');
        continue;
      }

      console.log(`\n✓ Found ${results.length} results:\n`);

      results.forEach((result, i) => {
        const similarity = (1 - result._distance) * 100;
        const icon = similarity > 20 ? '✅' : similarity > 10 ? '⚠️' : '❌';

        console.log(`${i + 1}. ${icon} ${result.name}`);
        console.log(`   Location: ${result.filePath}:${result.startLine}`);
        console.log(`   Similarity: ${similarity.toFixed(1)}% (distance: ${result._distance.toFixed(3)})`);

        if (result.cyclomaticComplexity !== null) {
          console.log(`   Complexity: ${result.cyclomaticComplexity}`);
        }

        if (result.maintainabilityIndex !== null) {
          console.log(`   Maintainability: ${result.maintainabilityIndex.toFixed(1)}`);
        }

        // Show code preview (first 100 chars)
        const codePreview = result.code.substring(0, 100).replace(/\n/g, ' ');
        console.log(`   Code: ${codePreview}...`);
        console.log('');
      });
    } catch (error: any) {
      console.log(`\n❌ Error: ${error.message}\n`);
    }
  }

  rl.close();
  await vectorizer.close();

  console.log('\n👋 Goodbye!\n');
}

searchRandevu().catch(console.error);
