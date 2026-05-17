/**
 * Local pipeline orchestrator for PR analysis
 * Coordinates fetching PR context, checking out code, and running Bob analysis
 */

import { PRFetcher } from './pr-fetcher';
import { checkoutHeadSHA, getCurrentBranch, checkoutBranch } from './git-operations';
import { runBobAnalysis } from './bob-analyzer';
import { generateChangelog } from './watsonx';
import { publishToNotion } from './notion';
import { loadConfig } from './cli/config';
import type { PRContext, BobAnalysisResult, ChangelogAudiences, NotionPublishResult } from './types';

/**
 * Result from running the complete local pipeline
 */
export interface PipelineResult {
    prContext: PRContext;
    bobAnalysis: BobAnalysisResult;
    changelog: ChangelogAudiences;
    notionPage: NotionPublishResult;
}

/**
 * Runs the complete local pipeline for PR analysis
 *
 * Pipeline steps:
 * 1. Fetch PR context from GitHub API
 * 2. Checkout the head SHA in the local repository
 * 3. Run Bob analysis against the local repository
 * 4. Generate changelog for multiple audiences using WatsonX
 * 5. Publish results to Notion
 *
 * @param owner - Repository owner (user or organization)
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @param localRepoPath - Path to the local git repository
 * @returns Pipeline result containing PR context, Bob analysis, changelog, and Notion page info
 * @throws Error if any step fails
 */
export async function runLocalPipeline(
    owner: string,
    repo: string,
    prNumber: number,
    localRepoPath: string
): Promise<PipelineResult> {
    // Capture the original branch before any operations
    let originalBranch: string | null = null;
    
    try {
        // Load configuration
        console.log('📋 Loading configuration...');
        const config = await loadConfig();
        console.log('✅ Configuration loaded successfully');

        // Capture current branch before checkout
        console.log('\n💾 Capturing current branch...');
        originalBranch = await getCurrentBranch(localRepoPath);
        if (originalBranch) {
            console.log(`✅ Current branch: ${originalBranch}`);
        } else {
            console.log('⚠️  Repository is in detached HEAD state');
        }

        // Step 1: Fetch PR context from GitHub API
        console.log('\n🔍 Step 1: Fetching PR context from GitHub...');
        const fetcher = new PRFetcher(config.github.token);
        const prContext = await fetcher.fetchPRContext(owner, repo, prNumber);
        console.log('✅ PR context fetched successfully');

        // Step 2: Checkout the head SHA in the local repository
        console.log('\n🔄 Step 2: Checking out head SHA in local repository...');
        await checkoutHeadSHA(localRepoPath, prContext.head_sha);

        // Step 3: Run Bob analysis against the local repository
        console.log('\n🤖 Step 3: Running Bob analysis...');
        const bobAnalysis = await runBobAnalysis(prContext, localRepoPath);
        console.log('✅ Bob analysis completed successfully');

        // Step 4: Generate changelog using WatsonX
        console.log('\n📝 Step 4: Generating changelog with WatsonX...');
        const changelog = await generateChangelog(bobAnalysis, config);
        console.log('✅ Changelog generated successfully');

        // Step 5: Publish to Notion
        console.log('\n📄 Step 5: Publishing to Notion...');
        const pageId = await publishToNotion(bobAnalysis, changelog, config);
        const notionUrl = `https://notion.so/${pageId.replace(/-/g, '')}`;
        console.log('✅ Notion page published successfully');

        // Restore original branch
        if (originalBranch) {
            console.log(`\n🔙 Restoring original branch: ${originalBranch}...`);
            await checkoutBranch(localRepoPath, originalBranch);
        }

        return {
            prContext,
            bobAnalysis,
            changelog,
            notionPage: {
                pageId,
                url: notionUrl,
            },
        };
    } catch (error: any) {
        console.error('\n❌ Pipeline failed:', error.message);
        
        // Attempt to restore original branch even on failure
        if (originalBranch) {
            try {
                console.log(`\n🔙 Attempting to restore original branch: ${originalBranch}...`);
                await checkoutBranch(localRepoPath, originalBranch);
            } catch (restoreError: any) {
                console.error(`⚠️  Failed to restore original branch: ${restoreError.message}`);
            }
        }
        
        throw error;
    }
}

// Made with Bob