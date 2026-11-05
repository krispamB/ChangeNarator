import type {
  ChangeAnalysisResult,
  ChangelogAudiences,
  PRContext,
  ProviderContextMode,
  ProviderId,
} from '../types';

export interface ProviderExecutionOptions {
  model?: string;
}

export interface ProviderResult<T> {
  value: T;
  model: string | null;
}

export interface AnalysisInput {
  prContext: PRContext;
  localRepoPath: string;
}

/**
 * The provider seam used by the pipeline. Command flags, HTTP formats,
 * authentication, and structured-output extraction stay behind this interface.
 */
export interface AIProvider {
  readonly id: ProviderId;
  readonly contextMode: ProviderContextMode;
  readonly defaultModel: string | null;

  analyze(
    input: AnalysisInput,
    options?: ProviderExecutionOptions,
  ): Promise<ProviderResult<ChangeAnalysisResult>>;

  generateChangelogs(
    analysis: ChangeAnalysisResult,
    options?: ProviderExecutionOptions,
  ): Promise<ProviderResult<ChangelogAudiences>>;
}

export interface ProviderDependencies {
  fetch: typeof globalThis.fetch;
  executeCommand: CommandExecutor;
}

export interface CommandRequest {
  command: string;
  args: string[];
  input: string;
  cwd: string;
  timeoutMs?: number;
}

export type CommandExecutor = (request: CommandRequest) => Promise<string>;
