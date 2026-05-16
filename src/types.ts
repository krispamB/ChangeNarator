/**
 * TypeScript type definitions for PR metadata
 */

export interface FileChange {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface PRContext {
  repo: string;
  pr_number: number;
  pr_title: string;
  base_sha: string;
  head_sha: string;
  commit_messages: string[];
  files_changed: FileChange[];
  stats: {
    total_files: number;
    total_commits: number;
  };
}

/**
 * Result from Bob's code change analysis
 * Based on the output schema defined in src/prompts/bob-prompt.md
 */
export interface BobAnalysisResult {
  repo: string;
  pr_number: number;
  pr_title: string;
  version_hint: string | null;
  change_types: Array<'feature' | 'fix' | 'refactor' | 'chore' | 'docs'>;
  affected_modules: string[];
  breaking_changes: boolean;
  breaking_change_details: string | null;
  technical_summary: string;
  files_skipped: string[];
}

export interface ChangelogAudiences {
  devs: string;
  pms: string;
  users: string;
}

export interface NotionPublishResult {
  pageId: string;
  url: string;
}

// Made with Bob
