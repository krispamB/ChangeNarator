/**
 * Configuration management for ChangeNarator
 * Handles reading and writing config.json file
 */

import { existsSync } from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { PROVIDER_IDS, type ProviderId } from '../types';

export interface ProviderConfig {
  model?: string;
  projectId?: string;
  url?: string;
}

export interface AIConfig {
  defaultProvider: ProviderId;
  providers?: Partial<Record<ProviderId, ProviderConfig>>;
}

export interface Config {
  github: {
    token: string;
  };
  /**
   * Legacy WatsonX configuration. New configurations use ai.providers.watsonx
   * and WATSONX_API_KEY, but these fields remain readable for compatibility.
   */
  watsonx?: {
    apiKey: string;
    projectId: string;
    url: string;
  };
  notion: {
    token: string;
    parentPageId: string;
  };
  localReposDir: string;
  ai?: AIConfig;
}

/**
 * Get the path to the config file
 * Stored in the project root as config.json
 */
export function getConfigPath(): string {
  // Get the project root (2 levels up from src/cli)
  const projectRoot = join(__dirname, '..', '..');
  return join(projectRoot, 'config.json');
}

/**
 * Check if config file exists
 */
export function configExists(): boolean {
  return existsSync(getConfigPath());
}

/**
 * Expand ~ to home directory in paths
 */
function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

/**
 * Load configuration from config.json
 * Falls back to environment variables if config doesn't exist
 */
export async function loadConfig(): Promise<Config> {
  const configPath = getConfigPath();

  // Try to load from config.json first
  if (existsSync(configPath)) {
    try {
      const content = await readFile(configPath, 'utf-8');
      const config = JSON.parse(content) as Config;
      
      // Expand paths
      config.localReposDir = expandPath(config.localReposDir);

      const errors = validateConfig(config);
      if (errors.length > 0) {
        throw new Error(errors.join('; '));
      }
      
      return config;
    } catch (error) {
      console.error('Error reading config.json:', error);
      throw new Error('Failed to parse config.json. Please run "changenarator init" to recreate it.');
    }
  }

  // Fallback to environment variables (for backward compatibility)
  const githubToken = process.env.GITHUB_TOKEN;
  const watsonxApiKey = process.env.WATSONX_API_KEY;
  const watsonxProjectId = process.env.WATSONX_PROJECT_ID;
  const watsonxUrl = process.env.WATSONX_URL || 'https://us-south.ml.cloud.ibm.com';
  const notionToken = process.env.NOTION_TOKEN;
  const notionPageId = process.env.NOTION_PARENT_PAGE_ID;
  const localReposDir = process.env.LOCAL_REPOS_DIR || '~/repos';

  // AI credentials are not required here: each provider checks its own
  // credentials when it runs, so `--provider anthropic` works without WatsonX.
  if (!githubToken || !notionToken || !notionPageId) {
    throw new Error(
      'Configuration not found. Please run "changenarator init" to set up your configuration, ' +
      'or set GITHUB_TOKEN, NOTION_TOKEN, and NOTION_PARENT_PAGE_ID in a .env file.'
    );
  }

  return {
    github: { token: githubToken },
    ...(watsonxApiKey && watsonxProjectId
      ? {
          watsonx: {
            apiKey: watsonxApiKey,
            projectId: watsonxProjectId,
            url: watsonxUrl,
          },
        }
      : {}),
    notion: {
      token: notionToken,
      parentPageId: notionPageId,
    },
    localReposDir: expandPath(localReposDir),
  };
}

/**
 * Save configuration to config.json
 */
export async function saveConfig(config: Config): Promise<void> {
  const configPath = getConfigPath();
  
  // Ensure the directory exists
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  // Write config with pretty formatting
  const content = JSON.stringify(config, null, 2);
  await writeFile(configPath, content, 'utf-8');
}

/**
 * Validate configuration values
 */
export function validateConfig(config: Partial<Config>): string[] {
  const errors: string[] = [];

  if (!config.github?.token) {
    errors.push('GitHub token is required');
  }

  if (config.ai) {
    if (!PROVIDER_IDS.includes(config.ai.defaultProvider)) {
      errors.push(`AI default provider must be one of: ${PROVIDER_IDS.join(', ')}`);
    }

    for (const [provider, settings] of Object.entries(config.ai.providers ?? {})) {
      if (!PROVIDER_IDS.includes(provider as ProviderId)) {
        errors.push(`Unknown AI provider: ${provider}`);
      }
      if (settings?.model !== undefined && !settings.model.trim()) {
        errors.push(`Model for ${provider} cannot be empty`);
      }
      if (settings?.url && !settings.url.startsWith('http://') && !settings.url.startsWith('https://')) {
        errors.push(`URL for ${provider} must start with http:// or https://`);
      }
    }

    if (config.ai.defaultProvider === 'watsonx') {
      const watsonSettings = config.ai.providers?.watsonx;
      const projectId = watsonSettings?.projectId || config.watsonx?.projectId || process.env.WATSONX_PROJECT_ID;
      const url = watsonSettings?.url || config.watsonx?.url || process.env.WATSONX_URL;
      if (!projectId) errors.push('WatsonX project ID is required');
      if (!url) errors.push('WatsonX URL is required');
    }
  } else {
    // Same precedence as the legacy generator in src/watsonx.ts: env first, then config.json.
    const apiKey = process.env.WATSONX_API_KEY || config.watsonx?.apiKey;
    const projectId = process.env.WATSONX_PROJECT_ID || config.watsonx?.projectId;
    const url = process.env.WATSONX_URL || config.watsonx?.url;
    if (!apiKey) {
      errors.push('WatsonX API key is required for the legacy pipeline (set WATSONX_API_KEY)');
    }
    if (!projectId) {
      errors.push('WatsonX project ID is required for the legacy pipeline');
    }
    if (!url) {
      errors.push('WatsonX URL is required for the legacy pipeline');
    } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
      errors.push('WatsonX URL must start with http:// or https://');
    }
  }

  if (!config.notion?.token) {
    errors.push('Notion token is required');
  }

  if (!config.notion?.parentPageId) {
    errors.push('Notion parent page ID is required');
  }

  if (!config.localReposDir) {
    errors.push('Local repos directory is required');
  }

  return errors;
}

// Made with Bob
