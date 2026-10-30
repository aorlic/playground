import { ProgramDependencyGraphBuilder } from './ProgramDependencyGraphBuilder';
import * as path from 'path';

/**
 * Example usage of the ProgramDependencyGraphBuilder
 */
function main(): void {
  // Path to the codebase to analyze (using current project as example)
  const codebasePath = path.join(__dirname, '..');

  console.log('Building Program Dependency Graph...');
  console.log(`Analyzing codebase at: ${codebasePath}\n`);

  try {
    // Create the builder and build the PDG
    const builder = new ProgramDependencyGraphBuilder(codebasePath);
    const pdg = builder.build();

    // Display statistics
    const stats = builder.getStats();
    console.log('=== PDG Statistics ===');
    console.log(`Total Nodes: ${stats.totalNodes}`);
    console.log(`Total Edges: ${stats.totalEdges}`);
    console.log('\nNodes by Type:');
    Object.entries(stats.nodesByType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
    console.log('\nEdges by Type:');
    Object.entries(stats.edgesByType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

    // Display sample nodes with metrics
    console.log('\n=== Sample Nodes with Metrics ===');
    let sampleCount = 0;
    for (const [id, node] of pdg.nodes) {
      if (sampleCount >= 5) break;
      console.log(`\nNode ID: ${id}`);
      console.log(`  Type: ${node.type}`);
      console.log(`  Name: ${node.name}`);
      console.log(`  Location: ${path.basename(node.filePath)}:${node.startLine}-${node.endLine}`);

      // Display metrics if available
      if (node.metadata?.metrics) {
        const m = node.metadata.metrics;
        console.log('  Metrics:');
        if (m.cyclomaticComplexity !== undefined) {
          console.log(`    Cyclomatic Complexity: ${m.cyclomaticComplexity.toFixed(2)}`);
        }
        if (m.maintainabilityIndex !== undefined) {
          console.log(`    Maintainability Index: ${m.maintainabilityIndex.toFixed(2)}`);
        }
        if (m.halsteadVolume !== undefined) {
          console.log(`    Halstead Volume: ${m.halsteadVolume.toFixed(2)}`);
        }
        if (m.halsteadDifficulty !== undefined) {
          console.log(`    Halstead Difficulty: ${m.halsteadDifficulty.toFixed(2)}`);
        }
        if (m.lcom !== undefined) {
          console.log(`    LCOM: ${m.lcom.toFixed(4)}`);
        }
        if (m.sloc?.logical !== undefined) {
          console.log(`    SLOC (logical): ${m.sloc.logical}`);
        }
      }
      sampleCount++;
    }

    // Display metrics summary
    console.log('\n=== Metrics Summary ===');
    let totalCC = 0;
    let totalMI = 0;
    let ccCount = 0;
    let miCount = 0;
    let maxCC = 0;
    let minMI = 100;
    let complexNodes: { name: string; cc: number }[] = [];

    for (const [, node] of pdg.nodes) {
      const metrics = node.metadata?.metrics;
      if (metrics?.cyclomaticComplexity !== undefined) {
        totalCC += metrics.cyclomaticComplexity;
        ccCount++;
        maxCC = Math.max(maxCC, metrics.cyclomaticComplexity);

        if (metrics.cyclomaticComplexity > 10) {
          complexNodes.push({ name: node.name, cc: metrics.cyclomaticComplexity });
        }
      }
      if (metrics?.maintainabilityIndex !== undefined) {
        totalMI += metrics.maintainabilityIndex;
        miCount++;
        minMI = Math.min(minMI, metrics.maintainabilityIndex);
      }
    }

    if (ccCount > 0) {
      console.log(`Average Cyclomatic Complexity: ${(totalCC / ccCount).toFixed(2)}`);
      console.log(`Maximum Cyclomatic Complexity: ${maxCC.toFixed(2)}`);
    }
    if (miCount > 0) {
      console.log(`Average Maintainability Index: ${(totalMI / miCount).toFixed(2)}`);
      console.log(`Minimum Maintainability Index: ${minMI.toFixed(2)}`);
    }

    if (complexNodes.length > 0) {
      console.log('\nHigh Complexity Nodes (CC > 10):');
      complexNodes
        .sort((a, b) => b.cc - a.cc)
        .slice(0, 10)
        .forEach((node) => {
          console.log(`  ${node.name}: ${node.cc.toFixed(2)}`);
        });
    }

    // Display sample edges
    console.log('\n=== Sample Edges ===');
    pdg.edges.slice(0, 5).forEach((edge) => {
      const sourceNode = pdg.nodes.get(edge.source);
      const targetNode = pdg.nodes.get(edge.target);
      console.log(
        `\n${edge.type}: ${sourceNode?.name} -> ${targetNode?.name}${edge.label ? ` (${edge.label})` : ''}`
      );
    });

    // Optionally export to JSON
    // console.log('\n=== JSON Export ===');
    // console.log(builder.toJSON());
  } catch (error) {
    console.error('Error building PDG:', error);
    process.exit(1);
  }
}

main();
