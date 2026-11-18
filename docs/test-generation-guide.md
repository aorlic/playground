# Test Generation and Infrastructure Guide

A comprehensive guide for generating test infrastructure, writing tests with proper mocking, and verifying test coverage in monorepo/nested repository structures.

---

## Table of Contents

1. [Path Normalization Rules](#path-normalization-rules)
2. [Test Infrastructure Setup](#test-infrastructure-setup)
3. [Test Framework Detection](#test-framework-detection)
4. [Test Generation Rules](#test-generation-rules)
5. [Mocking Patterns](#mocking-patterns)
6. [Test Execution and Verification](#test-execution-and-verification)
7. [Git Operations](#git-operations)
8. [PR Creation Checklist](#pr-creation-checklist)

---

## Path Normalization Rules

### Critical Rule: Always Normalize Paths

When working with file paths, **ALWAYS** handle both absolute and relative paths:

```typescript
// ✅ CORRECT: Normalize before use
const absoluteFilePath = path.isAbsolute(node.filePath)
  ? node.filePath
  : path.join(this.projectRoot, node.filePath);

const relativeFilePath = path.relative(projectRoot, absoluteFilePath);
```

```typescript
// ❌ WRONG: Assuming path is always relative or absolute
const relativeFilePath = path.relative(projectRoot, node.filePath);
// This fails if node.filePath is relative!
```

### Why This Matters

- File paths can come from different sources (AST, user input, file system)
- Some sources provide absolute paths, others provide relative paths
- Operations like `path.relative()` produce incorrect results if input is already relative
- Results in "test files not found" or incorrect directory calculations

### Key Locations to Apply

1. **Test file discovery** - When finding test files for a source file
2. **Vitest installation** - When determining which directory needs vitest
3. **Test execution** - When calculating working directory for test runner
4. **Git operations** - When staging files relative to git root

---

## Test Infrastructure Setup

### Vitest Installation Rules

#### Rule 1: Install Vitest with Vite

Vitest requires `vite` as a peer dependency. **ALWAYS** install both:

```typescript
// ✅ CORRECT
execSync('npm install --save-dev vitest vite --legacy-peer-deps', {
  cwd: installLocation,
  stdio: 'inherit'
});
```

```typescript
// ❌ WRONG
execSync('npm install --save-dev vitest', {...});
// Will fail with: Cannot find package 'vite'
```

#### Rule 2: Install in Correct Directory (Monorepo Support)

Use upward search pattern for subdirectories:

```typescript
private determineVitestInstallLocation(): string {
  if (!this.targetFilePath) {
    return this.projectPath;
  }

  // Normalize target path (handle absolute/relative)
  const relativeTargetPath = path.isAbsolute(this.targetFilePath)
    ? path.relative(this.projectPath, this.targetFilePath)
    : this.targetFilePath;

  // Check subdirectories first (server/, client/, packages/, apps/)
  const subDirs = ['server', 'client', 'packages', 'apps'];
  for (const subDir of subDirs) {
    if (relativeTargetPath.startsWith(subDir + '/') ||
        relativeTargetPath.startsWith(subDir + path.sep)) {
      const subDirPath = path.join(this.projectPath, subDir);
      if (fs.existsSync(path.join(subDirPath, 'package.json'))) {
        console.log(`   📍 Target file is in ${subDir}/ - will install vitest there\n`);
        return subDirPath;
      }
      break;
    }
  }

  return this.projectPath;
}
```

**Why**: In monorepos, each package has its own `package.json` and dependencies.

#### Rule 3: Clear User Messaging

```typescript
// ✅ CORRECT: Show clear location
const displayDir = relativeDir === '.' ? 'root' : relativeDir;
console.log(`📦 Installing vitest in: ${displayDir}`);
```

```typescript
// ❌ WRONG: Confusing output
console.log(`📦 Installing vitest in: .`);
// User doesn't know what "." means
```

### Infrastructure Files to Track

Always track these files for staging:

```typescript
const infrastructureFiles = [
  'package.json',           // Dependencies added
  'package-lock.json',      // Lock file updated
  'vitest.config.ts',       // Vitest configuration
  'vite.config.ts'          // Vite configuration (if separate)
];
```

---

## Test Framework Detection

### Rule: Scope Detection to Target Node

**NEVER** scan entire project. Only check directories relevant to the target file:

```typescript
// ✅ CORRECT: Scoped detection
async detectFramework(targetFilePath?: string): Promise<TestFramework | null> {
  let searchPath = this.projectPath;

  if (targetFilePath) {
    const relativeTarget = path.isAbsolute(targetFilePath)
      ? path.relative(this.projectPath, targetFilePath)
      : targetFilePath;

    // Check if in subdirectory with own package.json
    const subDirs = ['server', 'client', 'packages', 'apps'];
    for (const subDir of subDirs) {
      if (relativeTarget.startsWith(subDir + '/')) {
        const subDirPath = path.join(this.projectPath, subDir);
        if (fs.existsSync(path.join(subDirPath, 'package.json'))) {
          searchPath = subDirPath;
          break;
        }
      }
    }
  }

  // Now check package.json at searchPath
  const packageJson = path.join(searchPath, 'package.json');
  // ...
}
```

**Why**: Prevents detecting `react-scripts` in client/ when refactoring server/ code.

---

## Test Generation Rules

### Rule 1: Generate Complete Test Files

A valid test file must have:

1. ✅ Proper imports
2. ✅ Mock declarations (if needed)
3. ✅ At least one `describe()` block
4. ✅ At least one `it()` or `test()` case
5. ✅ Assertions using framework's expect API

### Rule 2: Test File Naming Convention

```typescript
// Source: src/services/database.ts
// Test:   src/services/database.test.ts

// Source: lib/utils/parser.js
// Test:   lib/utils/parser.test.js
```

Pattern: `{basename}.test.{extension}`

### Rule 3: Import Paths Must Be Relative

```typescript
// ✅ CORRECT
import { initDatabase, pool } from './database';
import { processUser } from '../utils/userProcessor';

// ❌ WRONG
import { initDatabase } from 'src/config/database';
import { processUser } from '@/utils/userProcessor';
```

**Why**: Test files are co-located with source files, so imports must be relative.

### Rule 4: Validate Generated Tests

```typescript
// After generating test code, verify:
const hasTestCases = /\b(it|test)\s*\(/.test(testCode);
if (!hasTestCases) {
  throw new Error('Generated test has no test cases');
}

const hasDescribe = /\bdescribe\s*\(/.test(testCode);
if (!hasDescribe) {
  console.warn('Test file should have describe blocks');
}
```

---

## Mocking Patterns

### CRITICAL: Mock External Dependencies, NOT Your Own Code

This is the **most important** rule for vitest mocking.

**Rule**: The test generator MUST analyze the source code's imports and mock ALL external packages, but NEVER mock internal helper functions or the code being tested.

### ✅ CORRECT Pattern: Mock External Dependency

```typescript
// Mock the EXTERNAL library ('pg'), not your code
vi.mock('pg', () => {
  const mockPool = {
    connect: vi.fn(),
    query: vi.fn(),
    end: vi.fn()
  };

  // Pool constructor must be a function (not arrow function)
  return {
    Pool: vi.fn(function(this: any) {
      return mockPool;
    })
  };
});

// Import your code AFTER mocks - it will use the mocked 'pg'
import { initDatabase, pool } from './database';
import { Pool } from 'pg';

// Get typed references AFTER imports
const mockConnect = vi.mocked(pool.connect);
const mockQuery = vi.mocked(pool.query);
```

### ❌ WRONG Pattern: Mock Your Own Code

```typescript
// ❌ DON'T DO THIS
vi.mock('./database', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    pool: {
      connect: vi.fn(),
      query: vi.fn()
    }
  };
});
```

**Why This Fails**:
- Using `importOriginal()` instantiates the real code
- Real code creates real `Pool` instance before mock intercepts
- Results in actual database connections, file writes, API calls, etc.

### Vitest Hoisting Rules

```typescript
// ✅ CORRECT: All mocks inline
vi.mock('pg', () => {
  // Everything created inline with vi.fn()
  const mockPool = {
    connect: vi.fn(),
    query: vi.fn().mockResolvedValue({ rows: [] })
  };

  return {
    Pool: vi.fn(function() { return mockPool; })
  };
});

// ❌ WRONG: References external variable
const mockConnect = vi.fn();  // ❌ Defined outside

vi.mock('pg', () => {
  return {
    Pool: vi.fn(function() {
      return { connect: mockConnect }; // ❌ References external var
    })
  };
});
```

**Why**: `vi.mock()` is hoisted to the top of the file. It executes before any other code, so external variables aren't available yet.

### Common Mocking Scenarios

#### Database (PostgreSQL)

```typescript
vi.mock('pg', () => {
  const mockPool = {
    connect: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    end: vi.fn().mockResolvedValue(undefined)
  };

  return {
    Pool: vi.fn(function(this: any) {
      return mockPool;
    })
  };
});
```

#### HTTP Client (axios)

```typescript
vi.mock('axios', () => {
  return {
    default: {
      get: vi.fn().mockResolvedValue({ data: {} }),
      post: vi.fn().mockResolvedValue({ data: {} })
    }
  };
});
```

#### File System

```typescript
vi.mock('fs/promises', () => {
  return {
    readFile: vi.fn().mockResolvedValue('file contents'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined)
  };
});
```

### Setting Mock Return Values in Tests

```typescript
import { pool } from './database';
import { vi } from 'vitest';

describe('Database Tests', () => {
  it('should query users', async () => {
    // Cast to mock to access mock methods
    const mockQuery = vi.mocked(pool.query);

    // Set return value for this test
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Alice' }],
      rowCount: 1
    });

    const result = await getUserById(1);

    expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1]);
    expect(result).toEqual({ id: 1, name: 'Alice' });
  });
});
```

---

## Test Execution and Verification

### Rule 1: Run Tests from Correct Working Directory

```typescript
// Determine working directory where vitest is installed
const firstTestFile = testFiles[0];
const relativeTestFile = path.isAbsolute(firstTestFile)
  ? path.relative(this.projectPath, firstTestFile)
  : firstTestFile;

let testCwd = this.projectPath;

// Check if test is in subdirectory with own package.json
const subDirs = ['server', 'client', 'packages', 'apps'];
for (const subDir of subDirs) {
  if (relativeTestFile.startsWith(subDir + '/')) {
    const subDirPath = path.join(this.projectPath, subDir);
    if (fs.existsSync(path.join(subDirPath, 'vitest.config.ts')) ||
        fs.existsSync(path.join(subDirPath, 'package.json'))) {
      testCwd = subDirPath;
      break;
    }
  }
}
```

### Rule 2: Make Test Paths Relative to Working Directory

```typescript
const relativeTestFiles = testFiles.map(f => {
  const absolutePath = path.isAbsolute(f) ? f : path.join(this.projectPath, f);
  return path.relative(testCwd, absolutePath);
});

const testCommand = `npx vitest run ${relativeTestFiles.join(' ')}`;
```

### Rule 3: Parse Test Results

```typescript
interface TestResult {
  success: boolean;
  total: number;
  passed: number;
  failed: number;
  output: string;
}

// Parse vitest output
const passMatch = output.match(/(\d+) passed/);
const failMatch = output.match(/(\d+) failed/);
const totalMatch = output.match(/Test Files\s+\d+\s+passed.*?\((\d+)\)/);

return {
  success: exitCode === 0,
  total: totalMatch ? parseInt(totalMatch[1]) : 0,
  passed: passMatch ? parseInt(passMatch[1]) : 0,
  failed: failMatch ? parseInt(failMatch[1]) : 0,
  output
};
```

### Rule 4: Automatic Test Fixing Loop

When tests fail, attempt to fix them automatically:

```typescript
let fixAttempts = 0;
const maxFixAttempts = 2;

while ((testResult.failed > 0 || testResult.total === 0) &&
       fixAttempts < maxFixAttempts) {
  fixAttempts++;
  console.log(`🔧 Attempting to fix tests (attempt ${fixAttempts}/${maxFixAttempts})...`);

  try {
    const currentTestCode = fs.readFileSync(testFilePath, 'utf-8');

    // Use Claude AI to analyze failure and generate fix
    const fixedCode = await testGenerator.fixFailingTests({
      testCode: currentTestCode,
      sourceCode: sourceCode,
      failureOutput: testResult.output,
      testFramework: framework.name,
      testFilePath
    });

    // Validate fixed code has test cases
    if (!/\b(it|test)\s*\(/.test(fixedCode)) {
      console.log('❌ Fixed test code has no test cases. Skipping fix.');
      break;
    }

    // Apply fix
    fs.writeFileSync(testFilePath, fixedCode, 'utf-8');
    console.log('✅ Applied test fixes');

    // Re-run tests
    testResult = await testRunner.runTests([testFilePath]);

    if (testResult.success && testResult.failed === 0 && testResult.total > 0) {
      console.log(`✅ All ${testResult.total} tests now pass!`);
      break;
    }
  } catch (error: any) {
    console.log(`❌ Error fixing tests: ${error.message}`);
    break;
  }
}
```

---

## Git Operations

### CRITICAL: Use Git Root, Not Project Path

This is **essential** for monorepos and nested repositories.

### Rule 1: Determine Git Root Early

```typescript
// Find git root directory ONCE at the start of commit process
let gitRoot: string;
try {
  gitRoot = execSync('git rev-parse --show-toplevel', {
    cwd: projectPath,
    encoding: 'utf-8'
  }).trim();
  console.log(`   Git repository root: ${gitRoot}`);
} catch (error) {
  console.log('   ⚠️  Not in a git repository');
  gitRoot = projectPath; // Fallback
}
```

### Rule 2: ALL Git Commands Use `gitRoot` as Working Directory

```typescript
// ✅ CORRECT: Use gitRoot
const relativeFilePath = path.relative(gitRoot, absoluteFilePath);
execSync(`git add "${relativeFilePath}"`, {
  cwd: gitRoot,  // ✅
  stdio: 'pipe'
});

// ❌ WRONG: Use projectPath
execSync(`git add "${filePath}"`, {
  cwd: projectPath,  // ❌ Wrong when projectPath ≠ gitRoot
  stdio: 'pipe'
});
```

### Rule 3: Stage ALL Modified Files

Must stage:

1. **Refactored source file**
   ```typescript
   const relativeFilePath = path.relative(gitRoot, filePath);
   execSync(`git add "${relativeFilePath}"`, { cwd: gitRoot, stdio: 'pipe' });
   ```

2. **All test files**
   ```typescript
   for (const testFile of testFiles) {
     const relativeTestFile = path.relative(gitRoot, testFile);
     execSync(`git add "${relativeTestFile}"`, { cwd: gitRoot, stdio: 'pipe' });
   }
   ```

3. **Infrastructure files** (in all relevant directories)
   ```typescript
   const infrastructureFiles = ['package.json', 'package-lock.json', 'vitest.config.ts'];
   const checkDirs = [projectPath]; // Add subdirectories if needed

   for (const dir of checkDirs) {
     for (const fileName of infrastructureFiles) {
       const filePath = path.join(dir, fileName);
       if (fs.existsSync(filePath)) {
         const relativeFilePath = path.relative(gitRoot, filePath);

         // Check if file has changes
         const statusOutput = execSync(`git status --porcelain "${relativeFilePath}"`, {
           cwd: gitRoot,
           encoding: 'utf-8'
         }).trim();

         if (statusOutput) {
           execSync(`git add "${relativeFilePath}"`, { cwd: gitRoot, stdio: 'pipe' });
           console.log(`✅ Staged: ${relativeFilePath}`);
         }
       }
     }
   }
   ```

### Rule 4: Commit and Push from Git Root

```typescript
// Commit
execSync(`git commit -F "${tempCommitFile}"`, {
  cwd: gitRoot,  // ✅ Not projectPath
  stdio: 'pipe'
});

// Push
execSync(`git push -u origin ${branchName}`, {
  cwd: gitRoot,  // ✅ Not projectPath
  stdio: 'inherit'
});
```

---

## PR Creation Checklist

### Pre-PR Validation

Before creating PR, verify:

```typescript
// ✅ 1. All tests pass
if (testResult.failed > 0) {
  throw new Error('Cannot create PR with failing tests');
}

// ✅ 2. Test files exist and have test cases
for (const testFile of testFiles) {
  const content = fs.readFileSync(testFile, 'utf-8');
  if (!/\b(it|test)\s*\(/.test(content)) {
    throw new Error(`Test file ${testFile} has no test cases`);
  }
}

// ✅ 3. All files are staged
const statusOutput = execSync('git status --porcelain', {
  cwd: gitRoot,
  encoding: 'utf-8'
}).trim();

if (statusOutput) {
  console.warn('⚠️  Unstaged changes detected:');
  console.warn(statusOutput);
}
```

### PR Description Template

```typescript
const prTitle = `refactor: improve ${nodeName}`;

const prBody = `## Refactoring Summary

**Node:** \`${nodeType}\` - \`${nodeName}\`
**Location:** \`${fileName}:${startLine}-${endLine}\`

## Metrics Improvement

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Quality Score | ${scoreBefore.toFixed(1)} | ${scoreAfter.toFixed(1)} | ${scoreChange > 0 ? '+' : ''}${scoreChange.toFixed(1)} |
| Cyclomatic Complexity | ${ccBefore} | ${ccAfter} | ${ccChange > 0 ? '+' : ''}${ccChange} |
| Maintainability Index | ${miBefore.toFixed(1)} | ${miAfter.toFixed(1)} | ${miChange > 0 ? '+' : ''}${miChange.toFixed(1)} |
| Halstead Volume | ${volBefore.toFixed(0)} | ${volAfter.toFixed(0)} | ${volChange > 0 ? '+' : ''}${volChange.toFixed(0)} |
| Lines of Code | ${locBefore} | ${locAfter} | ${locChange > 0 ? '+' : ''}${locChange} |

## Testing

- **Test Files**: ${testFiles.length}
- **Test Cases**: ${totalTestCases}
- **Test Status**: ✅ All passing
${infrastructureAdded ? `- **Testing Infrastructure**: Added (vitest, vite)` : ''}

## Changes Included

- ✅ Refactored source code
- ✅ Generated/updated test files
${vitestInstalled ? '- ✅ Installed vitest + vite' : ''}
${configAdded ? '- ✅ Added vitest.config.ts' : ''}
- ✅ Updated package.json
- ✅ Updated package-lock.json

🤖 Generated with Claude Code Quality Analyzer
`;
```

### Files That Must Be in PR

Verify these are staged:

1. ✅ Refactored source file
2. ✅ All test files (new and existing)
3. ✅ package.json (if dependencies changed)
4. ✅ package-lock.json (if dependencies changed)
5. ✅ vitest.config.ts (if created)
6. ✅ vite.config.ts (if created)

### Common Gotchas

```typescript
// ❌ GOTCHA 1: Checking git status with wrong cwd
const status = execSync('git status --porcelain', {
  cwd: projectPath  // ❌ Should be gitRoot
});

// ❌ GOTCHA 2: Not checking if files are actually modified
execSync(`git add "${file}"`, { cwd: gitRoot });
// Should check with git status first!

// ❌ GOTCHA 3: Using absolute paths in git commands
execSync(`git add "${absolutePath}"`, { cwd: gitRoot });
// Git expects paths relative to gitRoot!

// ✅ CORRECT: Check status, use relative paths
const relPath = path.relative(gitRoot, absolutePath);
const status = execSync(`git status --porcelain "${relPath}"`, {
  cwd: gitRoot,
  encoding: 'utf-8'
}).trim();

if (status) {
  execSync(`git add "${relPath}"`, { cwd: gitRoot });
}
```

---

## Common Error Patterns and Solutions

### Error: "0 tests found"

**Cause**: Path normalization issue

**Solution**:
```typescript
// Always normalize paths before path.relative()
const absolutePath = path.isAbsolute(filePath)
  ? filePath
  : path.join(projectRoot, filePath);
const relativePath = path.relative(projectRoot, absolutePath);
```

### Error: "Cannot find package 'vite'"

**Cause**: Only installed vitest, not vite

**Solution**:
```typescript
execSync('npm install --save-dev vitest vite --legacy-peer-deps', {...});
```

### Error: "Cannot access 'mockFn' before initialization"

**Cause**: Vitest hoisting violation

**Solution**:
```typescript
// ❌ WRONG
const mockFn = vi.fn();
vi.mock('module', () => ({ fn: mockFn }));

// ✅ CORRECT
vi.mock('module', () => ({ fn: vi.fn() }));
const mockFn = vi.mocked(importedModule.fn);
```

### Error: Test connects to real database

**Cause**: Mocking application code instead of dependency

**Solution**:
```typescript
// ❌ WRONG
vi.mock('./database', () => ({...}));

// ✅ CORRECT
vi.mock('pg', () => ({...}));
```

### Error: "Infrastructure files not staged"

**Cause**: Using `projectPath` instead of `gitRoot`

**Solution**:
```typescript
// ❌ WRONG
execSync(`git add package.json`, { cwd: projectPath });

// ✅ CORRECT
const gitRoot = execSync('git rev-parse --show-toplevel', {
  cwd: projectPath,
  encoding: 'utf-8'
}).trim();
const relPath = path.relative(gitRoot, path.join(projectPath, 'package.json'));
execSync(`git add "${relPath}"`, { cwd: gitRoot });
```

### Error: "Cannot find package 'passport'" (or other external package)

**Cause**: Test generator didn't mock all external dependencies imported by source code

**Solution**: Enhance test generator prompt to:
1. Analyze ALL import statements in source code
2. Identify external packages (npm packages that aren't relative imports)
3. Add vi.mock() for EVERY external package found
4. Never try to mock helper functions that are internal to the file

```typescript
// Source code imports:
import bcrypt from 'bcrypt';
import passport from 'passport';
import { pool } from '../config/database';

// Helper function (NOT imported, internal to file)
const validateInput = (email) => { ... };

// ✅ CORRECT Test mocks:
vi.mock('bcrypt', () => ({ default: { hash: vi.fn() } }));
vi.mock('passport', () => ({ default: {} }));
vi.mock('../config/database', () => ({ pool: { query: vi.fn() } }));

// ❌ WRONG: Don't try to mock validateInput
// vi.mock('../utils/validation', () => ({ validateInput: vi.fn() }));
// This will fail because validateInput isn't in a separate file!
```

### Error: "Cannot find module '../utils/validation'"

**Cause**: Test generator invented import paths for helper functions that don't exist as separate modules

**Root Cause**: Helper functions are defined in the same file as the code being tested, not in separate modules

**Solution**:
1. Test generator MUST NOT invent import paths
2. Only mock imports that ACTUALLY EXIST in the source code
3. Test through public interface - helper functions will be called internally
4. Don't try to import or mock non-exported helper functions

### Error: "Coverage shows 50% but I already generated tests"

**Cause**: Test coverage analyzer was counting `describe` blocks instead of actual test cases

**Root Cause**:
- Old logic counted `describe('register', ...)` as 1 test
- Didn't count the 12 `it()` cases inside the describe block
- Resulted in reporting 1 test when there were actually 12

**Solution**: Enhanced test counter to:
1. Look for `describe()` blocks matching the node name
2. If found, count ALL `it()` and `test()` cases in the entire file
3. If no describe block, try to find individual tests mentioning the node
4. Fallback: count all tests and estimate 30% relate to this node

**Code Fix** (TestCoverageAnalyzer.ts):
```typescript
// ✅ CORRECT: Count all test cases in file if describe block exists
const describePattern = new RegExp(
  `describe\\s*\\(['"]\s*${nodeName}\\s*['"]`,
  'gi'
);
if (content.match(describePattern)) {
  // Count all it() and test() calls in file
  const allTests = content.match(/\b(it|test)\s*\(/gi);
  totalTests = allTests ? allTests.length : 0;
}

// ❌ WRONG: Count describe blocks as tests
const matches = content.match(/describe.*register/gi);
totalTests = matches ? matches.length : 0; // Returns 1, not 12!
```

---

## Summary: The Golden Rules

1. **Path Normalization**: Always handle both absolute and relative paths
2. **Vitest + Vite**: Always install both together
3. **Mock Dependencies**: Mock external libraries, NOT your own code
4. **Vitest Hoisting**: Create all mocks inline with `vi.fn()`
5. **Scope Operations**: Only scan/install in directories relevant to target file
6. **Git Root**: ALL git operations use `gitRoot`, not `projectPath`
7. **Stage Everything**: Refactored code + tests + infrastructure files
8. **Verify Tests**: Auto-fix failing tests before creating PR
9. **Complete PRs**: Code must work before AND after PR
10. **Clear Messaging**: User should always know what's happening

---

## References

- **Vitest Documentation**: https://vitest.dev/
- **Vitest Mocking**: https://vitest.dev/guide/mocking.html
- **Git Best Practices**: https://git-scm.com/docs
- **Monorepo Patterns**: https://monorepo.tools/

---

**Last Updated**: 2026-11-16
**Version**: 1.0
