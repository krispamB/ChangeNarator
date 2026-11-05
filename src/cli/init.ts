/**
 * Interactive CLI setup command using @clack/prompts
 * Collects configuration and saves to config.json
 */

import * as p from '@clack/prompts';
import {
  saveConfig,
  configExists,
  validateConfig,
  type Config,
  type ProviderConfig,
} from './config';
import { PROVIDER_IDS, type ProviderId } from '../types';

const PROVIDER_LABELS: Record<ProviderId, string> = {
  bob: 'Bob CLI',
  watsonx: 'IBM WatsonX API',
  'claude-code': 'Claude Code CLI',
  codex: 'OpenAI Codex CLI',
  anthropic: 'Anthropic API',
  openai: 'OpenAI API',
  openrouter: 'OpenRouter API',
};

function cancelIfNeeded<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }
  return value as T;
}

/**
 * Run the interactive init command
 */
export async function initCommand(): Promise<void> {
  console.clear();
  
  p.intro('🚀 ChangeNarator Setup');

  // Check if config already exists
  if (configExists()) {
    const overwrite = await p.confirm({
      message: 'Configuration file already exists. Do you want to overwrite it?',
      initialValue: false,
    });

    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel('Setup cancelled.');
      process.exit(0);
    }
  }

  const base = await p.group(
    {
      githubToken: () => p.password({
        message: 'GitHub Personal Access Token:',
        mask: '•',
        validate: value => !value ? 'GitHub token is required' : undefined,
      }),
      notionToken: () => p.password({
        message: 'Notion Integration Token:',
        mask: '•',
        validate: value => !value ? 'Notion token is required' : undefined,
      }),
      notionPageId: () => p.text({
        message: 'Notion Parent Page ID:',
        validate: value => !value ? 'Page ID is required' : undefined,
      }),
      localReposDir: () => p.text({
        message: 'Local repos directory:',
        initialValue: '~/repos',
        validate: value => !value ? 'Directory path is required' : undefined,
      }),
    },
    {
      onCancel: () => {
        p.cancel('Setup cancelled.');
        process.exit(0);
      },
    },
  );

  const configuredProviders = cancelIfNeeded<ProviderId[]>(
    await p.multiselect({
      message: 'Which AI providers should be available?',
      options: PROVIDER_IDS.map(value => ({
        value,
        label: PROVIDER_LABELS[value],
      })),
      initialValues: ['claude-code'],
      required: true,
    }),
  );

  const defaultProvider = cancelIfNeeded<ProviderId>(
    await p.select({
      message: 'Which provider should be the default?',
      options: configuredProviders.map(value => ({
        value,
        label: PROVIDER_LABELS[value],
      })),
    }),
  );

  const providerSettings: Partial<Record<ProviderId, ProviderConfig>> = {};
  for (const provider of configuredProviders) {
    const model = cancelIfNeeded<string>(
      await p.text({
        message: `Optional saved model for ${PROVIDER_LABELS[provider]}:`,
        placeholder: 'Leave blank to use ChangeNarator’s tested default',
      }),
    ).trim();
    providerSettings[provider] = model ? { model } : {};
  }

  if (configuredProviders.includes('watsonx')) {
    const projectId = cancelIfNeeded<string>(
      await p.text({
        message: 'WatsonX Project ID:',
        validate: value => !value ? 'Project ID is required' : undefined,
      }),
    );
    const url = cancelIfNeeded<string>(
      await p.text({
        message: 'WatsonX Region URL:',
        initialValue: 'https://us-south.ml.cloud.ibm.com',
        validate: value =>
          !value?.startsWith('http://') && !value?.startsWith('https://')
            ? 'URL must start with http:// or https://'
            : undefined,
      }),
    );
    providerSettings.watsonx = {
      ...providerSettings.watsonx,
      projectId,
      url,
    };
  }

  const configData: Config = {
    github: {
      token: base.githubToken as string,
    },
    notion: {
      token: base.notionToken as string,
      parentPageId: base.notionPageId as string,
    },
    localReposDir: base.localReposDir as string,
    ai: {
      defaultProvider,
      providers: providerSettings,
    },
  };

  // Validate the configuration
  const errors = validateConfig(configData);
  if (errors.length > 0) {
    p.cancel('Configuration validation failed:');
    errors.forEach((error) => console.error(`  ❌ ${error}`));
    process.exit(1);
  }

  // Show a spinner while saving
  const s = p.spinner();
  s.start('Saving configuration...');

  try {
    await saveConfig(configData);
    s.stop('Configuration saved successfully!');
  } catch (error) {
    s.stop('Failed to save configuration');
    p.cancel(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }

  // Show success message with next steps
  p.note(
    `Configuration saved to config.json\n\n` +
    `Default AI provider: ${PROVIDER_LABELS[defaultProvider]}\n` +
    `API keys are read from environment variables and were not written to disk.\n\n` +
    `Next steps:\n` +
    `  1. Export any required provider API key.\n` +
    `  2. Run your first analysis:\n` +
    `     bun run start <owner> <repo> <pr_number> <local_repo_path>\n\n` +
    `  3. Override the provider when needed:\n` +
    `     changenarator analyze --provider openrouter <owner> <repo> <pr_number> <path>`,
    'Setup Complete! 🎉'
  );

  p.outro('Happy analyzing! 🚀');
}

// Made with Bob
