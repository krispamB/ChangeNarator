#!/usr/bin/env node
/**
 * ChangeNarator CLI Entry Point
 * Handles command routing and execution
 */

import { initCommand } from './init';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

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

function showHelp() {
  console.log(`
🚀 ChangeNarator CLI

USAGE:
  changenarator <command> [options]

COMMANDS:
  init              Interactive setup wizard to configure ChangeNarator
  help, --help, -h  Show this help message
  version, -v       Show version information

EXAMPLES:
  # Set up configuration
  changenarator init

  # Run analysis (after setup)
  bun run start <owner> <repo> <pr_number> <local_repo_path>

For more information, visit: https://github.com/yourusername/changenarator
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
