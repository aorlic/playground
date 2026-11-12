import { simpleGit, SimpleGit, CleanOptions } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface GitConfig {
  url: string;
  branch: string;
  token?: string;
  username?: string;
  cacheDir?: string;
}

export interface CloneResult {
  repoPath: string;
  isNewClone: boolean;
  branch: string;
  commitHash: string;
  commitMessage: string;
  commitDate: Date;
}

export class GitRepositoryManager {
  private git: SimpleGit;

  constructor() {
    this.git = simpleGit();
  }

  /**
   * Clones or updates repository and returns local path
   * Following Option A: Clone fresh to temp/cache directory each run
   */
  async ensureRepository(config: GitConfig): Promise<CloneResult> {
    this.validateConfig(config);

    // Determine cache directory
    const cacheDir = this.getCacheDirectory(config.cacheDir);
    const repoName = this.extractRepoName(config.url);
    const repoPath = path.join(cacheDir, repoName);

    console.log('=== Git Repository Manager ===');
    console.log(`Repository: ${config.url}`);
    console.log(`Branch: ${config.branch}`);
    console.log(`Local path: ${repoPath}`);
    console.log('');

    // Option A: Always clone fresh
    // If directory exists, remove it first
    if (fs.existsSync(repoPath)) {
      console.log('Removing existing repository...');
      fs.rmSync(repoPath, { recursive: true, force: true });
    }

    // Clone fresh
    console.log('Cloning repository...');
    const cloneResult = await this.cloneRepository(config, repoPath);

    console.log('✓ Repository ready');
    console.log(`  Commit: ${cloneResult.commitHash.substring(0, 7)}`);
    console.log(`  Message: ${cloneResult.commitMessage}`);
    console.log(`  Date: ${cloneResult.commitDate.toISOString()}`);
    console.log('');

    return cloneResult;
  }

  /**
   * Clone repository with authentication
   */
  private async cloneRepository(config: GitConfig, targetPath: string): Promise<CloneResult> {
    const cloneUrl = this.buildAuthenticatedUrl(config);

    try {
      // Clone with specific branch
      await this.git.clone(cloneUrl, targetPath, ['--branch', config.branch, '--single-branch']);

      // Get commit info
      const repoGit = simpleGit(targetPath);
      const log = await repoGit.log(['-1']);
      const latestCommit = log.latest;

      if (!latestCommit) {
        throw new Error('Failed to get latest commit information');
      }

      return {
        repoPath: targetPath,
        isNewClone: true,
        branch: config.branch,
        commitHash: latestCommit.hash,
        commitMessage: latestCommit.message,
        commitDate: new Date(latestCommit.date)
      };
    } catch (error: any) {
      // Clean up on failure
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      }

      if (error.message?.includes('Authentication failed')) {
        throw new Error(
          'Git authentication failed. Please check your GIT_TOKEN and GIT_USERNAME in .env file.\n' +
          'For GitHub, create a Personal Access Token at: https://github.com/settings/tokens'
        );
      } else if (error.message?.includes('Repository not found')) {
        throw new Error(
          `Repository not found: ${config.url}\n` +
          'Please check the GIT_REPO_URL in your .env file.'
        );
      } else if (error.message?.includes('branch')) {
        throw new Error(
          `Branch '${config.branch}' not found.\n` +
          'Please check the GIT_BRANCH in your .env file.'
        );
      }

      throw new Error(`Git clone failed: ${error.message}`);
    }
  }

  /**
   * Build authenticated URL for HTTPS clone
   */
  private buildAuthenticatedUrl(config: GitConfig): string {
    if (!config.token) {
      // Public repository, no authentication needed
      return config.url;
    }

    // Parse URL to inject credentials
    const url = new URL(config.url);

    // For GitHub/GitLab/Bitbucket, token can be used as username with empty password
    // Format: https://token@github.com/user/repo.git
    // Or: https://username:token@github.com/user/repo.git
    if (config.username) {
      url.username = config.username;
      url.password = config.token;
    } else {
      // Use token as username (common pattern for GitHub PAT)
      url.username = config.token;
    }

    return url.toString();
  }

  /**
   * Extract repository name from URL
   */
  private extractRepoName(url: string): string {
    // Extract from: https://github.com/user/repo.git -> repo
    // Or: https://github.com/user/repo -> repo
    const match = url.match(/\/([^\/]+?)(\.git)?$/);
    if (!match) {
      throw new Error(`Invalid repository URL: ${url}`);
    }
    return match[1];
  }

  /**
   * Get cache directory, create if doesn't exist
   */
  private getCacheDirectory(configuredDir?: string): string {
    let cacheDir: string;

    if (configuredDir) {
      // Use configured directory
      cacheDir = configuredDir.replace('~', os.homedir());
    } else {
      // Default to temp directory with timestamp to ensure fresh clone
      const timestamp = Date.now();
      cacheDir = path.join(os.tmpdir(), 'code-quality-analysis', timestamp.toString());
    }

    // Ensure directory exists
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    return cacheDir;
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: GitConfig): void {
    if (!config.url) {
      throw new Error('GIT_REPO_URL is required in .env file');
    }

    if (!config.branch) {
      throw new Error('GIT_BRANCH is required in .env file');
    }

    // Validate URL format
    try {
      new URL(config.url);
    } catch {
      throw new Error(`Invalid GIT_REPO_URL format: ${config.url}`);
    }

    // Must be HTTPS URL
    if (!config.url.startsWith('https://')) {
      throw new Error(
        'Only HTTPS URLs are supported. Please use format: https://github.com/user/repo.git'
      );
    }
  }

  /**
   * Clean up cloned repository
   */
  async cleanup(repoPath: string): Promise<void> {
    if (fs.existsSync(repoPath)) {
      console.log(`Cleaning up: ${repoPath}`);
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  }
}
