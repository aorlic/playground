import { ProgramDependencyGraphBuilder } from './ProgramDependencyGraphBuilder';
import { QualityAnalyzer } from './QualityAnalyzer';
import * as path from 'path';

/**
 * Analyze the randevu-backend codebase
 */
async function analyzeRandevuBackend() {
  console.log('=== Analyzing Randevu Backend ===\n');

  // Path to randevu-backend
  const randevuPath = '/Users/aleks/Dev/randevu-backend';

  console.log(`Analyzing codebase at: ${randevuPath}\n`);

  // We'll analyze each service individually since they have separate tsconfigs
  const services = ['gateway', 'scheduler', 'transactor', 'webhooks'];
  const libs = ['r-cacher', 'r-domain'];

  console.log('Services to analyze:', services.join(', '));
  console.log('Libraries to analyze:', libs.join(', '));
  console.log('');

  // Build PDG for each service
  let totalNodes = 0;
  const allPdgs: any[] = [];

  for (const service of services) {
    const servicePath = path.join(randevuPath, 'services', service);

    console.log(`\n📦 Analyzing service: ${service}`);
    console.log(`   Path: ${servicePath}`);

    try {
      const builder = new ProgramDependencyGraphBuilder(servicePath);
      const pdg = builder.build();
      const stats = builder.getStats();

      console.log(`   ✓ Nodes: ${stats.totalNodes}`);
      console.log(`   ✓ Edges: ${stats.totalEdges}`);
      console.log(`   ✓ Classes: ${stats.nodesByType['class'] || 0}`);
      console.log(`   ✓ Methods: ${stats.nodesByType['method'] || 0}`);
      console.log(`   ✓ Functions: ${stats.nodesByType['function'] || 0}`);

      totalNodes += stats.totalNodes;
      allPdgs.push({ service, pdg, stats });
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }

  // Build PDG for libraries
  for (const lib of libs) {
    const libPath = path.join(randevuPath, 'libs', lib);

    console.log(`\n📚 Analyzing library: ${lib}`);
    console.log(`   Path: ${libPath}`);

    try {
      const builder = new ProgramDependencyGraphBuilder(libPath);
      const pdg = builder.build();
      const stats = builder.getStats();

      console.log(`   ✓ Nodes: ${stats.totalNodes}`);
      console.log(`   ✓ Edges: ${stats.totalEdges}`);
      console.log(`   ✓ Classes: ${stats.nodesByType['class'] || 0}`);
      console.log(`   ✓ Methods: ${stats.nodesByType['method'] || 0}`);
      console.log(`   ✓ Functions: ${stats.nodesByType['function'] || 0}`);

      totalNodes += stats.totalNodes;
      allPdgs.push({ service: lib, pdg, stats });
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }

  console.log(`\n\n=== Total Analysis Summary ===`);
  console.log(`Total nodes across all services: ${totalNodes}`);
  console.log(`Services/libs analyzed: ${allPdgs.length}`);

  // Combine all PDGs for quality analysis
  console.log(`\n=== Quality Analysis ===\n`);

  const combinedPdg = {
    nodes: new Map(),
    edges: [] as any[],
  };

  allPdgs.forEach(({ service, pdg }) => {
    // Add service prefix to node IDs to avoid conflicts
    pdg.nodes.forEach((node: any, nodeId: string) => {
      const prefixedId = `${service}_${nodeId}`;
      combinedPdg.nodes.set(prefixedId, {
        ...node,
        id: prefixedId,
        metadata: {
          ...node.metadata,
          service, // Track which service this came from
        }
      });
    });

    // Add edges with prefixed IDs
    pdg.edges.forEach((edge: any) => {
      combinedPdg.edges.push({
        ...edge,
        source: `${service}_${edge.source}`,
        target: `${service}_${edge.target}`,
      });
    });
  });

  console.log(`Combined PDG: ${combinedPdg.nodes.size} nodes, ${combinedPdg.edges.length} edges\n`);

  // Run quality analysis
  const qualityAnalyzer = new QualityAnalyzer();
  const report = qualityAnalyzer.generateReport(combinedPdg, 5);
  console.log(report);

  console.log('\n✓ Randevu backend analysis complete!\n');
}

analyzeRandevuBackend().catch(console.error);
