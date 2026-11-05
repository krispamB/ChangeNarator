# Anthropic API and Claude Code provider contracts

Research date: 2026-07-29

Scope: the direct Anthropic Messages API and the local Claude Code CLI as two
separate ChangeNarator providers. All factual claims below cite first-party
Anthropic documentation. Recommendations are explicitly marked.

## Decision summary

- Use `claude-sonnet-5` as ChangeNarator's tested default for both providers.
  Anthropic describes Sonnet 5 as the best combination of speed and
  intelligence; its canonical, dateless ID is a pinned snapshot rather than an
  evergreen alias. It has a 1M-token context window and a 128K synchronous
  output limit. [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview)
  [Model IDs and versioning](https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions)
- For the API provider, call `POST https://api.anthropic.com/v1/messages` and
  use GA structured outputs through `output_config.format`. Read and parse the
  JSON string from the response's text content block.
  [Get started](https://platform.claude.com/docs/en/get-started)
  [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- For the CLI provider, use non-interactive print mode with
  `--output-format json --json-schema ...`. Parse the top-level
  `structured_output` field, not `result`.
  [Headless mode](https://code.claude.com/docs/en/headless)
- Run the CLI subprocess with the checked-out repository as its process `cwd`.
  Use `--safe-mode`, not `--bare`: safe mode suppresses user/project
  customizations while retaining normal authentication, including macOS
  Keychain login. Bare mode skips OAuth and Keychain reads.
  [CLI reference](https://code.claude.com/docs/en/cli-usage)
  [Headless mode](https://code.claude.com/docs/en/headless)
- Restrict the CLI to read-only repository tools and disable MCP/custom
  integrations. Recommended flags are `--tools "Read,Glob,Grep"`,
  `--strict-mcp-config`, `--disable-slash-commands`, and
  `--no-session-persistence`. The CLI reference says `--tools` restricts
  built-ins, `--strict-mcp-config` ignores configured MCP servers, and
  `--no-session-persistence` prevents saving the run for resumption.
  [CLI reference](https://code.claude.com/docs/en/cli-usage)

## Direct Anthropic Messages API

### Authentication and transport

The direct request contract is:

```http
POST https://api.anthropic.com/v1/messages
content-type: application/json
x-api-key: ${ANTHROPIC_API_KEY}
anthropic-version: 2023-06-01
```

Anthropic's quickstart uses `ANTHROPIC_API_KEY` and those three headers. The
version header is mandatory for raw HTTP clients; official SDKs set it
automatically. `2023-06-01` is the latest version currently listed.
[Get started](https://platform.claude.com/docs/en/get-started)
[API versioning](https://platform.claude.com/docs/en/api/versioning)

Recommendation: ChangeNarator should read `ANTHROPIC_API_KEY` from the process
environment at invocation time, never persist it in project configuration, and
fail before making a request when it is missing or blank.

### Request JSON

The minimum useful structured request for either pipeline stage is:

```json
{
  "model": "claude-sonnet-5",
  "max_tokens": 16384,
  "system": "<stage-specific instructions>",
  "messages": [
    {
      "role": "user",
      "content": "<PR metadata, commits, and patches>"
    }
  ],
  "output_config": {
    "format": {
      "type": "json_schema",
      "schema": {
        "type": "object",
        "properties": {},
        "required": [],
        "additionalProperties": false
      }
    }
  }
}
```

`model`, `max_tokens`, and `messages` are the core Messages API inputs.
`max_tokens` is an absolute output ceiling and the model can stop before it.
The Messages API is stateless, so ChangeNarator should submit each analysis or
changelog call as a self-contained request.
[Create a message](https://platform.claude.com/docs/en/api/messages/create)

`output_config.format` with `type: "json_schema"` is the current GA structured
output shape. The former `output_format` name and beta header are transitional
compatibility forms and should not be used in new code. Structured outputs are
GA for Claude 4.5 and newer models.
[Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)

The model supports up to 128K synchronous output tokens, but that is a model
limit rather than a sensible per-call default. Recommendation: start
ChangeNarator at `max_tokens: 16384` for each stage, make the value an internal
provider constant, and only raise it after measuring real truncations. This
allows substantial release notes without making the full 128K output budget
available on every call.
[Models overview](https://platform.claude.com/docs/en/about-claude/models/overview)

### Successful response JSON

A normal response has this outer shape:

```json
{
  "id": "msg_...",
  "type": "message",
  "role": "assistant",
  "model": "claude-sonnet-5",
  "content": [
    {
      "type": "text",
      "text": "{\"summary\":\"...\"}"
    }
  ],
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 1234,
    "output_tokens": 567
  }
}
```

With JSON structured output, the schema-conforming value is still serialized
as a JSON string inside a `content` text block. The adapter must select the text
block, parse its `text`, and validate the parsed object with the
provider-neutral runtime validator. It should also retain `id`, `model`,
`usage`, `stop_reason`, and the HTTP `request-id` header as execution metadata.
[Get started](https://platform.claude.com/docs/en/get-started)
[Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
[API errors](https://platform.claude.com/docs/en/api/errors)

Structured output has explicit successful-response exceptions:

- `stop_reason: "refusal"` returns HTTP 200 but can violate the schema.
- `stop_reason: "max_tokens"` returns HTTP 200 but can contain incomplete JSON.
- Enum and `const` capitalization can differ from the schema.

The adapter must inspect `stop_reason` before parsing. A refusal is a terminal,
actionable provider error. A token-limit result may be retried once against the
same provider with a larger bounded token budget; it must not be treated as a
schema-validation retry. Avoid case-sensitive enums in the provider schema
where possible, and keep independent runtime validation.
[Structured outputs: invalid outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs#invalid-outputs)

Anthropic imposes schema-complexity constraints, including at most 24 optional
parameters and 16 union-typed parameters across structured schemas. Objects
should use `additionalProperties: false`. Overly complex schemas can produce a
400 error or hit a 180-second compilation timeout.
[Structured outputs: schema limits](https://platform.claude.com/docs/en/build-with-claude/structured-outputs#schema-complexity-limits)

### Errors and retry classification

All ordinary API errors use JSON:

```json
{
  "type": "error",
  "error": {
    "type": "rate_limit_error",
    "message": "..."
  },
  "request_id": "req_..."
}
```

Known HTTP/type pairs are:

| HTTP | `error.type` | ChangeNarator handling |
| --- | --- | --- |
| 400 | `invalid_request_error` | Terminal configuration/payload error |
| 401 | `authentication_error` | Terminal; identify `ANTHROPIC_API_KEY` |
| 402 | `billing_error` | Terminal billing error |
| 403 | `permission_error` | Terminal account/model permission error |
| 404 | `not_found_error` | Terminal endpoint/model error |
| 409 | `conflict_error` | Retry only if the operation is known idempotent |
| 413 | `request_too_large` | Terminal after reporting/truncating payload |
| 429 | `rate_limit_error` | Transient; honor `retry-after` |
| 500 | `api_error` | Transient |
| 504 | `timeout_error` | Transient |
| 529 | `overloaded_error` | Transient |

The Messages API request-size limit is 32 MB. Anthropic's official SDKs retry
connection errors, rate limits, and 5xx errors twice by default with
exponential backoff and honor `retry-after`. Recommendation: whether using
`fetch` or the SDK, expose the same bounded policy—at most two retries with
jitter, honor `retry-after`, and never retry authentication, billing,
permission, invalid-request, or oversized-payload errors. Preserve the
`request_id` in the surfaced error while redacting credentials and request
content.
[API errors](https://platform.claude.com/docs/en/api/errors)

## Claude Code CLI

### Installation and macOS support

The executable is `claude`. Anthropic documents macOS support and currently
offers native installation:

```sh
curl -fsSL https://claude.ai/install.sh | bash
```

Recommendation: ChangeNarator should not install or update Claude Code. Probe
with `claude --version`; if resolution or execution fails, report that the user
must install the official CLI and ensure `claude` is on `PATH`.
[Set up Claude Code](https://code.claude.com/docs/en/setup)

### Authentication

On first interactive launch, `claude` opens a browser login. On macOS, login
credentials are stored in the encrypted Keychain. The user may authenticate
with Claude Pro/Max, Teams/Enterprise, Claude Console, or a supported cloud
provider. [Authentication](https://code.claude.com/docs/en/authentication)

For a preflight that does not start a model session:

```sh
claude auth status
```

It emits JSON by default and exits 0 when logged in or 1 when not logged in.
[CLI reference](https://code.claude.com/docs/en/cli-usage)

Credential precedence relevant to this adapter is:

1. Configured cloud provider credentials.
2. `ANTHROPIC_AUTH_TOKEN`.
3. `ANTHROPIC_API_KEY`.
4. `apiKeyHelper`.
5. `CLAUDE_CODE_OAUTH_TOKEN`.
6. Subscription OAuth credentials from `/login`.

In `-p` mode, `ANTHROPIC_API_KEY` is always used when present. This means the
Claude Code provider can work for signed-in CLI users without ChangeNarator
handling their token, but an exported API key may intentionally override that
login. The adapter should not attempt to read Keychain credentials itself.
[Authentication precedence](https://code.claude.com/docs/en/authentication#authentication-precedence)

Important product constraint: Anthropic says third-party developers may not
offer Claude.ai login or route subscription credentials on behalf of users.
Invoking the user's locally installed Claude Code is therefore the appropriate
CLI boundary; ChangeNarator must not extract, copy, transmit, or proxy those
OAuth credentials.
[Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)

### Non-interactive invocation

Recommended process invocation (argument array, not shell interpolation):

```text
claude
  --safe-mode
  -p
  --model claude-sonnet-5
  --output-format json
  --json-schema <serialized-stage-schema>
  --tools Read,Glob,Grep
  --strict-mcp-config
  --disable-slash-commands
  --no-session-persistence
  <stage-prompt>
```

Set the child process `cwd` to the checked-out PR repository. Claude Code loads
working-directory context and repository tools relative to that process
directory. Pass the prompt as a literal subprocess argument and large PR
metadata/patch content through stdin; do not construct a shell command.

`-p`/`--print` executes non-interactively and exits. `--model` accepts a full
model ID and overrides saved model settings and `ANTHROPIC_MODEL`.
`--output-format json` produces one JSON response with result/session/usage
metadata. `--json-schema` adds validated stage output and is print-mode only.
[CLI reference](https://code.claude.com/docs/en/cli-usage)
[Headless mode](https://code.claude.com/docs/en/headless)

`--safe-mode` prevents project or user CLAUDE.md files, plugins, hooks, skills,
MCP servers, agents, commands, output styles, and auto-memory from changing the
pipeline while retaining authentication and built-in tools. Do not use
`--bare`: it is recommended for generic scripts, but it explicitly skips OAuth
and Keychain reads and would exclude the signed-in CLI users this provider is
meant to support.
[CLI reference](https://code.claude.com/docs/en/cli-usage)
[Headless mode: bare mode](https://code.claude.com/docs/en/headless#start-faster-with-bare-mode)

Read-only tools let Claude inspect the checkout without allowing it to edit
files or run arbitrary shell commands. `--strict-mcp-config` with no
`--mcp-config` prevents MCP tools; `--disable-slash-commands` disables skills
and commands. `--no-session-persistence` avoids saving pipeline sessions.
[CLI reference](https://code.claude.com/docs/en/cli-usage)

The CLI reads piped stdin in non-interactive mode. Current versions cap stdin
at 10 MB and exit non-zero on overflow. Recommendation: keep the existing
ChangeNarator patch-budget logic below that hard cap (allowing headroom for
prompt text), fail or truncate deterministically before spawning, close stdin,
and apply an application-level timeout. SIGTERM cleanly aborts the in-progress
turn and exits 143.
[Headless mode: stdin and exit](https://code.claude.com/docs/en/headless#pipe-data-through-claude)

### CLI output contract

`--output-format json` returns a top-level JSON object containing request
metadata such as session ID, usage, cost, and `result`. When `--json-schema` is
also supplied, the validated value is in `structured_output`:

```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "result": "...",
  "structured_output": {
    "summary": "..."
  },
  "session_id": "...",
  "total_cost_usd": 0.01,
  "usage": {}
}
```

The adapter should parse stdout once, require a success result with
`is_error !== true`, take `structured_output` as the stage result, then apply
the shared runtime validator. Treat malformed stdout, missing
`structured_output`, a reported error, or any non-zero process exit as provider
failure. Include sanitized stderr and the numeric exit status in diagnostics.
[Headless mode: structured output](https://code.claude.com/docs/en/headless#get-structured-output)

Invalid schema input causes the current CLI to exit with an error. This
behavior requires Claude Code v2.1.205 or newer; earlier versions could silently
return unstructured output. Recommendation: document and enforce v2.1.205 as
the minimum supported CLI version, while still treating a missing
`structured_output` field as a compatibility failure.
[CLI reference](https://code.claude.com/docs/en/cli-usage)

### CLI failure modes

- Missing executable: fail preflight with install/PATH guidance.
- `claude auth status` exit 1: fail before sending PR context and instruct the
  user to run `claude` and `/login`.
- `Not logged in`, expired/revoked OAuth, or invalid API key: surface the
  official remediation without echoing credentials.
- Invalid `--json-schema`: implementation/configuration error; do not retry.
- Model not available or unauthorized: terminal for that invocation.
- Stdin over 10 MB: truncate before spawn or fail deterministically; do not
  blindly retry.
- Non-zero runtime exit, invalid JSON stdout, missing structured output, or
  timeout: one provider failure; never launch a different provider.
- SIGTERM timeout exit 143: identify it as ChangeNarator cancellation/timeout.

Anthropic documents explicit messages for not logged in, invalid API keys,
expired/revoked OAuth, and disabled organizations.
[Claude Code error reference](https://code.claude.com/docs/en/errors)

## Conformance cases

### Anthropic API adapter

1. Sends the required endpoint, headers, default model, stage schema, and
   `max_tokens`.
2. Uses a configured arbitrary model ID verbatim while retaining the shipped
   `claude-sonnet-5` default.
3. Parses structured JSON from the response text block and captures response
   metadata.
4. Rejects HTTP-200 refusal and max-token responses before normal validation.
5. Maps every documented HTTP/type pair and preserves `request_id`.
6. Retries only bounded transient errors and honors `retry-after`.
7. Rejects missing `ANTHROPIC_API_KEY` before any network call.
8. Rejects payloads beyond the application's budget before the 32 MB service
   ceiling.

### Claude Code adapter

1. Preflights executable and `claude auth status`.
2. Spawns with an argument array, checkout `cwd`, `--safe-mode`, the full model
   ID, structured schema, read-only tools, and no persisted session.
3. Supplies stdin and closes it; rejects content at or above the selected
   sub-10-MB application ceiling.
4. Parses `structured_output` and captures usage/cost/session metadata.
5. Rejects non-zero exits, error results, malformed JSON, and absent structured
   output.
6. Terminates on timeout and recognizes exit 143.
7. Never uses `--bare`, never reads Keychain/OAuth files, and never adds edit,
   Bash, browser, MCP, or network tools.
8. Enforces Claude Code v2.1.205 or later.

## Sources

- [Anthropic: Get started with Claude](https://platform.claude.com/docs/en/get-started)
- [Anthropic: Create a Message](https://platform.claude.com/docs/en/api/messages/create)
- [Anthropic: API versioning](https://platform.claude.com/docs/en/api/versioning)
- [Anthropic: Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Anthropic: API errors](https://platform.claude.com/docs/en/api/errors)
- [Anthropic: Models overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Anthropic: Model IDs and versioning](https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions)
- [Anthropic: Claude Code setup](https://code.claude.com/docs/en/setup)
- [Anthropic: Claude Code authentication](https://code.claude.com/docs/en/authentication)
- [Anthropic: Claude Code CLI reference](https://code.claude.com/docs/en/cli-usage)
- [Anthropic: Run Claude Code programmatically](https://code.claude.com/docs/en/headless)
- [Anthropic: Claude Code error reference](https://code.claude.com/docs/en/errors)
- [Anthropic: Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)
