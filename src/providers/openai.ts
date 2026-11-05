import type { AIProvider } from './contracts';
import { createPromptProvider } from './prompt-provider';
import { requestJson, requireCredential } from './http';

function extractResponseText(value: unknown): string {
  const response = value as {
    status?: string;
    incomplete_details?: { reason?: string };
    output_text?: string;
    output?: Array<{
      content?: Array<{ type?: string; text?: string; refusal?: string }>;
    }>;
  };
  if (response.status === 'incomplete') {
    const reason = response.incomplete_details?.reason;
    throw new Error(`OpenAI response was incomplete${reason ? `: ${reason}` : ''}`);
  }
  const refusal = response.output
    ?.flatMap(item => item.content ?? [])
    .find(item => item.type === 'refusal')?.refusal;
  if (refusal) throw new Error(`OpenAI refused the request: ${refusal}`);
  if (typeof response.output_text === 'string') return response.output_text;

  const text = response.output
    ?.flatMap(item => item.content ?? [])
    .filter(item => item.type === 'output_text' && typeof item.text === 'string')
    .map(item => item.text)
    .join('');
  if (!text) throw new Error('OpenAI returned an unexpected response shape');
  return text;
}

export function createOpenAIProvider(fetchImpl: typeof fetch): AIProvider {
  return createPromptProvider({
    id: 'openai',
    contextMode: 'pr-patches',
    defaultModel: 'gpt-5.6-sol',
    invoke: async (prompt, schema, { model, schemaName }) => {
      const apiKey = requireCredential('OpenAI', 'OPENAI_API_KEY');
      const response = await requestJson(fetchImpl, 'OpenAI', 'https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: prompt,
          text: {
            format: {
              type: 'json_schema',
              name: schemaName,
              strict: true,
              schema,
            },
          },
        }),
      });
      return extractResponseText(response);
    },
  });
}
