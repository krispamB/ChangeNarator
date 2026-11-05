# ChangeNarator

[![npm version](https://badge.fury.io/js/changenarrator.svg)](https://www.npmjs.com/package/changenarrator)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)

ChangeNarator fetches a GitHub pull request, analyzes its changes with your chosen AI provider, writes changelogs for developers, product managers, and users, and publishes the result to Notion.

## Supported AI providers

| Provider ID | Access | Tested default | Authentication |
| --- | --- | --- | --- |
| `bob` | Bob CLI | CLI default | Existing Bob login |
| `claude-code` | Claude Code CLI | `claude-sonnet-5` | Existing Claude Code login |
| `codex` | OpenAI Codex CLI | `gpt-5.6-sol` | Existing Codex login |
| `watsonx` | IBM WatsonX API | `ibm/granite-4-h-small` | `WATSONX_API_KEY` |
| `anthropic` | Anthropic API | `claude-sonnet-5` | `ANTHROPIC_API_KEY` |
| `openai` | OpenAI Responses API | `gpt-5.6-sol` | `OPENAI_API_KEY` |
| `openrouter` | OpenRouter API | `openai/gpt-5.4-mini` | `OPENROUTER_API_KEY` |

CLI providers run read-only inside the checked-out repository and can inspect repository context. API providers receive PR metadata, commit messages, and bounded changed-file patches only. ChangeNarator does not upload unrelated repository files.

Local CLI provider support currently targets macOS. The selected provider performs both change analysis and changelog generation in two structured invocations.

## Installation

```bash
npm install -g changenarrator
changenarator init
```

Requirements:

- Node.js 20 or newer
- A GitHub personal access token
- A Notion integration token and parent page
- Either a supported, authenticated local CLI or an API-provider key

## Configuration

Run the setup wizard:

```bash
changenarator init
```

The wizard:

- configures GitHub and Notion;
- lets you enable multiple AI providers;
- selects one default provider;
- optionally saves provider-specific model choices;
- never writes Anthropic, OpenAI, OpenRouter, or new WatsonX API keys to disk.

Provider API keys are read from the environment:

```bash
export ANTHROPIC_API_KEY="..."
export OPENAI_API_KEY="..."
export OPENROUTER_API_KEY="..."
export WATSONX_API_KEY="..."
export WATSONX_PROJECT_ID="..."
export WATSONX_URL="https://us-south.ml.cloud.ibm.com"
```

Example `config.json`:

```json
{
  "github": {
    "token": "ghp_example"
  },
  "notion": {
    "token": "ntn_example",
    "parentPageId": "page-id"
  },
  "localReposDir": "~/repos",
  "ai": {
    "defaultProvider": "claude-code",
    "providers": {
      "claude-code": {},
      "openai": {
        "model": "gpt-5.6-sol"
      },
      "openrouter": {
        "model": "openai/gpt-5.4-mini"
      }
    }
  }
}
```

`config.json` is ignored by Git because it still contains the GitHub and Notion credentials.

## Usage

Analyze a PR with the configured default:

```bash
changenarator facebook react 12345 ~/repos/react
```

The explicit form is equivalent:

```bash
changenarator analyze facebook react 12345 ~/repos/react
```

Override the provider for one run:

```bash
changenarator analyze \
  --provider openrouter \
  facebook react 12345 ~/repos/react
```

Override both provider and model:

```bash
changenarator analyze \
  --provider anthropic \
  --model claude-sonnet-5 \
  facebook react 12345 ~/repos/react
```

Model overrides outside the tested defaults are passed through on a best-effort basis. The model must support the provider's structured JSON requirements.

## Provider behavior

### Bob CLI

Install and authenticate Bob, then select `bob`. ChangeNarator invokes Bob non-interactively in ask mode and validates its JSON result.

### Claude Code CLI

Install and authenticate Claude Code, then select `claude-code`. ChangeNarator uses print mode, safe mode, a read-only tool set, no session persistence, and a JSON schema.

### Codex CLI

Install and authenticate Codex, then select `codex`. ChangeNarator uses `codex exec` with an ephemeral session, read-only sandbox, output schema, and a temporary final-message file.

### Anthropic, OpenAI, and OpenRouter

Export the corresponding API-key environment variable. Requests use each provider's structured-output interface and are validated again locally before entering the pipeline.

OpenRouter requests require models that accept the JSON-schema parameters and disable automatic upstream fallback for predictable execution.

### WatsonX

Export `WATSONX_API_KEY`. Set the project ID and region URL in `ai.providers.watsonx` or through `WATSONX_PROJECT_ID` and `WATSONX_URL`.

## Existing configuration migration

An existing configuration without an `ai` section keeps its original behavior:

1. Bob performs change analysis.
2. WatsonX generates the three audience changelogs.

This is the **legacy pipeline**. Existing `watsonx.apiKey` values remain readable for compatibility, but ChangeNarator warns that `WATSONX_API_KEY` should be used instead.

Run `changenarator init` when you are ready to choose a unified default provider.

## Failure and privacy guarantees

- ChangeNarator never automatically sends data to a different AI provider after a failure.
- Missing executables, credentials, invalid output, and HTTP failures stop the run with a provider-specific error.
- API patches are deterministically bounded to 40,000 characters per file and 200,000 characters per PR prompt.
- AI commands and HTTP requests time out after two minutes.
- Provider responses are validated against the provider-neutral analysis or changelog shape.
- The original Git branch is restored after successful and failed pipeline runs.

## Programmatic usage

```ts
import { runLocalPipeline } from 'changenarrator';

const result = await runLocalPipeline(
  'facebook',
  'react',
  12345,
  '/repos/react',
  {
    provider: 'openai',
    model: 'gpt-5.6-sol',
  },
);

console.log(result.analysis);
console.log(result.changelog);
console.log(result.ai);
```

`PipelineResult.analysis` is the provider-neutral result. `PipelineResult.bobAnalysis` and the `BobAnalysisResult` type remain as deprecated aliases for v1 compatibility.

## Development

```bash
bun install
bun run typecheck
bun test
bun run build:cli
```

The provider conformance tests mock external commands and HTTP interfaces. They do not require live credentials.

## License

Apache-2.0
