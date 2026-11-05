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

export const PROVIDER_IDS = [
  'bob',
  'watsonx',
  'claude-code',
  'codex',
  'anthropic',
  'openai',
  'openrouter',
] as const;

export type ProviderId = typeof PROVIDER_IDS[number];

export type ProviderContextMode = 'repository' | 'pr-patches';

/**
 * Provider-neutral structured result from code change analysis.
 */
export interface ChangeAnalysisResult {
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

/**
 * @deprecated Use ChangeAnalysisResult. Retained for v1 compatibility.
 */
export type BobAnalysisResult = ChangeAnalysisResult;

export interface ChangelogAudiences {
  devs: string;
  pms: string;
  users: string;
}

export interface ProviderStageMetadata {
  provider: ProviderId;
  model: string | null;
  contextMode: ProviderContextMode;
}

export interface AIExecutionMetadata {
  mode: 'unified' | 'legacy';
  analysis: ProviderStageMetadata;
  changelog: ProviderStageMetadata;
}

export interface NotionPublishResult {
  pageId: string;
  url: string;
}

// Made with Bob
