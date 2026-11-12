# Git Integration Guide

## Overview

The system now supports analyzing codebases directly from Git repositories. Instead of requiring a local copy, you can configure a repository URL and the system will automatically clone the latest version before analysis.

## Features

✅ **Automatic Cloning** - Clones repository on each run (Option A: fresh clone)
✅ **Branch Selection** - Analyze specific branches (main, develop, feature branches)
✅ **HTTPS + Token Auth** - Secure authentication for private repositories
✅ **Auto Cleanup** - Removes cloned repository after analysis
✅ **Configurable Cache** - Control where repositories are cloned
✅ **Backward Compatible** - Falls back to local directory if no Git config

## Setup

### 1. Copy Environment Template

```bash
cp .env.example .env
```

### 2. Edit .env File

```env
# Repository URL (required)
GIT_REPO_URL=https://github.com/username/randevu-backend.git

# Branch to analyze (required)
GIT_BRANCH=main

# GitHub Personal Access Token (required for private repos)
GIT_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxx

# Optional: Username (usually not needed with token)
GIT_USERNAME=

# Optional: Custom cache directory
REPO_CACHE_DIR=/tmp/code-analysis
```

### 3. Get GitHub Personal Access Token

For private repositories, create a token at:
https://github.com/settings/tokens

**Required Permissions**:
- `repo` (Full control of private repositories)

**For GitLab**: https://gitlab.com/-/profile/personal_access_tokens
- Scope: `read_repository`

**For Bitbucket**: https://bitbucket.org/account/settings/app-passwords/
- Permission: `Repositories: Read`

### 4. Run Analysis

```bash
# Interactive demo
npm run demo

# Randevu backend analysis
npm run analyze-randevu
```

## How It Works

### Flow Diagram

```
User runs: npm run demo
    ↓
Load .env configuration
    ↓
Check if GIT_REPO_URL exists?
    ├─ YES → Clone repository
    │   ↓
    │   GitRepositoryManager.ensureRepository()
    │   ↓
    │   1. Determine cache directory
    │   2. Remove existing clone (if any)
    │   3. Clone fresh from URL + branch
    │   4. Return local path
    │
    └─ NO → Use current directory (original behavior)
    ↓
Build PDG from local path
    ↓
Run quality analysis
    ↓
Interactive test coverage analysis
    ↓
Cleanup cloned repository (if Git was used)
```

### Option A: Fresh Clone Every Time

The system implements **Option A** as specified:
- Clones to temporary/cache directory
- Removes existing clone if present
- Always gets latest code from branch
- No persistent state between runs

**Advantages**:
- ✅ Always guaranteed latest code
- ✅ No merge conflicts or dirty state
- ✅ Simple and predictable

**Disadvantages**:
- ⚠️ Slower (full clone each time)
- ⚠️ Uses network bandwidth

### Cache Directory

**Default Behavior** (no REPO_CACHE_DIR set):
```
/tmp/code-quality-analysis/<timestamp>/randevu-backend/
```
- Uses system temp directory
- Timestamp ensures unique directory
- Cleaned up after analysis

**Custom Cache** (REPO_CACHE_DIR set):
```
REPO_CACHE_DIR=~/.code-quality-analysis/repos

Result:
~/.code-quality-analysis/repos/randevu-backend/
```
- Persistent across runs (but still removed/re-cloned each time)
- Easier to inspect/debug

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GIT_REPO_URL` | ✅ | - | HTTPS URL of repository to analyze |
| `GIT_BRANCH` | ✅ | - | Branch name (main, master, develop, etc.) |
| `GIT_TOKEN` | For private repos | - | Personal Access Token |
| `GIT_USERNAME` | ⚠️ Optional | - | Usually not needed with token |
| `REPO_CACHE_DIR` | ⚠️ Optional | `/tmp/code-quality-analysis/<timestamp>` | Where to clone repositories |
| `QUALITY_REPORT_LIMIT` | ⚠️ Optional | `5` | Number of worst nodes to display |

### Repository URL Format

**Supported**:
```
https://github.com/user/repo.git
https://github.com/user/repo
https://gitlab.com/user/repo.git
https://bitbucket.org/user/repo.git
```

**Not Supported**:
```
git@github.com:user/repo.git  # SSH (use HTTPS instead)
http://github.com/user/repo   # HTTP (use HTTPS)
```

## Examples

### Example 1: Public Repository

```env
GIT_REPO_URL=https://github.com/microsoft/typescript.git
GIT_BRANCH=main
# No token needed for public repos
```

```bash
npm run demo
```

Output:
```
=== Code Quality Analysis Demo ===

Using Git repository from .env configuration

=== Git Repository Manager ===
Repository: https://github.com/microsoft/typescript.git
Branch: main
Local path: /tmp/code-quality-analysis/1699564821234/typescript

Cloning repository...
✓ Repository ready
  Commit: abc1234
  Message: Fix compiler bug
  Date: 2024-11-09T10:30:00.000Z

Analyzing project at: /tmp/code-quality-analysis/1699564821234/typescript

Building Program Dependency Graph...
...
```

### Example 2: Private Repository

```env
GIT_REPO_URL=https://github.com/mycompany/randevu-backend.git
GIT_BRANCH=develop
GIT_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

```bash
npm run analyze-randevu
```

Output:
```
=== Analyzing Randevu Backend ===

Using Git repository from .env configuration

=== Git Repository Manager ===
Repository: https://github.com/mycompany/randevu-backend.git
Branch: develop
Local path: /tmp/code-quality-analysis/1699564821234/randevu-backend

Removing existing repository...
Cloning repository...
✓ Repository ready
  Commit: def5678
  Message: Add payment gateway integration
  Date: 2024-11-09T14:20:00.000Z

Analyzing codebase at: /tmp/code-quality-analysis/1699564821234/randevu-backend

Services to analyze: gateway, scheduler, transactor, webhooks
Libraries to analyze: r-cacher, r-domain

📦 Analyzing service: gateway
   Path: /tmp/code-quality-analysis/1699564821234/randevu-backend/services/gateway
   ✓ Nodes: 366
   ...

✓ Randevu backend analysis complete!

Cleaning up cloned repository...
✓ Cleanup complete
```

### Example 3: No Git Config (Fallback)

No `.env` file or empty configuration:

```bash
npm run demo
```

Output:
```
=== Code Quality Analysis Demo ===

No Git configuration found in .env
Analyzing current directory (to use Git, copy .env.example to .env)

Analyzing project at: /Users/aleks/Dev/casper/playground
...
```

### Example 4: Custom Cache Directory

```env
GIT_REPO_URL=https://github.com/user/repo.git
GIT_BRANCH=main
REPO_CACHE_DIR=~/my-analysis-cache
```

Result: Clones to `~/my-analysis-cache/repo/`

## Error Handling

### Authentication Failed

```
❌ Git Error: Git authentication failed. Please check your GIT_TOKEN and GIT_USERNAME in .env file.
For GitHub, create a Personal Access Token at: https://github.com/settings/tokens
```

**Solution**:
1. Verify token is correct
2. Check token has `repo` permission
3. Ensure token hasn't expired

### Repository Not Found

```
❌ Git Error: Repository not found: https://github.com/user/wrong-repo.git
Please check the GIT_REPO_URL in your .env file.
```

**Solution**:
1. Verify repository URL is correct
2. Check you have access to the repository
3. For private repos, ensure token is provided

### Branch Not Found

```
❌ Git Error: Branch 'wrong-branch' not found.
Please check the GIT_BRANCH in your .env file.
```

**Solution**:
1. List available branches: `git ls-remote --heads <repo-url>`
2. Update GIT_BRANCH to correct branch name

### Missing Configuration

```
❌ Git Error: GIT_REPO_URL is required in .env file
```

**Solution**:
1. Copy `.env.example` to `.env`
2. Fill in GIT_REPO_URL and GIT_BRANCH

## GitRepositoryManager API

### Methods

#### `ensureRepository(config: GitConfig): Promise<CloneResult>`

Clones repository and returns information.

**Parameters**:
```typescript
interface GitConfig {
  url: string;          // Repository URL
  branch: string;       // Branch name
  token?: string;       // Access token
  username?: string;    // Username (optional)
  cacheDir?: string;    // Cache directory (optional)
}
```

**Returns**:
```typescript
interface CloneResult {
  repoPath: string;      // "/tmp/.../repo"
  isNewClone: boolean;   // true (always in Option A)
  branch: string;        // "main"
  commitHash: string;    // "abc123..."
  commitMessage: string; // "Fix bug"
  commitDate: Date;      // 2024-11-09...
}
```

**Example**:
```typescript
const gitManager = new GitRepositoryManager();
const result = await gitManager.ensureRepository({
  url: process.env.GIT_REPO_URL,
  branch: process.env.GIT_BRANCH,
  token: process.env.GIT_TOKEN
});

console.log(`Cloned to: ${result.repoPath}`);
console.log(`Latest commit: ${result.commitHash}`);
```

#### `cleanup(repoPath: string): Promise<void>`

Removes cloned repository.

**Example**:
```typescript
await gitManager.cleanup(result.repoPath);
```

## Security Best Practices

### 1. Never Commit .env

The `.env` file is already in `.gitignore`:
```gitignore
# Environment variables
.env
```

### 2. Use Personal Access Tokens, Not Passwords

GitHub deprecated password authentication. Use tokens instead.

### 3. Limit Token Permissions

Only grant necessary permissions:
- GitHub: `repo` (for private repos) or nothing (for public)
- GitLab: `read_repository`

### 4. Rotate Tokens Regularly

Set token expiration and rotate periodically.

### 5. Keep .env.example Clean

Never put real credentials in `.env.example`:
```env
# ✅ Good
GIT_TOKEN=

# ❌ Bad
GIT_TOKEN=ghp_actual_token_here
```

## Monorepo Support

The system supports monorepos like randevu-backend:

```
randevu-backend/
├── services/
│   ├── gateway/       ← Analyzed separately
│   ├── scheduler/     ← Analyzed separately
│   ├── transactor/    ← Analyzed separately
│   └── webhooks/      ← Analyzed separately
└── libs/
    ├── r-cacher/      ← Analyzed separately
    └── r-domain/      ← Analyzed separately
```

The `analyze-randevu.ts` script:
1. Clones entire repository once
2. Analyzes each service/lib individually
3. Combines results into single report
4. Cleans up after analysis

## Troubleshooting

### Slow Cloning

**Problem**: Clone takes long time

**Solutions**:
- Use `--depth 1` for shallow clone (not implemented yet)
- Check network connection
- Use closer Git server mirror

### Disk Space Issues

**Problem**: Not enough space for clone

**Solutions**:
- Set `REPO_CACHE_DIR` to drive with more space
- Clean up temp directory: `rm -rf /tmp/code-quality-analysis/*`
- Use shallow clone (future enhancement)

### Permission Denied

**Problem**: Can't write to cache directory

**Solutions**:
- Set `REPO_CACHE_DIR` to writable location
- Check directory permissions
- Use default temp directory (don't set REPO_CACHE_DIR)

## Future Enhancements

Potential improvements (not implemented):

- [ ] **Option B: Clone once, pull updates** - Faster subsequent runs
- [ ] **Shallow clone** - `--depth 1` to reduce clone size
- [ ] **SSH support** - Use SSH keys instead of HTTPS tokens
- [ ] **Multiple repositories** - Analyze multiple repos in one run
- [ ] **Branch comparison** - Compare quality between branches
- [ ] **Sparse checkout** - Only fetch specific subdirectories
- [ ] **Submodule support** - Handle repositories with submodules
- [ ] **Webhook integration** - Trigger analysis on Git push
- [ ] **Incremental analysis** - Only analyze changed files

## Summary

The Git integration provides:

✅ **Zero Local Setup** - No need to manually clone repositories
✅ **Always Latest** - Fresh clone ensures up-to-date analysis
✅ **Secure** - Token-based authentication for private repos
✅ **Flexible** - Configurable cache directory
✅ **Backward Compatible** - Falls back to local directory
✅ **Clean** - Auto-cleanup after analysis

Configure once in `.env`, then run `npm run demo` or `npm run analyze-randevu` to analyze any repository!
