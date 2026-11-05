import { describe, expect, test } from 'bun:test';
import { parseAnalyzeArguments } from './args';

describe('parseAnalyzeArguments', () => {
  test('parses the legacy positional form', () => {
    expect(parseAnalyzeArguments(['owner', 'repo', '42', '/tmp/repo'])).toEqual({
      owner: 'owner',
      repo: 'repo',
      prNumber: 42,
      localRepoPath: '/tmp/repo',
      options: {},
    });
  });

  test('parses provider and model overrides in either flag form', () => {
    expect(parseAnalyzeArguments([
      'analyze',
      '--provider=openrouter',
      'owner',
      '--model',
      'openai/gpt-5.4-mini',
      'repo',
      '42',
      '/tmp/repo',
    ])).toEqual({
      owner: 'owner',
      repo: 'repo',
      prNumber: 42,
      localRepoPath: '/tmp/repo',
      options: {
        provider: 'openrouter',
        model: 'openai/gpt-5.4-mini',
      },
    });
  });

  test('rejects unknown providers', () => {
    expect(() => parseAnalyzeArguments([
      '--provider', 'mystery', 'owner', 'repo', '42', '/tmp/repo',
    ])).toThrow('Unknown AI provider');
  });

  test('rejects missing, invalid, and unknown arguments', () => {
    expect(() => parseAnalyzeArguments(['owner', 'repo'])).toThrow('Expected');
    expect(() => parseAnalyzeArguments(['owner', 'repo', '0', '/tmp/repo'])).toThrow(
      'positive integer',
    );
    expect(() => parseAnalyzeArguments([
      '--unknown', 'owner', 'repo', '42', '/tmp/repo',
    ])).toThrow('Unknown option');
  });
});
