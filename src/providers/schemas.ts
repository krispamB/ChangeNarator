export const CHANGE_ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    repo: { type: 'string' },
    pr_number: { type: 'number' },
    pr_title: { type: 'string' },
    version_hint: { type: ['string', 'null'] },
    change_types: {
      type: 'array',
      items: { enum: ['feature', 'fix', 'refactor', 'chore', 'docs'] },
    },
    affected_modules: { type: 'array', items: { type: 'string' } },
    breaking_changes: { type: 'boolean' },
    breaking_change_details: { type: ['string', 'null'] },
    technical_summary: { type: 'string' },
    files_skipped: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'repo',
    'pr_number',
    'pr_title',
    'version_hint',
    'change_types',
    'affected_modules',
    'breaking_changes',
    'breaking_change_details',
    'technical_summary',
    'files_skipped',
  ],
} as const;

export const CHANGELOG_AUDIENCES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    devs: { type: 'string' },
    pms: { type: 'string' },
    users: { type: 'string' },
  },
  required: ['devs', 'pms', 'users'],
} as const;
