import { ProgramDependencyGraphBuilder } from './ProgramDependencyGraphBuilder';
import { PDGNodeType } from './types';

async function testSemantics() {
  console.log('=== Testing Semantic Annotations ===\n');

  const codebasePath = process.cwd();
  const builder = new ProgramDependencyGraphBuilder(codebasePath);
  const pdg = builder.build();

  console.log(`Total nodes: ${pdg.nodes.size}\n`);

  // Find nodes with semantic annotations
  const nodesWithSemantics = Array.from(pdg.nodes.values()).filter(
    node => node.metadata?.semantics && Object.keys(node.metadata.semantics).length > 0
  );

  console.log(`Nodes with semantic annotations: ${nodesWithSemantics.length}\n`);

  // Show examples from each type
  const types = [PDGNodeType.CLASS, PDGNodeType.METHOD, PDGNodeType.FUNCTION];

  for (const type of types) {
    const samplesOfType = nodesWithSemantics
      .filter(n => n.type === type)
      .slice(0, 3);

    if (samplesOfType.length > 0) {
      console.log(`\n=== ${type.toUpperCase()} Examples ===\n`);

      samplesOfType.forEach(node => {
        console.log(`${node.name} (${node.filePath}:${node.startLine})`);

        const sem = node.metadata!.semantics!;

        if (sem.description) {
          console.log(`  Description: ${sem.description.substring(0, 100)}...`);
        } else if (sem.summary) {
          console.log(`  Summary: ${sem.summary}`);
        }

        if (sem.purpose) {
          console.log(`  Purpose: ${sem.purpose}`);
        }

        if (sem.patterns && sem.patterns.length > 0) {
          console.log(`  Patterns: ${sem.patterns.join(', ')}`);
        }

        if (sem.domainTerms && sem.domainTerms.length > 0) {
          console.log(`  Domain Terms: ${sem.domainTerms.slice(0, 5).join(', ')}`);
        }

        if (sem.technicalKeywords && sem.technicalKeywords.length > 0) {
          console.log(`  Technical: ${sem.technicalKeywords.slice(0, 5).join(', ')}`);
        }

        if (sem.externalDependencies && sem.externalDependencies.length > 0) {
          console.log(`  External Deps: ${sem.externalDependencies.join(', ')}`);
        }

        console.log('');
      });
    }
  }

  // Statistics
  console.log('\n=== Semantic Statistics ===\n');

  const withDescription = nodesWithSemantics.filter(n => n.metadata?.semantics?.description).length;
  const withPurpose = nodesWithSemantics.filter(n => n.metadata?.semantics?.purpose).length;
  const withPatterns = nodesWithSemantics.filter(n => n.metadata?.semantics?.patterns?.length).length;
  const withDomainTerms = nodesWithSemantics.filter(n => n.metadata?.semantics?.domainTerms?.length).length;
  const withTechnicalKeywords = nodesWithSemantics.filter(n => n.metadata?.semantics?.technicalKeywords?.length).length;

  console.log(`Nodes with JSDoc descriptions: ${withDescription}`);
  console.log(`Nodes with purpose classification: ${withPurpose}`);
  console.log(`Nodes with detected patterns: ${withPatterns}`);
  console.log(`Nodes with domain terms: ${withDomainTerms}`);
  console.log(`Nodes with technical keywords: ${withTechnicalKeywords}`);
}

testSemantics().catch(console.error);
