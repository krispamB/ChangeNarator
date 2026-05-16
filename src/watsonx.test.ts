/**
 * Unit tests for WatsonX module
 */

import { describe, test, expect, beforeEach, mock, afterEach } from 'bun:test';
import { generateChangelog } from './watsonx';
import type { BobAnalysisResult } from './types';

// Store original environment variables
const originalEnv = {
  WATSONX_URL: process.env.WATSONX_URL,
  WATSONX_API_KEY: process.env.WATSONX_API_KEY,
  WATSONX_PROJECT_ID: process.env.WATSONX_PROJECT_ID,
};

// Helper to create mock chat API response
function createChatResponse(content: string) {
  return {
    choices: [
      {
        message: {
          content,
        },
      },
    ],
  };
}

describe('WatsonX Module', () => {
  const mockBobAnalysis: BobAnalysisResult = {
    repo: 'owner/repo',
    pr_number: 123,
    pr_title: 'Add authentication feature',
    version_hint: 'v1.2.0',
    change_types: ['feature', 'fix'],
    affected_modules: ['auth', 'api'],
    breaking_changes: false,
    breaking_change_details: null,
    technical_summary: 'Implemented OAuth2 authentication and fixed API endpoint validation.',
    files_skipped: [],
  };

  const mockBobAnalysisWithBreakingChanges: BobAnalysisResult = {
    ...mockBobAnalysis,
    breaking_changes: true,
    breaking_change_details: 'Changed API response format from XML to JSON',
  };

  beforeEach(() => {
    // Set up test environment variables
    process.env.WATSONX_URL = 'https://test.watsonx.com';
    process.env.WATSONX_API_KEY = 'test-api-key';
    process.env.WATSONX_PROJECT_ID = 'test-project-id';
    
    // Clear console.log mock
    mock.restore();
  });

  afterEach(() => {
    // Restore original environment variables
    process.env.WATSONX_URL = originalEnv.WATSONX_URL;
    process.env.WATSONX_API_KEY = originalEnv.WATSONX_API_KEY;
    process.env.WATSONX_PROJECT_ID = originalEnv.WATSONX_PROJECT_ID;
    
    mock.restore();
  });

  describe('getIAMToken', () => {
    test('should successfully fetch IAM token', async () => {
      const mockFetch = mock((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'test-token-123' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(createChatResponse('Test changelog')),
        });
      });
      global.fetch = mockFetch as any;

      await generateChangelog(mockBobAnalysis);

      // Verify IAM token endpoint was called
      const iamCalls = mockFetch.mock.calls.filter((call: any) =>
        call[0].includes('iam.cloud.ibm.com')
      );
      expect(iamCalls.length).toBeGreaterThan(0);
    });

    test('should throw error when IAM token fetch fails', async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 401,
        })
      );
      global.fetch = mockFetch as any;

      await expect(generateChangelog(mockBobAnalysis)).rejects.toThrow(
        'IAM token fetch failed: 401'
      );
    });
  });

  describe('generate', () => {
    test('should successfully generate text with chat API response format', async () => {
      const mockFetch = mock((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'test-token' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(createChatResponse('  Test generated changelog text  ')),
        });
      });
      global.fetch = mockFetch as any;

      const result = await generateChangelog(mockBobAnalysis);

      expect(result.devs).toBe('Test generated changelog text');
      expect(result.pms).toBe('Test generated changelog text');
      expect(result.users).toBe('Test generated changelog text');
    });

    test('should throw error when generation API returns non-ok status', async () => {
      const mockFetch = mock((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'test-token' }),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: () => Promise.resolve('Server error details'),
        });
      });
      global.fetch = mockFetch as any;

      await expect(generateChangelog(mockBobAnalysis)).rejects.toThrow(
        'watsonx generation failed: 500 Internal Server Error'
      );
    });

    test('should throw error when response format is unexpected', async () => {
      const mockFetch = mock((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'test-token' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              unexpected_field: 'unexpected value',
            }),
        });
      });
      global.fetch = mockFetch as any;

      await expect(generateChangelog(mockBobAnalysis)).rejects.toThrow(
        'watsonx returned unexpected format'
      );
    });

    test('should use correct chat API endpoint', async () => {
      let capturedUrl = '';
      const mockFetch = mock((url: string, options: any) => {
        if (url.includes('ml/v1/text/chat')) {
          capturedUrl = url;
        }
        if (url.includes('iam.cloud.ibm.com')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'test-token' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(createChatResponse('Test')),
        });
      });
      global.fetch = mockFetch as any;

      await generateChangelog(mockBobAnalysis);

      expect(capturedUrl).toContain('/ml/v1/text/chat');
      expect(capturedUrl).toContain('version=2024-05-31');
    });

    test('should include proper headers in generation request', async () => {
      let capturedHeaders: any = null;
      const mockFetch = mock((url: string, options: any) => {
        if (url.includes('ml/v1/text/chat')) {
          capturedHeaders = options.headers;
        }
        if (url.includes('iam.cloud.ibm.com')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'test-token-456' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(createChatResponse('Test')),
        });
      });
      global.fetch = mockFetch as any;

      await generateChangelog(mockBobAnalysis);

      expect(capturedHeaders).toBeDefined();
      expect(capturedHeaders['Accept']).toBe('application/json');
      expect(capturedHeaders['Authorization']).toBe('Bearer test-token-456');
      expect(capturedHeaders['Content-Type']).toBe('application/json');
    });

    test('should send correct request body with messages format', async () => {
      let capturedBody: any = null;
      const mockFetch = mock((url: string, options: any) => {
        if (url.includes('ml/v1/text/chat')) {
          capturedBody = JSON.parse(options.body);
        }
        if (url.includes('iam.cloud.ibm.com')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'test-token' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(createChatResponse('Test')),
        });
      });
      global.fetch = mockFetch as any;

      await generateChangelog(mockBobAnalysis);

      expect(capturedBody).toBeDefined();
      // Model ID comes from constant in module, just verify it exists
      expect(capturedBody.model_id).toBeDefined();
      expect(typeof capturedBody.model_id).toBe('string');
      expect(capturedBody.project_id).toBeDefined();
      expect(typeof capturedBody.project_id).toBe('string');
      expect(capturedBody.messages).toBeDefined();
      expect(Array.isArray(capturedBody.messages)).toBe(true);
      expect(capturedBody.messages.length).toBe(2);
      expect(capturedBody.messages[0].role).toBe('system');
      expect(capturedBody.messages[1].role).toBe('user');
      expect(capturedBody.messages[1].content[0].type).toBe('text');
      expect(capturedBody.parameters.max_new_tokens).toBe(500);
      expect(capturedBody.parameters.time_limit).toBe(10000);
    });
  });

  describe('buildPrompt', () => {
    test('should include all PR context in user message', async () => {
      let capturedUserMessage = '';
      const mockFetch = mock((url: string, options: any) => {
        if (url.includes('ml/v1/text/chat')) {
          const body = JSON.parse(options.body);
          capturedUserMessage = body.messages[1].content[0].text;
        }
        if (url.includes('iam.cloud.ibm.com')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'test-token' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(createChatResponse('Test')),
        });
      });
      global.fetch = mockFetch as any;

      await generateChangelog(mockBobAnalysis);

      expect(capturedUserMessage).toContain('Add authentication feature');
      expect(capturedUserMessage).toContain('123');
      expect(capturedUserMessage).toContain('feature, fix');
      expect(capturedUserMessage).toContain('auth, api');
      expect(capturedUserMessage).toContain('OAuth2 authentication');
    });

    test('should format breaking changes correctly when present', async () => {
      let capturedUserMessage = '';
      const mockFetch = mock((url: string, options: any) => {
        if (url.includes('ml/v1/text/chat')) {
          const body = JSON.parse(options.body);
          capturedUserMessage = body.messages[1].content[0].text;
        }
        if (url.includes('iam.cloud.ibm.com')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'test-token' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(createChatResponse('Test')),
        });
      });
      global.fetch = mockFetch as any;

      await generateChangelog(mockBobAnalysisWithBreakingChanges);

      expect(capturedUserMessage).toContain('Yes — Changed API response format from XML to JSON');
    });

    test('should format breaking changes as None when not present', async () => {
      let capturedUserMessage = '';
      const mockFetch = mock((url: string, options: any) => {
        if (url.includes('ml/v1/text/chat')) {
          const body = JSON.parse(options.body);
          capturedUserMessage = body.messages[1].content[0].text;
        }
        if (url.includes('iam.cloud.ibm.com')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'test-token' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(createChatResponse('Test')),
        });
      });
      global.fetch = mockFetch as any;

      await generateChangelog(mockBobAnalysis);

      expect(capturedUserMessage).toContain('Breaking changes: None');
    });

    test('should use different system prompts for different audiences', async () => {
      const capturedSystemPrompts: string[] = [];
      const mockFetch = mock((url: string, options: any) => {
        if (url.includes('ml/v1/text/chat')) {
          const body = JSON.parse(options.body);
          capturedSystemPrompts.push(body.messages[0].content);
        }
        if (url.includes('iam.cloud.ibm.com')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'test-token' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(createChatResponse('Test')),
        });
      });
      global.fetch = mockFetch as any;

      await generateChangelog(mockBobAnalysis);

      expect(capturedSystemPrompts.length).toBe(3);
      expect(capturedSystemPrompts[0]).toContain('software developers');
      expect(capturedSystemPrompts[1]).toContain('product managers');
      expect(capturedSystemPrompts[2]).toContain('end users');
    });
  });

  describe('generateChangelog', () => {
    test('should generate changelog for all three audiences', async () => {
      const mockFetch = mock((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'test-token' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(createChatResponse('Generated changelog')),
        });
      });
      global.fetch = mockFetch as any;

      const result = await generateChangelog(mockBobAnalysis);

      expect(result).toHaveProperty('devs');
      expect(result).toHaveProperty('pms');
      expect(result).toHaveProperty('users');
      expect(typeof result.devs).toBe('string');
      expect(typeof result.pms).toBe('string');
      expect(typeof result.users).toBe('string');
    });

    test('should run all three generations in parallel', async () => {
      const callTimestamps: number[] = [];
      const mockFetch = mock((url: string) => {
        if (url.includes('ml/v1/text/chat')) {
          callTimestamps.push(Date.now());
        }
        if (url.includes('iam.cloud.ibm.com')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'test-token' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(createChatResponse('Test')),
        });
      });
      global.fetch = mockFetch as any;

      await generateChangelog(mockBobAnalysis);

      // All three calls should happen within a short time window (parallel execution)
      expect(callTimestamps.length).toBe(3);
      const timeSpan = callTimestamps[2]! - callTimestamps[0]!;
      expect(timeSpan).toBeLessThan(100); // Should be nearly simultaneous
    });

    test('should reuse IAM token for all three generations', async () => {
      let iamTokenCallCount = 0;
      const mockFetch = mock((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          iamTokenCallCount++;
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'test-token' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(createChatResponse('Test')),
        });
      });
      global.fetch = mockFetch as any;

      await generateChangelog(mockBobAnalysis);

      // Should only fetch IAM token once
      expect(iamTokenCallCount).toBe(1);
    });

    test('should propagate errors from generation failures', async () => {
      const mockFetch = mock((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'test-token' }),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          text: () => Promise.resolve('Rate limit exceeded'),
        });
      });
      global.fetch = mockFetch as any;

      await expect(generateChangelog(mockBobAnalysis)).rejects.toThrow(
        'watsonx generation failed: 429'
      );
    });

    test('should trim whitespace from generated text', async () => {
      const mockFetch = mock((url: string) => {
        if (url.includes('iam.cloud.ibm.com')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'test-token' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(createChatResponse('\n\n  Changelog with whitespace  \n\n')),
        });
      });
      global.fetch = mockFetch as any;

      const result = await generateChangelog(mockBobAnalysis);

      expect(result.devs).toBe('Changelog with whitespace');
      expect(result.devs).not.toContain('\n');
    });
  });
});

// Made with Bob