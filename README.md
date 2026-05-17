# ChangeNarator

[![npm version](https://badge.fury.io/js/changenarrator.svg)](https://www.npmjs.com/package/changenarrator)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)

ChangeNarrator - An AI-powered tool that watches code changes and automatically generates human-readable changelogs from GitHub PRs, published as a newsletter or release note.

## Features

- 🔍 **PR Metadata Fetcher**: Fetch complete PR context from GitHub including:
  - Base and head SHA
  - PR title and number
  - All commit messages
  - Changed files with patches
  - Addition/deletion statistics

## Installation

### Via npm (Recommended)

```bash
npm install -g changenarrator
```

Or using npx (no installation required):

```bash
npx changenarrator init
```

### From Source

If you want to contribute or run from source:

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ChangeNarator
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

## Prerequisites

- Node.js >= 20
- GitHub Personal Access Token with appropriate permissions
- IBM WatsonX API credentials (for AI-powered changelog generation)
- Notion Integration Token (for publishing changelogs)

## Quick Start

After installation, initialize the configuration:

```bash
changenarator init
```

This interactive wizard will guide you through setting up:
- GitHub Personal Access Token
- IBM WatsonX API credentials
- Notion integration
- Local repository directory

## Setup

3. **Configure ChangeNarator**
   
   Run the interactive setup wizard:
   ```bash
   changenarator init
   ```
   
   This will prompt you for:
   - **GitHub Personal Access Token** - For fetching PR data
   - **IBM WatsonX API Key** - For AI-powered changelog generation
   - **WatsonX Project ID** - Your WatsonX project identifier
   - **WatsonX Region URL** - Default: `https://us-south.ml.cloud.ibm.com`
   - **Notion Integration Token** - For publishing changelogs
   - **Notion Parent Page ID** - Where changelogs will be published
   - **Local repos directory** - Where repositories will be cloned (default: `~/repos`)

   Configuration is saved to `config.json` (automatically added to `.gitignore`).

   **Creating Required Tokens:**
   
   - **GitHub Token**: [GitHub Settings > Tokens](https://github.com/settings/tokens)
     - Select scopes: `repo` (private repos) or `public_repo` (public only)
   
   - **WatsonX Credentials**: [IBM Cloud](https://cloud.ibm.com/)
     - Create a WatsonX.ai instance
     - Get your API key and project ID
   
   - **Notion Token**: [Notion Integrations](https://www.notion.so/my-integrations)
     - Create a new integration
     - Share a page with your integration to get the page ID

   **Alternative: Manual Configuration**
   
   You can also manually create `config.json` based on `config.example.json`:
   ```bash
   cp config.example.json config.json
   # Edit config.json with your credentials
   ```

   **Legacy: Environment Variables**
   
   For backward compatibility, you can still use `.env` file:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

## Usage

### CLI Commands

**Initialize Configuration:**
```bash
changenarator init
```

**Run Analysis:**
```bash
changenarator <owner> <repo> <pr_number> <local_repo_path>
```

**Example:**
```bash
changenarator facebook react 12345 ~/repos/react
```

This will:
1. Fetch PR metadata from GitHub
2. Checkout the PR's head SHA locally
3. Run Bob analysis on the code changes
4. Generate changelogs for 3 audiences (developers, PMs, users)
5. Publish results to Notion

**Get Help:**
```bash
changenarator --help
```

**Check Version:**
```bash
changenarator --version
```

### Programmatic Usage

Import and use the `fetchPRContext` function in your code:

```typescript
import { fetchPRContext } from './src/index';

const prContext = await fetchPRContext('facebook', 'react', 12345);

console.log(prContext);
// {
//   repo: "facebook/react",
//   pr_number: 12345,
//   pr_title: "Add new feature",
//   base_sha: "abc123...",
//   head_sha: "def456...",
//   commit_messages: ["commit 1", "commit 2"],
//   files_changed: [...],
//   stats: { total_files: 3, total_commits: 2 }
// }
```

## Data Structure

### PRContext Interface

```typescript
interface PRContext {
  repo: string;                    // "owner/repo"
  pr_number: number;               // PR number
  pr_title: string;                // PR title
  base_sha: string;                // Base commit SHA
  head_sha: string;                // Head commit SHA
  commit_messages: string[];       // All commit messages
  files_changed: FileChange[];     // Array of changed files
  stats: {
    total_files: number;           // Total files changed
    total_commits: number;         // Total commits in PR
  };
}
```

### FileChange Interface

```typescript
interface FileChange {
  filename: string;                           // File path
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;                          // Lines added
  deletions: number;                          // Lines deleted
  patch: string | null;                       // Git diff patch
}
```

## Development

### Available Scripts

- `bun run dev` - Run in watch mode (auto-reload on changes)
- `bun run start` - Run the application
## Testing

The project includes a comprehensive test suite using Bun's built-in test runner.

### Running Tests

```bash
# Run all tests
bun test

# Run tests in watch mode (auto-rerun on file changes)
bun test:watch

# Run tests with coverage report
bun test:coverage
```

### Test Structure

```
src/
├── github-client.test.ts    # Unit tests for GitHub API client
├── pr-fetcher.test.ts       # Unit tests for PR fetching logic
└── index.test.ts            # Integration tests for main function
```

### Test Coverage

The test suite includes:

- ✅ **GitHubClient Tests** (11 tests)
  - Constructor validation
  - PR metadata fetching
  - Commit message retrieval
  - Compare diff fetching
  - Error handling for API failures

- ✅ **PRFetcher Tests** (10 tests)
  - Data shaping and transformation
  - Input validation
  - File status mapping
  - Error propagation
  - Edge cases (empty PRs, etc.)

- ✅ **Integration Tests** (5 tests)
  - Environment variable handling
  - CLI argument parsing
  - End-to-end flow validation

### Test Results

```
26 pass
0 fail
47 expect() calls
```

### Writing New Tests

To add new tests, create a file with `.test.ts` extension:

```typescript
import { describe, test, expect } from 'bun:test';

describe('My Feature', () => {
  test('should work correctly', () => {
    expect(true).toBe(true);
  });
});
```

Bun will automatically discover and run all `*.test.ts` files.

- `bun run build` - Build for production
- `bun run typecheck` - Check TypeScript types

### Project Structure

```
src/
├── index.ts           # CLI entry point and main export
├── types.ts           # TypeScript type definitions
├── github-client.ts   # GitHub API wrapper using Octokit
├── pr-fetcher.ts      # Main PR fetching and data shaping logic
```

## Error Handling

The script handles various error scenarios:

- ❌ Missing GitHub token
- ❌ Invalid repository or PR number
- ❌ PR not found (404)
- ❌ API rate limits
- ❌ Network errors
- ❌ Invalid input parameters

## Examples

### Fetch a PR from a public repository

```bash
bun run start vercel next.js 50000
```

### Fetch a PR from a private repository

Ensure your `GITHUB_TOKEN` has `repo` scope:

```bash
bun run start your-org your-private-repo 123
```

### Use in your own script

```typescript
import { fetchPRContext } from './src/index';
import type { PRContext } from './src/types';

async function analyzePR() {
  try {
    const context: PRContext = await fetchPRContext('owner', 'repo', 123);
    
    // Process the PR context
    console.log(`Analyzing ${context.stats.total_files} files...`);
    
    for (const file of context.files_changed) {
      console.log(`${file.status}: ${file.filename}`);
      console.log(`  +${file.additions} -${file.deletions}`);
    }
  } catch (error) {
    console.error('Failed to fetch PR:', error);
  }
}

analyzePR();
```

## License

See [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

Made with ❤️ by Bob
