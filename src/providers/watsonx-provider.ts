import type { Config } from '../cli/config';
import type { AIProvider } from './contracts';
import {
  extractChatCompletionContent,
  requestJson,
  requireCredential,
} from './http';
import { createPromptProvider } from './prompt-provider';

const DEFAULT_WATSONX_URL = 'https://us-south.ml.cloud.ibm.com';

function resolveWatsonXSettings(config: Config): {
  apiKey: string;
  projectId: string;
  url: string;
} {
  const providerConfig = config.ai?.providers?.watsonx;
  const apiKey = requireCredential('WatsonX', 'WATSONX_API_KEY', config.watsonx?.apiKey);
  const projectId =
    providerConfig?.projectId ||
    process.env.WATSONX_PROJECT_ID ||
    config.watsonx?.projectId;
  const url =
    providerConfig?.url ||
    process.env.WATSONX_URL ||
    config.watsonx?.url ||
    DEFAULT_WATSONX_URL;

  if (!projectId) {
    throw new Error('WatsonX requires WATSONX_PROJECT_ID or ai.providers.watsonx.projectId');
  }

  return { apiKey, projectId, url: url.replace(/\/$/, '') };
}

async function getIAMToken(
  fetchImpl: typeof fetch,
  apiKey: string,
): Promise<string> {
  const response = await requestJson(
    fetchImpl,
    'WatsonX IAM',
    'https://iam.cloud.ibm.com/identity/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
        apikey: apiKey,
      }),
    },
  ) as { access_token?: unknown };

  if (typeof response.access_token !== 'string') {
    throw new Error('WatsonX IAM returned an unexpected response shape');
  }
  return response.access_token;
}

export function createWatsonXProvider(
  fetchImpl: typeof fetch,
  config: Config,
): AIProvider {
  let tokenPromise: Promise<string> | undefined;

  return createPromptProvider({
    id: 'watsonx',
    contextMode: 'pr-patches',
    defaultModel: 'ibm/granite-4-h-small',
    invoke: async (prompt, schema, { model, schemaName }) => {
      const settings = resolveWatsonXSettings(config);
      tokenPromise ??= getIAMToken(fetchImpl, settings.apiKey);
      const token = await tokenPromise;
      const response = await requestJson(
        fetchImpl,
        'WatsonX',
        `${settings.url}/ml/v1/text/chat?version=2024-05-31`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model_id: model,
            project_id: settings.projectId,
            messages: [{ role: 'user', content: prompt }],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: schemaName,
                strict: true,
                schema,
              },
            },
            max_tokens: 4_096,
            time_limit: 30_000,
            temperature: 0.2,
          }),
        },
      );

      return extractChatCompletionContent(response, 'WatsonX');
    },
  });
}
