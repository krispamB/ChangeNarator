/**
 * Test helper for creating mock config objects
 */

import type { Config } from './config';

export function createMockConfig(overrides?: Partial<Config>): Config {
  return {
    github: {
      token: 'test-github-token',
    },
    watsonx: {
      apiKey: 'test-watsonx-api-key',
      projectId: 'test-project-id',
      url: 'https://test.watsonx.com',
    },
    notion: {
      token: 'test-notion-token',
      parentPageId: 'test-page-id',
    },
    localReposDir: '~/test-repos',
    ...overrides,
  };
}

// Made with Bob
