import { ProgramDependencyGraphBuilder } from './ProgramDependencyGraphBuilder';
import { QualityAnalyzer } from './QualityAnalyzer';
import { TestCoverageAnalyzer } from './TestCoverageAnalyzer';
import { GitRepositoryManager } from './GitRepositoryManager';
import { MonorepoDetector } from './MonorepoDetector';
import { ClaudeRefactoringService } from './ClaudeRefactoringService';
import { TestRunner } from './TestRunner';
import { ClaudeTestGenerator } from './ClaudeTestGenerator';
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
  console.log('Select a node to analyze from the report above.');
  console.log('Enter a Node ID, or press Enter to exit.\n');

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

      // Show node menu
      await showNodeMenu(selectedNode, combinedPdg, projectPath, gitManager, cloneResult, rl, askForNodeId, qualityAnalyzer);
    });
  };

  askForNodeId();
}

/**
 * Show menu for selected node
 */
async function showNodeMenu(
  selectedNode: any,
  combinedPdg: any,
  projectPath: string,
  gitManager: GitRepositoryManager | null,
  cloneResult: any,
  rl: readline.Interface,
  askForNodeId: () => void,
  qualityAnalyzer: QualityAnalyzer
) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Selected: ${selectedNode.type} - ${selectedNode.name}`);
  console.log(`Location: ${selectedNode.filePath}:${selectedNode.startLine}-${selectedNode.endLine}`);
  console.log(`${'='.repeat(80)}\n`);

  console.log('What would you like to do?\n');
  console.log('1. Refactor this node');
  console.log('2. Analyze test coverage');
  console.log('3. Go back to node selection\n');

  rl.question('Choose option (1-3): ', async (option) => {
    option = option.trim();

    switch (option) {
      case '1':
        await refactorNode(selectedNode, combinedPdg, projectPath, gitManager, cloneResult, qualityAnalyzer, rl, askForNodeId);
        break;

      case '2':
        console.log('\n🔍 Analyzing test coverage...\n');
        const coverageAnalyzer = new TestCoverageAnalyzer(projectPath);
        const coverage = await coverageAnalyzer.analyzeNode(selectedNode, combinedPdg);
        const coverageReport = coverageAnalyzer.formatReport(coverage);
        console.log(coverageReport);
        console.log('\nPress Enter to continue...');
        rl.question('', () => {
          showNodeMenu(selectedNode, combinedPdg, projectPath, gitManager, cloneResult, rl, askForNodeId, qualityAnalyzer);
        });
        break;

      case '3':
        console.log('\n');
        askForNodeId();
        break;

      default:
        console.log('\n❌ Invalid option. Please choose 1, 2, or 3.\n');
        showNodeMenu(selectedNode, combinedPdg, projectPath, gitManager, cloneResult, rl, askForNodeId, qualityAnalyzer);
        break;
    }
  });
}

/**
 * Refactor a node with git workflow
 */
async function refactorNode(
  selectedNode: any,
  combinedPdg: any,
  projectPath: string,
  gitManager: GitRepositoryManager | null,
  cloneResult: any,
  qualityAnalyzer: QualityAnalyzer,
  rl: readline.Interface,
  askForNodeId: () => void
) {
  console.log('\n🔧 Starting refactoring workflow...\n');

  // Check if git is available
  if (!gitManager || !cloneResult) {
    console.log('❌ Git integration not available. Refactoring requires Git repository configuration.');
    console.log('Please configure GIT_REPO_URL and GIT_BRANCH in .env file.\n');
    console.log('Press Enter to continue...');
    rl.question('', () => {
      showNodeMenu(selectedNode, combinedPdg, projectPath, gitManager, cloneResult, rl, askForNodeId, qualityAnalyzer);
    });
    return;
  }

  // Calculate current metrics
  const currentMetrics = selectedNode.metadata?.metrics || {};
  const currentScore = qualityAnalyzer.calculateQualityScore(selectedNode);

  console.log('Current metrics:');
  console.log(`  Quality Score: ${currentScore.toFixed(1)}/100`);
  console.log(`  Cyclomatic Complexity: ${currentMetrics.cyclomaticComplexity || 'N/A'}`);
  console.log(`  Maintainability Index: ${currentMetrics.maintainabilityIndex?.toFixed(1) || 'N/A'}`);
  console.log(`  Halstead Volume: ${currentMetrics.halsteadVolume?.toFixed(0) || 'N/A'}`);
  console.log('');

  console.log('⚠️  Refactoring workflow:');
  console.log('   1. Create git branch: refactor/<node-name>');
  console.log('   2. Validate and generate tests (ensure 100% coverage)');
  console.log('   3. Refactor the code (AI-assisted)');
  console.log('   4. Create PR with tests and refactored code\n');

  rl.question('Proceed with refactoring? (y/n): ', async (answer) => {
    if (answer.toLowerCase() !== 'y') {
      console.log('\n❌ Refactoring cancelled.\n');
      showNodeMenu(selectedNode, combinedPdg, projectPath, gitManager, cloneResult, rl, askForNodeId, qualityAnalyzer);
      return;
    }

    try {
      // Step 1: Create git branch FIRST
      console.log('\n📋 Step 1: Creating git branch...');
      const { execSync } = require('child_process');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const baseBranchName = `refactor/${selectedNode.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
      const branchName = `${baseBranchName}-${timestamp}`;

      try {
        execSync(`git checkout -b ${branchName}`, { cwd: projectPath, stdio: 'pipe' });
        console.log(`✅ Created branch: ${branchName}`);
      } catch (error: any) {
        throw new Error(`Failed to create branch: ${error.message}`);
      }

      // Step 2: Testing Harness - in the branch
      console.log('\n🧪 Step 2: Testing Harness - Validation & Coverage Analysis...');

      const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
      const testingResult = await runTestingHarness(
        selectedNode,
        projectPath,
        combinedPdg,
        qualityAnalyzer,
        currentMetrics,
        anthropicApiKey,
        rl
      );

      if (!testingResult.passed) {
        console.log('\n❌ Testing validation failed. Refactoring aborted.\n');
        // Cleanup: delete the branch
        try {
          execSync(`git checkout master`, { cwd: projectPath, stdio: 'pipe' });
          execSync(`git branch -D ${branchName}`, { cwd: projectPath, stdio: 'pipe' });
          console.log(`🧹 Cleaned up branch ${branchName}`);
        } catch (error: any) {
          console.log(`⚠️  Could not cleanup branch: ${error.message}`);
        }
        console.log('\nPress Enter to continue...');
        rl.question('', () => {
          showNodeMenu(selectedNode, combinedPdg, projectPath, gitManager, cloneResult, rl, askForNodeId, qualityAnalyzer);
        });
        return;
      }

      // Step 3+: Now proceed with refactoring (branch already created)
      await performRefactoring(selectedNode, combinedPdg, projectPath, currentMetrics, currentScore, qualityAnalyzer, rl, gitManager, cloneResult, askForNodeId, testingResult, branchName);
    } catch (error: any) {
      console.log(`\n❌ Error during refactoring: ${error.message}\n`);
      console.log('Press Enter to continue...');
      rl.question('', () => {
        showNodeMenu(selectedNode, combinedPdg, projectPath, gitManager, cloneResult, rl, askForNodeId, qualityAnalyzer);
      });
    }
  });
}

/**
 * Run testing harness: validate existing tests and generate missing ones
 */
async function runTestingHarness(
  selectedNode: any,
  projectPath: string,
  combinedPdg: any,
  qualityAnalyzer: QualityAnalyzer,
  currentMetrics: any,
  anthropicApiKey: string | undefined,
  rl: readline.Interface
): Promise<{ passed: boolean; testFiles: string[] }> {
  const { execSync } = require('child_process');
  const fs = require('fs');
  const path = require('path');

  // Initialize test infrastructure
  const testCoverageAnalyzer = new TestCoverageAnalyzer(projectPath);

  // Extract relative path from the selected node's file path for scoping
  // Handle both absolute and relative paths
  const absoluteProjectPath = path.isAbsolute(projectPath) ? projectPath : path.join(process.cwd(), projectPath);
  const absoluteFilePath = path.isAbsolute(selectedNode.filePath) ? selectedNode.filePath : path.join(absoluteProjectPath, selectedNode.filePath);
  const relativeFilePath = path.relative(absoluteProjectPath, absoluteFilePath);

  // STEP 1: Analyze test coverage FIRST
  console.log('📊 Analyzing test coverage for selected node...\n');
  const coverageInfo = await testCoverageAnalyzer.analyzeNode(selectedNode, combinedPdg);

  console.log(`📊 Test Coverage Analysis:`);
  console.log(`   Tests found: ${coverageInfo.hasTests ? 'Yes' : 'No'}`);
  console.log(`   Test files: ${coverageInfo.testFiles.length}`);
  console.log(`   Estimated test cases: ${coverageInfo.estimatedTestCount}`);
  console.log(`   Required for 100% coverage: ${coverageInfo.requiredTests}`);
  console.log(`   Coverage estimate: ${coverageInfo.coverageEstimate.toFixed(0)}%`);
  console.log(`   Status: ${coverageInfo.coverageStatus}\n`);

  // STEP 2: Initialize TestRunner with target file path for scoped detection
  const testRunner = new TestRunner(projectPath, relativeFilePath);

  // STEP 3: Ensure project dependencies are installed (NOT test framework - just npm install)
  const depsInstalled = await testRunner.ensureDependenciesInstalled(relativeFilePath);
  if (!depsInstalled) {
    console.log('⚠️  Failed to install project dependencies. Tests may fail.\n');
  }

  // STEP 4: Check if testing infrastructure exists
  console.log('🔍 Checking for test framework (vitest/jest/mocha)...\n');
  let framework = testRunner.getFramework();
  const hasProperFramework = framework && ['vitest', 'jest', 'mocha'].includes(framework.name);

  if (hasProperFramework && framework) {
    console.log(`   ✅ Found test framework: ${framework.name}\n`);
  } else {
    console.log('   ⚠️  No test framework found\n');
  }

  // STEP 5: If coverage < 100% AND no infrastructure, offer to install vitest
  if (coverageInfo.coverageEstimate < 100 && !hasProperFramework) {
    console.log('⚠️  Test framework required:');
    console.log(`   - Coverage is ${coverageInfo.coverageEstimate.toFixed(0)}% (need 100%)`);
    console.log('   - No test framework detected (checked for: vitest, jest, mocha)');
    console.log('   - Cannot generate missing tests without a test framework\n');

    // Ask user if they want to install vitest
    const installAnswer = await new Promise<string>((resolve) => {
      rl.question('Would you like to install vitest? (y/n): ', resolve);
    });

    if (installAnswer.toLowerCase() === 'y') {
      const installed = await testRunner.installVitest();
      if (!installed) {
        console.log('❌ Could not install vitest. Cannot proceed with test generation.\n');
        return { passed: false, testFiles: [] };
      }
      framework = testRunner.getFramework();
    } else {
      console.log('❌ Cannot proceed without a test framework.\n');
      return { passed: false, testFiles: [] };
    }
  }

  // STEP 6: If we have tests OR need to generate tests, verify framework exists
  if ((coverageInfo.hasTests || coverageInfo.coverageEstimate < 100) && !framework) {
    console.log('❌ No test framework available. Cannot proceed.\n');
    return { passed: false, testFiles: [] };
  }

  if (framework) {
    console.log(`✅ Test framework: ${framework.name}\n`);
  }

  // STEP 7: If we have 100% coverage, validate existing tests
  if (coverageInfo.hasTests && coverageInfo.coverageEstimate >= 100) {
    console.log('🔍 Step 2a: Validating existing tests...');
    console.log('   All tests must pass before refactoring can proceed.\n');

    const testResult = await testRunner.runTests(coverageInfo.testFiles);

    console.log(`\n📋 Test Results:`);
    console.log(`   Total: ${testResult.total}`);
    console.log(`   Passed: ${testResult.passed}`);
    console.log(`   Failed: ${testResult.failed}\n`);

    if (!testResult.success || testResult.failed > 0) {
      console.log('❌ TEST VALIDATION FAILED');
      console.log('\n⚠️  Pre-existing tests are failing. Cannot proceed with refactoring.');
      console.log('   These tests existed before our analysis and must be fixed manually.\n');

      console.log('Failed test output:');
      console.log('─'.repeat(80));
      console.log(testResult.output.substring(0, 1000));
      console.log('─'.repeat(80));
      console.log('\n💡 Please fix the failing tests in the target repository and try again.\n');

      return { passed: false, testFiles: coverageInfo.testFiles }; // Block refactoring
    }

    console.log('✅ All existing tests pass!\n');
  } else {
    console.log('⚠️  No existing tests found for this node.\n');
  }

  // Track all test files (existing + newly generated)
  let allTestFiles = [...coverageInfo.testFiles];

  // Step 2b: Check coverage and generate missing tests
  if (coverageInfo.coverageEstimate < 100) {
    if (coverageInfo.hasTests) {
      console.log(`🔬 Step 2b: Test coverage is ${coverageInfo.coverageEstimate.toFixed(0)}% - Generating additional tests...`);
      console.log(`   Need ${coverageInfo.missingTests} more test cases for 100% coverage\n`);
    } else {
      console.log(`🔬 Step 2b: No tests found (0% coverage) - Creating full test suite...`);
      console.log(`   Generating ${coverageInfo.requiredTests} test cases for complete coverage\n`);
    }

    if (!anthropicApiKey) {
      console.log('⚠️  Anthropic API key not configured. Cannot auto-generate tests.');
      console.log('   Proceeding with refactoring, but coverage remains incomplete.\n');
      return { passed: true, testFiles: allTestFiles }; // Continue but with warning
    }

    // Framework must exist at this point (validated earlier)
    if (!framework) {
      console.log('❌ Error: No test framework available for test generation.\n');
      return { passed: false, testFiles: allTestFiles };
    }

    try {
      const filePath = selectedNode.filePath;
      const originalCode = fs.readFileSync(filePath, 'utf-8');
      const lines = originalCode.split('\n');
      const startLine = selectedNode.startLine - 1;
      const endLine = selectedNode.endLine;
      const codeToTest = lines.slice(startLine, endLine).join('\n');

      // Read existing tests if they exist
      let existingTests = '';
      if (coverageInfo.testFiles.length > 0) {
        existingTests = fs.readFileSync(coverageInfo.testFiles[0], 'utf-8');
      }

      console.log('⏳ Generating tests with Claude...\n');

      const testGenerator = new ClaudeTestGenerator(anthropicApiKey);
      const testResult = await testGenerator.generateTests({
        code: codeToTest,
        filePath,
        nodeType: selectedNode.type,
        nodeName: selectedNode.name,
        existingTests,
        testFramework: framework.name, // Now safe - framework is guaranteed to exist
        cyclomaticComplexity: currentMetrics.cyclomaticComplexity || 1,
        missingTestCount: coverageInfo.missingTests
      });

      // Validate that tests were actually generated
      if (!testResult.testCode || testResult.testCode.trim().length === 0) {
        console.log('❌ Error: No test code was generated by Claude.\n');
        console.log('   Proceeding with refactoring without additional tests.\n');
        return { passed: true, testFiles: allTestFiles };
      }

      // Validate that test code contains test cases (it, test, describe keywords)
      const hasDescribe = /\bdescribe\s*\(/.test(testResult.testCode);
      const hasTestCases = /\b(it|test)\s*\(/.test(testResult.testCode);

      if (!hasTestCases) {
        console.log('❌ Error: Generated code does not contain actual test cases.\n');
        console.log('   Found describe blocks: ' + hasDescribe);
        console.log('   Found it() or test() blocks: false\n');
        console.log('Full generated code:');
        console.log('─'.repeat(80));
        console.log(testResult.testCode);
        console.log('─'.repeat(80));

        // Ask user if they want to regenerate
        const retry = await new Promise<boolean>((resolve) => {
          rl.question('\nAttempt to regenerate tests with a different approach? (y/n): ', (answer) => {
            resolve(answer.toLowerCase() === 'y');
          });
        });

        if (!retry) {
          console.log('\n⚠️  Proceeding with refactoring without additional tests.\n');
          return { passed: true, testFiles: allTestFiles };
        } else {
          console.log('\n⚠️  Automatic retry not yet implemented. Proceeding without tests.\n');
          return { passed: true, testFiles: allTestFiles };
        }
      }

      // Count actual test cases
      const testMatches = testResult.testCode.match(/\b(it|test)\s*\(/g);
      const actualTestCount = testMatches ? testMatches.length : 0;

      if (actualTestCount === 0) {
        console.log(`❌ Error: Found describe blocks but no actual test cases (it/test).\n`);
        console.log('Full generated code:');
        console.log('─'.repeat(80));
        console.log(testResult.testCode);
        console.log('─'.repeat(80));
        console.log('\n⚠️  Proceeding with refactoring without additional tests.\n');
        return { passed: true, testFiles: allTestFiles };
      }

      console.log(`✅ Validation passed: Found ${actualTestCount} test cases\n`);

      console.log('📝 Generated test code:\n');
      console.log('Test Cases:');
      testResult.testCases.forEach((tc, i) => console.log(`   ${i + 1}. ${tc}`));
      console.log(`\nExplanation: ${testResult.explanation}\n`);

      // Show FULL preview (not truncated) for debugging
      console.log('Generated test preview (FULL):');
      console.log('─'.repeat(80));
      console.log(testResult.testCode);
      console.log('─'.repeat(80));
      console.log(`\nTotal length: ${testResult.testCode.length} characters\n`);

      // Ask user to approve
      const approved = await new Promise<boolean>((resolve) => {
        rl.question('\nApprove and save these tests? (y/n): ', (answer) => {
          resolve(answer.toLowerCase() === 'y');
        });
      });

      if (!approved) {
        console.log('\n⚠️  Test generation cancelled by user.');
        console.log('   Proceeding with refactoring without additional tests.\n');
        return { passed: true, testFiles: allTestFiles };
      }

      // Write or merge tests
      const testFilePath = testResult.testFilePath;
      let finalTestCode = testResult.testCode;

      if (fs.existsSync(testFilePath)) {
        console.log('\n🔀 Merging with existing test file...');
        finalTestCode = await testGenerator.mergeWithExistingTests(
          testFilePath,
          testResult.testCode,
          anthropicApiKey
        );
      }

      // Final validation before writing
      const finalTestMatches = finalTestCode.match(/\b(it|test)\s*\(/g);
      const finalTestCount = finalTestMatches ? finalTestMatches.length : 0;

      if (finalTestCount === 0) {
        console.log('\n❌ CRITICAL: Final validation failed - no test cases in code to be written!');
        console.log('Code to be written:');
        console.log('─'.repeat(80));
        console.log(finalTestCode);
        console.log('─'.repeat(80));
        console.log('\n⚠️  NOT writing empty test file. Proceeding without additional tests.\n');
        return { passed: true, testFiles: allTestFiles };
      }

      // Write test file
      fs.writeFileSync(testFilePath, finalTestCode, 'utf-8');
      console.log(`✅ Test file saved: ${testFilePath}`);

      // Add to tracked test files
      if (!allTestFiles.includes(testFilePath)) {
        allTestFiles.push(testFilePath);
      }

      // Run new tests to verify they pass
      console.log('\n🧪 Running newly generated tests...\n');
      let newTestResult = await testRunner.runTests([testFilePath]);

      // Test fixing loop - try to fix failing tests automatically
      let fixAttempts = 0;
      const maxFixAttempts = 2;

      while ((newTestResult.failed > 0 || newTestResult.total === 0) && fixAttempts < maxFixAttempts) {
        console.log('⚠️  Some generated tests are failing:');
        console.log('─'.repeat(80));
        console.log(newTestResult.output.substring(0, 1000));
        if (newTestResult.output.length > 1000) {
          console.log('\n... (output truncated)');
        }
        console.log('─'.repeat(80));

        // If no tests were found, show the test file content
        if (newTestResult.total === 0) {
          console.log('\n⚠️  No test cases found in the generated file!');
          console.log('Generated test file content (first 2000 chars):');
          console.log('─'.repeat(80));
          try {
            const testFileContent = fs.readFileSync(testFilePath, 'utf-8');
            console.log(testFileContent.substring(0, 2000));
            if (testFileContent.length > 2000) {
              console.log('\n... (truncated)');
            }
          } catch (error: any) {
            console.log(`Could not read test file: ${error.message}`);
          }
          console.log('─'.repeat(80));
        }

        fixAttempts++;
        console.log(`\n🔧 Attempting to fix tests automatically (attempt ${fixAttempts}/${maxFixAttempts})...\n`);

        try {
          // Read current test code and original source code
          const currentTestCode = fs.readFileSync(testFilePath, 'utf-8');
          const sourceCode = fs.readFileSync(filePath, 'utf-8');

          // Use Claude to fix the tests
          const fixedTestResult = await testGenerator.fixFailingTests({
            testCode: currentTestCode,
            sourceCode: codeToTest,
            failureOutput: newTestResult.output,
            testFramework: framework.name,
            testFilePath
          });

          if (fixedTestResult && fixedTestResult.trim().length > 0) {
            // Validate that fixed tests have actual test cases
            const hasTestCases = /\b(it|test)\s*\(/.test(fixedTestResult);
            if (!hasTestCases) {
              console.log('❌ Fixed test code has no test cases. Skipping fix.\n');
              break;
            }

            // Write fixed test code
            fs.writeFileSync(testFilePath, fixedTestResult, 'utf-8');
            console.log(`✅ Applied test fixes\n`);

            // Run tests again
            console.log('🧪 Running fixed tests...\n');
            newTestResult = await testRunner.runTests([testFilePath]);

            if (newTestResult.success && newTestResult.failed === 0 && newTestResult.total > 0) {
              console.log(`✅ All ${newTestResult.total} tests now pass!\n`);
              break;
            }
          } else {
            console.log('❌ Could not generate test fixes.\n');
            break;
          }
        } catch (error: any) {
          console.log(`❌ Error fixing tests: ${error.message}\n`);
          break;
        }
      }

      // After fix attempts, check if tests are still failing
      if (newTestResult.failed > 0 || newTestResult.total === 0) {
        console.log('\n⚠️  Tests are still failing after fix attempts.');
        console.log('You may need to fix these tests manually.');

        const continueAnyway = await new Promise<boolean>((resolve) => {
          rl.question('\nContinue with refactoring anyway? (y/n): ', (answer) => {
            resolve(answer.toLowerCase() === 'y');
          });
        });

        if (!continueAnyway) {
          return { passed: false, testFiles: allTestFiles };
        }
      } else if (fixAttempts > 0) {
        console.log(`✅ All ${newTestResult.total} tests pass after ${fixAttempts} fix attempt(s)!`);
      } else {
        console.log(`✅ All ${newTestResult.total} new tests pass!`);
      }

      // Stage test file for commit (will be included in final commit)
      try {
        execSync(`git add "${testFilePath}"`, { cwd: projectPath, stdio: 'pipe' });
        console.log(`✅ Test file will be included in commit\n`);
      } catch (error: any) {
        console.log(`⚠️  Could not stage test file: ${error.message}\n`);
      }

    } catch (error: any) {
      console.log(`\n❌ Error generating tests: ${error.message}`);
      console.log('   Proceeding with refactoring without additional tests.\n');
    }
  } else {
    console.log('✅ Test coverage is already at 100%!\n');
  }

  return { passed: true, testFiles: allTestFiles }; // All checks passed
}

/**
 * Perform the actual refactoring workflow
 */
async function performRefactoring(
  selectedNode: any,
  combinedPdg: any,
  projectPath: string,
  currentMetrics: any,
  currentScore: number,
  qualityAnalyzer: QualityAnalyzer,
  rl: readline.Interface,
  gitManager: GitRepositoryManager,
  cloneResult: any,
  askForNodeId: () => void,
  testingResult: { passed: boolean; testFiles: string[] },
  branchName: string
) {
  const { execSync } = require('child_process');
  const fs = require('fs');
  const path = require('path');

  // Check if Anthropic API key is configured (needed for refactoring)
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

  // Step 3: Read the code file
  console.log('\n📖 Step 3: Reading code file...');
  const filePath = selectedNode.filePath;

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const originalCode = fs.readFileSync(filePath, 'utf-8');
  const lines = originalCode.split('\n');
  const startLine = selectedNode.startLine - 1; // Convert to 0-based
  const endLine = selectedNode.endLine;
  const codeToRefactor = lines.slice(startLine, endLine).join('\n');

  console.log(`✅ Read ${endLine - startLine} lines from ${path.basename(filePath)}`);

  // Step 4: Refactor the code using Claude API
  console.log('\n🤖 Step 4: AI-powered refactoring with Claude...');
  console.log('\nOriginal code:');
  console.log('─'.repeat(80));
  console.log(codeToRefactor.substring(0, 500) + (codeToRefactor.length > 500 ? '...' : ''));
  console.log('─'.repeat(80));

  // Check if Anthropic API key is configured for refactoring
  if (!anthropicApiKey) {
    console.log('\n❌ Anthropic API key not configured.');
    console.log('Please add ANTHROPIC_API_KEY to your .env file.');
    console.log('Get your API key from: https://console.anthropic.com/settings/keys\n');
    console.log('Falling back to manual refactoring...');
    console.log(`\nFile: ${filePath}`);
    console.log(`Lines: ${selectedNode.startLine}-${selectedNode.endLine}\n`);
    console.log('Please manually refactor the code in your editor, save it, and press Enter to continue...\n');

    await new Promise<void>((resolve) => {
      rl.question('', () => resolve());
    });
  } else {
    try {
      console.log('\n⏳ Sending code to Claude for refactoring...');

      const claudeService = new ClaudeRefactoringService(anthropicApiKey);
      const qualityAnalyzer = new QualityAnalyzer();

      const refactoringResult = await claudeService.refactorCode({
        code: codeToRefactor,
        filePath,
        nodeType: selectedNode.type,
        nodeName: selectedNode.name,
        currentMetrics,
        issues: qualityAnalyzer.getIssues(selectedNode),
      });

      console.log('✅ Refactoring complete!\n');

      // Show explanation
      console.log('📝 Explanation:');
      console.log(refactoringResult.explanation);
      console.log('');

      // Show improvements
      if (refactoringResult.improvements.length > 0) {
        console.log('✨ Improvements:');
        refactoringResult.improvements.forEach(imp => {
          console.log(`   - ${imp}`);
        });
        console.log('');
      }

      // Show refactored code preview
      console.log('Refactored code preview:');
      console.log('─'.repeat(80));
      const preview = refactoringResult.refactoredCode.substring(0, 500);
      console.log(preview + (refactoringResult.refactoredCode.length > 500 ? '...' : ''));
      console.log('─'.repeat(80));

      // Validate refactored code
      const validation = await claudeService.validateRefactoredCode(codeToRefactor, refactoringResult.refactoredCode);
      if (!validation.valid) {
        console.log('\n⚠️  Validation warnings:');
        validation.errors.forEach(err => console.log(`   - ${err}`));
      }

      // Ask for approval
      console.log('\n');
      const approved = await new Promise<boolean>((resolve) => {
        rl.question('Apply this refactoring? (y/n): ', (answer) => {
          resolve(answer.toLowerCase() === 'y');
        });
      });

      if (approved) {
        // Replace the code in the file
        lines.splice(startLine, endLine - startLine, ...refactoringResult.refactoredCode.split('\n'));
        fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
        console.log('✅ Refactored code applied to file');
      } else {
        console.log('❌ Refactoring cancelled. Original code unchanged.');
        console.log('\nYou can manually refactor the code in your editor if desired.');
        console.log('Press Enter to continue with original code...\n');
        await new Promise<void>((resolve) => {
          rl.question('', () => resolve());
        });
      }
    } catch (error: any) {
      console.log(`\n❌ Error during AI refactoring: ${error.message}`);
      console.log('\nFalling back to manual refactoring...');
      console.log(`\nFile: ${filePath}`);
      console.log(`Lines: ${selectedNode.startLine}-${selectedNode.endLine}\n`);
      console.log('Please manually refactor the code in your editor, save it, and press Enter to continue...\n');

      await new Promise<void>((resolve) => {
        rl.question('', () => resolve());
      });
    }
  }

  // Step 5: Re-analyze metrics
  console.log('\n📊 Step 5: Re-analyzing metrics...');

  const ProgramDependencyGraphBuilder = require('./ProgramDependencyGraphBuilder').ProgramDependencyGraphBuilder;

  // Find the directory containing tsconfig.json by walking up from the file
  let subprojectPath = path.dirname(filePath);
  while (subprojectPath !== path.dirname(subprojectPath)) { // While not at root
    const tsconfigPath = path.join(subprojectPath, 'tsconfig.json');
    if (fs.existsSync(tsconfigPath)) {
      break;
    }
    subprojectPath = path.dirname(subprojectPath);
  }

  console.log(`   Subproject path: ${subprojectPath}`);

  let newMetrics = currentMetrics;
  let newScore = currentScore;
  let refactoredNode: any = null;

  try {
    const builder = new ProgramDependencyGraphBuilder(subprojectPath);
    const newPdg = builder.build();

    // Find the refactored node by matching file path and name
    for (const [nodeId, node] of newPdg.nodes) {
      if (node.filePath === filePath && node.name === selectedNode.name) {
        refactoredNode = node;
        break;
      }
    }

    if (refactoredNode) {
      newMetrics = refactoredNode.metadata?.metrics || currentMetrics;
      newScore = qualityAnalyzer.calculateQualityScore(refactoredNode);
      console.log('✅ Metrics recalculated successfully');
    } else {
      console.log('⚠️  Could not find refactored node, using original metrics');
    }
  } catch (error: any) {
    console.log(`⚠️  Error recalculating metrics: ${error.message}`);
    console.log('Continuing with original metrics...');
  }

  // Step 6: Show metrics comparison
  console.log('\n📈 Metrics Comparison:');
  console.log('─'.repeat(80));
  console.log(`${'Metric'.padEnd(30)} ${'Before'.padEnd(15)} ${'After'.padEnd(15)} ${'Change'.padEnd(15)}`);
  console.log('─'.repeat(80));

  const scoreChange = newScore - currentScore;
  console.log(`${'Quality Score'.padEnd(30)} ${currentScore.toFixed(1).padEnd(15)} ${newScore.toFixed(1).padEnd(15)} ${(scoreChange > 0 ? '+' : '') + scoreChange.toFixed(1)}`);

  const ccBefore = currentMetrics.cyclomaticComplexity || 0;
  const ccAfter = newMetrics.cyclomaticComplexity || 0;
  const ccChange = ccAfter - ccBefore;
  console.log(`${'Cyclomatic Complexity'.padEnd(30)} ${ccBefore.toString().padEnd(15)} ${ccAfter.toString().padEnd(15)} ${(ccChange > 0 ? '+' : '') + ccChange}`);

  const miBefore = currentMetrics.maintainabilityIndex || 0;
  const miAfter = newMetrics.maintainabilityIndex || 0;
  const miChange = miAfter - miBefore;
  console.log(`${'Maintainability Index'.padEnd(30)} ${miBefore.toFixed(1).padEnd(15)} ${miAfter.toFixed(1).padEnd(15)} ${(miChange > 0 ? '+' : '') + miChange.toFixed(1)}`);

  const volBefore = currentMetrics.halsteadVolume || 0;
  const volAfter = newMetrics.halsteadVolume || 0;
  const volChange = volAfter - volBefore;
  console.log(`${'Halstead Volume'.padEnd(30)} ${volBefore.toFixed(0).padEnd(15)} ${volAfter.toFixed(0).padEnd(15)} ${(volChange > 0 ? '+' : '') + volChange.toFixed(0)}`);

  // Use logical SLOC (Source Lines of Code) - counts only executable statements
  const locBefore = currentMetrics.sloc?.logical || (selectedNode.endLine - selectedNode.startLine + 1);
  const locAfter = newMetrics.sloc?.logical || locBefore;
  const locChange = locAfter - locBefore;
  console.log(`${'Lines of Code (logical)'.padEnd(30)} ${locBefore.toString().padEnd(15)} ${locAfter.toString().padEnd(15)} ${(locChange > 0 ? '+' : '') + locChange}`);
  console.log('─'.repeat(80));

  // Step 7: Post-refactoring test validation
  console.log('\n🧪 Step 7: Validating tests after refactoring...');

  const testRunner = new TestRunner(projectPath);

  if (testingResult.testFiles.length > 0) {
    console.log('   Running all tests to ensure refactoring didn\'t break anything...\n');

    const postTestResult = await testRunner.runTests(testingResult.testFiles);

    console.log(`📋 Post-Refactoring Test Results:`);
    console.log(`   Total: ${postTestResult.total}`);
    console.log(`   Passed: ${postTestResult.passed}`);
    console.log(`   Failed: ${postTestResult.failed}\n`);

    if (!postTestResult.success || postTestResult.failed > 0) {
      console.log('❌ TESTS FAILED AFTER REFACTORING!');
      console.log('\n⚠️  Attempting to fix the issue (could be in refactored code or tests)...\n');

      console.log('Failed test output:');
      console.log('─'.repeat(80));
      console.log(postTestResult.output.substring(0, 1000));
      console.log('─'.repeat(80));

      // Scenario 3: Try to fix either refactored code or tests (or both)
      let fixAttempts = 0;
      const maxFixAttempts = 2;
      let currentTestResult = postTestResult;

      if (!anthropicApiKey) {
        console.log('\n❌ Cannot fix automatically - ANTHROPIC_API_KEY not set.');
        console.log('   Rolling back changes...\n');
        fs.writeFileSync(filePath, originalCode, 'utf-8');
        console.log('✅ Original code restored');
        throw new Error('Tests failed after refactoring. Changes have been rolled back.');
      }

      const testGenerator = new ClaudeTestGenerator(anthropicApiKey);
      const refactoredCode = fs.readFileSync(filePath, 'utf-8');

      while (fixAttempts < maxFixAttempts && (currentTestResult.failed > 0 || currentTestResult.total === 0)) {
        fixAttempts++;
        console.log(`\n🔧 Fix attempt ${fixAttempts}/${maxFixAttempts}...\n`);

        try {
          // For each failing test file, try to fix it
          for (const testFile of testingResult.testFiles) {
            const testCode = fs.readFileSync(testFile, 'utf-8');

            console.log(`   Analyzing: ${path.relative(projectPath, testFile)}`);

            // Use the test fix method - it will analyze the failure and decide what to fix
            const fixedTestCode = await testGenerator.fixFailingTests({
              testCode,
              sourceCode: refactoredCode,
              failureOutput: currentTestResult.output,
              testFramework: 'vitest',
              testFilePath: testFile
            });

            if (fixedTestCode && fixedTestCode.trim().length > 0) {
              const hasTestCases = /\b(it|test)\s*\(/.test(fixedTestCode);
              if (hasTestCases) {
                fs.writeFileSync(testFile, fixedTestCode, 'utf-8');
                console.log(`   ✅ Applied fixes to test\n`);
              }
            }
          }

          // Re-run tests
          console.log('   Re-running tests...\n');
          currentTestResult = await testRunner.runTests(testingResult.testFiles);

          if (currentTestResult.success && currentTestResult.failed === 0 && currentTestResult.total > 0) {
            console.log(`   ✅ All ${currentTestResult.total} tests pass now!\n`);
            break;
          } else {
            console.log(`   ⚠️  Still failing: ${currentTestResult.failed}/${currentTestResult.total}\n`);
          }
        } catch (error: any) {
          console.log(`   ❌ Error during fix attempt: ${error.message}\n`);
        }
      }

      // Check if fixes worked
      if (currentTestResult.failed > 0 || currentTestResult.total === 0) {
        console.log(`\n❌ Could not fix tests after ${maxFixAttempts} attempts.`);
        console.log('   Rolling back refactored code...\n');
        fs.writeFileSync(filePath, originalCode, 'utf-8');
        console.log('✅ Original code restored');
        throw new Error('Tests failed after refactoring. Changes have been rolled back.');
      }

      console.log('✅ Tests fixed successfully! Refactoring is complete.\n');
    }

    console.log('✅ All tests still pass after refactoring!\n');
  } else {
    console.log('⚠️  No tests found. Skipping post-refactoring validation.\n');
  }

  // Step 8: Commit changes
  console.log('\n💾 Step 8: Committing changes...');

  // Find git root directory (the repo we're working in)
  let gitRoot: string;
  try {
    gitRoot = execSync('git rev-parse --show-toplevel', {
      cwd: projectPath,
      encoding: 'utf-8'
    }).trim();
    console.log(`   Git repository root: ${gitRoot}`);
  } catch (error) {
    console.log('   ⚠️  Not in a git repository, skipping git operations\n');
    gitRoot = projectPath;
  }

  try {
    // Stage the refactored file
    const relativeFilePath = path.relative(gitRoot, filePath);
    execSync(`git add "${relativeFilePath}"`, { cwd: gitRoot, stdio: 'pipe' });

    // Stage all test files (if any exist)
    if (testingResult.testFiles.length > 0) {
      for (const testFile of testingResult.testFiles) {
        try {
          const relativeTestFile = path.relative(gitRoot, testFile);
          execSync(`git add "${relativeTestFile}"`, { cwd: gitRoot, stdio: 'pipe' });
          console.log(`   ✅ Staged test file: ${relativeTestFile}`);
        } catch (error: any) {
          console.log(`   ⚠️  Could not stage test file ${testFile}: ${error.message}`);
        }
      }
    }

    // Stage test infrastructure files (package.json, vitest.config.ts, package-lock.json)
    // These may have been modified during vitest installation
    console.log('\n📦 Checking for test infrastructure files to stage...');

    const infrastructureFiles = [
      'package.json',
      'package-lock.json',
      'vitest.config.ts'
    ];

    // Determine which directory to check for infrastructure files
    // If target file is in a subdirectory with its own package.json, check there too
    const checkDirs: string[] = [projectPath];
    const targetFilePath = selectedNode.filePath.replace(projectPath + '/', '');

    if (targetFilePath) {
      const subDirs = ['server', 'client', 'packages', 'apps'];
      for (const subDir of subDirs) {
        if (targetFilePath.startsWith(subDir + '/') || targetFilePath.startsWith(subDir + path.sep)) {
          const subDirPath = path.join(projectPath, subDir);
          checkDirs.push(subDirPath);
          console.log(`   Target is in ${subDir}/ - will check both root and ${subDir}/`);
          break;
        }
      }
    }

    let stagedInfraFiles = 0;
    for (const dir of checkDirs) {
      const relativeDir = path.relative(projectPath, dir) || 'root';
      console.log(`   Checking ${relativeDir} for infrastructure files...`);

      for (const fileName of infrastructureFiles) {
        const filePath = path.join(dir, fileName);
        if (fs.existsSync(filePath)) {
          try {
            // Convert to relative path from git root for git commands
            const relativeFilePath = path.relative(gitRoot, filePath);

            // Check if file has changes using git status
            const statusOutput = execSync(`git status --porcelain "${relativeFilePath}"`, {
              cwd: gitRoot,
              encoding: 'utf-8'
            }).trim();

            if (statusOutput) {
              execSync(`git add "${relativeFilePath}"`, { cwd: gitRoot, stdio: 'pipe' });
              console.log(`      ✅ Staged: ${relativeFilePath}`);
              stagedInfraFiles++;
            } else {
              console.log(`      ⏭️  ${relativeFilePath} (no changes)`);
            }
          } catch (error: any) {
            console.log(`      ⚠️  Could not stage ${path.relative(gitRoot, filePath)}: ${error.message}`);
          }
        }
      }
    }

    if (stagedInfraFiles === 0) {
      console.log('   ℹ️  No infrastructure files needed staging\n');
    } else {
      console.log(`   ✅ Staged ${stagedInfraFiles} infrastructure file(s)\n`);
    }

    // Build commit message with details about what's included
    let commitMessageParts = [`refactor: improve ${selectedNode.name}

Quality Score: ${currentScore.toFixed(1)} → ${newScore.toFixed(1)} (${scoreChange > 0 ? '+' : ''}${scoreChange.toFixed(1)})
Cyclomatic Complexity: ${ccBefore} → ${ccAfter} (${ccChange > 0 ? '+' : ''}${ccChange})
Maintainability Index: ${miBefore.toFixed(1)} → ${miAfter.toFixed(1)} (${miChange > 0 ? '+' : ''}${miChange.toFixed(1)})
Halstead Volume: ${volBefore.toFixed(0)} → ${volAfter.toFixed(0)} (${volChange > 0 ? '+' : ''}${volChange.toFixed(0)})
Lines of Code (logical): ${locBefore} → ${locAfter} (${locChange > 0 ? '+' : ''}${locChange})`];

    // Add information about test files if included
    if (testingResult.testFiles.length > 0) {
      commitMessageParts.push(`\nTest Coverage: ${testingResult.testFiles.length} test file(s) included`);
    }

    // Check if vitest.config.ts was added (indicates new test infrastructure)
    const vitestConfigPath = path.join(projectPath, 'vitest.config.ts');
    const vitestConfigExists = fs.existsSync(vitestConfigPath);
    if (vitestConfigExists) {
      try {
        const relativeVitestConfigPath = path.relative(gitRoot, vitestConfigPath);
        const statusOutput = execSync(`git status --porcelain "${relativeVitestConfigPath}"`, {
          cwd: gitRoot,
          encoding: 'utf-8'
        }).trim();
        if (statusOutput.startsWith('A')) {
          commitMessageParts.push('Test Infrastructure: Added vitest configuration');
        }
      } catch (error) {
        // Ignore
      }
    }

    commitMessageParts.push('\n🤖 Generated with Claude Code Quality Analyzer');

    const commitMessage = commitMessageParts.join('\n');

    // Write commit message to temporary file to avoid shell escaping issues
    const absoluteGitRoot = path.resolve(gitRoot);
    const tempCommitFile = path.join(absoluteGitRoot, '.git', 'COMMIT_EDITMSG_TEMP');
    fs.writeFileSync(tempCommitFile, commitMessage, 'utf-8');
    execSync(`git commit -F "${tempCommitFile}"`, { cwd: gitRoot, stdio: 'pipe' });
    fs.unlinkSync(tempCommitFile);

    console.log('✅ Changes committed');
  } catch (error: any) {
    console.log(`⚠️  Error committing: ${error.message}`);
  }

  // Step 9: Push and create PR
  console.log('\n🚀 Step 9: Creating Pull Request...');

  rl.question('Push changes and create PR? (y/n): ', async (answer) => {
    if (answer.toLowerCase() === 'y') {
      try {
        // Push branch
        try {
          execSync(`git push -u origin ${branchName}`, { cwd: gitRoot, stdio: 'inherit' });
          console.log('✅ Branch pushed to remote');
        } catch (pushError: any) {
          // Check if remote branch exists
          if (pushError.message.includes('rejected') || pushError.message.includes('fetch first')) {
            console.log('\n⚠️  Remote branch already exists with different commits.');
            console.log('This usually means a previous refactoring created this branch.\n');

            // Use readline to ask for force push
            const forceAnswer = await new Promise<string>((resolve) => {
              rl.question('Force push to overwrite remote branch? (y/n): ', resolve);
            });

            if (forceAnswer.toLowerCase() === 'y') {
              execSync(`git push -u origin ${branchName} --force`, { cwd: gitRoot, stdio: 'inherit' });
              console.log('✅ Branch force-pushed to remote');
            } else {
              console.log('\n⚠️  Push cancelled. Changes are committed locally but not pushed.');
              console.log(`   You can manually push with: git push -u origin ${branchName} --force\n`);
              console.log('Press Enter to continue...');
              rl.question('', () => {
                showNodeMenu(selectedNode, combinedPdg, projectPath, gitManager, cloneResult, rl, askForNodeId, qualityAnalyzer);
              });
              return;
            }
          } else {
            throw pushError;
          }
        }

        // Check if gh CLI is available
        let ghAvailable = false;
        try {
          execSync('gh --version', { stdio: 'pipe' });
          ghAvailable = true;
        } catch (error) {
          ghAvailable = false;
        }

        if (!ghAvailable) {
          console.log('\n⚠️  GitHub CLI (gh) is not installed.');
          console.log('\n📋 Please create the PR manually with the following details:\n');

          const prTitle = `refactor: improve ${selectedNode.name}`;
          console.log(`Title: ${prTitle}\n`);

          // Build testing infrastructure section
          let testingSection = '';
          if (testingResult.testFiles.length > 0) {
            testingSection = `\n## Testing\n\n`;
            testingSection += `- **Test Files**: ${testingResult.testFiles.length}\n`;

            // Count test cases in test files
            let totalTestCases = 0;
            for (const testFile of testingResult.testFiles) {
              try {
                const testContent = fs.readFileSync(testFile, 'utf-8');
                const testMatches = testContent.match(/\b(it|test)\s*\(/g);
                if (testMatches) {
                  totalTestCases += testMatches.length;
                }
              } catch (error) {
                // Ignore read errors
              }
            }
            if (totalTestCases > 0) {
              testingSection += `- **Test Cases**: ${totalTestCases}\n`;
            }

            // Check if vitest was installed in this PR
            const infrastructureFiles = ['vitest.config.ts', 'package.json'];
            const newInfrastructure: string[] = [];

            for (const fileName of infrastructureFiles) {
              try {
                const filePath = path.join(projectPath, fileName);
                if (fs.existsSync(filePath)) {
                  const relativeInfraPath = path.relative(gitRoot, filePath);
                  const statusOutput = execSync(`git status --porcelain "${relativeInfraPath}"`, {
                    cwd: gitRoot,
                    encoding: 'utf-8'
                  }).trim();
                  if (statusOutput.startsWith('M') || statusOutput.startsWith('A')) {
                    newInfrastructure.push(fileName);
                  }
                }
              } catch (error) {
                // Ignore
              }
            }

            if (newInfrastructure.length > 0) {
              testingSection += `- **Testing Infrastructure**: Added/Updated (${newInfrastructure.join(', ')})\n`;
            }
          }

          const prBody = `## Refactoring Summary

**Node:** \`${selectedNode.type}\` - \`${selectedNode.name}\`
**Location:** \`${path.basename(filePath)}:${selectedNode.startLine}-${selectedNode.endLine}\`

## Metrics Improvement

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| **Quality Score** | ${currentScore.toFixed(1)} | ${newScore.toFixed(1)} | **${scoreChange > 0 ? '+' : ''}${scoreChange.toFixed(1)}** |
| Cyclomatic Complexity | ${ccBefore} | ${ccAfter} | ${ccChange > 0 ? '+' : ''}${ccChange} |
| Maintainability Index | ${miBefore.toFixed(1)} | ${miAfter.toFixed(1)} | ${miChange > 0 ? '+' : ''}${miChange.toFixed(1)} |
| Halstead Volume | ${volBefore.toFixed(0)} | ${volAfter.toFixed(0)} | ${volChange > 0 ? '+' : ''}${volChange.toFixed(0)} |
| Lines of Code (logical) | ${locBefore} | ${locAfter} | ${locChange > 0 ? '+' : ''}${locChange} |
${testingSection}
🤖 Generated with [Claude Code Quality Analyzer](https://github.com/anthropics/claude-code)`;

          console.log('Description:');
          console.log('---');
          console.log(prBody);
          console.log('---\n');

          // Get remote URL to construct PR URL
          try {
            const remoteUrl = execSync('git remote get-url origin', { cwd: projectPath, encoding: 'utf-8' }).trim();
            const match = remoteUrl.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/);
            if (match) {
              const [, owner, repo] = match;
              const prUrl = `https://github.com/${owner}/${repo}/compare/${branchName}?expand=1`;
              console.log(`🔗 Create PR here: ${prUrl}\n`);
            }
          } catch (error) {
            console.log('💡 Or go to your repository on GitHub and create a PR from the pushed branch.\n');
          }

          console.log('To install GitHub CLI: https://cli.github.com/\n');
        } else {
          // Create PR with gh CLI
          const prTitle = `refactor: improve ${selectedNode.name}`;

          // Build testing infrastructure section
          let testingSection = '';
          if (testingResult.testFiles.length > 0) {
            testingSection = `\n## Testing\n\n`;
            testingSection += `- **Test Files**: ${testingResult.testFiles.length}\n`;

            // Count test cases in test files
            let totalTestCases = 0;
            for (const testFile of testingResult.testFiles) {
              try {
                const testContent = fs.readFileSync(testFile, 'utf-8');
                const testMatches = testContent.match(/\b(it|test)\s*\(/g);
                if (testMatches) {
                  totalTestCases += testMatches.length;
                }
              } catch (error) {
                // Ignore read errors
              }
            }
            if (totalTestCases > 0) {
              testingSection += `- **Test Cases**: ${totalTestCases}\n`;
            }

            // Check if vitest was installed in this PR
            const infrastructureFiles = ['vitest.config.ts', 'package.json'];
            const newInfrastructure: string[] = [];

            for (const fileName of infrastructureFiles) {
              try {
                const filePath = path.join(projectPath, fileName);
                if (fs.existsSync(filePath)) {
                  const relativeInfraPath = path.relative(gitRoot, filePath);
                  const statusOutput = execSync(`git status --porcelain "${relativeInfraPath}"`, {
                    cwd: gitRoot,
                    encoding: 'utf-8'
                  }).trim();
                  if (statusOutput.startsWith('M') || statusOutput.startsWith('A')) {
                    newInfrastructure.push(fileName);
                  }
                }
              } catch (error) {
                // Ignore
              }
            }

            if (newInfrastructure.length > 0) {
              testingSection += `- **Testing Infrastructure**: Added/Updated (${newInfrastructure.join(', ')})\n`;
            }
          }

          const prBody = `## Refactoring Summary

**Node:** \`${selectedNode.type}\` - \`${selectedNode.name}\`
**Location:** \`${path.basename(filePath)}:${selectedNode.startLine}-${selectedNode.endLine}\`

## Metrics Improvement

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| **Quality Score** | ${currentScore.toFixed(1)} | ${newScore.toFixed(1)} | **${scoreChange > 0 ? '+' : ''}${scoreChange.toFixed(1)}** |
| Cyclomatic Complexity | ${ccBefore} | ${ccAfter} | ${ccChange > 0 ? '+' : ''}${ccChange} |
| Maintainability Index | ${miBefore.toFixed(1)} | ${miAfter.toFixed(1)} | ${miChange > 0 ? '+' : ''}${miChange.toFixed(1)} |
| Halstead Volume | ${volBefore.toFixed(0)} | ${volAfter.toFixed(0)} | ${volChange > 0 ? '+' : ''}${volChange.toFixed(0)} |
| Lines of Code (logical) | ${locBefore} | ${locAfter} | ${locChange > 0 ? '+' : ''}${locChange} |
${testingSection}
🤖 Generated with [Claude Code Quality Analyzer](https://github.com/anthropics/claude-code)`;

          // Write PR body to temporary file to avoid shell escaping issues
          const absoluteProjectPath = path.resolve(projectPath);
          const tempPrBodyFile = path.join(absoluteProjectPath, '.git', 'PR_BODY_TEMP.md');
          fs.writeFileSync(tempPrBodyFile, prBody, 'utf-8');

          // Create PR using the body file
          execSync(`gh pr create --title "${prTitle}" --body-file "${tempPrBodyFile}"`, { cwd: projectPath, stdio: 'inherit' });
          fs.unlinkSync(tempPrBodyFile);

          console.log('\n✅ Pull Request created successfully!');
        }
      } catch (error: any) {
        console.log(`\n❌ Error creating PR: ${error.message}`);
        console.log('\nYou can manually create the PR from the pushed branch.');
      }
    } else {
      console.log('\n⚠️  Changes committed locally but not pushed.');
    }

    console.log('\n✅ Refactoring workflow complete!\n');
    console.log('Press Enter to continue...');
    rl.question('', () => {
      askForNodeId();
    });
  });
}

demo().catch(console.error);
