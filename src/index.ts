/**
 * ChangeNarator - Local PR Analysis Pipeline
 * Fetches PR metadata, checks out code locally, and runs Bob analysis
 */

import 'dotenv/config';
import { PRFetcher } from './pr-fetcher';
import { runLocalPipeline } from './pipeline';
import type { PRContext } from './types';

// Export pipeline for programmatic use
export { runLocalPipeline } from './pipeline';
export type { PipelineResult } from './pipeline';

/**
 * Main function to fetch PR context
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @returns PRContext object with all PR metadata
 */
export async function fetchPRContext(
  owner: string,
  repo: string,
  prNumber: number
): Promise<PRContext> {
  const githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    throw new Error(
      'GITHUB_TOKEN environment variable is required. Please set it in your .env file.'
    );
  }

  const fetcher = new PRFetcher(githubToken);
  return await fetcher.fetchPRContext(owner, repo, prNumber);
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 4) {
    console.error('❌ Usage: bun run start <owner> <repo> <pr_number> <local_repo_path>');
    console.error('   Example: bun run start facebook react 12345 /path/to/local/react');
    process.exit(1);
  }

  const owner = args[0];
  const repo = args[1];
  const prNumberStr = args[2];
  const localRepoPath = args[3];

  if (!owner || !repo || !prNumberStr || !localRepoPath) {
    console.error('❌ Error: All arguments (owner, repo, pr_number, local_repo_path) are required');
    process.exit(1);
  }

  const prNumber = parseInt(prNumberStr, 10);

  if (isNaN(prNumber)) {
    console.error('❌ Error: PR number must be a valid number');
    process.exit(1);
  }

  try {
    console.log('🚀 ChangeNarator - Local PR Analysis Pipeline\n');
    console.log(`📁 Local Repository: ${localRepoPath}`);
    console.log(`🔗 Analyzing: ${owner}/${repo} PR #${prNumber}\n`);

    // Run the complete pipeline
    const { prContext, bobAnalysis, changelog } = await runLocalPipeline(
      owner,
      repo,
      prNumber,
      localRepoPath
    );

    // Display PR Context
    console.log('\n' + '='.repeat(80));
    console.log('📊 PR CONTEXT');
    console.log('='.repeat(80));
    console.log(`Repository: ${prContext.repo}`);
    console.log(`PR #${prContext.pr_number}: ${prContext.pr_title}`);
    console.log(`Base SHA: ${prContext.base_sha.substring(0, 7)}`);
    console.log(`Head SHA: ${prContext.head_sha.substring(0, 7)}`);
    console.log(`Files Changed: ${prContext.stats.total_files}`);
    console.log(`Total Commits: ${prContext.stats.total_commits}`);

    // Display Bob Analysis
    console.log('\n' + '='.repeat(80));
    console.log('🤖 BOB ANALYSIS');
    console.log('='.repeat(80));
    console.log(JSON.stringify(bobAnalysis, null, 2));
    console.log('='.repeat(80));

    // Display Generated Changelog
    console.log('\n' + '='.repeat(80));
    console.log('📝 GENERATED CHANGELOG');
    console.log('='.repeat(80));
    
    console.log('\n👨‍💻 FOR DEVELOPERS:');
    console.log('-'.repeat(80));
    console.log(changelog.devs);
    
    console.log('\n\n📊 FOR PRODUCT MANAGERS:');
    console.log('-'.repeat(80));
    console.log(changelog.pms);
    
    console.log('\n\n👥 FOR END USERS:');
    console.log('-'.repeat(80));
    console.log(changelog.users);
    
    console.log('\n' + '='.repeat(80));

    console.log('\n✅ Pipeline completed successfully!');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Pipeline Error:', error.message);
    process.exit(1);
  }
}

// Run CLI if this file is executed directly
if (import.meta.main) {
  main();
}

// Made with Bob
