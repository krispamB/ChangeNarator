/**
 * Unit tests for GitHubClient
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { GitHubClient } from './github-client';

describe('GitHubClient', () => {
  describe('constructor', () => {
    test('should throw error when token is empty', () => {
      expect(() => new GitHubClient('')).toThrow(
        'GitHub token is required. Please set GITHUB_TOKEN environment variable.'
      );
    });

    test('should create instance with valid token', () => {
      const client = new GitHubClient('test-token');
      expect(client).toBeInstanceOf(GitHubClient);
    });
  });

  describe('getPullRequest', () => {
    test('should fetch PR metadata successfully', async () => {
      const client = new GitHubClient('test-token');
      
      // Mock the Octokit pulls.get method
      const mockGet = mock(() => Promise.resolve({
        data: {
          title: 'Test PR',
          number: 123,
          base: { sha: 'base-sha-123' },
          head: { sha: 'head-sha-456' },
        },
      }));

      // @ts-ignore - accessing private property for testing
      client.octokit.pulls.get = mockGet;

      const result = await client.getPullRequest('owner', 'repo', 123);

      expect(result).toEqual({
        title: 'Test PR',
        base_sha: 'base-sha-123',
        head_sha: 'head-sha-456',
        number: 123,
      });

      expect(mockGet).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 123,
      });
    });

    test('should throw error for non-existent PR', async () => {
      const client = new GitHubClient('test-token');
      
      const mockGet = mock(() => Promise.reject({ status: 404 }));
      // @ts-ignore
      client.octokit.pulls.get = mockGet;

      await expect(
        client.getPullRequest('owner', 'repo', 999)
      ).rejects.toThrow('PR #999 not found in owner/repo');
    });

    test('should throw error for API failures', async () => {
      const client = new GitHubClient('test-token');
      
      const mockGet = mock(() => Promise.reject({ message: 'API Error' }));
      // @ts-ignore
      client.octokit.pulls.get = mockGet;

      await expect(
        client.getPullRequest('owner', 'repo', 123)
      ).rejects.toThrow('Failed to fetch PR: API Error');
    });
  });

  describe('getPullRequestCommits', () => {
    test('should fetch commit messages successfully', async () => {
      const client = new GitHubClient('test-token');
      
      const mockListCommits = mock(() => Promise.resolve({
        data: [
          { commit: { message: 'First commit' } },
          { commit: { message: 'Second commit' } },
          { commit: { message: 'Third commit' } },
        ],
      }));

      // @ts-ignore
      client.octokit.pulls.listCommits = mockListCommits;

      const result = await client.getPullRequestCommits('owner', 'repo', 123);

      expect(result).toEqual(['First commit', 'Second commit', 'Third commit']);
      expect(mockListCommits).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 123,
        per_page: 100,
      });
    });

    test('should handle empty commit list', async () => {
      const client = new GitHubClient('test-token');
      
      const mockListCommits = mock(() => Promise.resolve({ data: [] }));
      // @ts-ignore
      client.octokit.pulls.listCommits = mockListCommits;

      const result = await client.getPullRequestCommits('owner', 'repo', 123);

      expect(result).toEqual([]);
    });

    test('should throw error on API failure', async () => {
      const client = new GitHubClient('test-token');
      
      const mockListCommits = mock(() => Promise.reject({ message: 'Network error' }));
      // @ts-ignore
      client.octokit.pulls.listCommits = mockListCommits;

      await expect(
        client.getPullRequestCommits('owner', 'repo', 123)
      ).rejects.toThrow('Failed to fetch PR commits: Network error');
    });
  });

  describe('getCompareDiff', () => {
    test('should fetch compare diff successfully', async () => {
      const client = new GitHubClient('test-token');
      
      const mockCompareCommits = mock(() => Promise.resolve({
        data: {
          files: [
            {
              filename: 'src/app.ts',
              status: 'modified',
              additions: 10,
              deletions: 5,
              patch: '@@ -1,5 +1,10 @@',
            },
            {
              filename: 'src/utils.ts',
              status: 'added',
              additions: 20,
              deletions: 0,
              patch: '@@ -0,0 +1,20 @@',
            },
          ],
          commits: [{ sha: 'commit1' }, { sha: 'commit2' }],
        },
      }));

      // @ts-ignore
      client.octokit.repos.compareCommits = mockCompareCommits;

      const result = await client.getCompareDiff('owner', 'repo', 'base-sha', 'head-sha');

      expect(result.files).toHaveLength(2);
      expect(result.totalCommits).toBe(2);
      expect(result.files[0]?.filename).toBe('src/app.ts');
      expect(mockCompareCommits).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        base: 'base-sha',
        head: 'head-sha',
      });
    });

    test('should handle empty files array', async () => {
      const client = new GitHubClient('test-token');
      
      const mockCompareCommits = mock(() => Promise.resolve({
        data: {
          files: undefined,
          commits: [],
        },
      }));

      // @ts-ignore
      client.octokit.repos.compareCommits = mockCompareCommits;

      const result = await client.getCompareDiff('owner', 'repo', 'base', 'head');

      expect(result.files).toEqual([]);
      expect(result.totalCommits).toBe(0);
    });

    test('should throw error on API failure', async () => {
      const client = new GitHubClient('test-token');
      
      const mockCompareCommits = mock(() => Promise.reject({ message: 'Comparison failed' }));
      // @ts-ignore
      client.octokit.repos.compareCommits = mockCompareCommits;

      await expect(
        client.getCompareDiff('owner', 'repo', 'base', 'head')
      ).rejects.toThrow('Failed to fetch compare diff: Comparison failed');
    });
  });
});

// Made with Bob
