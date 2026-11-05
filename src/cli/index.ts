#!/usr/bin/env node
/**
 * ChangeNarator CLI Entry Point
 * Handles command routing and execution
 */

import 'dotenv/config';
import { initCommand } from './init';
import { runLocalPipeline } from '../pipeline';
import { parseAnalyzeArguments, type AnalyzeArguments } from './args';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const reservedCommands = ['init', 'help', '--help', '-h', 'version', '--version', '-v'];
  if (command === 'analyze' || (command && !reservedCommands.includes(command))) {
    try {
      await analyzeCommand(parseAnalyzeArguments(args));
    } catch (error) {
      console.error(`❌ ${error instanceof Error ? error.message : 'Invalid arguments'}\n`);
      showHelp();
      process.exit(1);
    }
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
async function analyzeCommand({
  owner,
  repo,
  prNumber,
  localRepoPath,
  options,
}: AnalyzeArguments) {

  try {
    console.log('🚀 ChangeNarator - Local PR Analysis Pipeline\n');
    console.log(`📁 Local Repository: ${localRepoPath}`);
    console.log(`🔗 Analyzing: ${owner}/${repo} PR #${prNumber}\n`);

    // Run the complete pipeline
    const { prContext, analysis, changelog, notionPage, ai } = await runLocalPipeline(
      owner,
      repo,
      prNumber,
      localRepoPath,
      options,
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

    // Display provider-neutral analysis
    console.log('\n' + '='.repeat(80));
    console.log(`🤖 CHANGE ANALYSIS (${ai.analysis.provider})`);
    console.log('='.repeat(80));
    console.log(JSON.stringify(analysis, null, 2));
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
  changenarator [analyze] [--provider <provider>] [--model <model>] <owner> <repo> <pr_number> <local_repo_path>
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

  # Override the configured provider and model
  changenarator analyze --provider anthropic --model claude-sonnet-5 facebook react 12345 ~/repos/react

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
