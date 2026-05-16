/**
 * GitHub API client wrapper using Octokit
 */

import { Octokit } from '@octokit/rest';

export class GitHubClient {
  private octokit: Octokit;

  constructor(token: string) {
    if (!token) {
      throw new Error('GitHub token is required. Please set GITHUB_TOKEN environment variable.');
    }

    this.octokit = new Octokit({
      auth: token,
    });
  }

  /**
   * Fetch PR metadata including base/head SHA and title
   */
  async getPullRequest(owner: string, repo: string, prNumber: number) {
    try {
      const { data } = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      return {
        title: data.title,
        base_sha: data.base.sha,
        head_sha: data.head.sha,
        number: data.number,
      };
    } catch (error: any) {
      if (error.status === 404) {
        throw new Error(`PR #${prNumber} not found in ${owner}/${repo}`);
      }
      throw new Error(`Failed to fetch PR: ${error.message}`);
    }
  }

  /**
   * Fetch all commit messages from a PR
   */
  async getPullRequestCommits(owner: string, repo: string, prNumber: number) {
    try {
      const { data } = await this.octokit.pulls.listCommits({
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
      });

      return data.map(commit => commit.commit.message);
    } catch (error: any) {
      throw new Error(`Failed to fetch PR commits: ${error.message}`);
    }
  }

  /**
   * Fetch the compare diff between base and head
   * Returns changed files with patches
   */
  async getCompareDiff(owner: string, repo: string, baseSha: string, headSha: string) {
    try {
      const { data } = await this.octokit.repos.compareCommits({
        owner,
        repo,
        base: baseSha,
        head: headSha,
      });

      return {
        files: data.files || [],
        totalCommits: data.commits.length,
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch compare diff: ${error.message}`);
    }
  }
}

// Made with Bob
