import { afterEach, describe, expect, test } from 'bun:test';
import type { Config } from '../cli/config';
import type { ChangeAnalysisResult, PRContext } from '../types';
import { createAnthropicProvider } from './anthropic';
import { createBobProvider, createClaudeCodeProvider, createCodexProvider } from './cli';
import { createOpenAIProvider } from './openai';
import { createOpenRouterProvider } from './openrouter';
import { createProvider } from './registry';
import { createWatsonXProvider } from './watsonx-provider';

const prContext: PRContext = {
  repo: 'owner/repo',
  pr_number: 42,
  pr_title: 'Add providers',
  base_sha: 'base',
  head_sha: 'head',
  commit_messages: ['feat: add providers'],
  files_changed: [{
    filename: 'src/provider.ts',
    status: 'added',
    additions: 10,
    deletions: 0,
    patch: '+provider',
  }],
  stats: { total_files: 1, total_commits: 1 },
};

const analysis: ChangeAnalysisResult = {
  repo: 'owner/repo',
  pr_number: 42,
  pr_title: 'Add providers',
  version_hint: null,
  change_types: ['feature'],
  affected_modules: ['ai'],
  breaking_changes: false,
  breaking_change_details: null,
  technical_summary: 'Adds provider adapters.',
  files_skipped: [],
};

const config: Config = {
  github: { token: 'github' },
  notion: { token: 'notion', parentPageId: 'page' },
  localReposDir: '/tmp',
  ai: { defaultProvider: 'openai', providers: {} },
};

const originalEnvironment = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  WATSONX_API_KEY: process.env.WATSONX_API_KEY,
};

afterEach(() => {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('provider registry', () => {
  test('constructs every supported provider', () => {
    process.env.WATSONX_API_KEY = 'watson';
    for (const id of [
      'bob', 'watsonx', 'claude-code', 'codex',
      'anthropic', 'openai', 'openrouter',
    ] as const) {
      expect(createProvider(id, {
        ...config,
        ai: {
          defaultProvider: id,
          providers: {
            watsonx: {
              projectId: 'project',
              url: 'https://watson.example',
            },
          },
        },
      }).id).toBe(id);
    }
  });
});

describe('CLI providers', () => {
  test('Bob uses repository context and machine-readable output', async () => {
    let request: {
      command: string;
      args: string[];
      input: string;
      cwd: string;
    } | undefined;
    const provider = createBobProvider(async value => {
      request = value;
      return JSON.stringify({ result: JSON.stringify(analysis) });
    });

    const result = await provider.analyze({ prContext, localRepoPath: '/tmp/repo' });
    expect(result.value).toEqual(analysis);
    expect(request?.command).toBe('bob');
    expect(request?.args).toContain('json');
    expect(request?.cwd).toBe('/tmp/repo');
  });

  test('Claude Code uses safe mode, JSON schema, and a model override', async () => {
    let args: string[] = [];
    const provider = createClaudeCodeProvider(async request => {
      args = request.args;
      return JSON.stringify({ structured_output: analysis });
    });

    const result = await provider.analyze(
      { prContext, localRepoPath: '/tmp/repo' },
      { model: 'claude-custom' },
    );
    expect(result.model).toBe('claude-custom');
    expect(args).toContain('--safe-mode');
    expect(args).toContain('--json-schema');
    expect(args).toContain('claude-custom');
  });

  test('Codex reads its validated last-message file in a read-only sandbox', async () => {
    let args: string[] = [];
    const written = new Map<string, string>();
    const files = {
      writeFile: async (path: string, data: string) => { written.set(path, data); },
      readFile: async (path: string) => {
        const data = written.get(path);
        if (data === undefined) throw new Error(`no such file: ${path}`);
        return data;
      },
    };
    const provider = createCodexProvider(async request => {
      args = request.args;
      if (request.args[0] === 'login') return '';
      expect(written.has(request.args[request.args.indexOf('--output-schema') + 1]!)).toBe(true);
      const outputFlag = request.args.indexOf('--output-last-message');
      await files.writeFile(request.args[outputFlag + 1]!, JSON.stringify(analysis));
      return '';
    }, files);

    const result = await provider.analyze({ prContext, localRepoPath: '/tmp/repo' });
    expect(result.value).toEqual(analysis);
    expect(args).toContain('read-only');
    expect(args).toContain('--output-schema');
    expect(args.at(-1)).toBe('-');
  });

  test('reports unauthenticated Claude Code before sending PR context', async () => {
    const provider = createClaudeCodeProvider(async () => {
      throw new Error('not logged in');
    });
    await expect(
      provider.analyze({ prContext, localRepoPath: '/tmp/repo' }),
    ).rejects.toThrow('claude auth login');
  });
});

describe('API providers', () => {
  test('OpenAI uses Responses structured output and environment auth', async () => {
    process.env.OPENAI_API_KEY = 'secret-openai';
    let body: any;
    const provider = createOpenAIProvider((async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({ output_text: JSON.stringify(analysis) });
    }) as typeof fetch);

    const result = await provider.analyze({ prContext, localRepoPath: '/tmp/repo' });
    expect(result.value).toEqual(analysis);
    expect(body.text.format.type).toBe('json_schema');
    expect(body.model).toBe('gpt-5.6-sol');
  });

  test('Anthropic uses Messages structured output', async () => {
    process.env.ANTHROPIC_API_KEY = 'secret-anthropic';
    let body: any;
    const provider = createAnthropicProvider((async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({
        content: [{ type: 'text', text: JSON.stringify(analysis) }],
      });
    }) as typeof fetch);

    await provider.analyze({ prContext, localRepoPath: '/tmp/repo' });
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.model).toBe('claude-sonnet-5');
  });

  test('OpenRouter requires schema support and disables upstream fallback', async () => {
    process.env.OPENROUTER_API_KEY = 'secret-openrouter';
    let body: any;
    const provider = createOpenRouterProvider((async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({
        choices: [{ message: { content: JSON.stringify(analysis) } }],
      });
    }) as typeof fetch);

    await provider.analyze({ prContext, localRepoPath: '/tmp/repo' });
    expect(body.provider.require_parameters).toBe(true);
    expect(body.provider.allow_fallbacks).toBe(false);
  });

  test('WatsonX obtains an IAM token and uses top-level generation controls', async () => {
    process.env.WATSONX_API_KEY = 'secret-watson';
    let calls = 0;
    let chatBody: any;
    const fetchMock = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls += 1;
      if (calls === 1) return Response.json({ access_token: 'iam-token' });
      chatBody = JSON.parse(String(init?.body));
      return Response.json({
        choices: [{ message: { content: JSON.stringify(analysis) } }],
      });
    }) as typeof fetch;
    const provider = createWatsonXProvider(fetchMock, {
      ...config,
      ai: {
        defaultProvider: 'watsonx',
        providers: {
          watsonx: {
            projectId: 'project-id',
            url: 'https://watson.example',
          },
        },
      },
    });

    await provider.analyze({ prContext, localRepoPath: '/tmp/repo' });
    expect(calls).toBe(2);
    expect(chatBody.max_tokens).toBe(4_096);
    expect(chatBody.parameters).toBeUndefined();
  });

  test('reports the expected environment variable without exposing credentials', async () => {
    delete process.env.OPENAI_API_KEY;
    const provider = createOpenAIProvider(fetch);
    await expect(
      provider.analyze({ prContext, localRepoPath: '/tmp/repo' }),
    ).rejects.toThrow('OPENAI_API_KEY');
  });
});
