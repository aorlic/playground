import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PDGNode } from './types';

export interface TestResult {
  success: boolean;
  passed: number;
  failed: number;
  total: number;
  output: string;
  error?: string;
  testFiles: string[];
}

export interface TestFramework {
  name: string;
  command: string;
  configFile?: string;
  testPattern: string;
}

export class TestRunner {
  private projectPath: string;
  private framework: TestFramework | null = null;
  private targetFilePath?: string;

  constructor(projectPath: string, targetFilePath?: string) {
    this.projectPath = projectPath;
    this.targetFilePath = targetFilePath;
    this.detectTestFramework();
  }

  /**
   * Install vitest at the closest valid location in the upward search path
   * Follows the rule: install at the first directory with package.json
   */
  async installVitest(): Promise<boolean> {
    console.log('📦 Installing vitest...\n');

    try {
      const { execSync } = require('child_process');
      const fs = require('fs');
      const path = require('path');

      // Determine installation location using upward search
      const installLocation = this.determineVitestInstallLocation();
      const relativeInstallPath = path.relative(this.projectPath, installLocation) || '.';

      console.log(`   Installation location: ${relativeInstallPath}\n`);

      // Install vitest and vite (required peer dependency) with --legacy-peer-deps to avoid conflicts
      console.log(`   Running: npm install --save-dev vitest vite in ${relativeInstallPath}...`);
      execSync('npm install --save-dev vitest vite --legacy-peer-deps', {
        cwd: installLocation,
        stdio: 'inherit'
      });

      console.log('✅ Vitest installed successfully!');

      // Add test script to package.json if it doesn't exist
      const packageJsonPath = path.join(installLocation, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

        if (!packageJson.scripts) {
          packageJson.scripts = {};
        }

        if (!packageJson.scripts.test) {
          packageJson.scripts.test = 'npx vitest run';
          fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
          console.log('✅ Added "test" script to package.json (using npx vitest run)\n');
        } else {
          console.log('✅ Test script already exists in package.json\n');
        }
      }

      // Create vitest.config.ts if it doesn't exist
      const vitestConfigPath = path.join(installLocation, 'vitest.config.ts');
      if (!fs.existsSync(vitestConfigPath)) {
        const vitestConfig = `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  },
});
`;
        fs.writeFileSync(vitestConfigPath, vitestConfig, 'utf-8');
        console.log('✅ Created vitest.config.ts\n');
      }

      // Re-detect framework
      this.detectTestFramework();

      if (this.framework) {
        console.log(`✅ Test framework detected: ${this.framework.name}\n`);
        return true;
      } else {
        console.log('⚠️  Framework detection failed after installation.\n');
        return false;
      }
    } catch (error: any) {
      console.log(`\n❌ Failed to install vitest: ${error.message}\n`);
      return false;
    }
  }

  /**
   * Determine where to install vitest based on upward search path
   * Returns the first directory with a package.json (closest to target)
   */
  private determineVitestInstallLocation(): string {
    if (!this.targetFilePath) {
      // No target file - default to root
      return this.projectPath;
    }

    // Normalize target path to relative (handle both absolute and relative)
    const relativeTargetPath = path.isAbsolute(this.targetFilePath)
      ? path.relative(this.projectPath, this.targetFilePath)
      : this.targetFilePath;

    // Check subdirectory first (upward search pattern)
    const subDirs = ['server', 'client', 'packages', 'apps'];
    for (const subDir of subDirs) {
      if (relativeTargetPath.startsWith(subDir + '/') || relativeTargetPath.startsWith(subDir + path.sep)) {
        const subDirPath = path.join(this.projectPath, subDir);
        if (fs.existsSync(path.join(subDirPath, 'package.json'))) {
          console.log(`   📍 Target file is in ${subDir}/ - will install vitest there\n`);
          return subDirPath; // Install in subdirectory
        }
        break;
      }
    }

    // Default to root
    console.log(`   📍 Target file not in known subdirectory - will install vitest at root\n`);
    return this.projectPath;
  }

  /**
   * Ensure project dependencies are installed for the selected node's directory
   * @param targetFilePath - Optional file path of the node being refactored to scope dependency installation
   */
  async ensureDependenciesInstalled(targetFilePath?: string): Promise<boolean> {
    console.log('📦 Checking project dependencies...\n');

    try {
      const { execSync } = require('child_process');
      const fs = require('fs');
      const path = require('path');

      // Determine which directories need dependencies installed
      const dirsToCheck: string[] = [];

      // Always check root
      const rootPackageJson = path.join(this.projectPath, 'package.json');
      if (fs.existsSync(rootPackageJson)) {
        dirsToCheck.push(this.projectPath);
      }

      // If targetFilePath is provided, only check its subdirectory
      if (targetFilePath) {
        const subDirs = ['server', 'client', 'packages', 'apps'];
        for (const subDir of subDirs) {
          if (targetFilePath.startsWith(subDir + '/') || targetFilePath.startsWith(subDir + path.sep)) {
            const subDirPath = path.join(this.projectPath, subDir);
            const subPackageJson = path.join(subDirPath, 'package.json');
            if (fs.existsSync(subPackageJson)) {
              dirsToCheck.push(subDirPath);
              console.log(`   Target file is in ${subDir}/ - will only install dependencies there\n`);
            }
            break; // Only check the relevant subdirectory
          }
        }
      } else {
        // No target file specified - check all subdirectories (legacy behavior)
        const subDirs = ['server', 'client', 'packages', 'apps'];
        for (const subDir of subDirs) {
          const subDirPath = path.join(this.projectPath, subDir);
          const subPackageJson = path.join(subDirPath, 'package.json');
          if (fs.existsSync(subPackageJson)) {
            dirsToCheck.push(subDirPath);
          }
        }
      }

      // Install dependencies in relevant directories
      for (const dir of dirsToCheck) {
        const nodeModulesPath = path.join(dir, 'node_modules');
        const relativeDir = path.relative(this.projectPath, dir) || '.';
        const displayDir = relativeDir === '.' ? 'root' : relativeDir;

        // Check if node_modules exists and is not empty
        const needsInstall = !fs.existsSync(nodeModulesPath) ||
                            fs.readdirSync(nodeModulesPath).length === 0;

        if (needsInstall) {
          console.log(`   Installing dependencies in ${displayDir}...`);
          execSync('npm install', {
            cwd: dir,
            stdio: 'pipe'
          });
          console.log(`   ✅ Dependencies installed in ${displayDir}\n`);
        } else {
          console.log(`   ✅ Dependencies already installed in ${displayDir}\n`);
        }
      }

      return true;
    } catch (error: any) {
      console.log(`\n❌ Failed to install dependencies: ${error.message}\n`);
      return false;
    }
  }

  /**
   * Detect which test framework is being used
   * Searches upward from the selected node's directory to root
   * If targetFilePath is provided, searches from that directory upward
   * Otherwise checks all common locations
   */
  private detectTestFramework(): void {
    // Determine which locations to check based on target file path
    let locationsToCheck: string[];

    if (this.targetFilePath) {
      // Search upward from the target file's directory to root
      // Example: server/src/controllers/file.ts → check server/, then root
      locationsToCheck = [];

      const subDirs = ['server', 'client', 'packages', 'apps'];
      for (const subDir of subDirs) {
        if (this.targetFilePath.startsWith(subDir + '/') || this.targetFilePath.startsWith(subDir + path.sep)) {
          // Found the subdirectory - add it first (closest to target)
          locationsToCheck.push(path.join(this.projectPath, subDir));
          break;
        }
      }

      // Always check root last (furthest from target, but most general)
      locationsToCheck.push(this.projectPath);
    } else {
      // No target file - check all locations (legacy behavior)
      locationsToCheck = [
        this.projectPath,
        path.join(this.projectPath, 'server'),
        path.join(this.projectPath, 'client'),
        path.join(this.projectPath, 'packages'),
        path.join(this.projectPath, 'apps')
      ];
    }

    let fallbackFramework: TestFramework | null = null;

    // Search for test frameworks (vitest, jest, mocha) in order
    // Return immediately when first proper framework is found
    for (const location of locationsToCheck) {
      const packageJsonPath = path.join(location, 'package.json');

      if (!fs.existsSync(packageJsonPath)) {
        continue;
      }

      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        const scripts = packageJson.scripts || {};

        // Detect Vitest (check first as it's our preferred framework)
        if (deps.vitest || fs.existsSync(path.join(location, 'vitest.config.ts')) ||
            fs.existsSync(path.join(location, 'vitest.config.js'))) {
          this.framework = {
            name: 'vitest',
            command: scripts.test || 'npm test',
            configFile: 'vitest.config.ts',
            testPattern: '**/*.{test,spec}.{js,ts,tsx}'
          };
          return;
        }

        // Detect Jest
        if (deps.jest || fs.existsSync(path.join(location, 'jest.config.js')) ||
            fs.existsSync(path.join(location, 'jest.config.ts'))) {
          this.framework = {
            name: 'jest',
            command: scripts.test || 'npm test',
            configFile: 'jest.config.js',
            testPattern: '**/*.{test,spec}.{js,ts,tsx}'
          };
          return;
        }

        // Detect Mocha
        if (deps.mocha) {
          this.framework = {
            name: 'mocha',
            command: scripts.test || 'npm test',
            testPattern: '**/*.{test,spec}.{js,ts}'
          };
          return;
        }

        // Store fallback if test script exists but no framework detected yet
        // Only store fallback if we're not doing targeted upward search
        if (scripts.test && !fallbackFramework && !this.targetFilePath) {
          fallbackFramework = {
            name: 'unknown',
            command: scripts.test,
            testPattern: '**/*.{test,spec}.{js,ts}'
          };
        }
      } catch (error: any) {
        // Continue to next location
        continue;
      }
    }

    // Use fallback framework if no specific framework was found
    if (fallbackFramework) {
      this.framework = fallbackFramework;
      return;
    }

    // No framework found in any location
    console.log('⚠️  No test framework found in root or subdirectories');
  }

  /**
   * Determine the appropriate working directory for running tests
   * Also detects the test framework specific to that directory
   * Returns both the directory and optionally an updated framework
   */
  private determineTestWorkingDirectory(testFiles: string[]): string {
    if (testFiles.length === 0) {
      return this.projectPath;
    }

    // Get the first test file and determine which subdirectory it's in
    // Normalize to relative path if absolute
    const firstTestFile = testFiles[0];
    const relativeTestFile = path.isAbsolute(firstTestFile)
      ? path.relative(this.projectPath, firstTestFile)
      : firstTestFile;

    console.log(`   🔍 Determining test working directory:`);
    console.log(`      projectPath: ${this.projectPath}`);
    console.log(`      firstTestFile: ${firstTestFile}`);
    console.log(`      relativeTestFile: ${relativeTestFile}`);

    const subDirs = ['server', 'client', 'packages', 'apps'];

    for (const subDir of subDirs) {
      if (relativeTestFile.startsWith(subDir + '/') || relativeTestFile.startsWith(subDir + path.sep)) {
        const subDirPath = path.join(this.projectPath, subDir);
        // Verify that this subdirectory has a package.json with a test framework
        const packageJsonPath = path.join(subDirPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
          try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
            const scripts = packageJson.scripts || {};

            // Check if vitest exists in parent (monorepo root)
            const parentPackageJsonPath = path.join(this.projectPath, 'package.json');
            let parentHasVitest = false;
            if (fs.existsSync(parentPackageJsonPath)) {
              try {
                const parentPackageJson = JSON.parse(fs.readFileSync(parentPackageJsonPath, 'utf-8'));
                const parentDeps = { ...parentPackageJson.dependencies, ...parentPackageJson.devDependencies };
                parentHasVitest = !!parentDeps.vitest || fs.existsSync(path.join(this.projectPath, 'vitest.config.ts'));
              } catch (error) {
                // Ignore
              }
            }

            // Detect framework: either in subdirectory OR in parent (monorepo pattern)
            if (deps.vitest || fs.existsSync(path.join(subDirPath, 'vitest.config.ts')) ||
                fs.existsSync(path.join(subDirPath, 'vitest.config.js')) || parentHasVitest) {
              // Update framework to use vitest
              this.framework = {
                name: 'vitest',
                command: scripts.test || 'npx vitest run',
                configFile: 'vitest.config.ts',
                testPattern: '**/*.{test,spec}.{js,ts,tsx}'
              };
              return subDirPath;
            }

            if (deps.jest || fs.existsSync(path.join(subDirPath, 'jest.config.js')) ||
                fs.existsSync(path.join(subDirPath, 'jest.config.ts'))) {
              this.framework = {
                name: 'jest',
                command: scripts.test || 'npm test',
                configFile: 'jest.config.js',
                testPattern: '**/*.{test,spec}.{js,ts,tsx}'
              };
              return subDirPath;
            }

            if (deps.mocha) {
              this.framework = {
                name: 'mocha',
                command: scripts.test || 'npm test',
                testPattern: '**/*.{test,spec}.{js,ts}'
              };
              return subDirPath;
            }

            // If subdirectory has test script, use it
            if (scripts.test) {
              return subDirPath;
            }
          } catch (error) {
            // Continue to check other subdirectories
          }
        }
      }
    }

    // Default to root
    return this.projectPath;
  }

  /**
   * Run tests for specific test files
   */
  async runTests(testFiles: string[]): Promise<TestResult> {
    if (!this.framework) {
      return {
        success: false,
        passed: 0,
        failed: 0,
        total: 0,
        output: '',
        error: 'No test framework detected',
        testFiles: []
      };
    }

    if (testFiles.length === 0) {
      return {
        success: true,
        passed: 0,
        failed: 0,
        total: 0,
        output: 'No test files found',
        testFiles: []
      };
    }

    // Determine the appropriate working directory for running tests
    // Check if test files are in a subdirectory (server, client, etc.)
    const testCwd = this.determineTestWorkingDirectory(testFiles);

    console.log(`\n🔍 Test execution details:`);
    console.log(`   Working directory: ${testCwd}`);
    console.log(`   Test files (absolute): ${testFiles.join(', ')}`);

    let command = this.framework.command;

    // Make test file paths relative to the test working directory
    // Handle both absolute and relative paths
    const relativeTestFiles = testFiles.map(f => {
      const absolutePath = path.isAbsolute(f) ? f : path.join(this.projectPath, f);
      return path.relative(testCwd, absolutePath);
    });

    console.log(`   Test files (relative): ${relativeTestFiles.join(', ')}`);

    // Add file filter based on framework
    if (this.framework.name === 'jest') {
      const filePattern = relativeTestFiles.map(f => path.basename(f, path.extname(f))).join('|');
      command = `${command} --testNamePattern="${filePattern}" --verbose`;
    } else if (this.framework.name === 'vitest') {
      command = `${command} ${relativeTestFiles.join(' ')}`;
    } else {
      // Generic: try to pass files as arguments
      command = `${command} ${relativeTestFiles.join(' ')}`;
    }

    console.log(`   Command: ${command}`);

    // Show current directory BEFORE changing
    const currentDir = execSync('pwd', { encoding: 'utf-8' }).trim();
    console.log(`\n   📍 CURRENT DIR (before): ${currentDir}`);
    console.log(`   📍 WILL EXECUTE: cd "${testCwd}" && ${command}\n`);

    try {
      const output = execSync(command, {
        cwd: testCwd,
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      const result = this.parseTestOutput(output, this.framework.name);
      result.testFiles = testFiles;
      return result;
    } catch (error: any) {
      // Test failure throws error with output
      const output = error.stdout || error.stderr || error.message;
      const result = this.parseTestOutput(output, this.framework.name);
      result.success = false;
      result.error = error.message;
      result.testFiles = testFiles;
      return result;
    }
  }

  /**
   * Run all tests in the project
   */
  async runAllTests(): Promise<TestResult> {
    if (!this.framework) {
      return {
        success: false,
        passed: 0,
        failed: 0,
        total: 0,
        output: '',
        error: 'No test framework detected',
        testFiles: []
      };
    }

    try {
      const output = execSync(this.framework.command, {
        cwd: this.projectPath,
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      const result = this.parseTestOutput(output, this.framework.name);
      return result;
    } catch (error: any) {
      const output = error.stdout || error.stderr || error.message;
      const result = this.parseTestOutput(output, this.framework.name);
      result.success = false;
      result.error = error.message;
      return result;
    }
  }

  /**
   * Parse test output to extract results
   */
  private parseTestOutput(output: string, framework: string): TestResult {
    let passed = 0;
    let failed = 0;
    let total = 0;

    if (framework === 'jest' || framework === 'vitest') {
      // Parse Jest/Vitest output
      // Vitest format: "Tests  11 passed (11)" or "11 passed"
      // Jest format: "Tests: 1 passed, 1 total"
      const passedMatch = output.match(/(\d+)\s+passed/i);
      const failedMatch = output.match(/(\d+)\s+failed/i);

      // Try multiple formats for total
      let totalMatch = output.match(/Tests?:\s*(\d+)\s+total/i);
      if (!totalMatch) {
        // Vitest format: "Tests  11 passed (11)" - extract the number in parentheses
        totalMatch = output.match(/Tests\s+\d+\s+passed\s+\((\d+)\)/i);
      }

      if (passedMatch) passed = parseInt(passedMatch[1]);
      if (failedMatch) failed = parseInt(failedMatch[1]);
      if (totalMatch) total = parseInt(totalMatch[1]);

      // If total not found, calculate from passed + failed
      if (total === 0 && (passed > 0 || failed > 0)) {
        total = passed + failed;
      }
    } else if (framework === 'mocha') {
      // Parse Mocha output
      const passedMatch = output.match(/(\d+)\s+passing/i);
      const failedMatch = output.match(/(\d+)\s+failing/i);

      if (passedMatch) passed = parseInt(passedMatch[1]);
      if (failedMatch) failed = parseInt(failedMatch[1]);
      total = passed + failed;
    }

    return {
      success: failed === 0 && total > 0,
      passed,
      failed,
      total,
      output,
      testFiles: []
    };
  }

  /**
   * Get the detected test framework
   */
  getFramework(): TestFramework | null {
    return this.framework;
  }

  /**
   * Check if tests exist for a node
   */
  hasTests(testFiles: string[]): boolean {
    return testFiles.length > 0 && testFiles.some(f => fs.existsSync(f));
  }
}
