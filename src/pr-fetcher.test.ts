/**
 * Unit tests for PRFetcher
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { PRFetcher } from './pr-fetcher';
import { GitHubClient } from './github-client';
import type { PRContext } from './types';

describe('PRFetcher', () => {
  describe('constructor', () => {
    test('should create instance with valid token', () => {
      const fetcher = new PRFetcher('test-token');
      expect(fetcher).toBeInstanceOf(PRFetcher);
    });

    test('should throw error with empty token', () => {
      expect(() => new PRFetcher('')).toThrow();
    });
  });

  describe('fetchPRContext', () => {
    test('should fetch and shape PR context successfully', async () => {
      const fetcher = new PRFetcher('test-token');

      // Mock GitHubClient methods
      const mockGetPullRequest = mock(() => Promise.resolve({
        title: 'Add new feature',
        base_sha: 'abc123def456',
        head_sha: 'ghi789jkl012',
        number: 123,
      }));

      const mockGetPullRequestCommits = mock(() => Promise.resolve([
        'feat: add new component',
        'fix: resolve bug',
        'docs: update readme',
      ]));

      const mockGetCompareDiff = mock(() => Promise.resolve({
        files: [
          {
            filename: 'src/app.ts',
            status: 'modified',
            additions: 15,
            deletions: 5,
            patch: '@@ -1,5 +1,15 @@\n-old line\n+new line',
          },
          {
            filename: 'src/utils.ts',
            status: 'added',
            additions: 30,
            deletions: 0,
            patch: '@@ -0,0 +1,30 @@\n+new file content',
          },
          {
            filename: 'old-file.ts',
            status: 'removed',
            additions: 0,
            deletions: 20,
            patch: null,
          },
        ],
        totalCommits: 3,
      }));

      // @ts-ignore - accessing private property for testing
      fetcher.client.getPullRequest = mockGetPullRequest;
      // @ts-ignore
      fetcher.client.getPullRequestCommits = mockGetPullRequestCommits;
      // @ts-ignore
      fetcher.client.getCompareDiff = mockGetCompareDiff;

      const result = await fetcher.fetchPRContext('owner', 'repo', 123);

      expect(result).toEqual({
        repo: 'owner/repo',
        pr_number: 123,
        pr_title: 'Add new feature',
        base_sha: 'abc123def456',
        head_sha: 'ghi789jkl012',
        commit_messages: [
          'feat: add new component',
          'fix: resolve bug',
          'docs: update readme',
        ],
        files_changed: [
          {
            filename: 'src/app.ts',
            status: 'modified',
            additions: 15,
            deletions: 5,
            patch: '@@ -1,5 +1,15 @@\n-old line\n+new line',
          },
          {
            filename: 'src/utils.ts',
            status: 'added',
            additions: 30,
            deletions: 0,
            patch: '@@ -0,0 +1,30 @@\n+new file content',
          },
          {
            filename: 'old-file.ts',
            status: 'removed',
            additions: 0,
            deletions: 20,
            patch: null,
          },
        ],
        stats: {
          total_files: 3,
          total_commits: 3,
        },
      });

      expect(mockGetPullRequest).toHaveBeenCalledWith('owner', 'repo', 123);
      expect(mockGetPullRequestCommits).toHaveBeenCalledWith('owner', 'repo', 123);
      expect(mockGetCompareDiff).toHaveBeenCalledWith(
        'owner',
        'repo',
        'abc123def456',
        'ghi789jkl012'
      );
    });

    test('should handle PR with no file changes', async () => {
      const fetcher = new PRFetcher('test-token');

      // @ts-ignore
      fetcher.client.getPullRequest = mock(() => Promise.resolve({
        title: 'Empty PR',
        base_sha: 'base123',
        head_sha: 'head456',
        number: 456,
      }));

      // @ts-ignore
      fetcher.client.getPullRequestCommits = mock(() => Promise.resolve(['Initial commit']));

      // @ts-ignore
      fetcher.client.getCompareDiff = mock(() => Promise.resolve({
        files: [],
        totalCommits: 1,
      }));

      const result = await fetcher.fetchPRContext('owner', 'repo', 456);

      expect(result.files_changed).toEqual([]);
      expect(result.stats.total_files).toBe(0);
      expect(result.stats.total_commits).toBe(1);
    });

    test('should validate owner parameter', async () => {
      const fetcher = new PRFetcher('test-token');

      await expect(
        fetcher.fetchPRContext('', 'repo', 123)
      ).rejects.toThrow('Invalid owner: must be a non-empty string');
    });

    test('should validate repo parameter', async () => {
      const fetcher = new PRFetcher('test-token');

      await expect(
        fetcher.fetchPRContext('owner', '', 123)
      ).rejects.toThrow('Invalid repo: must be a non-empty string');
    });

    test('should validate PR number parameter', async () => {
      const fetcher = new PRFetcher('test-token');

      await expect(
        fetcher.fetchPRContext('owner', 'repo', 0)
      ).rejects.toThrow('Invalid PR number: must be a positive number');

      await expect(
        fetcher.fetchPRContext('owner', 'repo', -1)
      ).rejects.toThrow('Invalid PR number: must be a positive number');
    });

    test('should map file statuses correctly', async () => {
      const fetcher = new PRFetcher('test-token');

      // @ts-ignore
      fetcher.client.getPullRequest = mock(() => Promise.resolve({
        title: 'Test',
        base_sha: 'base',
        head_sha: 'head',
        number: 1,
      }));

      // @ts-ignore
      fetcher.client.getPullRequestCommits = mock(() => Promise.resolve([]));

      // @ts-ignore
      fetcher.client.getCompareDiff = mock(() => Promise.resolve({
        files: [
          { filename: 'added.ts', status: 'added', additions: 10, deletions: 0, patch: null },
          { filename: 'modified.ts', status: 'modified', additions: 5, deletions: 3, patch: null },
          { filename: 'removed.ts', status: 'removed', additions: 0, deletions: 15, patch: null },
          { filename: 'renamed.ts', status: 'renamed', additions: 2, deletions: 2, patch: null },
          { filename: 'unknown.ts', status: 'unknown', additions: 1, deletions: 1, patch: null },
        ],
        totalCommits: 1,
      }));

      const result = await fetcher.fetchPRContext('owner', 'repo', 1);

      expect(result.files_changed[0]?.status).toBe('added');
      expect(result.files_changed[1]?.status).toBe('modified');
      expect(result.files_changed[2]?.status).toBe('removed');
      expect(result.files_changed[3]?.status).toBe('renamed');
      expect(result.files_changed[4]?.status).toBe('modified'); // unknown maps to modified
    });

    test('should propagate errors from GitHub client', async () => {
      const fetcher = new PRFetcher('test-token');

      // @ts-ignore
      fetcher.client.getPullRequest = mock(() => 
        Promise.reject(new Error('API rate limit exceeded'))
      );

      await expect(
        fetcher.fetchPRContext('owner', 'repo', 123)
      ).rejects.toThrow('API rate limit exceeded');
    });
  });
});

// Made with Bob
