import Anthropic from '@anthropic-ai/sdk';
import { PDGNode } from './types';
import * as fs from 'fs';
import * as path from 'path';

export interface TestGenerationRequest {
  code: string;
  filePath: string;
  nodeType: string;
  nodeName: string;
  existingTests?: string;
  testFramework: string;
  cyclomaticComplexity: number;
  missingTestCount: number;
}

export interface TestGenerationResult {
  testCode: string;
  testFilePath: string;
  explanation: string;
  testCases: string[];
}

export interface TestFixRequest {
  testCode: string;
  sourceCode: string;
  failureOutput: string;
  testFramework: string;
  testFilePath: string;
}

export class ClaudeTestGenerator {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Generate test cases for a node
   */
  async generateTests(request: TestGenerationRequest): Promise<TestGenerationResult> {
    const prompt = this.buildTestGenerationPrompt(request);

    const message = await this.client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    return this.parseTestGenerationResponse(responseText, request);
  }

  /**
   * Fix failing tests by analyzing the error output
   */
  async fixFailingTests(request: TestFixRequest): Promise<string> {
    const prompt = this.buildTestFixPrompt(request);

    const message = await this.client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Extract the fixed test code
    const codeMatch = responseText.match(/```(?:typescript|ts|javascript|js)?\n([\s\S]*?)```/);
    if (codeMatch) {
      return codeMatch[1].trim();
    }

    // If no code block found, return the entire response (might be code without markdown)
    return responseText.trim();
  }

  /**
   * Build prompt for test generation
   */
  private buildTestGenerationPrompt(request: TestGenerationRequest): string {
    const existingTestsSection = request.existingTests
      ? `**Existing Tests**:
\`\`\`typescript
${request.existingTests}
\`\`\`

Note: Build upon these existing tests. Do not duplicate them.`
      : `**Existing Tests**: None

Note: No existing tests found. You are creating a complete test suite from scratch.
This is a greenfield test file - include all necessary imports, setup, and test structure.`;

    return `You are a test generation expert. Generate comprehensive unit tests for the following code.

**Code Context**:
- File: ${request.filePath}
- Node Type: ${request.nodeType}
- Function/Class: ${request.nodeName}
- Cyclomatic Complexity: ${request.cyclomaticComplexity}
- Test Cases to Generate: ${request.missingTestCount}
- Test Framework: ${request.testFramework}

**Code to Test**:
\`\`\`typescript
${request.code}
\`\`\`

${existingTestsSection}

**Your Task**:
1. **FIRST**: Analyze the "Code to Test" section and identify ALL external dependencies
   - Look at the import statements at the top of the code
   - Identify which imports are EXTERNAL packages (npm packages like 'pg', 'bcrypt', 'axios', 'passport', etc.)
   - Identify which imports are INTERNAL modules (starting with './' or '../')
   - Note: You must mock ALL external packages, but NOT internal helper functions within the same file

2. Generate exactly ${request.missingTestCount} complete, working test cases
3. ${request.existingTests ? 'Add to existing tests without duplicating' : 'Create a complete, standalone test file with all imports and setup'}
4. Each test MUST use it() or test() function with actual test logic inside
5. Include tests for:
   - Happy path scenarios
   - Edge cases (null, undefined, empty values)
   - Error conditions
   - Boundary values
   - All conditional branches

6. Follow ${request.testFramework} best practices
7. Use clear, descriptive test names (e.g., "should handle valid input", "should throw error on null")
8. Include all necessary imports: test framework, the function/class being tested, mocks, etc.
9. Each test must have assertions (expect, assert, etc.)
10. Mock external dependencies appropriately (see mocking rules below)

**CRITICAL - Import Paths**:
- The test file will be in the SAME directory as the code being tested
- Look at the imports in the code above (the "Code to Test" section)
- When importing the function/class to test: use './filename' (same directory)
- When mocking dependencies: use the EXACT SAME import path as shown in the code
- Example: If code imports from '../config/database', your mock MUST use '../config/database'
- DO NOT invent new import paths - copy them from the code being tested

**CRITICAL**: Do NOT generate placeholder tests, empty describe blocks, or TODO comments.
Every it() or test() block must contain working test code with assertions.

**CRITICAL - What to Mock**:
1. **ALWAYS Mock External npm Packages**:
   - Database libraries: 'pg', 'mysql', 'mongodb', 'sequelize', etc.
   - HTTP clients: 'axios', 'node-fetch', 'request', etc.
   - Authentication: 'passport', 'jsonwebtoken', 'bcrypt', etc.
   - File system: 'fs', 'fs/promises', etc.
   - Any package from node_modules

2. **NEVER Mock Internal Code**:
   - DO NOT mock helper functions in the same file (they're private, not exported)
   - DO NOT use importOriginal() to mock your own modules
   - DO NOT mock the code you're testing

3. **Example**: If testing authController.ts that imports:
   - ✅ Mock: 'passport', 'bcrypt', '../config/database' (pool)
   - ❌ Don't Mock: validateRegistrationInput (it's in the same file, not imported)

**CRITICAL - Vitest Mocking Rules (MUST FOLLOW)**:
- vi.mock() calls are HOISTED to the top of the file
- NEVER reference external variables inside vi.mock() factory
- ALL mock functions must be created INLINE with vi.fn()
- Get typed mock references AFTER imports using vi.mocked()
- **MOST IMPORTANT**: Mock the DEPENDENCY (e.g., 'pg', 'axios'), NOT the code being tested

**Example of CORRECT vitest mocking (mocking external dependency):**
\`\`\`typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// CORRECT: Mock the external dependency ('pg'), not your own code
vi.mock('pg', () => {
  const mockPool = {
    connect: vi.fn(),
    query: vi.fn(),
    end: vi.fn()
  };

  return {
    Pool: vi.fn(function(this: any) {
      return mockPool;
    })
  };
});

// Import your code AFTER mocks - it will use the mocked dependencies
import { initDatabase, pool } from './database';

// Get typed references AFTER imports
const mockConnect = vi.mocked(pool.connect);

describe('initDatabase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn()
    };
    mockConnect.mockResolvedValue(mockClient);
  });

  it('should initialize database tables', async () => {
    await initDatabase();
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });
});
\`\`\`

**WRONG (causes real database connections):**
\`\`\`typescript
// ❌ Mocking your own module with importOriginal
vi.mock('./database', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, pool: { connect: vi.fn() } }; // ❌ Real pool already instantiated!
});
\`\`\`

**Example: Testing a controller with helper functions in same file**
\`\`\`typescript
// Source: authController.ts
import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import passport from 'passport';
import { pool } from '../config/database';

// Helper function (NOT exported, internal to file)
const validateInput = (email?: string) => {
  if (!email) return 'Email required';
  return null;
};

// Function to test (exported)
export const register = async (req: Request, res: Response) => {
  const error = validateInput(req.body.email);
  if (error) return res.status(400).json({ error });
  const hash = await bcrypt.hash(req.body.password, 10);
  await pool.query('INSERT INTO users...', [req.body.email, hash]);
  res.status(201).json({ success: true });
};

// CORRECT Test:
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

// ✅ Mock external dependencies ONLY
vi.mock('bcrypt', () => ({ default: { hash: vi.fn() } }));
vi.mock('passport', () => ({ default: {} }));
vi.mock('../config/database', () => ({ pool: { query: vi.fn() } }));

// Import after mocks
import { register } from './authController';
import { pool } from '../config/database';
import bcrypt from 'bcrypt';

describe('register', () => {
  it('should return 400 when email is missing', async () => {
    const req = { body: {} } as Request;
    const res = { status: vi.fn().mockReturnValue({ json: vi.fn() }) } as any;

    await register(req, res);

    // validateInput runs internally - we test through the public interface
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should hash password and insert user', async () => {
    const req = { body: { email: 'test@test.com', password: 'pass' } } as Request;
    const res = { status: vi.fn().mockReturnValue({ json: vi.fn() }) } as any;

    vi.mocked(bcrypt.hash).mockResolvedValue('hashed');
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);

    await register(req, res);

    expect(bcrypt.hash).toHaveBeenCalledWith('pass', 10);
    expect(pool.query).toHaveBeenCalledWith(expect.any(String), ['test@test.com', 'hashed']);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
\`\`\`

**Response Format**:
Provide your response in the following format:

TEST_CODE:
\`\`\`typescript
[Complete, runnable test file code here with ${request.missingTestCount} actual test cases using it() or test()]
\`\`\`

EXPLANATION:
[Brief explanation of the test strategy and coverage]

TEST_CASES:
- [Test case 1: Description of what it tests]
- [Test case 2: Description of what it tests]
- [Test case 3: Description of what it tests]

Remember: Generate ${request.missingTestCount} COMPLETE, WORKING test cases with assertions that will pass when executed.`;
  }

  /**
   * Build prompt for fixing failing tests
   */
  private buildTestFixPrompt(request: TestFixRequest): string {
    return `You are a testing expert. A test file is failing and needs to be fixed.

**Current Test Code**:
\`\`\`typescript
${request.testCode}
\`\`\`

**Source Code Being Tested**:
\`\`\`typescript
${request.sourceCode}
\`\`\`

**Test Failure Output**:
\`\`\`
${request.failureOutput}
\`\`\`

**Test Framework**: ${request.testFramework}

**Your Task**:
Analyze the test failure and fix the test code. Common issues to check:

1. **Missing External Dependency Mocks**: Check if all external npm packages are mocked
   - Look for errors like "Cannot find package 'passport'" or "Cannot find module..."
   - Add vi.mock() for ANY external package imported by the source code
   - Example: If source imports 'passport', 'bcrypt', add mocks for both

2. **Incorrect Mock Targets**: Are you mocking the right things?
   - ✅ Mock: External packages ('pg', 'bcrypt', 'passport', 'axios')
   - ❌ Don't Mock: Helper functions in the same file (they're not imported, they're internal)
   - ❌ Don't Mock: Your own code with importOriginal()

3. **Incorrect Expectations**: The test might expect the wrong number of calls, wrong values, or wrong error messages

4. **Mock Setup Issues**: Mocks might not be configured properly (missing mockResolvedValue, wrong mock structure)

5. **Async Issues**: Missing await, wrong promise handling

6. **Import/Path Issues**: Incorrect imports or mock paths

7. **Timing Issues**: Race conditions, missing beforeEach setup

**CRITICAL - Mocking Rules**:
- Mock ALL external dependencies (npm packages) that the source code imports
- Mock external dependencies (e.g., 'pg'), NOT your own code
- Use vi.fn() inline in vi.mock(), never reference external variables
- For constructors, use: \`Pool: vi.fn(function(this: any) { return mockPool; })\`
- Don't try to import or mock helper functions that aren't exported from the source file

**Instructions**:
1. Identify the root cause of the failure from the error output
2. Fix ONLY what's broken - don't rewrite working parts
3. Ensure all test cases use proper assertions
4. Make sure mocks are correctly configured
5. Return the COMPLETE fixed test file

Provide ONLY the fixed test code in a typescript code block, nothing else.`;
  }

  /**
   * Parse the AI response to extract test code
   */
  private parseTestGenerationResponse(
    responseText: string,
    request: TestGenerationRequest
  ): TestGenerationResult {
    // Extract test code
    const testCodeMatch = responseText.match(/TEST_CODE:\s*```(?:typescript|ts|javascript|js)?\n([\s\S]*?)```/i);
    const testCode = testCodeMatch ? testCodeMatch[1].trim() : '';

    // Extract explanation
    const explanationMatch = responseText.match(/EXPLANATION:\s*([\s\S]*?)(?=TEST_CASES:|$)/i);
    const explanation = explanationMatch ? explanationMatch[1].trim() : '';

    // Extract test cases list
    const testCasesMatch = responseText.match(/TEST_CASES:\s*([\s\S]*?)$/i);
    const testCasesText = testCasesMatch ? testCasesMatch[1].trim() : '';
    const testCases = testCasesText
      .split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.replace(/^-\s*/, '').trim());

    // Determine test file path
    const testFilePath = this.determineTestFilePath(request.filePath, request.testFramework);

    return {
      testCode,
      testFilePath,
      explanation,
      testCases
    };
  }

  /**
   * Determine the appropriate test file path
   */
  private determineTestFilePath(sourceFilePath: string, framework: string): string {
    const ext = path.extname(sourceFilePath);
    const base = path.basename(sourceFilePath, ext);
    const dir = path.dirname(sourceFilePath);

    // Check if __tests__ directory exists
    const testsDir = path.join(dir, '__tests__');
    if (fs.existsSync(testsDir)) {
      return path.join(testsDir, `${base}.test${ext}`);
    }

    // Otherwise, place test file next to source
    return path.join(dir, `${base}.test${ext}`);
  }

  /**
   * Merge new tests with existing test file
   */
  async mergeWithExistingTests(
    existingTestFilePath: string,
    newTestCode: string,
    apiKey: string
  ): Promise<string> {
    if (!fs.existsSync(existingTestFilePath)) {
      return newTestCode;
    }

    const existingContent = fs.readFileSync(existingTestFilePath, 'utf-8');

    // Use Claude to intelligently merge the tests
    const prompt = `Merge these new test cases into the existing test file. Avoid duplicates.

**Existing Test File**:
\`\`\`typescript
${existingContent}
\`\`\`

**New Test Cases to Add**:
\`\`\`typescript
${newTestCode}
\`\`\`

**Instructions**:
1. Add the new test cases to the existing file
2. Remove any duplicate tests
3. Organize tests logically (happy path, edge cases, errors)
4. Maintain consistent style with existing tests
5. Keep all imports and setup code
6. Return the complete merged file

**Response**: Provide only the complete merged test file in a typescript code block.`;

    const message = await this.client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const codeMatch = responseText.match(/```(?:typescript|ts)?\n([\s\S]*?)```/);

    return codeMatch ? codeMatch[1].trim() : newTestCode;
  }
}
