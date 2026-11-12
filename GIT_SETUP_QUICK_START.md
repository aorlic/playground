# Git Integration - Quick Start

## 🚀 5-Minute Setup

### Step 1: Copy Template
```bash
cp .env.example .env
```

### Step 2: Edit .env
```env
GIT_REPO_URL=https://github.com/your-username/randevu-backend.git
GIT_BRANCH=main
GIT_TOKEN=ghp_your_token_here
```

### Step 3: Get Token
**GitHub**: https://github.com/settings/tokens
- Click "Generate new token (classic)"
- Select scope: `repo`
- Copy token

**GitLab**: https://gitlab.com/-/profile/personal_access_tokens
- Add token with scope: `read_repository`

**Bitbucket**: https://bitbucket.org/account/settings/app-passwords/
- Create app password with: `Repositories: Read`

### Step 4: Run
```bash
npm run demo
# or
npm run analyze-randevu
```

## ✅ What You Get

**Before** (manual):
```bash
cd /path/to/repo
git pull
cd /path/to/playground
npm run demo
```

**After** (automatic):
```bash
npm run demo
```

The system automatically:
1. ✅ Clones latest code from Git
2. ✅ Checks out specified branch
3. ✅ Runs quality analysis
4. ✅ Cleans up afterward

## 🔒 Security

- ✅ `.env` is in `.gitignore` (never committed)
- ✅ Use tokens, not passwords
- ✅ Tokens can be revoked anytime

## 📋 Example .env

```env
# For public repo
GIT_REPO_URL=https://github.com/microsoft/typescript.git
GIT_BRANCH=main
# No token needed

# For private repo
GIT_REPO_URL=https://github.com/mycompany/randevu-backend.git
GIT_BRANCH=develop
GIT_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# Optional: Custom cache location
REPO_CACHE_DIR=~/code-analysis-cache
```

## ❓ Troubleshooting

**Q: "Authentication failed"**
- Check token is correct
- Verify token has `repo` permission

**Q: "Repository not found"**
- Verify URL is correct
- Check you have access to repo

**Q: "Branch not found"**
- Check branch name spelling
- Verify branch exists: `git ls-remote --heads <url>`

**Q: Want to use local directory instead?**
- Don't create `.env` file
- System falls back to current directory

## 📖 Full Documentation

See [GIT_INTEGRATION.md](GIT_INTEGRATION.md) for complete guide.
