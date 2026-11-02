import { ProgramDependencyGraphBuilder } from './ProgramDependencyGraphBuilder';
import { PDGVectorizer } from './vectorization/PDGVectorizer';
import * as path from 'path';
import * as readline from 'readline';

/**
 * Interactive Demo: Build PDG, vectorize it, and perform semantic search
 *
 * Prerequisites:
 * 1. Install Ollama: https://ollama.com
 * 2. Pull BGE-M3 model: ollama pull bge-m3
 * 3. Start Ollama service: ollama serve
 */

/**
 * Create readline interface for user input
 */
function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompt user for input
 */
function promptUser(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

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
    // Step 3: Interactive semantic search
    // ========================================
    console.log('\n=== Interactive Semantic Search ===\n');
    console.log('You can now search the codebase using natural language queries.');
    console.log('Examples:');
    console.log('  - "embedding generation code"');
    console.log('  - "build dependency graph"');
    console.log('  - "calculate code complexity metrics"');
    console.log('  - "payment processing"');
    console.log('\nType "quit" or "exit" to stop.\n');

    const rl = createReadlineInterface();

    // Interactive search loop
    let continueSearching = true;
    while (continueSearching) {
      const query = await promptUser(rl, 'Enter search query: ');

      // Check for exit commands
      if (query.toLowerCase() === 'quit' || query.toLowerCase() === 'exit' || query === '') {
        continueSearching = false;
        break;
      }

      // Ask for number of results
      const limitInput = await promptUser(rl, 'Number of results (default 5): ');
      const limit = limitInput ? parseInt(limitInput, 10) : 5;

      if (isNaN(limit) || limit < 1) {
        console.log('Invalid number, using default: 5\n');
      }

      // Ask if user wants to filter by complexity
      const filterInput = await promptUser(rl, 'Filter by max complexity? (leave empty to skip): ');
      const maxComplexity = filterInput ? parseInt(filterInput, 10) : undefined;

      console.log(''); // Empty line before results

      // Perform search
      try {
        let results;
        if (maxComplexity !== undefined && !isNaN(maxComplexity)) {
          results = await vectorizer.searchWithFilter(
            query,
            { maxComplexity },
            limit
          );
        } else {
          results = await vectorizer.search(query, limit);
        }

        vectorizer.displayResults(results);
      } catch (error: any) {
        console.error('Search error:', error.message);
        console.log('');
      }
    }

    // ========================================
    // Cleanup
    // ========================================
    rl.close();
    await vectorizer.close();

    console.log('\n=== Demo Complete ===\n');
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
