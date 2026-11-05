import type { Config } from '../cli/config';
import { PROVIDER_IDS, type ProviderId } from '../types';
import type { AIProvider, ProviderDependencies } from './contracts';
import { executeCommand } from './command';
import {
  createBobProvider,
  createClaudeCodeProvider,
  createCodexProvider,
} from './cli';
import { createAnthropicProvider } from './anthropic';
import { createOpenAIProvider } from './openai';
import { createOpenRouterProvider } from './openrouter';
import { createWatsonXProvider } from './watsonx-provider';

const DEFAULT_DEPENDENCIES: ProviderDependencies = {
  fetch: globalThis.fetch,
  executeCommand,
};

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

export function createProvider(
  id: ProviderId,
  config: Config,
  dependencyOverrides: Partial<ProviderDependencies> = {},
): AIProvider {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...dependencyOverrides };

  switch (id) {
    case 'bob':
      return createBobProvider(dependencies.executeCommand);
    case 'claude-code':
      return createClaudeCodeProvider(dependencies.executeCommand);
    case 'codex':
      return createCodexProvider(dependencies.executeCommand);
    case 'anthropic':
      return createAnthropicProvider(dependencies.fetch);
    case 'openai':
      return createOpenAIProvider(dependencies.fetch);
    case 'openrouter':
      return createOpenRouterProvider(dependencies.fetch);
    case 'watsonx':
      return createWatsonXProvider(dependencies.fetch, config);
  }
}

export function getConfiguredModel(config: Config, id: ProviderId): string | undefined {
  return config.ai?.providers?.[id]?.model;
}
