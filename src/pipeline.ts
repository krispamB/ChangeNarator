/**
 * Local pipeline orchestrator for PR analysis
 * Coordinates fetching PR context, checking out code, and running AI analysis
 */

import { PRFetcher } from './pr-fetcher';
import { checkoutHeadSHA, getCurrentBranch, checkoutBranch } from './git-operations';
import { runBobAnalysis } from './bob-analyzer';
import { generateChangelog } from './watsonx';
import { publishToNotion } from './notion';
import { loadConfig } from './cli/config';
import { createProvider, getConfiguredModel } from './providers/registry';
import type {
    AIExecutionMetadata,
    ChangeAnalysisResult,
    ChangelogAudiences,
    NotionPublishResult,
    PRContext,
    ProviderId,
} from './types';

export interface PipelineOptions {
    provider?: ProviderId;
    model?: string;
}

/**
 * Result from running the complete local pipeline
 */
export interface PipelineResult {
    prContext: PRContext;
    analysis: ChangeAnalysisResult;
    /**
     * @deprecated Use analysis. This alias will be removed in the next major release.
     */
    bobAnalysis: ChangeAnalysisResult;
    changelog: ChangelogAudiences;
    notionPage: NotionPublishResult;
    ai: AIExecutionMetadata;
}

/**
 * Runs the complete local pipeline for PR analysis
 *
 * Pipeline steps:
 * 1. Fetch PR context from GitHub API
 * 2. Checkout the head SHA in the local repository
 * 3. Run structured analysis with the selected AI provider
 * 4. Generate audience changelogs with the selected AI provider
 * 5. Publish results to Notion
 *
 * @param owner - Repository owner (user or organization)
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @param localRepoPath - Path to the local git repository
 * @returns Pipeline result containing PR context, change analysis, changelog, provider metadata, and Notion page info
 * @throws Error if any step fails
 */
export async function runLocalPipeline(
    owner: string,
    repo: string,
    prNumber: number,
    localRepoPath: string,
    options: PipelineOptions = {},
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

        let analysis: ChangeAnalysisResult;
        let changelog: ChangelogAudiences;
        let ai: AIExecutionMetadata;

        const useLegacyPipeline = !options.provider && !config.ai;
        if (useLegacyPipeline) {
            console.log('\n🤖 Step 3: Running legacy Bob analysis...');
            analysis = await runBobAnalysis(prContext, localRepoPath);
            console.log('✅ Bob analysis completed successfully');

            console.log('\n📝 Step 4: Generating changelog with legacy WatsonX...');
            changelog = await generateChangelog(analysis, config);
            console.log('✅ WatsonX changelog generated successfully');

            ai = {
                mode: 'legacy',
                analysis: {
                    provider: 'bob',
                    model: null,
                    contextMode: 'repository',
                },
                changelog: {
                    provider: 'watsonx',
                    model: 'ibm/granite-4-h-small',
                    contextMode: 'pr-patches',
                },
            };
        } else {
            const providerId = options.provider ?? config.ai?.defaultProvider;
            if (!providerId) {
                throw new Error('No AI provider selected. Run "changenarator init" or use --provider.');
            }

            const provider = createProvider(providerId, config);
            const model = options.model ?? getConfiguredModel(config, providerId);
            const executionOptions = model ? { model } : undefined;

            console.log(`\n🤖 Step 3: Analyzing changes with ${providerId}...`);
            const analysisResult = await provider.analyze(
                { prContext, localRepoPath },
                executionOptions,
            );
            analysis = analysisResult.value;
            console.log(`✅ ${providerId} analysis completed successfully`);

            console.log(`\n📝 Step 4: Generating changelogs with ${providerId}...`);
            const changelogResult = await provider.generateChangelogs(
                analysis,
                executionOptions,
            );
            changelog = changelogResult.value;
            console.log(`✅ ${providerId} changelogs generated successfully`);

            ai = {
                mode: 'unified',
                analysis: {
                    provider: providerId,
                    model: analysisResult.model,
                    contextMode: provider.contextMode,
                },
                changelog: {
                    provider: providerId,
                    model: changelogResult.model,
                    contextMode: provider.contextMode,
                },
            };
        }

        // Step 5: Publish to Notion
        console.log('\n📄 Step 5: Publishing to Notion...');
        const pageId = await publishToNotion(analysis, changelog, config);
        const notionUrl = `https://notion.so/${pageId.replace(/-/g, '')}`;
        console.log('✅ Notion page published successfully');

        // Restore original branch
        if (originalBranch) {
            console.log(`\n🔙 Restoring original branch: ${originalBranch}...`);
            await checkoutBranch(localRepoPath, originalBranch);
        }

        return {
            prContext,
            analysis,
            bobAnalysis: analysis,
            changelog,
            notionPage: {
                pageId,
                url: notionUrl,
            },
            ai,
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
