import type { BobAnalysisResult, ChangelogAudiences } from './types'
import type { Config } from './cli/config'

const MODEL_ID = 'ibm/granite-4-h-small';

async function getIAMToken(apiKey: string): Promise<string> {
    const res = await fetch('https://iam.cloud.ibm.com/identity/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
            apikey: apiKey,
        }),
    });

    if (!res.ok) throw new Error(`IAM token fetch failed: ${res.status}`);
    const data = await res.json() as { access_token: string };
    return data.access_token;
}

async function generate(
    token: string,
    systemPrompt: string,
    userPrompt: string,
    watsonxUrl: string,
    projectId: string
): Promise<string> {
    const res = await fetch(
        `${watsonxUrl}/ml/v1/text/chat?version=2024-05-31`,
        {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model_id: MODEL_ID,
                project_id: projectId,
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt,
                    },
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: userPrompt,
                            },
                        ],
                    },
                ],
                parameters: {
                    max_new_tokens: 500,
                    time_limit: 10000,
                    temperature: 0.3
                },
            }),
        }
    );

    if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`watsonx generation failed: ${res.status} ${res.statusText}\n${errorBody}`);
    }

    const data = await res.json() as any;

    // Chat API response format: data.choices[0].message.content
    if (data.choices && Array.isArray(data.choices) && data.choices.length > 0) {
        const choice = data.choices[0];
        if (choice && choice.message && choice.message.content) {
            return choice.message.content.trim();
        }
    }

    // If we get here, the response format is unexpected
    throw new Error(`watsonx returned unexpected format. Response: ${JSON.stringify(data)}`);
}

function buildPrompt(analysis: BobAnalysisResult, audience: 'devs' | 'pms' | 'users'): { system: string; user: string } {
    const personas = {
        devs: `You are a technical writer creating changelog entries for software developers. Be precise and code-level. Mention affected modules, breaking changes, and technical impact. Keep it to 2-3 short paragraphs.`,

        pms: `You are a technical writer creating release summaries for product managers and stakeholders. Avoid jargon. Focus on what changed, why it matters, and any user-facing impact. Keep it to 2-3 short paragraphs.`,

        users: `You are a technical writer creating release notes for end users. Use plain English only. Focus on what improved or changed for them personally. Keep it to 1-2 short paragraphs.`,
    };

    const userPrompt = `Here is the change analysis:
- PR: ${analysis.pr_title}
- PR number: ${analysis.pr_number}
- Change types: ${analysis.change_types.join(', ')}
- Affected modules: ${analysis.affected_modules.join(', ')}
- Breaking changes: ${analysis.breaking_changes ? `Yes — ${analysis.breaking_change_details}` : 'None'}
- Technical summary: ${analysis.technical_summary}

Write the changelog section now. Return only the text, no headings, no labels.`;

    return {
        system: personas[audience],
        user: userPrompt,
    };
}

export async function generateChangelog(analysis: BobAnalysisResult, config: Config): Promise<ChangelogAudiences> {
    const token = await getIAMToken(config.watsonx.apiKey);

    // Build prompts for all three audiences
    const devsPrompt = buildPrompt(analysis, 'devs');
    const pmsPrompt = buildPrompt(analysis, 'pms');
    const usersPrompt = buildPrompt(analysis, 'users');

    // run all 3 generations in parallel
    const [devs, pms, users] = await Promise.all([
        generate(token, devsPrompt.system, devsPrompt.user, config.watsonx.url, config.watsonx.projectId),
        generate(token, pmsPrompt.system, pmsPrompt.user, config.watsonx.url, config.watsonx.projectId),
        generate(token, usersPrompt.system, usersPrompt.user, config.watsonx.url, config.watsonx.projectId),
    ]);

    return { devs, pms, users };
}