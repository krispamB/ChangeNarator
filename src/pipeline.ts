/**
 * Local pipeline orchestrator for PR analysis
 * Coordinates fetching PR context, checking out code, and running Bob analysis
 */

import { PRFetcher } from './pr-fetcher';
import { checkoutHeadSHA } from './git-operations';
import { runBobAnalysis } from './bob-analyzer';
import { generateChangelog } from './watsonx';
import { publishToNotion } from './notion';
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
    try {
        // Step 1: Fetch PR context from GitHub API
        console.log('\n🔍 Step 1: Fetching PR context from GitHub...');
        const githubToken = process.env.GITHUB_TOKEN;
        
        if (!githubToken) {
            throw new Error(
                'GITHUB_TOKEN environment variable is required. Please set it in your .env file.'
            );
        }

        const fetcher = new PRFetcher(githubToken);
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
        
        // Validate WatsonX environment variables
        const requiredEnvVars = ['WATSONX_URL', 'WATSONX_API_KEY', 'WATSONX_PROJECT_ID'];
        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        
        if (missingVars.length > 0) {
            throw new Error(
                `Missing required WatsonX environment variables: ${missingVars.join(', ')}. ` +
                'Please set them in your .env file.'
            );
        }

        const changelog = await generateChangelog(bobAnalysis);
        console.log('✅ Changelog generated successfully');

        // Step 5: Publish to Notion
        console.log('\n📄 Step 5: Publishing to Notion...');
        
        // Validate Notion environment variables
        const notionEnvVars = ['NOTION_TOKEN', 'NOTION_PARENT_PAGE_ID'];
        const missingNotionVars = notionEnvVars.filter(varName => !process.env[varName]);
        
        if (missingNotionVars.length > 0) {
            throw new Error(
                `Missing required Notion environment variables: ${missingNotionVars.join(', ')}. ` +
                'Please set them in your .env file.'
            );
        }

        const pageId = await publishToNotion(bobAnalysis, changelog);
        const notionUrl = `https://notion.so/${pageId.replace(/-/g, '')}`;
        console.log('✅ Notion page published successfully');

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
        throw error;
    }
}

// Made with Bob