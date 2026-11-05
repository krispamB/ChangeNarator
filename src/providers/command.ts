import { spawn } from 'node:child_process';
import type { CommandExecutor } from './contracts';

const MAX_STDOUT_CHARACTERS = 5_000_000;
const MAX_STDERR_CHARACTERS = 20_000;

export const executeCommand: CommandExecutor = ({
  command,
  args,
  input,
  cwd,
  timeoutMs = 120_000,
}) =>
  new Promise((resolve, reject) => {
    // The timeout is managed here rather than with spawn's `timeout` option:
    // Node clears that timer only on 'exit', which never fires when the
    // binary is missing, so a failed spawn would keep the process alive.
    const child = spawn(command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let outputTooLarge = false;
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    const settle = (error: Error | null, value = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
      if (stdout.length > MAX_STDOUT_CHARACTERS) {
        outputTooLarge = true;
        child.kill();
      }
    });
    child.stderr.on('data', chunk => {
      if (stderr.length < MAX_STDERR_CHARACTERS) {
        stderr += chunk.toString();
      }
    });
    child.on('error', error => {
      const message = (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? `${command} is not installed or is not available on PATH`
        : `Failed to execute ${command}: ${error.message}`;
      // A failed spawn emits no 'close'; release the pipes so nothing lingers.
      child.stdin.destroy();
      child.stdout.destroy();
      child.stderr.destroy();
      settle(new Error(message));
    });
    child.on('close', code => {
      if (outputTooLarge) {
        settle(new Error(`${command} output exceeded the 5MB safety limit`));
        return;
      }
      if (timedOut) {
        settle(new Error(`${command} timed out after ${timeoutMs}ms`));
        return;
      }
      if (code === 0) {
        settle(null, stdout);
        return;
      }
      const detail = stderr.trim() || stdout.trim() || 'no diagnostic output';
      settle(new Error(`${command} exited with code ${code}: ${detail}`));
    });

    // If the child exits before reading all of its input (bad flag, auth
    // failure), writing raises EPIPE. Without a listener that is an uncaught
    // exception on Node; the 'close' handler already reports the real outcome.
    child.stdin.on('error', error => {
      if ((error as NodeJS.ErrnoException).code === 'EPIPE') return;
      settle(new Error(`Failed to send input to ${command}: ${error.message}`));
    });
    child.stdin.write(input);
    child.stdin.end();
  });
