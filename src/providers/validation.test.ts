import { describe, expect, test } from 'bun:test';
import type { ChangeAnalysisResult } from '../types';
import {
  extractStructuredValue,
  validateChangeAnalysis,
  validateChangelogAudiences,
} from './validation';

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

describe('provider output validation', () => {
  test('extracts CLI structured-output envelopes', () => {
    expect(extractStructuredValue({
      result: JSON.stringify({ structured_output: analysis }),
    })).toEqual(analysis);
  });

  test('validates change analysis and rejects unsupported change types', () => {
    expect(validateChangeAnalysis(analysis)).toEqual(analysis);
    expect(() => validateChangeAnalysis({
      ...analysis,
      change_types: ['marketing'],
    })).toThrow('unsupported values');
  });

  test('strips JSON fences and validates all audiences', () => {
    expect(validateChangelogAudiences(
      '```json\n{"devs":"D","pms":"P","users":"U"}\n```',
    )).toEqual({ devs: 'D', pms: 'P', users: 'U' });
  });

  test('rejects empty audience output', () => {
    expect(() => validateChangelogAudiences({
      devs: 'D',
      pms: '',
      users: 'U',
    })).toThrow('pms must be a non-empty string');
  });
});
