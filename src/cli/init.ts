/**
 * Interactive CLI setup command using @clack/prompts
 * Collects configuration and saves to config.json
 */

import * as p from '@clack/prompts';
import { saveConfig, configExists, validateConfig, type Config } from './config';

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

  // Collect configuration using grouped prompts
  const config = await p.group(
    {
      githubToken: () =>
        p.password({
          message: 'GitHub Personal Access Token:',
          mask: '•',
          validate: (value) => {
            if (!value) return 'GitHub token is required';
            if (value.length < 10) return 'Token seems too short';
          },
        }),

      watsonxApiKey: () =>
        p.password({
          message: 'IBM WatsonX API Key:',
          mask: '•',
          validate: (value) => {
            if (!value) return 'WatsonX API key is required';
            if (value.length < 10) return 'API key seems too short';
          },
        }),

      watsonxProjectId: () =>
        p.text({
          message: 'WatsonX Project ID:',
          placeholder: 'abc123xyz',
          validate: (value) => {
            if (!value) return 'Project ID is required';
            if (value.length < 5) return 'Project ID seems too short';
          },
        }),

      watsonxUrl: () =>
        p.text({
          message: 'WatsonX Region URL:',
          initialValue: 'https://us-south.ml.cloud.ibm.com',
          placeholder: 'e.g. us-south.ml.cloud.ibm.com',
          validate: (value) => {
            if (!value) return 'URL is required';
            if (!value.startsWith('http://') && !value.startsWith('https://')) {
              return 'URL must start with http:// or https://';
            }
          },
        }),

      notionToken: () =>
        p.password({
          message: 'Notion Integration Token:',
          mask: '•',
          validate: (value) => {
            if (!value) return 'Notion token is required';
            if (!value.startsWith('ntn_')) {
              return 'Notion token should start with "ntn_"';
            }
          },
        }),

      notionPageId: () =>
        p.text({
          message: 'Notion Parent Page ID:',
          placeholder: '1234567890abcdef',
          validate: (value) => {
            if (!value) return 'Page ID is required';
            if (value.length < 10) return 'Page ID seems too short';
          },
        }),

      localReposDir: () =>
        p.text({
          message: 'Local repos directory (where repos will be cloned):',
          initialValue: '~/repos',
          placeholder: '~/repos',
          validate: (value) => {
            if (!value) return 'Directory path is required';
          },
        }),
    },
    {
      onCancel: () => {
        p.cancel('Setup cancelled.');
        process.exit(0);
      },
    }
  );

  // Transform collected data into Config structure
  const configData: Config = {
    github: {
      token: config.githubToken as string,
    },
    watsonx: {
      apiKey: config.watsonxApiKey as string,
      projectId: config.watsonxProjectId as string,
      url: config.watsonxUrl as string,
    },
    notion: {
      token: config.notionToken as string,
      parentPageId: config.notionPageId as string,
    },
    localReposDir: config.localReposDir as string,
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
    `Next steps:\n` +
    `  1. Run your first analysis:\n` +
    `     bun run start <owner> <repo> <pr_number> <local_repo_path>\n\n` +
    `  2. Example:\n` +
    `     bun run start facebook react 12345 ${configData.localReposDir}/react\n\n` +
    `Note: Make sure to add config.json to .gitignore to keep your secrets safe!`,
    'Setup Complete! 🎉'
  );

  p.outro('Happy analyzing! 🚀');
}

// Made with Bob
