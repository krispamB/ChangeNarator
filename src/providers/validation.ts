import type { ChangeAnalysisResult, ChangelogAudiences } from '../types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonCandidate(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Provider did not return a JSON object');
    return JSON.parse(match[0]);
  }
}

export function extractStructuredValue(raw: unknown): unknown {
  let value = parseJsonCandidate(raw);

  for (let depth = 0; depth < 5; depth += 1) {
    if (!isRecord(value)) return value;

    if ('structured_output' in value) {
      value = parseJsonCandidate(value.structured_output);
      continue;
    }
    if ('result' in value) {
      value = parseJsonCandidate(value.result);
      continue;
    }
    if ('output_text' in value) {
      value = parseJsonCandidate(value.output_text);
      continue;
    }
    if ('content' in value && typeof value.content === 'string') {
      value = parseJsonCandidate(value.content);
      continue;
    }
    break;
  }

  return value;
}

export function validateChangeAnalysis(value: unknown): ChangeAnalysisResult {
  const data = extractStructuredValue(value);
  if (!isRecord(data)) throw new Error('Change analysis must be a JSON object');

  const errors: string[] = [];
  if (typeof data.repo !== 'string') errors.push('repo must be a string');
  if (typeof data.pr_number !== 'number') errors.push('pr_number must be a number');
  if (typeof data.pr_title !== 'string') errors.push('pr_title must be a string');
  if (data.version_hint !== null && typeof data.version_hint !== 'string') {
    errors.push('version_hint must be a string or null');
  }
  if (!Array.isArray(data.change_types)) {
    errors.push('change_types must be an array');
  } else {
    const allowed = new Set(['feature', 'fix', 'refactor', 'chore', 'docs']);
    if (data.change_types.some(value => typeof value !== 'string' || !allowed.has(value))) {
      errors.push('change_types contains unsupported values');
    }
  }
  if (!Array.isArray(data.affected_modules) || data.affected_modules.some(value => typeof value !== 'string')) {
    errors.push('affected_modules must be an array of strings');
  }
  if (typeof data.breaking_changes !== 'boolean') errors.push('breaking_changes must be a boolean');
  if (data.breaking_change_details !== null && typeof data.breaking_change_details !== 'string') {
    errors.push('breaking_change_details must be a string or null');
  }
  if (typeof data.technical_summary !== 'string') errors.push('technical_summary must be a string');
  if (!Array.isArray(data.files_skipped) || data.files_skipped.some(value => typeof value !== 'string')) {
    errors.push('files_skipped must be an array of strings');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid change analysis:\n${errors.map(error => `  - ${error}`).join('\n')}`);
  }

  return data as unknown as ChangeAnalysisResult;
}

export function validateChangelogAudiences(value: unknown): ChangelogAudiences {
  const data = extractStructuredValue(value);
  if (!isRecord(data)) throw new Error('Audience changelogs must be a JSON object');

  const errors: string[] = [];
  for (const audience of ['devs', 'pms', 'users'] as const) {
    if (typeof data[audience] !== 'string' || data[audience].trim().length === 0) {
      errors.push(`${audience} must be a non-empty string`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`Invalid audience changelogs:\n${errors.map(error => `  - ${error}`).join('\n')}`);
  }

  return {
    devs: data.devs as string,
    pms: data.pms as string,
    users: data.users as string,
  };
}
