/**
 * Main PR fetcher logic - orchestrates fetching and shaping PR data
 */

import { GitHubClient } from './github-client';
import type { PRContext, FileChange } from './types';

export class PRFetcher {
  private client: GitHubClient;

  constructor(githubToken: string) {
    this.client = new GitHubClient(githubToken);
  }

  /**
   * Fetch complete PR context including metadata, commits, and file changes
   * @param owner - Repository owner (user or organization)
   * @param repo - Repository name
   * @param prNumber - Pull request number
   * @returns Structured PRContext object
   */
  async fetchPRContext(owner: string, repo: string, prNumber: number): Promise<PRContext> {
    // Validate inputs
    this.validateInputs(owner, repo, prNumber);

    try {
      // Fetch PR metadata
      console.log(`📥 Fetching PR #${prNumber} from ${owner}/${repo}...`);
      const prData = await this.client.getPullRequest(owner, repo, prNumber);

      // Fetch commit messages
      console.log('📝 Fetching commit messages...');
      const commitMessages = await this.client.getPullRequestCommits(owner, repo, prNumber);

      // Fetch compare diff with file changes
      console.log('🔍 Fetching file changes and patches...');
      const { files, totalCommits } = await this.client.getCompareDiff(
        owner,
        repo,
        prData.base_sha,
        prData.head_sha
      );

      // Shape the data into PRContext format
      const filesChanged: FileChange[] = files.map(file => ({
        filename: file.filename,
        status: this.mapFileStatus(file.status),
        additions: file.additions,
        deletions: file.deletions,
        patch: file.patch || null,
      }));

      const prContext: PRContext = {
        repo: `${owner}/${repo}`,
        pr_number: prNumber,
        pr_title: prData.title,
        base_sha: prData.base_sha,
        head_sha: prData.head_sha,
        commit_messages: commitMessages,
        files_changed: filesChanged,
        stats: {
          total_files: filesChanged.length,
          total_commits: totalCommits,
        },
      };

      console.log('✅ PR context fetched successfully!');
      return prContext;
    } catch (error: any) {
      console.error('❌ Error fetching PR context:', error.message);
      throw error;
    }
  }

  /**
   * Validate input parameters
   */
  private validateInputs(owner: string, repo: string, prNumber: number): void {
    if (!owner || typeof owner !== 'string') {
      throw new Error('Invalid owner: must be a non-empty string');
    }
    if (!repo || typeof repo !== 'string') {
      throw new Error('Invalid repo: must be a non-empty string');
    }
    if (!prNumber || typeof prNumber !== 'number' || prNumber <= 0) {
      throw new Error('Invalid PR number: must be a positive number');
    }
  }

  /**
   * Map GitHub file status to our FileChange status type
   */
  private mapFileStatus(status: string): FileChange['status'] {
    const statusMap: Record<string, FileChange['status']> = {
      added: 'added',
      modified: 'modified',
      removed: 'removed',
      renamed: 'renamed',
    };

    return statusMap[status] || 'modified';
  }
}

// Made with Bob
