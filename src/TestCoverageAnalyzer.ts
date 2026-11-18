import { PDGNode, ProgramDependencyGraph, PDGNodeType } from './types';
import * as path from 'path';
import * as fs from 'fs';

export interface TestCoverageInfo {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  location: string;

  // Test analysis
  hasTests: boolean;
  testFiles: string[];
  estimatedTestCount: number;

  // Coverage estimation
  cyclomaticComplexity: number;
  requiredTests: number;
  coverageEstimate: number; // 0-100%

  // Recommendations
  missingTests: number;
  coverageStatus: 'none' | 'poor' | 'partial' | 'good' | 'excellent';
  recommendations: string[];
}

export class TestCoverageAnalyzer {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Analyzes test coverage for a specific node
   */
  async analyzeNode(node: PDGNode, pdg: ProgramDependencyGraph): Promise<TestCoverageInfo> {
    const cc = node.metadata?.metrics?.cyclomaticComplexity || 1;
    const requiredTests = this.calculateRequiredTests(cc);

    // Find potential test files
    const testFiles = await this.findTestFiles(node);
    const estimatedTestCount = await this.estimateTestCount(testFiles, node);

    // Calculate coverage estimate
    const coverageEstimate = requiredTests > 0
      ? Math.min(100, (estimatedTestCount / requiredTests) * 100)
      : 100;

    const coverageStatus = this.getCoverageStatus(coverageEstimate);
    const recommendations = this.generateRecommendations(node, estimatedTestCount, requiredTests);

    return {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      location: `${node.filePath}:${node.startLine}-${node.endLine}`,
      hasTests: testFiles.length > 0,
      testFiles,
      estimatedTestCount,
      cyclomaticComplexity: cc,
      requiredTests,
      coverageEstimate,
      missingTests: Math.max(0, requiredTests - estimatedTestCount),
      coverageStatus,
      recommendations
    };
  }

  /**
   * Calculate required test cases based on cyclomatic complexity
   * Rule of thumb: At least CC tests needed for branch coverage
   */
  private calculateRequiredTests(cc: number): number {
    // For very complex code, we don't need CC tests (diminishing returns)
    if (cc > 50) return Math.ceil(cc * 0.5); // 50% of paths
    if (cc > 20) return Math.ceil(cc * 0.75); // 75% of paths
    return cc; // 100% branch coverage
  }

  /**
   * Find potential test files for a node
   */
  private async findTestFiles(node: PDGNode): Promise<string[]> {
    const testFiles: string[] = [];

    // Normalize file path - handle both absolute and relative paths
    const absoluteFilePath = path.isAbsolute(node.filePath)
      ? node.filePath
      : path.join(this.projectRoot, node.filePath);

    // Common test file patterns
    const baseFileName = path.basename(absoluteFilePath, path.extname(absoluteFilePath));
    const dirName = path.dirname(absoluteFilePath);

    const patterns = [
      // Same directory
      path.join(dirName, `${baseFileName}.test.ts`),
      path.join(dirName, `${baseFileName}.test.js`),
      path.join(dirName, `${baseFileName}.spec.ts`),
      path.join(dirName, `${baseFileName}.spec.js`),

      // __tests__ subdirectory
      path.join(dirName, '__tests__', `${baseFileName}.test.ts`),
      path.join(dirName, '__tests__', `${baseFileName}.test.js`),

      // tests directory at project root
      path.join(this.projectRoot, 'tests', `${baseFileName}.test.ts`),
      path.join(this.projectRoot, 'test', `${baseFileName}.test.ts`),

      // Mirror structure in test directory
      path.join(this.projectRoot, 'tests', path.relative(this.projectRoot, absoluteFilePath).replace(/\.ts$/, '.test.ts')),
      path.join(this.projectRoot, 'test', path.relative(this.projectRoot, absoluteFilePath).replace(/\.ts$/, '.test.ts'))
    ];

    for (const pattern of patterns) {
      if (fs.existsSync(pattern)) {
        testFiles.push(pattern);
      }
    }

    return testFiles;
  }

  /**
   * Estimate number of test cases by scanning test files
   */
  private async estimateTestCount(testFiles: string[], node: PDGNode): Promise<number> {
    if (testFiles.length === 0) return 0;

    let totalTests = 0;

    for (const testFile of testFiles) {
      try {
        const content = fs.readFileSync(testFile, 'utf-8');

        // Look for describe blocks that match this node's name
        const describePattern = new RegExp(
          `describe\\s*\\(['"]\s*${this.escapeRegex(node.name)}\\s*['"]`,
          'gi'
        );
        const describeMatches = content.match(describePattern);

        if (describeMatches && describeMatches.length > 0) {
          // Found describe block(s) for this node - count ALL test cases in the file
          // since they're likely all related to this node
          const allTests = content.match(/\b(it|test)\s*\(/gi);
          if (allTests) {
            totalTests += allTests.length;
          }
        } else {
          // No describe block found - try to find individual test cases mentioning this node
          const testPattern = new RegExp(
            `(it|test)\\s*\\([^)]*${this.escapeRegex(node.name)}`,
            'gi'
          );
          const testMatches = content.match(testPattern);
          if (testMatches) {
            totalTests += testMatches.length;
          } else {
            // No matches at all - count all tests and assume 30% relate to this node
            const allTests = content.match(/\b(it|test)\s*\(/gi);
            if (allTests) {
              totalTests += Math.ceil(allTests.length * 0.3);
            }
          }
        }
      } catch (error) {
        // Ignore file read errors
      }
    }

    return totalTests;
  }

  /**
   * Determine coverage status based on percentage
   */
  private getCoverageStatus(coveragePercent: number): 'none' | 'poor' | 'partial' | 'good' | 'excellent' {
    if (coveragePercent === 0) return 'none';
    if (coveragePercent < 30) return 'poor';
    if (coveragePercent < 60) return 'partial';
    if (coveragePercent < 90) return 'good';
    return 'excellent';
  }

  /**
   * Generate recommendations for improving test coverage
   */
  private generateRecommendations(node: PDGNode, currentTests: number, requiredTests: number): string[] {
    const recommendations: string[] = [];
    const cc = node.metadata?.metrics?.cyclomaticComplexity || 1;
    const mi = node.metadata?.metrics?.maintainabilityIndex || 70;

    // No tests at all
    if (currentTests === 0) {
      recommendations.push('⚠️  No tests found - Create basic test file first');
      recommendations.push(`📝 Start with ${Math.min(5, requiredTests)} essential test cases`);

      if (node.type === PDGNodeType.CLASS) {
        recommendations.push('🔹 Test constructor and basic methods');
      } else if (node.type === PDGNodeType.METHOD || node.type === PDGNodeType.FUNCTION) {
        recommendations.push('🔹 Test happy path and main error case');
      }

      return recommendations;
    }

    // Insufficient tests
    const missingTests = requiredTests - currentTests;
    if (missingTests > 0) {
      recommendations.push(`📊 Add ${missingTests} more test case(s) for better coverage`);
    }

    // High complexity warnings
    if (cc > 50) {
      recommendations.push('🔴 Extremely high complexity (CC: ' + cc + ') - Consider refactoring before adding tests');
      recommendations.push('💡 Split into smaller methods to make testing easier');
    } else if (cc > 20) {
      recommendations.push('⚠️  High complexity (CC: ' + cc + ') - Focus on critical paths');
      recommendations.push('🎯 Prioritize testing error handling and edge cases');
    } else if (cc > 10) {
      recommendations.push('🔹 Moderate complexity (CC: ' + cc + ') - Cover all decision branches');
    }

    // Low maintainability
    if (mi < 65) {
      recommendations.push('⚠️  Low maintainability (MI: ' + mi.toFixed(1) + ') - Tests will be harder to write');
      recommendations.push('💡 Consider refactoring to improve testability');
    }

    // LCOM issues
    if (node.type === PDGNodeType.CLASS) {
      const lcom = node.metadata?.metrics?.lcom;
      if (lcom && lcom > 0.7) {
        recommendations.push('🔴 Low cohesion (LCOM: ' + lcom.toFixed(2) + ') - Split class before testing');
        recommendations.push('💡 Each split class will be easier to test');
      }
    }

    // Good coverage
    if (missingTests <= 0 && currentTests >= requiredTests) {
      recommendations.push('✅ Good test coverage achieved!');
      if (cc > 10) {
        recommendations.push('🔍 Consider mutation testing to verify test quality');
      }
    }

    return recommendations;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Generate formatted report
   */
  formatReport(coverage: TestCoverageInfo): string {
    const lines: string[] = [];

    lines.push('='.repeat(80));
    lines.push('TEST COVERAGE ANALYSIS');
    lines.push('='.repeat(80));
    lines.push('');

    lines.push(`Node: ${coverage.nodeType} - ${coverage.nodeName}`);
    lines.push(`Node ID: ${coverage.nodeId}`);
    lines.push(`Location: ${coverage.location}`);
    lines.push('');

    lines.push('Coverage Metrics:');
    lines.push(`  Cyclomatic Complexity: ${coverage.cyclomaticComplexity}`);
    lines.push(`  Required Test Cases: ${coverage.requiredTests} (for branch coverage)`);
    lines.push(`  Estimated Existing Tests: ${coverage.estimatedTestCount}`);
    lines.push(`  Missing Tests: ${coverage.missingTests}`);
    lines.push('');

    // Coverage bar
    const coverageBar = this.createProgressBar(coverage.coverageEstimate);
    const statusEmoji = {
      'none': '❌',
      'poor': '🔴',
      'partial': '🟡',
      'good': '🟢',
      'excellent': '✨'
    };

    lines.push(`Coverage Estimate: ${coverage.coverageEstimate.toFixed(1)}% ${coverageBar}`);
    lines.push(`Status: ${statusEmoji[coverage.coverageStatus]} ${coverage.coverageStatus.toUpperCase()}`);
    lines.push('');

    // Test files
    if (coverage.testFiles.length > 0) {
      lines.push('Test Files Found:');
      coverage.testFiles.forEach(file => {
        lines.push(`  📄 ${path.relative(this.projectRoot, file)}`);
      });
      lines.push('');
    } else {
      lines.push('⚠️  No test files found');
      lines.push('');
    }

    // Recommendations
    if (coverage.recommendations.length > 0) {
      lines.push('Recommendations:');
      coverage.recommendations.forEach(rec => {
        lines.push(`  ${rec}`);
      });
      lines.push('');
    }

    lines.push('='.repeat(80));

    return lines.join('\n');
  }

  /**
   * Create visual progress bar
   */
  private createProgressBar(percent: number, width: number = 30): string {
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;

    let color = '';
    if (percent < 30) color = '░'; // Poor
    else if (percent < 60) color = '▒'; // Partial
    else if (percent < 90) color = '▓'; // Good
    else color = '█'; // Excellent

    return '[' + color.repeat(filled) + '░'.repeat(empty) + ']';
  }
}
