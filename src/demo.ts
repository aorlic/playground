import { ProgramDependencyGraphBuilder } from './ProgramDependencyGraphBuilder';
import { QualityAnalyzer } from './QualityAnalyzer';

/**
 * Demo: Analyze the playground codebase itself
 */
async function demo() {
  console.log('=== Code Quality Analysis Demo ===\n');

  const projectPath = process.cwd();
  console.log(`Analyzing project at: ${projectPath}\n`);

  // Build PDG
  const builder = new ProgramDependencyGraphBuilder(projectPath);
  const pdg = builder.build();
  const stats = builder.getStats();

  console.log('PDG Statistics:');
  console.log(`  Total Nodes: ${stats.totalNodes}`);
  console.log(`  Total Edges: ${stats.totalEdges}`);
  console.log(`  Classes: ${stats.nodesByType['class'] || 0}`);
  console.log(`  Methods: ${stats.nodesByType['method'] || 0}`);
  console.log(`  Functions: ${stats.nodesByType['function'] || 0}`);
  console.log('');

  // Run quality analysis
  const qualityAnalyzer = new QualityAnalyzer();
  const report = qualityAnalyzer.generateReport(pdg, 5);
  console.log(report);
}

demo().catch(console.error);
