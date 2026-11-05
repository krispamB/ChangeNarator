import { isProviderId } from '../providers/registry';
import type { PipelineOptions } from '../pipeline';

export interface AnalyzeArguments {
  owner: string;
  repo: string;
  prNumber: number;
  localRepoPath: string;
  options: PipelineOptions;
}

export function parseAnalyzeArguments(argv: string[]): AnalyzeArguments {
  const args = argv[0] === 'analyze' ? argv.slice(1) : [...argv];
  const positional: string[] = [];
  const options: PipelineOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument) continue;

    const [flag, inlineValue] = argument.split('=', 2);
    if (flag === '--provider' || flag === '--model') {
      const value = inlineValue ?? args[++index];
      if (!value || value.startsWith('--')) {
        throw new Error(`${flag} requires a value`);
      }

      if (flag === '--provider') {
        if (!isProviderId(value)) {
          throw new Error(`Unknown AI provider "${value}"`);
        }
        options.provider = value;
      } else {
        options.model = value;
      }
      continue;
    }

    if (argument.startsWith('-')) {
      throw new Error(`Unknown option "${argument}"`);
    }
    positional.push(argument);
  }

  if (positional.length !== 4) {
    throw new Error(
      'Expected <owner> <repo> <pr_number> <local_repo_path>',
    );
  }

  const [owner, repo, prNumberValue, localRepoPath] = positional;
  const prNumber = Number.parseInt(prNumberValue ?? '', 10);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error('PR number must be a positive integer');
  }

  return {
    owner: owner!,
    repo: repo!,
    prNumber,
    localRepoPath: localRepoPath!,
    options,
  };
}
