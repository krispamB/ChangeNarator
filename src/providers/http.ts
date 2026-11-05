const MAX_ERROR_BODY_LENGTH = 2_000;

export async function requestJson(
  fetchImpl: typeof fetch,
  providerName: string,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(120_000),
    });
  } catch (error) {
    throw new Error(
      `${providerName} request failed: ${error instanceof Error ? error.message : 'network error'}`,
    );
  }

  if (!response.ok) {
    const body = (await response.text()).slice(0, MAX_ERROR_BODY_LENGTH);
    throw new Error(
      `${providerName} request failed with ${response.status} ${response.statusText}${body ? `: ${body}` : ''}`,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new Error(`${providerName} returned a non-JSON response`);
  }
}

export function requireCredential(
  providerName: string,
  environmentVariable: string,
  fallback?: string,
): string {
  const value = process.env[environmentVariable] || fallback;
  if (!value) {
    throw new Error(
      `${providerName} requires the ${environmentVariable} environment variable`,
    );
  }
  return value;
}

export function extractChatCompletionContent(value: unknown, providerName: string): unknown {
  const data = value as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (content === undefined) {
    throw new Error(`${providerName} returned an unexpected response shape`);
  }
  return content;
}
