import type { ChangeAnalysisResult, PRContext } from '../types';

const MAX_PATCH_CHARACTERS = 40_000;
const MAX_TOTAL_PATCH_CHARACTERS = 200_000;

function boundedPRContext(prContext: PRContext): PRContext {
  let remaining = MAX_TOTAL_PATCH_CHARACTERS;
  return {
    ...prContext,
    files_changed: prContext.files_changed.map(file => {
      if (file.patch === null) return file;
      if (remaining <= 0) {
        return { ...file, patch: '[patch omitted: total patch budget exceeded]' };
      }

      const allowed = Math.min(MAX_PATCH_CHARACTERS, remaining);
      remaining -= Math.min(file.patch.length, allowed);
      if (file.patch.length <= allowed) return file;
      return {
        ...file,
        patch: `${file.patch.slice(0, allowed)}\n[patch truncated by ChangeNarator]`,
      };
    }),
  };
}

export function buildAnalysisPrompt(prContext: PRContext, canInspectRepository: boolean): string {
  const repositoryInstruction = canInspectRepository
    ? 'You may inspect the checked-out repository for read-only context. Do not edit files or run mutating commands.'
    : 'Use only the supplied PR metadata and patches. Do not infer facts that are not present.';

  return `You are a code change analyst. Analyze the supplied GitHub pull request and return only JSON matching the required schema.

${repositoryInstruction}

Requirements:
- Ground every conclusion in commit messages, patches, or repository evidence.
- Identify logical modules rather than merely repeating paths.
- Flag removed exports, renamed interfaces, deleted behavior, and other breaking changes.
- Put filenames whose patch is null in files_skipped.
- Use only these change types: feature, fix, refactor, chore, docs.

PR context:
${JSON.stringify(boundedPRContext(prContext), null, 2)}`;
}

export function buildChangelogPrompt(analysis: ChangeAnalysisResult): string {
  return `You are a technical release-note writer. Return only JSON matching the required schema, with all three audience changelogs.

Rules:
- devs: precise and code-level, including affected modules, compatibility, and technical impact; 2-3 short paragraphs.
- pms: explain what changed, why it matters, and product impact without unnecessary jargon; 2-3 short paragraphs.
- users: plain English focused on what improved or changed for the user; 1-2 short paragraphs.
- Stay factual and do not add headings or labels inside the strings.

Change analysis:
${JSON.stringify(analysis, null, 2)}`;
}
