#!/usr/bin/env node
/**
 * ChangeNarator CLI Entry Point
 * Handles command routing and execution
 */

import { initCommand } from './init';
import { runLocalPipeline } from '../pipeline';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Check if this is an analyze command (4 args without a command keyword)
  // or explicit 'analyze' command with 4 additional args
  const isAnalyzeCommand =
    (args.length === 4 && command && !['init', 'help', '--help', '-h', 'version', '--version', '-v'].includes(command)) ||
    (command === 'analyze' && args.length === 5);

  if (isAnalyzeCommand) {
    await analyzeCommand(args);
    return;
  }

  switch (command) {
    case 'init':
      await initCommand();
      break;

    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;

    case 'version':
    case '--version':
    case '-v':
      showVersion();
      break;

    default:
      if (!command) {
        console.error('❌ No command specified\n');
      } else {
        console.error(`❌ Unknown command: ${command}\n`);
      }
      showHelp();
      process.exit(1);
  }
}

/**
 * Handle the analyze command
 * Accepts either: <owner> <repo> <pr_number> <local_repo_path>
 * Or: analyze <owner> <repo> <pr_number> <local_repo_path>
 */
async function analyzeCommand(args: string[]) {
  // Handle both formats: with or without 'analyze' keyword
  const startIndex = args[0] === 'analyze' ? 1 : 0;
  const owner = args[startIndex];
  const repo = args[startIndex + 1];
  const prNumberStr = args[startIndex + 2];
  const localRepoPath = args[startIndex + 3];

  if (!owner || !repo || !prNumberStr || !localRepoPath) {
    console.error('❌ Error: All arguments are required');
    console.error('   Usage: changenarator <owner> <repo> <pr_number> <local_repo_path>');
    console.error('   Example: changenarator facebook react 12345 ~/repos/react');
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
    const { prContext, bobAnalysis, changelog, notionPage } = await runLocalPipeline(
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

    // Display Notion page info
    console.log('\n📄 NOTION PAGE');
    console.log('-'.repeat(80));
    console.log(`Page ID: ${notionPage.pageId}`);
    console.log(`URL: ${notionPage.url}`);

    console.log('\n✅ Pipeline completed successfully!');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Pipeline Error:', error.message);
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
🚀 ChangeNarator CLI

USAGE:
  changenarator <owner> <repo> <pr_number> <local_repo_path>
  changenarator <command> [options]

COMMANDS:
  analyze           Analyze a GitHub PR and generate changelog (default command)
  init              Interactive setup wizard to configure ChangeNarator
  help, --help, -h  Show this help message
  version, -v       Show version information

EXAMPLES:
  # Set up configuration (first time)
  changenarator init

  # Analyze a PR (default command - no 'analyze' keyword needed)
  changenarator facebook react 12345 ~/repos/react

  # Analyze a PR (explicit command)
  changenarator analyze facebook react 12345 ~/repos/react

  # Get help
  changenarator help

For more information, visit: https://github.com/krispamB/ChangeNarator
  `);
}

function showVersion() {
  // Read version from package.json
  try {
    const packageJson = require('../../package.json');
    console.log(`ChangeNarator v${packageJson.version}`);
  } catch {
    console.log('ChangeNarator (version unknown)');
  }
}

// Run the CLI
main().catch((error) => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});

// Made with Bob
