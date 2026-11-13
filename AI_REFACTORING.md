# AI-Powered Refactoring with Claude API

## Overview

The Code Quality Analysis system now includes **AI-powered automatic refactoring** using the Claude API. Instead of manually refactoring code, Claude analyzes your code and automatically generates improved versions with reduced complexity and better maintainability.

## Features

### Automatic Code Refactoring
- ✅ **AI-Powered**: Uses Claude Sonnet 4 to analyze and refactor code
- ✅ **Quality-Focused**: Targets cyclomatic complexity, maintainability, and code volume
- ✅ **Context-Aware**: Understands current metrics and specific issues
- ✅ **Explanation Provided**: Shows what changed and why
- ✅ **User Approval**: Preview and approve changes before applying
- ✅ **Validation**: Basic syntax validation of refactored code
- ✅ **Fallback**: Manual refactoring if API unavailable

### Refactoring Process

```
Original Code → Claude API → Refactored Code → User Approval → Applied to File
     ↓              ↓              ↓                ↓              ↓
  Metrics      Analysis      Improvements      Review         Commit
```

## Setup

### 1. Get Anthropic API Key

Visit [Anthropic Console](https://console.anthropic.com/settings/keys) to get your API key.

### 2. Configure Environment

Add your API key to `.env`:

```env
# Anthropic API Configuration (for AI-powered refactoring)
# Get your API key from: https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=sk-ant-api03-...
```

### 3. Install Dependencies

The required package is already included:

```bash
npm install @anthropic-ai/sdk
```

## Usage

### During Refactoring Workflow

When you select "Refactor this node" from the menu, the system automatically:

1. **Sends code to Claude** with context:
   - Current code
   - File path and node information
   - Current quality metrics
   - Identified issues

2. **Receives refactored code** with:
   - Improved code structure
   - Explanation of changes
   - List of improvements made

3. **Shows preview** and asks for approval

4. **Applies changes** if approved

### Example Session

```bash
🤖 Step 3: AI-powered refactoring with Claude...

Original code:
────────────────────────────────────────────────────────────────────────────────
export const register = async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Username too short' });
    }

    if (!email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING *',
      [username, email, hashedPassword]
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
};
────────────────────────────────────────────────────────────────────────────────

⏳ Sending code to Claude for refactoring...
✅ Refactoring complete!

📝 Explanation:
The code has been refactored to reduce complexity and improve maintainability:
- Extracted validation logic into a separate function
- Replaced nested if-else with early returns
- Added proper type safety
- Improved error handling with specific messages
- Reduced cyclomatic complexity from 8 to 4

✨ Improvements:
   - Extracted validateRegistrationInput() helper function
   - Replaced nested conditionals with early returns
   - Added input sanitization (trim, toLowerCase for email)
   - Created structured validation result type
   - Improved error messages with field-specific feedback
   - Better separation of concerns

Refactored code preview:
────────────────────────────────────────────────────────────────────────────────
interface ValidationResult {
  valid: boolean;
  error?: string;
  data?: { username: string; email: string; password: string };
}

function validateRegistrationInput(body: any): ValidationResult {
  const { username, email, password } = body;

  if (!username || !email || !password) {
    return { valid: false, error: 'All fields are required' };
  }

  if (username.length < 3) {
    return { valid: false, error: 'Username must be at least 3 characters' };
  }

  if (!email.includes('@')) {
    return { valid: false, error: 'Invalid email address' };
  }

  return {
    valid: true,
    data: {
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password
    }
  };
}

export const register = async (req: Request, res: Response) => {
  const validation = validateRegistrationInput(req.body);

  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const { username, email, password } = validation.data!;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING *',
      [username, email, hashedPassword]
    );

    return res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Registration failed' });
  }
};
────────────────────────────────────────────────────────────────────────────────

Apply this refactoring? (y/n): y
✅ Refactored code applied to file
```

## Technical Details

### Claude Refactoring Service

**File**: `src/ClaudeRefactoringService.ts`

**Key Components**:

1. **RefactoringRequest Interface**:
```typescript
interface RefactoringRequest {
  code: string;
  filePath: string;
  nodeType: string;
  nodeName: string;
  currentMetrics: {
    cyclomaticComplexity?: number;
    maintainabilityIndex?: number;
    halsteadVolume?: number;
    lcom?: number;
  };
  issues: string[];
}
```

2. **Refactoring Prompt**:
- Includes current code and metrics
- Lists identified issues
- Specifies goals (reduce complexity, improve maintainability)
- Requests structured response format

3. **Response Parsing**:
- Extracts refactored code from markdown code blocks
- Parses explanation and improvements list
- Validates basic syntax (balanced braces, parentheses)

### Refactoring Goals

Claude is instructed to:

1. **Reduce Cyclomatic Complexity**:
   - Replace nested conditionals with early returns
   - Extract complex logic into helper functions
   - Simplify control flow

2. **Improve Maintainability**:
   - Better naming conventions
   - Clearer code structure
   - Add helpful comments
   - Improve type safety

3. **Reduce Code Volume**:
   - Eliminate redundancy
   - Extract reusable functions
   - Simplify expressions

4. **Maintain Functionality**:
   - Keep the same external API
   - Preserve all behavior
   - Maintain type safety

### Validation

Before applying refactored code, the system validates:

- ✅ Code is not empty
- ✅ Length is reasonable (not 3x original)
- ✅ Braces are balanced: `{ }`
- ✅ Parentheses are balanced: `( )`

Additional validation could include:
- TypeScript compilation
- Linting checks
- Unit test execution

## Fallback Behavior

### If API Key Not Configured

```
❌ Anthropic API key not configured.
Please add ANTHROPIC_API_KEY to your .env file.
Get your API key from: https://console.anthropic.com/settings/keys

Falling back to manual refactoring...

File: /path/to/authController.ts
Lines: 6-53

Please manually refactor the code in your editor, save it, and press Enter to continue...
```

### If API Error Occurs

```
❌ Error during AI refactoring: Rate limit exceeded

Falling back to manual refactoring...

File: /path/to/authController.ts
Lines: 6-53

Please manually refactor the code in your editor, save it, and press Enter to continue...
```

### If User Cancels

```
❌ Refactoring cancelled. Original code unchanged.

You can manually refactor the code in your editor if desired.
Press Enter to continue with original code...
```

## Model Configuration

**Current Model**: `claude-sonnet-5-5`

**Why Claude Sonnet 5.5**:
- ✅ Best combination of speed and intelligence
- ✅ Excellent at code understanding and refactoring
- ✅ Strong reasoning about code quality
- ✅ Fast response times
- ✅ Cost-effective for refactoring tasks
- ✅ Latest Sonnet model with extended context

**Token Limits**:
- Max tokens: 8192 (sufficient for large functions)
- For larger code blocks, consider chunking

## Cost Considerations

**Approximate costs** (as of 2024):

| Code Size | Input Tokens | Output Tokens | Estimated Cost |
|-----------|--------------|---------------|----------------|
| Small function (50 lines) | ~1,000 | ~1,500 | $0.01 |
| Medium function (150 lines) | ~3,000 | ~3,000 | $0.03 |
| Large function (300 lines) | ~6,000 | ~4,000 | $0.05 |

**Tips to minimize costs**:
- Refactor one function at a time
- Don't refactor trivial code
- Focus on high-complexity nodes
- Cache refactoring suggestions

## Best Practices

### 1. Review Before Applying

Always review Claude's refactoring:
- ✅ Does it maintain functionality?
- ✅ Are edge cases handled?
- ✅ Is error handling preserved?
- ✅ Are types correctly maintained?

### 2. Test After Refactoring

Run tests to verify behavior:
```bash
npm test
```

### 3. Incremental Refactoring

For complex functions:
- Refactor one aspect at a time
- Test after each change
- Commit incrementally

### 4. Provide Context

The system automatically provides:
- Current metrics
- Identified issues
- File context

But you can enhance by:
- Adding comments about intended behavior
- Documenting edge cases
- Explaining business logic

## Troubleshooting

### "Anthropic API key not configured"

**Solution**: Add your API key to `.env`:
```env
ANTHROPIC_API_KEY=sk-ant-api03-...
```

### "Rate limit exceeded"

**Solution**: Wait a moment and try again, or refactor manually for now.

### "Could not extract refactored code from response"

**Cause**: Claude's response format was unexpected.

**Solution**: The system will show an error. Try again or refactor manually.

### Refactored code has syntax errors

**Cause**: Rare, but Claude may occasionally produce invalid syntax.

**Solution**: Don't apply the refactoring. Either:
- Try again (often works on second attempt)
- Refactor manually
- Report the issue

### Metrics didn't improve

**Possible reasons**:
- Refactoring was too conservative
- Complexity is inherent to business logic
- Metrics calculation variance

**Solution**: Review the changes and decide if they improve code quality despite metrics.

## Future Enhancements

### Iterative Refactoring

Allow multiple rounds of refinement:
1. Initial refactoring
2. Review metrics
3. Request further improvements
4. Apply final version

### Test Generation

After refactoring:
- Generate unit tests for the refactored code
- Verify behavior parity with original
- Add edge case tests

### Batch Refactoring

Refactor multiple related functions:
- Process all functions in a file
- Maintain consistency across changes
- Create single comprehensive PR

### Learning from Feedback

Track which refactorings are:
- Accepted
- Rejected
- Modified

Use feedback to improve prompts.

## Summary

AI-powered refactoring with Claude provides:

1. ✅ **Automatic code improvement** - No manual editing needed
2. ✅ **Quality-focused** - Targets complexity and maintainability
3. ✅ **Transparent** - Shows what changed and why
4. ✅ **Safe** - User approval before applying
5. ✅ **Integrated** - Part of complete Git workflow
6. ✅ **Fallback** - Manual option if API unavailable

This makes refactoring faster, more consistent, and more accessible to all developers, regardless of their refactoring expertise.
