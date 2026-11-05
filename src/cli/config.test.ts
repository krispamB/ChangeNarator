import { describe, expect, test } from 'bun:test';
import { validateConfig, type Config } from './config';

const baseConfig = {
  github: { token: 'github-token' },
  notion: { token: 'notion-token', parentPageId: 'page-id' },
  localReposDir: '~/repos',
};

describe('validateConfig provider configuration', () => {
  test('accepts environment-backed API providers without persisted API keys', () => {
    const config: Config = {
      ...baseConfig,
      ai: {
        defaultProvider: 'openai',
        providers: {
          openai: { model: 'gpt-5.6-sol' },
          anthropic: {},
        },
      },
    };

    expect(validateConfig(config)).toEqual([]);
  });

  test('requires WatsonX fields only when WatsonX is the unified default', () => {
    const config: Config = {
      ...baseConfig,
      ai: {
        defaultProvider: 'watsonx',
        providers: { watsonx: {} },
      },
    };

    expect(validateConfig(config)).toContain('WatsonX project ID is required');
  });

  test('preserves validation for the legacy Bob to WatsonX config', () => {
    const config: Config = {
      ...baseConfig,
      watsonx: {
        apiKey: 'watson-key',
        projectId: 'project-id',
        url: 'https://watson.example',
      },
    };

    expect(validateConfig(config)).toEqual([]);
  });

  test('accepts a legacy config whose WatsonX API key lives only in WATSONX_API_KEY', () => {
    const previous = process.env.WATSONX_API_KEY;
    process.env.WATSONX_API_KEY = 'env-watson-key';
    try {
      const config = {
        ...baseConfig,
        watsonx: { projectId: 'project-id', url: 'https://watson.example' },
      } as Config;

      expect(validateConfig(config)).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env.WATSONX_API_KEY;
      else process.env.WATSONX_API_KEY = previous;
    }
  });

  test('still rejects a legacy config with no WatsonX API key anywhere', () => {
    const previous = process.env.WATSONX_API_KEY;
    delete process.env.WATSONX_API_KEY;
    try {
      const config = {
        ...baseConfig,
        watsonx: { projectId: 'project-id', url: 'https://watson.example' },
      } as Config;

      expect(validateConfig(config)).toContain(
        'WatsonX API key is required for the legacy pipeline (set WATSONX_API_KEY)',
      );
    } finally {
      if (previous !== undefined) process.env.WATSONX_API_KEY = previous;
    }
  });
});
