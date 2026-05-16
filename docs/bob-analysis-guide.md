# Bob Analysis Integration Guide

## Overview

The `runBobAnalysis` function integrates Bob CLI to analyze GitHub PR changes and return structured insights. This guide provides recommendations for ensuring the PR context data is properly formatted for Bob analysis.

## Architecture

```
fetchPRContext() → PRContext JSON → runBobAnalysis() → Bob CLI → BobAnalysisResult
```

## How It Works

1. **Fetch PR Context**: `fetchPRContext()` retrieves PR metadata, commits, and file changes from GitHub
2. **Prepare Prompt**: The Bob prompt template is read and `{{PR_CONTEXT}}` is replaced with the JSON-stringified PR context
3. **Execute Bob**: The resolved prompt is piped to `bob -p -` via stdin
4. **Parse Response**: Bob's JSON output is parsed and validated against the `BobAnalysisResult` schema
5. **Return Result**: The typed analysis result is returned

## Ensuring Valid JSON from fetchPRContext

### Current Implementation ✅

The existing `fetchPRContext()` implementation already handles most edge cases well:

```typescript
// From src/pr-fetcher.ts
const filesChanged: FileChange[] = files.map(file => ({
  filename: file.filename,
  status: this.mapFileStatus(file.status),
  additions: file.additions,
  deletions: file.deletions,
  patch: file.patch || null,  // ✅ Handles null patches correctly
}));
```

### Recommendations for Robustness

#### 1. **Handle Large Patches**

Very large diffs can cause issues with Bob's input limits or processing time.

**Recommendation**: Add optional patch truncation:

```typescript
// In src/pr-fetcher.ts
const MAX_PATCH_SIZE = 10000; // characters

const filesChanged: FileChange[] = files.map(file => {
  let patch = file.patch || null;
  
  // Truncate large patches
  if (patch && patch.length > MAX_PATCH_SIZE) {
    patch = patch.substring(0, MAX_PATCH_SIZE) + '\n... [truncated]';
  }
  
  return {
    filename: file.filename,
    status: this.mapFileStatus(file.status),
    additions: file.additions,
    deletions: file.deletions,
    patch,
  };
});
```

#### 2. **Sanitize Commit Messages**

Commit messages may contain special characters that could cause JSON parsing issues.

**Current State**: `JSON.stringify()` handles this automatically ✅

**Additional Safety**: Add validation if needed:

```typescript
// Optional: Validate commit messages
const sanitizedMessages = commitMessages.map(msg => 
  msg.replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
);
```

#### 3. **Handle Binary Files**

Binary files have `patch: null` which is already handled correctly.

**Enhancement**: Track skipped files explicitly:

```typescript
// In src/types.ts - add to PRContext
export interface PRContext {
  // ... existing fields
  files_with_no_patch: string[]; // Track files without patches
}

// In src/pr-fetcher.ts
const filesWithNoPatch = filesChanged
  .filter(f => f.patch === null)
  .map(f => f.filename);

const prContext: PRContext = {
  // ... existing fields
  files_with_no_patch: filesWithNoPatch,
};
```

#### 4. **Validate PRContext Before Analysis**

Add a validation function to catch issues early:

```typescript
// In src/bob-analyzer.ts or new src/validators.ts
export function validatePRContext(prContext: PRContext): void {
  const errors: string[] = [];
  
  if (!prContext.repo || typeof prContext.repo !== 'string') {
    errors.push('repo must be a non-empty string');
  }
  
  if (!prContext.pr_number || typeof prContext.pr_number !== 'number') {
    errors.push('pr_number must be a valid number');
  }
  
  if (!Array.isArray(prContext.commit_messages)) {
    errors.push('commit_messages must be an array');
  }
  
  if (!Array.isArray(prContext.files_changed)) {
    errors.push('files_changed must be an array');
  }
  
  // Check for excessively large context
  const totalPatchSize = prContext.files_changed
    .reduce((sum, f) => sum + (f.patch?.length || 0), 0);
    
  if (totalPatchSize > 100000) {
    errors.push(`Total patch size (${totalPatchSize}) exceeds recommended limit`);
  }
  
  if (errors.length > 0) {
    throw new Error(`Invalid PRContext:\n${errors.join('\n')}`);
  }
}

// Use in runBobAnalysis
export async function runBobAnalysis(prContext: PRContext): Promise<BobAnalysisResult> {
  validatePRContext(prContext); // Add this line
  // ... rest of implementation
}
```

#### 5. **Handle Special Characters in Filenames**

GitHub allows various characters in filenames that are valid in JSON.

**Current State**: `JSON.stringify()` handles this correctly ✅

**No action needed** - JavaScript's built-in JSON serialization properly escapes special characters.

#### 6. **Size Limits and Pagination**

For PRs with many files, consider summarizing or paginating.

**Recommendation**: Add configuration options:

```typescript
export interface BobAnalysisOptions {
  maxFiles?: number;           // Limit number of files to analyze
  maxPatchSize?: number;        // Max size per patch
  includePatchesForBinary?: boolean; // Whether to include null patches
}

export async function runBobAnalysis(
  prContext: PRContext,
  options?: BobAnalysisOptions
): Promise<BobAnalysisResult> {
  // Apply options to filter/limit data
  // ...
}
```

## Testing Recommendations

### Unit Tests

Test edge cases in your PR fetcher:

```typescript
test('handles files with null patches', async () => {
  // Test binary files, large files, etc.
});

test('handles commit messages with special characters', async () => {
  // Test unicode, newlines, quotes, etc.
});

test('handles very large PRs', async () => {
  // Test with 100+ files
});
```

### Integration Tests

Test the full flow with real PR data:

```typescript
test('analyzes real PR successfully', async () => {
  const prContext = await fetchPRContext('owner', 'repo', 123);
  const analysis = await runBobAnalysis(prContext);
  expect(analysis).toBeDefined();
  expect(analysis.repo).toBe('owner/repo');
});
```

## Error Handling

The `runBobAnalysis` function includes comprehensive error handling:

- **File read errors**: Clear message about missing prompt template
- **Bob execution errors**: Captures exit code and stderr
- **JSON parsing errors**: Shows Bob's output for debugging
- **Schema validation errors**: Lists all validation failures

## Usage Example

```typescript
import { fetchPRContext } from './pr-fetcher';
import { runBobAnalysis } from './bob-analyzer';

async function analyzePR(owner: string, repo: string, prNumber: number) {
  try {
    // Fetch PR context from GitHub
    const prContext = await fetchPRContext(owner, repo, prNumber);
    
    // Run Bob analysis
    const analysis = await runBobAnalysis(prContext);
    
    console.log('Analysis Results:');
    console.log(`- Change Types: ${analysis.change_types.join(', ')}`);
    console.log(`- Affected Modules: ${analysis.affected_modules.join(', ')}`);
    console.log(`- Breaking Changes: ${analysis.breaking_changes}`);
    console.log(`- Summary: ${analysis.technical_summary}`);
    
    return analysis;
  } catch (error) {
    console.error('Analysis failed:', error.message);
    throw error;
  }
}
```

## Best Practices

1. **Always validate input**: Use the validation functions before passing data to Bob
2. **Handle large PRs**: Consider truncating or summarizing very large diffs
3. **Log for debugging**: Add logging to track what's being sent to Bob
4. **Test edge cases**: Test with various PR types (large, binary files, special characters)
5. **Monitor performance**: Track Bob execution time for optimization opportunities

## Troubleshooting

### Bob returns invalid JSON

- Check Bob's stderr output for error messages
- Verify the prompt template is correctly formatted
- Ensure `{{PR_CONTEXT}}` placeholder exists in the template

### Analysis fails for large PRs

- Implement patch size limits
- Consider analyzing files in batches
- Summarize very large diffs

### Schema validation fails

- Check Bob's output format matches the expected schema
- Update the prompt template if needed
- Verify all required fields are present in Bob's response

## Future Enhancements

1. **Caching**: Cache analysis results to avoid re-analyzing the same PR
2. **Incremental analysis**: Analyze only changed files since last run
3. **Parallel processing**: Analyze multiple PRs concurrently
4. **Custom prompts**: Allow custom prompt templates for different analysis types
5. **Streaming**: Stream large PR contexts to Bob instead of loading all at once

---

**Made with Bob** 🤖