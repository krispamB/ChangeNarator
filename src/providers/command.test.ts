import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

// Run the real executor in a separate Node process:
// - src/bob-analyzer.test.ts replaces `child_process` with mock.module, and Bun
//   module mocks apply to the whole test process.
// - The published CLI runs on Node, and only Node turns an unhandled stdin
//   EPIPE into a crash; Bun swallows it, so a Bun-only test would not catch it.
const COMMAND_MODULE = join(import.meta.dir, 'command.ts');
const NODE = Bun.which('node');

function runExecutor(request: object): { outcome: string; message: string } {
  const script = `
    const { executeCommand } = await import(${JSON.stringify(COMMAND_MODULE)});
    const request = JSON.parse(process.env.REQUEST);
    if (request.inputSize) request.input = 'x'.repeat(request.inputSize);
    try {
      await executeCommand(request);
      console.log(JSON.stringify({ outcome: 'resolved', message: '' }));
    } catch (error) {
      console.log(JSON.stringify({ outcome: 'rejected', message: error.message }));
    }
  `;
  const result = Bun.spawnSync([
    NODE!,
    '--experimental-strip-types',
    '--no-warnings',
    '--input-type=module',
    '-e',
    script,
  ], {
    env: { ...process.env, REQUEST: JSON.stringify(request) },
    // Each case should finish in well under a second; a hang is a failure.
    timeout: 10_000,
  });
  if (result.exitCode !== 0) {
    throw new Error(`executor process crashed: ${result.stderr.toString()}`);
  }
  return JSON.parse(result.stdout.toString().trim());
}

describe.skipIf(!NODE)('executeCommand (under Node)', () => {
  test('reports the exit status instead of crashing when the child exits before reading input', () => {
    // Far larger than a pipe buffer, so the write is still pending when the child exits.
    const result = runExecutor({
      command: 'sh',
      args: ['-c', 'exit 3'],
      input: '',
      inputSize: 5_000_000,
      cwd: process.cwd(),
    });

    expect(result.outcome).toBe('rejected');
    expect(result.message).toContain('sh exited with code 3');
  });

  test('reports a missing command clearly', () => {
    const result = runExecutor({
      command: 'changenarrator-command-that-does-not-exist',
      args: [],
      input: 'prompt',
      cwd: process.cwd(),
    });

    expect(result.outcome).toBe('rejected');
    expect(result.message).toContain('is not installed or is not available on PATH');
  });

  test('stops a command that runs past its timeout and exits promptly', () => {
    const started = Date.now();
    const result = runExecutor({
      command: 'sleep',
      args: ['5'],
      input: '',
      cwd: process.cwd(),
      timeoutMs: 200,
    });

    expect(result.outcome).toBe('rejected');
    expect(result.message).toContain('sleep timed out after 200ms');
    expect(Date.now() - started).toBeLessThan(4_000);
  });
});
