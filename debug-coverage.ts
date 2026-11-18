import { TestCoverageAnalyzer } from './src/TestCoverageAnalyzer';
import { PDGNode, PDGNodeType } from './src/types';

// Create a mock node similar to what demo.ts would have
const mockNode: PDGNode = {
  id: 'test-node-id',
  name: 'register',
  type: PDGNodeType.FUNCTION,
  filePath: 'cb_root/photos-portal/server/src/controllers/authController.ts',
  startLine: 10,
  endLine: 50,
  metadata: {
    metrics: {
      cyclomaticComplexity: 10,
      maintainabilityIndex: 70
    }
  },
  dependencies: [],
  dependents: []
};

const projectRoot = '/Users/aleks/Dev/casper/playground';

async function debug() {
  console.log('🔍 Debugging Test Coverage Analyzer\n');
  console.log('Project Root:', projectRoot);
  console.log('Mock Node File Path:', mockNode.filePath);
  console.log('');

  const analyzer = new TestCoverageAnalyzer(projectRoot);

  try {
    const coverageInfo = await analyzer.analyzeNode(mockNode, {} as any);

    console.log('📊 Coverage Info Result:');
    console.log('  hasTests:', coverageInfo.hasTests);
    console.log('  testFiles.length:', coverageInfo.testFiles.length);
    console.log('  testFiles:', coverageInfo.testFiles);
    console.log('  estimatedTestCount:', coverageInfo.estimatedTestCount);
    console.log('  coverageEstimate:', coverageInfo.coverageEstimate);
    console.log('  coverageStatus:', coverageInfo.coverageStatus);
    console.log('');

    if (coverageInfo.testFiles.length === 0) {
      console.log('❌ NO TEST FILES FOUND!');
      console.log('   This is the bug causing "no tests found after refactoring"');
    } else {
      console.log('✅ Test files found successfully');
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

debug();
