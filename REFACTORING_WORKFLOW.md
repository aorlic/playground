# Refactoring Workflow

This document describes the interactive refactoring workflow in the Code Quality Analysis Demo.

## Overview

The demo now includes an interactive menu system that allows you to:
1. Select low-quality nodes from the quality report
2. Choose actions: refactor, analyze test coverage, or go back
3. Execute a complete Git-based refactoring workflow with automatic PR creation

## User Flow

### 1. Node Selection

After the quality analysis report is displayed, you can select a node by entering its Node ID:

```
Select a node to analyze from the report above.
Enter a Node ID, or press Enter to exit.

Node ID: server_node_5
```

### 2. Node Action Menu

Once a node is selected, you'll see a menu with options:

```
================================================================================
Selected: function - register
Location: /path/to/authController.ts:6-53
================================================================================

What would you like to do?

1. Refactor this node
2. Analyze test coverage
3. Go back to node selection

Choose option (1-3):
```

## Refactoring Workflow

When you select option **1. Refactor this node**, the system executes a complete Git-based workflow:

### Step 1: Show Current Metrics

```
🔧 Starting refactoring workflow...

Current metrics:
  Quality Score: 75.0/100
  Cyclomatic Complexity: 9
  Maintainability Index: 55.9
  Halstead Volume: 1038

⚠️  Refactoring workflow:
   1. Create git branch: refactor/<node-name>
   2. Refactor the code (AI-assisted)
   3. Create PR with metrics improvement

Proceed with refactoring? (y/n):
```

### Step 2: Create Git Branch

The system automatically creates a new Git branch:

```
📋 Step 1: Creating git branch...
✅ Created branch: refactor/register
```

Branch naming convention: `refactor/<node-name-sanitized>`
- Special characters are replaced with hyphens
- Converted to lowercase
- Example: `register` → `refactor/register`

### Step 3: Display Code to Refactor

The system reads and displays the code that needs refactoring:

```
📖 Step 2: Reading code file...
✅ Read 48 lines from authController.ts

🤖 Step 3: Refactoring code...

Original code:
────────────────────────────────────────────────────────────────────────────────
export const register = async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }
    ...
────────────────────────────────────────────────────────────────────────────────

⚠️  AI-assisted refactoring is not yet implemented.
For now, please manually refactor the code in your editor.

File: /path/to/authController.ts
Lines: 6-53

Once you have refactored the code, save the file and press Enter to continue...
```

### Step 4: Re-analyze Metrics

After you refactor and save the code, the system recalculates metrics:

```
📊 Step 4: Re-analyzing metrics...
✅ Metrics recalculated successfully
```

### Step 5: Show Metrics Comparison

The system displays a detailed before/after comparison:

```
📈 Metrics Comparison:
────────────────────────────────────────────────────────────────────────────────
Metric                         Before          After           Change
────────────────────────────────────────────────────────────────────────────────
Quality Score                  75.0            85.0            +10.0
Cyclomatic Complexity          9               6               -3
Maintainability Index          55.9            65.2            +9.3
Halstead Volume                1038            850             -188
────────────────────────────────────────────────────────────────────────────────
```

### Step 6: Commit Changes

The system automatically commits your changes with a detailed message:

```
💾 Step 5: Committing changes...
✅ Changes committed
```

**Commit message format**:
```
refactor: improve register

Quality Score: 75.0 → 85.0 (+10.0)
Cyclomatic Complexity: 9 → 6 (-3)
Maintainability Index: 55.9 → 65.2 (+9.3)
Halstead Volume: 1038 → 850 (-188)

🤖 Generated with Claude Code Quality Analyzer
```

### Step 7: Push and Create PR

Finally, the system offers to push and create a pull request:

```
🚀 Step 6: Creating Pull Request...

Push changes and create PR? (y/n):
```

If you choose **y**:
1. Branch is pushed to origin
2. PR is created using GitHub CLI (`gh`)
3. PR includes detailed metrics comparison

**PR Format**:

**Title**: `refactor: improve register`

**Body**:
```markdown
## Refactoring Summary

**Node:** `function` - `register`
**Location:** `authController.ts:6-53`

## Metrics Improvement

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| **Quality Score** | 75.0 | 85.0 | **+10.0** |
| Cyclomatic Complexity | 9 | 6 | -3 |
| Maintainability Index | 55.9 | 65.2 | +9.3 |
| Halstead Volume | 1038 | 850 | -188 |

🤖 Generated with [Claude Code Quality Analyzer](https://github.com/anthropics/claude-code)
```

### Step 8: Complete

```
✅ Pull Request created successfully!

✅ Refactoring workflow complete!

Press Enter to continue...
```

You're returned to the main node selection menu.

## Test Coverage Analysis

When you select option **2. Analyze test coverage**, the system:

1. Analyzes test coverage for the selected node
2. Displays which parts are tested and which aren't
3. Shows test file locations
4. Returns you to the node menu

```
🔍 Analyzing test coverage...

[Coverage report displayed]

Press Enter to continue...
```

## Go Back

Option **3. Go back to node selection** returns you to the main menu where you can select a different node.

## Prerequisites

### Git Configuration Required

The refactoring workflow requires Git integration to be configured in `.env`:

```env
GIT_REPO_URL=https://github.com/username/repository.git
GIT_BRANCH=main
GIT_TOKEN=your_github_token
GIT_USERNAME=your_username
```

If Git is not configured, you'll see:

```
❌ Git integration not available. Refactoring requires Git repository configuration.
Please configure GIT_REPO_URL and GIT_BRANCH in .env file.
```

### GitHub CLI for PR Creation

To automatically create pull requests, you need the GitHub CLI (`gh`) installed and authenticated:

```bash
# Install gh
brew install gh  # macOS
# or
sudo apt install gh  # Linux

# Authenticate
gh auth login
```

If `gh` is not available, the branch will be pushed but you'll need to create the PR manually.

## Example Session

Here's a complete example session:

```bash
$ npm run demo

=== Code Quality Analysis Demo ===

[Analysis runs...]

================================================================================
CODE QUALITY ANALYSIS - LOWEST QUALITY NODES
================================================================================

1. function: register
   Node ID: server_node_5
   Quality Score: 75.0/100
   Location: /path/to/authController.ts:6-53

Select a node to analyze from the report above.
Enter a Node ID, or press Enter to exit.

Node ID: server_node_5

================================================================================
Selected: function - register
Location: /path/to/authController.ts:6-53
================================================================================

What would you like to do?

1. Refactor this node
2. Analyze test coverage
3. Go back to node selection

Choose option (1-3): 1

🔧 Starting refactoring workflow...

Current metrics:
  Quality Score: 75.0/100
  Cyclomatic Complexity: 9
  Maintainability Index: 55.9
  Halstead Volume: 1038

⚠️  Refactoring workflow:
   1. Create git branch: refactor/<node-name>
   2. Refactor the code (AI-assisted)
   3. Create PR with metrics improvement

Proceed with refactoring? (y/n): y

📋 Step 1: Creating git branch...
✅ Created branch: refactor/register

📖 Step 2: Reading code file...
✅ Read 48 lines from authController.ts

🤖 Step 3: Refactoring code...
[Code displayed]

Once you have refactored the code, save the file and press Enter to continue...

[User refactors code in editor and presses Enter]

📊 Step 4: Re-analyzing metrics...
✅ Metrics recalculated successfully

📈 Metrics Comparison:
[Table displayed]

💾 Step 5: Committing changes...
✅ Changes committed

🚀 Step 6: Creating Pull Request...

Push changes and create PR? (y/n): y

✅ Branch pushed to remote
✅ Pull Request created successfully!

✅ Refactoring workflow complete!

Press Enter to continue...
```

## Technical Details

### Branch Creation

```typescript
const branchName = `refactor/${selectedNode.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
execSync(`git checkout -b ${branchName}`, { cwd: projectPath });
```

### Metrics Recalculation

After refactoring, the system:
1. Rebuilds the PDG for the subproject
2. Finds the refactored node by matching file path and name
3. Recalculates all metrics (CC, MI, Halstead Volume)
4. Computes the new quality score

### Git Commit

```typescript
const commitMessage = `refactor: improve ${selectedNode.name}

Quality Score: ${before} → ${after} (${change})
Cyclomatic Complexity: ${ccBefore} → ${ccAfter} (${ccChange})
Maintainability Index: ${miBefore} → ${miAfter} (${miChange})
Halstead Volume: ${volBefore} → ${volAfter} (${volChange})

🤖 Generated with Claude Code Quality Analyzer`;

execSync(`git commit -m "${commitMessage}"`, { cwd: projectPath });
```

### PR Creation

```bash
gh pr create \
  --title "refactor: improve register" \
  --body "[Markdown table with metrics]"
```

## Future Enhancements

### AI-Assisted Refactoring

Currently, the workflow pauses for manual refactoring. Future versions could:
- Automatically suggest refactoring strategies
- Generate refactored code using AI
- Apply refactoring automatically with user approval

### Incremental Refactoring

For large functions, the system could:
- Break down refactoring into smaller steps
- Create multiple commits for each improvement
- Allow reviewing each step before proceeding

### Automated Testing

After refactoring, the system could:
- Run existing tests automatically
- Verify that tests still pass
- Generate new tests for uncovered code

### Team Collaboration

Future features could include:
- Assigning refactoring tasks to team members
- Tracking refactoring progress across the team
- Generating team-wide quality reports

## Troubleshooting

### "Git integration not available"

**Problem**: You see this error when trying to refactor.

**Solution**: Configure Git settings in `.env`:
```env
GIT_REPO_URL=https://github.com/username/repo.git
GIT_BRANCH=main
GIT_TOKEN=your_token
```

### "Failed to create/checkout branch"

**Problem**: Git branch creation fails.

**Causes**:
- Repository has uncommitted changes
- Branch already exists
- No Git repository at path

**Solutions**:
- Commit or stash changes: `git stash`
- Delete existing branch: `git branch -D refactor/name`
- Ensure you're in a Git repository

### "Error creating PR"

**Problem**: PR creation fails after pushing.

**Causes**:
- `gh` CLI not installed
- Not authenticated with GitHub
- Remote branch not pushed

**Solutions**:
- Install gh: `brew install gh`
- Authenticate: `gh auth login`
- Manually push: `git push -u origin branch-name`
- Create PR manually on GitHub

### "Metrics recalculation failed"

**Problem**: After refactoring, metrics can't be recalculated.

**Causes**:
- Syntax errors in refactored code
- TypeScript compilation errors
- File path changed

**Solutions**:
- Fix syntax errors in your code
- Ensure code compiles: `npm run build`
- Check that function name wasn't changed

## Summary

The refactoring workflow provides a complete Git-based solution for improving code quality:

1. ✅ **Interactive menu** - Choose actions per node
2. ✅ **Automatic branching** - Creates feature branches
3. ✅ **Manual refactoring** - Edit code in your editor
4. ✅ **Metrics tracking** - Before/after comparison
5. ✅ **Automatic commit** - Detailed commit messages
6. ✅ **PR creation** - GitHub integration with metrics

This streamlines the refactoring process and ensures quality improvements are tracked and documented.
