import { ProgramDependencyGraphBuilder } from './ProgramDependencyGraphBuilder';
import { QualityAnalyzer } from './QualityAnalyzer';
import { TestCoverageAnalyzer } from './TestCoverageAnalyzer';
import { GitRepositoryManager } from './GitRepositoryManager';
import { MonorepoDetector } from './MonorepoDetector';
import { ClaudeRefactoringService } from './ClaudeRefactoringService';
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
  console.log('   2. Refactor the code (AI-assisted)');
  console.log('   3. Create PR with metrics improvement\n');

  rl.question('Proceed with refactoring? (y/n): ', async (answer) => {
    if (answer.toLowerCase() !== 'y') {
      console.log('\n❌ Refactoring cancelled.\n');
      showNodeMenu(selectedNode, combinedPdg, projectPath, gitManager, cloneResult, rl, askForNodeId, qualityAnalyzer);
      return;
    }

    try {
      await performRefactoring(selectedNode, combinedPdg, projectPath, currentMetrics, currentScore, qualityAnalyzer, rl, gitManager, cloneResult, askForNodeId);
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
  askForNodeId: () => void
) {
  const { execSync } = require('child_process');
  const fs = require('fs');
  const path = require('path');

  // Step 1: Create git branch
  console.log('\n📋 Step 1: Creating git branch...');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const baseBranchName = `refactor/${selectedNode.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
  // Always include timestamp to ensure unique branch names
  const branchName = `${baseBranchName}-${timestamp}`;

  // Create the local branch
  try {
    execSync(`git checkout -b ${branchName}`, { cwd: projectPath, stdio: 'pipe' });
    console.log(`✅ Created branch: ${branchName}`);
  } catch (error: any) {
    throw new Error(`Failed to create branch: ${error.message}`);
  }

  // Step 2: Read the code file
  console.log('\n📖 Step 2: Reading code file...');
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

  // Step 3: Refactor the code using Claude API
  console.log('\n🤖 Step 3: AI-powered refactoring with Claude...');
  console.log('\nOriginal code:');
  console.log('─'.repeat(80));
  console.log(codeToRefactor.substring(0, 500) + (codeToRefactor.length > 500 ? '...' : ''));
  console.log('─'.repeat(80));

  // Check if Anthropic API key is configured
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
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

  // Step 4: Re-analyze metrics
  console.log('\n📊 Step 4: Re-analyzing metrics...');

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

  // Step 5: Show metrics comparison
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

  // Step 6: Commit changes
  console.log('\n💾 Step 5: Committing changes...');

  try {
    execSync(`git add "${filePath}"`, { cwd: projectPath, stdio: 'pipe' });

    const commitMessage = `refactor: improve ${selectedNode.name}

Quality Score: ${currentScore.toFixed(1)} → ${newScore.toFixed(1)} (${scoreChange > 0 ? '+' : ''}${scoreChange.toFixed(1)})
Cyclomatic Complexity: ${ccBefore} → ${ccAfter} (${ccChange > 0 ? '+' : ''}${ccChange})
Maintainability Index: ${miBefore.toFixed(1)} → ${miAfter.toFixed(1)} (${miChange > 0 ? '+' : ''}${miChange.toFixed(1)})
Halstead Volume: ${volBefore.toFixed(0)} → ${volAfter.toFixed(0)} (${volChange > 0 ? '+' : ''}${volChange.toFixed(0)})
Lines of Code (logical): ${locBefore} → ${locAfter} (${locChange > 0 ? '+' : ''}${locChange})

🤖 Generated with Claude Code Quality Analyzer`;

    // Write commit message to temporary file to avoid shell escaping issues
    const absoluteProjectPath = path.resolve(projectPath);
    const tempCommitFile = path.join(absoluteProjectPath, '.git', 'COMMIT_EDITMSG_TEMP');
    fs.writeFileSync(tempCommitFile, commitMessage, 'utf-8');
    execSync(`git commit -F "${tempCommitFile}"`, { cwd: projectPath, stdio: 'pipe' });
    fs.unlinkSync(tempCommitFile);

    console.log('✅ Changes committed');
  } catch (error: any) {
    console.log(`⚠️  Error committing: ${error.message}`);
  }

  // Step 7: Push and create PR
  console.log('\n🚀 Step 6: Creating Pull Request...');

  rl.question('Push changes and create PR? (y/n): ', async (answer) => {
    if (answer.toLowerCase() === 'y') {
      try {
        // Push branch
        try {
          execSync(`git push -u origin ${branchName}`, { cwd: projectPath, stdio: 'inherit' });
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
              execSync(`git push -u origin ${branchName} --force`, { cwd: projectPath, stdio: 'inherit' });
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
