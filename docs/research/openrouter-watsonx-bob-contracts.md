# OpenRouter, watsonx.ai, and Bob backend contracts

Research date: 2026-07-29

This note records current first-party API/CLI contracts that affect the proposed
provider abstraction. It separates published behavior from observations of the
repository and the locally installed Bob Shell. Model catalogs and CLI flags are
version-sensitive, so release tests must remain the final authority.

## Executive decisions

- Implement OpenRouter with its OpenAI-compatible **Chat Completions** endpoint,
  not its beta Responses endpoint. Chat Completions has the widest documented
  compatibility, directly supports the `response_format.json_schema` contract
  needed here, and returns the familiar `choices[0].message.content` shape.
- Require `OPENROUTER_API_KEY` and send it as a Bearer token. Attribution headers
  are optional; if sent, use a stable project URL as `HTTP-Referer` and
  `ChangeNarator` as `X-OpenRouter-Title`.
- Pin an OpenRouter model in each released ChangeNarator version rather than use
  `openrouter/auto` or a `~...-latest` alias. A reasonable current candidate is
  `openai/gpt-5.4-mini`, subject to a live structured-output conformance test
  before release. Send `provider.require_parameters: true` so routing excludes
  endpoints that cannot honor JSON Schema.
- Do not send an OpenRouter `models` fallback array. OpenRouter also performs
  provider-endpoint fallback for the *same* model by default; set
  `provider.allow_fallbacks: false` only if the product's “no automatic
  cross-provider fallback” decision is intended to prohibit that internal
  OpenRouter behavior too.
- Keep watsonx.ai on `POST /ml/v1/text/chat?version=2024-05-31`, with IBM IAM
  Bearer authentication and a required project or space. The current
  `ibm/granite-4-h-small` default is also used by IBM's current Node SDK example
  and is a defensible tested default.
- Fix the current watsonx request shape during the provider refactor:
  chat-generation controls such as `max_tokens`, `temperature`, and
  `time_limit` are top-level request fields. The repository currently sends a
  nested `parameters` object containing text-generation-style
  `max_new_tokens`.
- Treat Bob as a local, authenticated agent CLI rather than a deterministic JSON
  API. Use its working directory to grant repository context, prefer its current
  positional one-shot prompt form over deprecated `-p`, request a machine output
  mode where feasible, and still validate the semantic result locally.

## OpenRouter

### Authentication and endpoint

The direct API uses:

```http
POST https://openrouter.ai/api/v1/chat/completions
Authorization: Bearer $OPENROUTER_API_KEY
Content-Type: application/json
```

OpenRouter documents the endpoint as compatible with standard OpenAI Chat
Completions clients. The required credential is an API key in the Bearer
`Authorization` header. `HTTP-Referer` and `X-OpenRouter-Title` are optional for
requests; they are used for app attribution rather than authentication.
([OpenRouter quickstart](https://openrouter.ai/docs/quickstart),
[app attribution](https://openrouter.ai/docs/app-attribution))

The implementation should use `OPENROUTER_API_KEY` only from the environment and
must never include its value in logs or thrown errors.

### Request and response shape

A suitable non-streaming request is:

```json
{
  "model": "openai/gpt-5.4-mini",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "change_analysis",
      "strict": true,
      "schema": {}
    }
  },
  "provider": {
    "require_parameters": true
  },
  "stream": false
}
```

OpenRouter accepts the OpenAI-style `response_format` with
`type: "json_schema"`, a named schema, and `strict: true`. Support is per model
*and endpoint*, can change over time, and strict enforcement can vary by
upstream provider. OpenRouter specifically recommends checking supported
parameters and setting `provider.require_parameters: true` so only endpoints
which accept the required parameter are considered. Therefore, ChangeNarator
must also parse and validate returned JSON against its own schema; gateway
acceptance is not a substitute for application validation.
([structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs),
[model metadata](https://openrouter.ai/docs/guides/overview/models))

For non-streaming Chat Completions, consume the assistant text from
`choices[0].message.content`. Retain the returned `model` and usage fields as
execution metadata because routed/aliased requests may resolve to a different
concrete model.

### Model selection

OpenRouter exposes `GET /api/v1/models`; each model includes its identifier,
context length, pricing, expiration, and `supported_parameters`. Use that
catalog in release-time verification, not as a runtime dependency for every
analysis.
([OpenRouter Models API](https://openrouter.ai/docs/guides/overview/models))

`openrouter/auto` deliberately selects a model dynamically, and `~...-latest`
aliases deliberately advance to newer concrete releases. Both improve
convenience but weaken reproducibility and can change cost or structured-output
behavior without a ChangeNarator release.
([Auto Router](https://openrouter.ai/docs/guides/routing/routers/auto-router),
[latest-model resolution](https://openrouter.ai/docs/guides/routing/routers/latest-resolution))

Recommendation:

1. Ship a concrete, conformance-tested model ID.
2. Allow a saved model and `--model` to override it.
3. Reject neither unknown nor newly added IDs locally; pass them through and
   surface the upstream validation error.
4. Re-evaluate the shipped default for every release.

As of the research date, `openai/gpt-5.4-mini` is a sensible candidate: the
official model page identifies it as a production-oriented, high-throughput
coding/instruction-following model with a 400K context window. This is a
recommendation, not a durable API guarantee, and it still needs the provider
conformance smoke test.
([GPT-5.4 Mini model page](https://openrouter.ai/openai/gpt-5.4-mini/benchmarks))

### Routing and privacy caveats

There are two distinct fallback mechanisms:

- A `models` array opts into fallback across different models. ChangeNarator
  should not send it.
- OpenRouter can route the same model across multiple hosting providers and
  keeps fallback endpoints by default. `provider.allow_fallbacks: false`
  disables further provider endpoints after the selected/ordered endpoint
  fails.

([model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks),
[provider routing](https://openrouter.ai/docs/guides/routing/provider-selection))

This distinction needs an explicit product interpretation. From
ChangeNarator's perspective, OpenRouter remains the selected logical provider,
but source patches may be processed by different upstream companies unless
routing is constrained. For source-code privacy, consider a provider policy
such as `data_collection: "deny"` and/or `zdr: true`; these filters reduce the
eligible endpoint pool and may increase errors or cost.
([OpenRouter sovereign/privacy controls](https://openrouter.ai/docs/guides/get-started/sovereign-ai),
[provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging/))

### Errors and retries

The common pre-generation error envelope is:

```json
{
  "error": {
    "code": 429,
    "message": "Rate limit exceeded",
    "metadata": {
      "error_type": "rate_limit_exceeded"
    }
  }
}
```

Important status classes include 400 invalid request/context constraints, 401
authentication, 402 insufficient credits, 403 permissions or moderation, 408
timeout, 429 rate limit, 502 upstream invalid/unavailable response, and 503 no
eligible provider. `429` and `503` may provide `Retry-After`. Provider errors
that occur after generation begins can appear in a response body (or in-band
SSE event for streaming) even when HTTP status is 200. Non-streaming code must
therefore check both HTTP status and response-level/choice-level errors before
using `choices`.
([OpenRouter errors and debugging](https://openrouter.ai/docs/api/reference/errors-and-debugging))

For this batch CLI:

- use non-streaming calls;
- retry only transient 408/429/502/503 failures, within the same configured
  OpenRouter model/provider policy;
- honor a valid `Retry-After`;
- do not retry 400/401/402/403 automatically;
- classify malformed or schema-invalid successful content separately, permitting
  at most the agreed same-provider repair attempt.

## IBM watsonx.ai

### Authentication

IBM Cloud watsonx.ai uses IBM Cloud IAM. Exchange the configured API key with:

```http
POST https://iam.cloud.ibm.com/identity/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=...
```

Use the returned `access_token` as `Authorization: Bearer ...` for watsonx.ai
requests. IAM tokens expire in at most one hour; `expires_in` is the source of
truth for caching. A service ID API key is the appropriate unattended
credential.
([IBM Cloud IAM token documentation](https://cloud.ibm.com/docs/account?topic=account-iamtoken_from_apikey))

This agrees with the repository's existing token exchange in
[`src/watsonx.ts`](../../src/watsonx.ts), although the current implementation
does not cache the token and discards IAM error details.

### Chat endpoint and request

The IBM Cloud foundation-model chat endpoint is:

```http
POST {regionServiceUrl}/ml/v1/text/chat?version=YYYY-MM-DD
Authorization: Bearer {iam_access_token}
Accept: application/json
Content-Type: application/json
```

The query `version` is required. `2024-05-31` remains the version used in IBM's
current Node SDK example, so keeping it is the least disruptive choice unless a
provider conformance test identifies a required change. The body contains
`model_id`, `messages`, and either `project_id` or `space_id` for IBM Cloud.
([watsonx.ai API reference](https://ondeck.console.cloud.ibm.com/apidocs/watsonx-ai),
[IBM watsonx.ai Node SDK](https://ibm.github.io/watsonx-ai-node-sdk/))

A corrected direct request is:

```json
{
  "model_id": "ibm/granite-4-h-small",
  "project_id": "...",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "max_tokens": 1200,
  "temperature": 0.2,
  "time_limit": 30000,
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "change_analysis",
      "strict": true,
      "schema": {}
    }
  }
}
```

The current chat schema exposes generation controls at the top level, including
`max_tokens`, `max_completion_tokens`, `temperature`, and `time_limit`.
`response_format` supports `text`, `json_object`, and `json_schema`; the JSON
Schema form includes `name`, `schema`, and `strict`, with only a subset of JSON
Schema supported in strict mode.
([watsonx.ai chat parameter schema](https://ibm.github.io/watsonx-ai-python-sdk/fm_schema.html),
[Node SDK `TextChatParams`](https://ibm.github.io/watsonx-ai-node-sdk/interfaces/1_7_x.WatsonXAI.TextChatParams.html))

By contrast, [`src/watsonx.ts`](../../src/watsonx.ts) currently sends:

```json
{
  "parameters": {
    "max_new_tokens": 500,
    "time_limit": 10000,
    "temperature": 0.3
  }
}
```

That is a text-generation-style shape, not the published chat shape. The
provider refactor should correct it rather than preserve it as compatibility
behavior.

### Model and response

Keep `ibm/granite-4-h-small` as the initial tested default. IBM's current Node
SDK basic chat example uses the same model and version date. Make the model
configurable and pass arbitrary IDs through because availability is
region/account dependent.
([IBM watsonx.ai Node SDK](https://ibm.github.io/watsonx-ai-node-sdk/))

Successful direct chat responses have:

```json
{
  "model_id": "...",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {}
}
```

Consume `choices[0].message.content`, but also validate the finish reason and
application schema. Preserve `model_id` and usage in execution metadata.
([watsonx.ai API reference](https://ondeck.console.cloud.ibm.com/apidocs/watsonx-ai))

### Errors and retries

The chat endpoint documents 400, 401, 403, and 404 failures, with 429 and 503
also indicating model overload/unavailability. IBM error responses include a
trace identifier useful for support. Preserve the HTTP status, IBM message, and
trace ID in a redacted provider error.
([watsonx.ai API reference](https://ondeck.console.cloud.ibm.com/apidocs/watsonx-ai))

Recommended policy:

- acquire one IAM token for the complete two-stage run and refresh only if its
  `expires_in` window is reached;
- retry 429/503 and transient transport failures with bounded backoff;
- do not retry authentication, authorization, invalid project/model, or malformed
  request failures;
- distinguish IAM exchange errors from inference errors;
- never include the API key or Bearer token in diagnostics.

## Bob Shell: locally observable contract

### Installed CLI facts

The inspected executable is Bob Shell `1.0.3`, installed as the `bobshell` npm
package. Its own bundled documentation says non-interactive usage requires an
authenticated environment (`BOBSHELL_API_KEY`), runs in the current project
directory, can read project files by default, and accepts piped input. Its local
help additionally exposes:

- positional prompts for one-shot execution;
- `-m, --model`;
- `--chat-mode` (`plan`, `code`, `advanced`, `ask`);
- `-o, --output-format` (`text`, `json`, `stream-json`);
- `--hide-intermediary-output`;
- read/write approval and sandbox controls;
- exit code 1 when `--max-coins` is exceeded.

Local first-party sources:

- `/Users/tasck/.nvm/versions/node/v22.20.0/lib/node_modules/bobshell/package.json`
- `/Users/tasck/.nvm/versions/node/v22.20.0/lib/node_modules/bobshell/bundle/bobshell-docs/start-bobshell-non-interactive.md`
- `/Users/tasck/.nvm/versions/node/v22.20.0/lib/node_modules/bobshell/bundle/bobshell-docs/configuring.md`
- `bob --help` and `bob --version`, observed 2026-07-29

Bob authentication is owned by Bob Shell. ChangeNarator should not accept or
store the Bob credential; it should check executable availability, run the CLI,
and translate an authentication failure into setup guidance.

### What the repository assumes today

[`src/bob-analyzer.ts`](../../src/bob-analyzer.ts) currently:

1. builds a prompt containing the entire serialized `PRContext`;
2. writes the same prompt to `.bob-prompt-temp.md` in the checked-out repository;
3. spawns `bob -p -` with that repository as `cwd`;
4. writes the prompt to stdin;
5. buffers all stdout/stderr with no timeout or cancellation;
6. extracts JSON heuristically from `---output---`, after `</thinking>`, or the
   first greedy brace-to-brace match;
7. validates the object with handwritten runtime checks;
8. deletes the temporary file in `finally`.

The temporary prompt file is never referenced by the command or prompt, so it is
redundant exposure of PR data on disk. Its existence also makes the otherwise
analytical Bob stage mutate the checked-out repository temporarily.

### Non-interactive limitations and migration implications

- **`-p` is deprecated.** Bob 1.0.3 help states that `-p/--prompt` will be
  removed and recommends a positional prompt. The adapter must not encode
  `bob -p -` as its long-term contract.
- **Bob is an agent, not a JSON-schema endpoint.** Bob's docs recommend
  prompt-level structured-output instructions. Although 1.0.3 has JSON output
  modes, the installed docs do not promise that the model's semantic answer is
  itself schema-valid. Keep local parse/schema validation.
- **Machine-output compatibility must be version-tested.** Before switching to
  `--output-format json`, capture and fixture the envelope emitted by the
  minimum supported Bob version. Do not assume stdout contains only the model's
  answer merely because the output format is named JSON.
- **Repository access comes from `cwd`.** Bob can inspect the checked-out
  repository and its context files. This is the intended distinction from API
  providers, which only receive explicitly assembled PR data.
- **Read-only is the safe default.** Bob's bundled guide says non-interactive
  mode permits non-destructive tools by default and needs `--yolo` to modify
  files. ChangeNarator should never pass `--yolo` or an edit approval mode for
  analysis.
- **No timeout exists in the adapter.** A hung authentication flow, agent/tool
  call, or large analysis can hang the whole pipeline. The common CLI adapter
  needs AbortSignal/timeout handling and must terminate the child process.
- **Output size is unbounded.** Both stdout and stderr are accumulated in
  memory; set an explicit maximum or safely truncate diagnostic stderr.
- **The model default is external state.** `--model` is supported, but the help
  does not identify a durable default. Treat the CLI's own default as the
  provider default unless the user configures a Bob model; record the resolved
  model when Bob's machine envelope exposes it.
- **CLI version is part of compatibility.** Feature-detect or declare a minimum
  Bob version before depending on positional prompts, `--output-format`, or a
  specific JSON envelope.

### Recommended Bob invocation contract

The implementation should first establish a fixture from the minimum supported
Bob version, then use a contract equivalent to:

```text
bob [--model MODEL] --chat-mode ask --output-format json "PROMPT"
```

If command-line argument length makes a positional multiline prompt unsafe,
pipe the prompt on stdin using a Bob-supported non-deprecated form verified by
the conformance test. Do not recreate the prompt as a repository file. Always
set `cwd` to the checked-out repository, omit mutation approvals, enforce a
timeout, require exit code zero, unwrap the versioned machine-output envelope,
and validate the resulting `ChangeAnalysisResult`.

## Conformance tests implied by this research

### OpenRouter live smoke test

- validates `OPENROUTER_API_KEY` Bearer auth;
- sends the exact production JSON Schema to the pinned default;
- sets `require_parameters: true`;
- asserts semantic schema validity and captures returned concrete model/usage;
- verifies 401 and an invalid model are translated without leaking the key;
- verifies the selected interpretation of `allow_fallbacks`.

### watsonx.ai live smoke test

- exchanges an API key for IAM token and respects `expires_in`;
- calls `/ml/v1/text/chat?version=2024-05-31` with top-level chat parameters;
- runs `ibm/granite-4-h-small` with the production JSON Schema;
- validates the response and records `model_id`, usage, finish reason, and trace
  on failure;
- verifies invalid project/model errors remain distinguishable.

### Bob local conformance test

- runs against the declared minimum and current Bob versions;
- verifies authenticated, one-shot, read-only operation in a temporary git repo;
- fixtures the `--output-format json` envelope;
- verifies optional `--model`, nonzero exit, missing executable, timeout, and
  malformed semantic output;
- asserts the adapter creates or modifies no repository files.
