import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProviderId } from '../types';
import type { AIProvider, CommandExecutor } from './contracts';
import { createPromptProvider } from './prompt-provider';
import { extractStructuredValue } from './validation';

function parseCliOutput(output: string): unknown {
  const trimmed = output.trim();
  if (!trimmed) throw new Error('CLI provider returned no output');

  try {
    return extractStructuredValue(JSON.parse(trimmed));
  } catch (error) {
    if (error instanceof SyntaxError) return extractStructuredValue(trimmed);
    throw error;
  }
}

export function createBobProvider(executeCommand: CommandExecutor): AIProvider {
  return createPromptProvider({
    id: 'bob',
    contextMode: 'repository',
    defaultModel: null,
    invoke: async (prompt, _schema, { cwd, model }) => {
      const args = ['--chat-mode', 'ask', '--hide-intermediary-output', '--output-format', 'json'];
      if (model) args.push('--model', model);
      // Bob still requires the deprecated prompt switch for reliable piped input.
      args.push('-p', '-');
      return parseCliOutput(await executeCommand({ command: 'bob', args, input: prompt, cwd }));
    },
  });
}

export function createClaudeCodeProvider(executeCommand: CommandExecutor): AIProvider {
  let authenticationCheck: Promise<void> | undefined;
  const ensureAuthenticated = (cwd: string) => {
    authenticationCheck ??= executeCommand({
      command: 'claude',
      args: ['auth', 'status'],
      input: '',
      cwd,
      timeoutMs: 15_000,
    }).then(() => undefined).catch(() => {
      throw new Error('Claude Code is not authenticated. Run "claude auth login" and try again.');
    });
    return authenticationCheck;
  };

  return createPromptProvider({
    id: 'claude-code',
    contextMode: 'repository',
    defaultModel: 'claude-sonnet-5',
    invoke: async (prompt, schema, { cwd, model }) => {
      await ensureAuthenticated(cwd);
      const args = [
        '-p',
        '--safe-mode',
        '--output-format', 'json',
        '--json-schema', JSON.stringify(schema),
        '--permission-mode', 'plan',
        '--tools', 'Read,Glob,Grep',
        '--strict-mcp-config',
        '--mcp-config', '{"mcpServers":{}}',
        '--no-session-persistence',
      ];
      if (model) args.push('--model', model);
      return parseCliOutput(await executeCommand({ command: 'claude', args, input: prompt, cwd }));
    },
  });
}

/** File I/O the Codex provider uses for its schema and last-message files. */
export interface CodexFileSystem {
  writeFile(path: string, data: string): Promise<void>;
  readFile(path: string): Promise<string>;
}

const nodeFileSystem: CodexFileSystem = {
  writeFile: (path, data) => writeFile(path, data, 'utf-8'),
  readFile: path => readFile(path, 'utf-8'),
};

export function createCodexProvider(
  executeCommand: CommandExecutor,
  files: CodexFileSystem = nodeFileSystem,
): AIProvider {
  let authenticationCheck: Promise<void> | undefined;
  const ensureAuthenticated = (cwd: string) => {
    authenticationCheck ??= executeCommand({
      command: 'codex',
      args: ['login', 'status'],
      input: '',
      cwd,
      timeoutMs: 15_000,
    }).then(() => undefined).catch(() => {
      throw new Error('Codex CLI is not authenticated. Run "codex login" and try again.');
    });
    return authenticationCheck;
  };

  return createPromptProvider({
    id: 'codex',
    contextMode: 'repository',
    defaultModel: 'gpt-5.6-sol',
    invoke: async (prompt, schema, { cwd, model }) => {
      await ensureAuthenticated(cwd);
      const directory = await mkdtemp(join(tmpdir(), 'changenarrator-codex-'));
      const schemaPath = join(directory, 'output-schema.json');
      const outputPath = join(directory, 'last-message.json');
      try {
        await files.writeFile(schemaPath, JSON.stringify(schema));
        const args = [
          'exec',
          '--ephemeral',
          '--sandbox', 'read-only',
          '--output-schema', schemaPath,
          '--output-last-message', outputPath,
          '--color', 'never',
        ];
        if (model) args.push('--model', model);
        args.push('-');
        await executeCommand({ command: 'codex', args, input: prompt, cwd });
        return parseCliOutput(await files.readFile(outputPath));
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  });
}

export function isCliProvider(id: ProviderId): boolean {
  return id === 'bob' || id === 'claude-code' || id === 'codex';
}
