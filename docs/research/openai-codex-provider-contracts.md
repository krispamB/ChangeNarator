# OpenAI API and Codex CLI provider contracts

Research date: 2026-07-29

This note records the current official contracts needed to implement two
distinct ChangeNarator providers:

- `openai`: direct calls to the OpenAI Responses API.
- `codex`: non-interactive calls to the locally installed Codex CLI.

The contracts should not be conflated. The API provider authenticates with an
OpenAI Platform API key and receives only the context ChangeNarator sends. The
CLI provider reuses a user's Codex authentication and can inspect the checked
out repository under its sandbox policy.

Only official OpenAI documentation is cited below.

## Recommended defaults

- Use the Responses API for the `openai` provider, through the official
  `openai` JavaScript/TypeScript SDK.
- Use `gpt-5.6-sol` as ChangeNarator's tested API model default. The current
  model catalog calls it the flagship choice for complex reasoning and coding;
  `gpt-5.6` is an alias that routes to `gpt-5.6-sol`. Keep accepting an
  arbitrary user-supplied model ID because model access can vary by account.
  [Model catalog](https://developers.openai.com/api/docs/models) and
  [GPT-5.6 guidance](https://developers.openai.com/api/docs/guides/latest-model)
- For the `codex` provider, omit `--model` unless the user configured one.
  This preserves the user's/current Codex recommended model and entitlement.
  When ChangeNarator or the user does specify one, pass it through with
  `--model`/`-m`. The current Codex recommendation is the Power setting using
  `gpt-5.6-sol` with medium reasoning, but the documented CLI example uses the
  public `gpt-5.6` alias. [Codex model selection](https://learn.chatgpt.com/docs/models)
- Run Codex with `--sandbox read-only`, `--ephemeral`, `--output-schema`, and
  `--output-last-message`. Do not use `--json` as the final-result channel:
  `--json` emits a JSONL event stream rather than one result object.
  [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)

## OpenAI Responses API contract

### Authentication

- The standard environment variable is `OPENAI_API_KEY`.
- The official SDK reads `OPENAI_API_KEY` automatically.
- A raw HTTP request uses
  `Authorization: Bearer $OPENAI_API_KEY` and
  `Content-Type: application/json`.
- API keys should stay server-side and must not be logged or included in
  provider error messages.

Sources:
[Developer quickstart](https://developers.openai.com/api/docs/quickstart) and
[text generation guide](https://developers.openai.com/api/docs/guides/text).

### Request

The implementation-level request for either ChangeNarator stage should be
equivalent to:

```ts
const response = await client.responses.create({
  model,
  instructions,
  input,
  text: {
    format: {
      type: "json_schema",
      name: schemaName,
      strict: true,
      schema,
    },
  },
  max_output_tokens: outputLimit,
});
```

Relevant fields:

- `model`: a model ID such as `gpt-5.6-sol`, or the configured per-run
  override.
- `instructions`: stable stage instructions. The API also accepts message
  arrays with `developer`, `system`, and `user` roles, but separate
  `instructions` and `input` are sufficient for ChangeNarator.
- `input`: a string or array of input items. ChangeNarator should serialize
  only the already-approved PR metadata, commit information, and available
  patches here.
- `text.format`: for the Responses API, structured output belongs under
  `text.format`, with `type: "json_schema"`, a name, the JSON Schema, and
  `strict: true`.
- `max_output_tokens`: bound output explicitly and treat an exhausted bound as
  an incomplete result, not valid JSON.

The official JavaScript example creates a response with `model`,
`instructions`, and `input`; the structured-output example adds the
`text.format` JSON Schema.
[Text generation](https://developers.openai.com/api/docs/guides/text) and
[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

### Response extraction

The raw response has an `output` array, which may contain messages, reasoning
items, tool calls, and other item types. Production code must not assume the
answer is always at `output[0].content[0].text`. Official SDKs expose the
convenience property `response.output_text`, which aggregates text output.
[Text generation response shape](https://developers.openai.com/api/docs/guides/text).

For strict structured output:

1. Reject `response.status === "incomplete"`. In particular,
   `response.incomplete_details.reason === "max_output_tokens"` means the
   requested object was truncated.
2. Walk message content (or use the SDK parsing helper if adopted) and detect a
   content item whose `type` is `refusal`; report it as a provider refusal, not
   as malformed JSON.
3. For an `output_text` item, parse its `text` as JSON and run the project's
   own schema validation even though the server was asked for strict output.
   Local validation protects the provider boundary from SDK/API drift and gives
   all providers one conformance path.
4. Treat missing message content, missing output text, invalid JSON, and local
   schema mismatch as provider-output errors.

The official structured-output examples explicitly branch on incomplete
responses, refusals, output text, and missing content.
[Structured Outputs edge cases](https://developers.openai.com/api/docs/guides/structured-outputs).

### Structured-output constraints

Structured Outputs guarantees adherence only to the supported subset of JSON
Schema. The ChangeNarator schemas should therefore remain simple object/array
schemas, list every required property, and set `additionalProperties: false`
on object definitions. Do not depend on unsupported JSON Schema vocabulary.
Structured Outputs is supported on `gpt-4o-mini`, `gpt-4o-2024-08-06`, and
later compatible models; an arbitrary user-selected model can still reject the
feature, which should surface as a model/capability error rather than silently
falling back to unstructured generation.
[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

### Errors and retry classification

Map SDK/HTTP failures into ChangeNarator's provider-neutral errors while
retaining the provider (`openai`), selected model, stage, HTTP status, API error
code/type when present, and request ID when the SDK exposes it. Never retain
the API key or full request payload.

Suggested classification:

| Status/condition | Classification | Retry |
| --- | --- | --- |
| Missing `OPENAI_API_KEY` | configuration/authentication | No |
| 400/422 invalid request or unsupported model/schema | request/capability | No |
| 401 | authentication | No |
| 403 | authorization/region | No |
| 404 model not found/unavailable | model/capability | No |
| 408/connection reset/timeout before a response | transient transport | Bounded retry |
| 429 rate limit | rate limit | Bounded retry with backoff |
| 429 quota/billing | quota | No |
| 500 | provider transient | Bounded retry after a brief wait |
| 503 overload/slow down | provider transient | Bounded retry with backoff |
| Refusal | refusal | No |
| `status: "incomplete"` | incomplete output | Retry only if policy allows a larger output bound |
| Invalid structured output | provider output | At most the shared structured-output repair retry |

OpenAI's error guide distinguishes invalid authentication, unauthorized
regions, rate limiting from exhausted quota, and retryable 500/503 server
conditions. It explicitly recommends pacing rate-limit requests and retrying
500/503 failures after a wait.
[Error codes](https://developers.openai.com/api/docs/guides/error-codes).

## Codex CLI non-interactive contract

### Availability and authentication

- Resolve the `codex` executable from `PATH`; a missing executable is a
  provider-availability error with installation/login guidance.
- Codex supports ChatGPT subscription login and API-key login for local work.
- `codex login` starts the default browser flow.
- `codex login status` reports the active authentication method.
- API-key login is performed with
  `printenv OPENAI_API_KEY | codex login --with-api-key`.
- Login details are cached and reused by `codex exec`; CLI and IDE share the
  cache. Storage may be the OS credential store or
  `$CODEX_HOME/auth.json` (defaulting to `~/.codex/auth.json`).
- `CODEX_API_KEY` can authenticate one `codex exec` invocation, but the docs
  specifically scope it to `codex exec`. ChangeNarator should normally reuse
  the user's saved CLI login rather than translating the direct API provider's
  `OPENAI_API_KEY` into CLI auth.

For a friendly preflight, run `codex login status` and use its exit result and
stderr; do not read or parse the credential cache directly.

Sources:
[Codex authentication](https://learn.chatgpt.com/docs/auth) and
[Codex non-interactive authentication](https://learn.chatgpt.com/docs/non-interactive-mode#authenticate-in-automation).

### Invocation, stdin, working directory, and model

Recommended invocation shape:

```text
codex exec
  --cd <checked-out-repository>
  --sandbox read-only
  --ephemeral
  --output-schema <temporary-schema-file>
  --output-last-message <temporary-result-file>
  [--model <configured-model>]
  -
```

Write the complete stage prompt to the child's stdin, then close stdin. The
documented `-` sentinel makes stdin the complete prompt. If a prompt argument
and piped stdin are both supplied, Codex treats the argument as the instruction
and stdin as additional context; using only `-` avoids that split.

Behavior of the relevant options:

- `codex exec` (short form `codex e`) is the scripted, non-interactive
  interface.
- `--cd`/`-C` sets the workspace root before the task starts. Use the checked
  out PR repository, not ChangeNarator's installation directory.
- `--sandbox read-only` prevents model-generated file edits. Read-only is also
  the documented default for `codex exec`, but pass it explicitly for a stable
  provider contract.
- `--ephemeral` avoids persisting session rollout files.
- `--model`/`-m` overrides the configured model for this run. Omit it when no
  explicit provider/per-run override is configured.
- `--output-schema <path>` supplies the JSON Schema for the expected final
  response and asks Codex to validate the final output against it.
- `--output-last-message <path>`/`-o <path>` writes the final assistant message
  to a file and still prints it to stdout.
- Codex normally requires a Git repository. ChangeNarator checks out a GitHub
  repository, so do not pass `--skip-git-repo-check`.
- Do not pass `--ignore-user-config`: the provider is explicitly the user's
  local Codex CLI, so their model provider, managed policy, required MCP
  configuration, and authentication should remain effective.
- Do not use the deprecated `--full-auto` or the dangerous
  `--dangerously-bypass-approvals-and-sandbox`.

Sources:
[Codex CLI command reference](https://learn.chatgpt.com/docs/developer-commands?surface=cli#cli-codex-exec),
[non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), and
[Codex model selection](https://learn.chatgpt.com/docs/models).

### Output and process handling

Without `--json`, `codex exec` streams progress to stderr and prints only the
final agent message to stdout. With `--json`, stdout is a JSONL event stream
whose event types include `thread.started`, `turn.started`, `turn.completed`,
`turn.failed`, `item.*`, and `error`.

For ChangeNarator:

1. Use `--output-schema` and a unique temporary `--output-last-message` file.
2. On exit code zero, read the result file, parse it as JSON, and run the same
   local schema validator used by all other providers.
3. Capture bounded stderr for diagnostics, redacting paths or secrets as
   appropriate. Do not parse progress prose as a stable protocol.
4. Regard a missing/empty result file, invalid JSON, or local schema mismatch
   as a provider-output error even if the process exited successfully.
5. On non-zero exit, return a CLI execution error containing the exit
   code/signal and a sanitized stderr excerpt.
6. Implement timeout cancellation with the child-process signal/termination
   policy shared by other CLI providers; ensure temporary schema/result files
   are cleaned up in `finally`.

Using the result file isolates the one schema-conforming final object from
stdout events and warnings. `--json` may optionally be enabled later for
telemetry, but it is not needed to implement the provider.
[Codex non-interactive output](https://learn.chatgpt.com/docs/non-interactive-mode#make-output-machine-readable).

### Repository access and security

The Codex backend deliberately differs from the API backend:

- `--cd` places the agent in the checked-out repository, so it may inspect
  repository files in addition to the prompt.
- `--sandbox read-only` is the least-privilege mode suitable for analysis and
  changelog generation.
- The prompt should explicitly prohibit mutations and request only the final
  schema, even though the sandbox is read-only.
- User/project `AGENTS.md`, configuration, managed policy, and required MCP
  servers may affect behavior. In particular, the docs state that if an enabled
  MCP server is marked `required = true` and fails to initialize,
  `codex exec` exits with an error. Surface that error; do not bypass the user's
  policy automatically.
- Because both pipeline stages are intended as independent provider calls,
  use two ephemeral invocations rather than `codex exec resume`. Pass the
  validated analysis object into the changelog-stage prompt.

[Codex non-interactive permissions](https://learn.chatgpt.com/docs/non-interactive-mode#permissions-and-safety).

## Provider conformance cases

The implementation should include mocked or fake-process tests for:

### `openai`

- Reads `OPENAI_API_KEY`; missing variable fails before any HTTP call.
- Sends the selected model and the stage's strict JSON Schema in
  `text.format`.
- Extracts and validates a successful structured response.
- Distinguishes refusal, incomplete output, empty content, invalid JSON, and
  local schema mismatch.
- Distinguishes retryable rate-limit/server/transport errors from permanent
  authentication, quota, request, and model-capability errors.
- Redacts credentials and payloads in all error paths.
- Accepts a per-run model override.

### `codex`

- Detects a missing executable and unauthenticated CLI preflight.
- Spawns `codex exec` with the checkout as `--cd`, explicit read-only sandbox,
  ephemeral mode, a temporary schema path, a temporary result path, and `-`.
- Omits `--model` by default and passes it exactly once when configured.
- Sends the complete prompt through stdin and closes stdin.
- Reads/validates the final-message file rather than treating JSONL/progress
  output as the final result.
- Handles non-zero exit, signal exit, timeout, empty result, invalid JSON, and
  schema mismatch.
- Cleans up temporary files on success, failure, and cancellation.
- Never passes full-auto, sandbox bypass, write-enabled sandbox, or
  skip-git-repo-check flags.

## Implementation caveats

- “ChatGPT CLI” is not the official name of this local provider; use the
  canonical public identifier `codex` and describe it as “Codex CLI” in help
  text.
- `OPENAI_API_KEY` belongs to the direct `openai` provider.
  The local `codex` provider should primarily use the user's existing Codex
  session; the two auth modes must remain independently diagnosable.
- Model aliases move. `gpt-5.6-sol` is the tested default as of the research
  date, while arbitrary model IDs remain best effort.
- Strict server-side output does not remove the need for local validation or
  refusal/incomplete handling.
- CLI schema enforcement and API schema enforcement use different mechanisms:
  a schema file passed to `codex exec --output-schema` versus
  `text.format` in a Responses API request.
