import type { AIProvider } from './contracts';
import { createPromptProvider } from './prompt-provider';
import { requestJson, requireCredential } from './http';

function extractAnthropicText(value: unknown): string {
  const response = value as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = response.content
    ?.filter(item => item.type === 'text' && typeof item.text === 'string')
    .map(item => item.text)
    .join('');
  if (!text) throw new Error('Anthropic returned an unexpected response shape');
  return text;
}

export function createAnthropicProvider(fetchImpl: typeof fetch): AIProvider {
  return createPromptProvider({
    id: 'anthropic',
    contextMode: 'pr-patches',
    defaultModel: 'claude-sonnet-5',
    invoke: async (prompt, schema, { model }) => {
      const apiKey = requireCredential('Anthropic', 'ANTHROPIC_API_KEY');
      const response = await requestJson(fetchImpl, 'Anthropic', 'https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4_096,
          messages: [{ role: 'user', content: prompt }],
          output_config: {
            format: {
              type: 'json_schema',
              schema,
            },
          },
        }),
      });
      return extractAnthropicText(response);
    },
  });
}
