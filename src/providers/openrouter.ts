import type { AIProvider } from './contracts';
import { createPromptProvider } from './prompt-provider';
import {
  extractChatCompletionContent,
  requestJson,
  requireCredential,
} from './http';

export function createOpenRouterProvider(fetchImpl: typeof fetch): AIProvider {
  return createPromptProvider({
    id: 'openrouter',
    contextMode: 'pr-patches',
    defaultModel: 'openai/gpt-5.4-mini',
    invoke: async (prompt, schema, { model, schemaName }) => {
      const apiKey = requireCredential('OpenRouter', 'OPENROUTER_API_KEY');
      const response = await requestJson(
        fetchImpl,
        'OpenRouter',
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/krispamB/ChangeNarator',
            'X-Title': 'ChangeNarator',
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: schemaName,
                strict: true,
                schema,
              },
            },
            provider: {
              require_parameters: true,
              allow_fallbacks: false,
            },
          }),
        },
      );
      return extractChatCompletionContent(response, 'OpenRouter');
    },
  });
}
