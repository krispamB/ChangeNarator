import type {
  ChangeAnalysisResult,
  ChangelogAudiences,
  ProviderContextMode,
  ProviderId,
} from '../types';
import type {
  AIProvider,
  AnalysisInput,
  ProviderExecutionOptions,
  ProviderResult,
} from './contracts';
import { buildAnalysisPrompt, buildChangelogPrompt } from './prompts';
import { CHANGE_ANALYSIS_SCHEMA, CHANGELOG_AUDIENCES_SCHEMA } from './schemas';
import { validateChangeAnalysis, validateChangelogAudiences } from './validation';

export type StructuredInvoker = (
  prompt: string,
  schema: object,
  options: {
    cwd: string;
    model: string | null;
    schemaName: 'change_analysis' | 'audience_changelogs';
  },
) => Promise<unknown>;

export function createPromptProvider(options: {
  id: ProviderId;
  contextMode: ProviderContextMode;
  defaultModel: string | null;
  invoke: StructuredInvoker;
}): AIProvider {
  const resolveModel = (executionOptions?: ProviderExecutionOptions) =>
    executionOptions?.model ?? options.defaultModel;

  return {
    id: options.id,
    contextMode: options.contextMode,
    defaultModel: options.defaultModel,

    async analyze(
      input: AnalysisInput,
      executionOptions?: ProviderExecutionOptions,
    ): Promise<ProviderResult<ChangeAnalysisResult>> {
      const model = resolveModel(executionOptions);
      const raw = await options.invoke(
        buildAnalysisPrompt(input.prContext, options.contextMode === 'repository'),
        CHANGE_ANALYSIS_SCHEMA,
        { cwd: input.localRepoPath, model, schemaName: 'change_analysis' },
      );

      return { value: validateChangeAnalysis(raw), model };
    },

    async generateChangelogs(
      analysis: ChangeAnalysisResult,
      executionOptions?: ProviderExecutionOptions,
    ): Promise<ProviderResult<ChangelogAudiences>> {
      const model = resolveModel(executionOptions);
      const raw = await options.invoke(
        buildChangelogPrompt(analysis),
        CHANGELOG_AUDIENCES_SCHEMA,
        { cwd: process.cwd(), model, schemaName: 'audience_changelogs' },
      );

      return { value: validateChangelogAudiences(raw), model };
    },
  };
}
