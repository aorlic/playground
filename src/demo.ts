import { ProgramDependencyGraphBuilder } from './ProgramDependencyGraphBuilder';
import { QualityAnalyzer } from './QualityAnalyzer';
import { TestCoverageAnalyzer } from './TestCoverageAnalyzer';
import { GitRepositoryManager } from './GitRepositoryManager';
import { MonorepoDetector } from './MonorepoDetector';
import * as readline from 'readline';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Demo: Analyze codebase from Git repository or local directory
 */
async function demo() {
  console.log('=== Code Quality Analysis Demo ===\n');

  let projectPath: string;
  let gitManager: GitRepositoryManager | null = null;
  let cloneResult: any = null;

  // Check if Git configuration exists
  if (process.env.GIT_REPO_URL && process.env.GIT_BRANCH) {
    // Use Git repository
    console.log('Using Git repository from .env configuration\n');

    gitManager = new GitRepositoryManager();
    try {
      cloneResult = await gitManager.ensureRepository({
        url: process.env.GIT_REPO_URL,
        branch: process.env.GIT_BRANCH,
        token: process.env.GIT_TOKEN,
        username: process.env.GIT_USERNAME,
        cacheDir: process.env.REPO_CACHE_DIR
      });
      projectPath = cloneResult.repoPath;
    } catch (error: any) {
      console.error('❌ Git Error:', error.message);
      console.log('\nFalling back to current directory...\n');
      projectPath = process.cwd();
      gitManager = null;
    }
  } else {
    // Use current directory (original behavior)
    console.log('No Git configuration found in .env');
    console.log('Analyzing current directory (to use Git, copy .env.example to .env)\n');
    projectPath = process.cwd();
  }

  console.log(`Analyzing project at: ${projectPath}\n`);

  // Detect monorepo structure
  let monorepoInfo;
  try {
    monorepoInfo = MonorepoDetector.detect(projectPath);
    console.log(MonorepoDetector.formatInfo(monorepoInfo));
    console.log('');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (gitManager && cloneResult) {
      await gitManager.cleanup(cloneResult.repoPath);
    }
    process.exit(1);
  }

  // Analyze ALL subprojects and combine results
  const allPdgs: any[] = [];
  let totalNodes = 0;
  let totalEdges = 0;

  console.log('Building Program Dependency Graphs for all subprojects...\n');

  for (const subproject of monorepoInfo.subprojects) {
    console.log(`📦 Analyzing: ${subproject.name}`);
    console.log(`   Path: ${subproject.path}`);

    try {
      const builder = new ProgramDependencyGraphBuilder(subproject.path);
      const pdg = builder.build();
      const stats = builder.getStats();

      console.log(`   ✓ Nodes: ${stats.totalNodes}`);
      console.log(`   ✓ Edges: ${stats.totalEdges}`);
      console.log(`   ✓ Classes: ${stats.nodesByType['class'] || 0}`);
      console.log(`   ✓ Methods: ${stats.nodesByType['method'] || 0}`);
      console.log(`   ✓ Functions: ${stats.nodesByType['function'] || 0}`);

      totalNodes += stats.totalNodes;
      totalEdges += stats.totalEdges;
      allPdgs.push({ subproject: subproject.name, pdg, stats });
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
    }

    console.log('');
  }

  // Combine all PDGs
  console.log('Combining results from all subprojects...');
  const combinedPdg = {
    nodes: new Map(),
    edges: [] as any[],
  };

  allPdgs.forEach(({ subproject, pdg }) => {
    // Add subproject prefix to node IDs to avoid conflicts
    pdg.nodes.forEach((node: any, nodeId: string) => {
      const prefixedId = `${subproject}_${nodeId}`;
      combinedPdg.nodes.set(prefixedId, {
        ...node,
        id: prefixedId,
        metadata: {
          ...node.metadata,
          subproject, // Track which subproject this came from
        }
      });
    });

    // Add edges with prefixed IDs
    pdg.edges.forEach((edge: any) => {
      combinedPdg.edges.push({
        ...edge,
        source: `${subproject}_${edge.source}`,
        target: `${subproject}_${edge.target}`,
      });
    });
  });

  console.log(`Combined: ${combinedPdg.nodes.size} nodes, ${combinedPdg.edges.length} edges\n`);

  console.log('PDG Statistics (Combined):');
  console.log(`  Total Nodes: ${totalNodes}`);
  console.log(`  Total Edges: ${totalEdges}`);
  console.log(`  Subprojects Analyzed: ${allPdgs.length}`);
  console.log('');

  // Run quality analysis
  const qualityAnalyzer = new QualityAnalyzer();
  const report = qualityAnalyzer.generateReport(combinedPdg, 5);
  console.log(report);

  // Interactive selection
  console.log('\n');
  console.log('Would you like to analyze test coverage for a specific node?');
  console.log('Enter a Node ID from the report above, or press Enter to exit.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const askForNodeId = () => {
    rl.question('Node ID: ', async (nodeId) => {
      nodeId = nodeId.trim();

      if (!nodeId) {
        console.log('\nExiting...');
        rl.close();

        // Cleanup cloned repository if using Git
        if (gitManager && cloneResult) {
          console.log('\nCleaning up cloned repository...');
          await gitManager.cleanup(cloneResult.repoPath);
        }

        return;
      }

      // Find the node
      const selectedNode = combinedPdg.nodes.get(nodeId);

      if (!selectedNode) {
        console.log(`\n❌ Error: Node ID "${nodeId}" not found.`);
        console.log('Please enter a valid Node ID from the report above.\n');
        askForNodeId();
        return;
      }

      // Analyze test coverage
      console.log('\n🔍 Analyzing test coverage...\n');
      const coverageAnalyzer = new TestCoverageAnalyzer(projectPath);
      const coverage = await coverageAnalyzer.analyzeNode(selectedNode, combinedPdg);
      const coverageReport = coverageAnalyzer.formatReport(coverage);
      console.log(coverageReport);

      // Ask if they want to analyze another
      console.log('\nAnalyze another node? Enter Node ID or press Enter to exit.\n');
      askForNodeId();
    });
  };

  askForNodeId();
}

demo().catch(console.error);
