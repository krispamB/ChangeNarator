/**
 * Configuration management for ChangeNarator
 * Handles reading and writing config.json file
 */

import { existsSync } from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';

export interface Config {
  github: {
    token: string;
  };
  watsonx: {
    apiKey: string;
    projectId: string;
    url: string;
  };
  notion: {
    token: string;
    parentPageId: string;
  };
  localReposDir: string;
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

  if (!githubToken || !watsonxApiKey || !watsonxProjectId || !notionToken || !notionPageId) {
    throw new Error(
      'Configuration not found. Please run "changenarator init" to set up your configuration, ' +
      'or set the required environment variables in .env file.'
    );
  }

  return {
    github: { token: githubToken },
    watsonx: {
      apiKey: watsonxApiKey,
      projectId: watsonxProjectId,
      url: watsonxUrl,
    },
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

  if (!config.watsonx?.apiKey) {
    errors.push('WatsonX API key is required');
  }

  if (!config.watsonx?.projectId) {
    errors.push('WatsonX project ID is required');
  }

  if (!config.watsonx?.url) {
    errors.push('WatsonX URL is required');
  } else if (!config.watsonx.url.startsWith('http')) {
    errors.push('WatsonX URL must start with http:// or https://');
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
