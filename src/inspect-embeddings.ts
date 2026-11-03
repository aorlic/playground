import { ProgramDependencyGraphBuilder } from './ProgramDependencyGraphBuilder';
import { NodeSerializer } from './vectorization/NodeSerializer';
import * as path from 'path';

/**
 * Inspect actual text being embedded to diagnose search quality
 */
async function inspectEmbeddings() {
  console.log('=== Inspecting Embedding Text Quality ===\n');

  // Analyze gateway service (has most code)
  const gatewayPath = '/Users/aleks/Dev/randevu-backend/services/gateway';
  const builder = new ProgramDependencyGraphBuilder(gatewayPath);
  const pdg = builder.build();

  console.log(`Loaded gateway PDG: ${pdg.nodes.size} nodes\n`);

  // Get a few sample nodes
  const serializer = new NodeSerializer();

  // Find PaymentServices class
  const paymentNode = Array.from(pdg.nodes.values()).find(
    n => n.name === 'PaymentServices' || n.name.includes('Payment')
  );

  // Find gateway-related nodes
  const gatewayNode = Array.from(pdg.nodes.values()).find(
    n => n.name.includes('Gateway') || n.name.includes('gateway')
  );

  // Find cache-related nodes
  const cacheNode = Array.from(pdg.nodes.values()).find(
    n => n.name.includes('Cache') || n.name.includes('cache')
  );

  const samples = [paymentNode, gatewayNode, cacheNode].filter(n => n);

  for (const node of samples) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`NODE: ${node!.name}`);
    console.log(`Type: ${node!.type}`);
    console.log(`File: ${node!.filePath}:${node!.startLine}`);
    console.log('='.repeat(80));

    const serialized = serializer.serializeNode(node!, pdg);

    console.log(`\n📝 Serialized Text (for embedding):`);
    console.log(`Length: ${serialized.text.length} characters\n`);
    console.log(serialized.text.substring(0, 1000));
    console.log(`\n... (${serialized.text.length - 1000} more characters)\n`);

    // Check what semantic info was extracted
    console.log(`📊 Semantic Annotations:`);
    const sem = node!.metadata?.semantics;
    if (sem) {
      console.log(`  Description: ${sem.description ? 'YES' : 'NO'}`);
      console.log(`  Domain Terms: ${sem.domainTerms?.length || 0} terms`);
      if (sem.domainTerms && sem.domainTerms.length > 0) {
        console.log(`    → ${sem.domainTerms.slice(0, 10).join(', ')}`);
      }
      console.log(`  Technical Keywords: ${sem.technicalKeywords?.length || 0} keywords`);
      if (sem.technicalKeywords && sem.technicalKeywords.length > 0) {
        console.log(`    → ${sem.technicalKeywords.slice(0, 10).join(', ')}`);
      }
      console.log(`  Purpose: ${sem.purpose || 'none'}`);
      console.log(`  Patterns: ${sem.patterns?.join(', ') || 'none'}`);
    } else {
      console.log(`  ❌ NO SEMANTIC ANNOTATIONS!`);
    }

    // Check metrics
    console.log(`\n📈 Metrics:`);
    const metrics = node!.metadata?.metrics;
    if (metrics) {
      console.log(`  CC: ${metrics.cyclomaticComplexity || 'none'}`);
      console.log(`  MI: ${metrics.maintainabilityIndex?.toFixed(1) || 'none'}`);
    } else {
      console.log(`  ❌ NO METRICS!`);
    }
  }

  console.log(`\n\n${'='.repeat(80)}`);
  console.log('ANALYSIS');
  console.log('='.repeat(80));
  console.log(`
Key Questions:
1. Does the serialized text contain relevant keywords?
2. Are semantic annotations (domain terms, technical keywords) present?
3. Is the code snippet meaningful or just boilerplate?
4. Is there enough context (JSDoc, comments)?

Common Issues:
- If no domain terms: SemanticAnalyzer not detecting business concepts
- If no technical keywords: Pattern matching too restrictive
- If no JSDoc: Code has no documentation to extract
- If text is mostly code: Need more semantic context
  `);
}

inspectEmbeddings().catch(console.error);
