import { getStorageItem } from '../utils/storage';
import type { Resource, Project, Allocation } from '../db';

export interface AISettings {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export const getAISettings = async (): Promise<AISettings | null> => {
  const apiKey = await getStorageItem<string>('openAiApiKey');
  const model = await getStorageItem<string>('openAiModel') || 'gpt-4o-mini';
  const baseUrl = await getStorageItem<string>('openAiBaseUrl') || 'https://api.openai.com/v1';
  
  if (!apiKey) return null;
  return { apiKey, model, baseUrl };
};

/**
 * Robust JSON extraction from AI response
 */
const extractJsonArray = (text: string): any[] => {
  try {
    // Attempt to find the first '[' and last ']'
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1) {
      console.error('[AI Parser] No JSON array found in text:', text);
      return [];
    }
    const jsonStr = text.substring(start, end + 1);
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error('[AI Parser] JSON parse error:', err, 'Raw text:', text);
    return [];
  }
};

const callAI = async (systemMsg: string, prompt: string, settings: AISettings) => {
  const url = `${settings.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: 'system', content: systemMsg }, 
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`AI API Error: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  const rawContent = data.choices[0].message.content.trim();
  console.log('[AI Service] 📥 Raw content received:', rawContent);
  
  return extractJsonArray(rawContent);
};

/**
 * Phase 1: Draft the initial global schedule
 */
export const draftInitialSchedule = async (
  resources: Resource[],
  projects: Project[],
  year: number
): Promise<Partial<Allocation>[]> => {
  const settings = await getAISettings();
  if (!settings) throw new Error('AI API Key is not configured.');

  const prompt = `
Generate a resource plan for the year ${year}.
Resources: ${JSON.stringify(resources)}
Projects: ${JSON.stringify(projects.map((p, i) => ({ ...p, priorityOrder: i + 1 })))}

Rules:
1. Every allocation MUST result in at least 1 Man-Day (Working Days * % / 100 >= 1).
2. Use "resourceId" and "projectId".
3. "startDate" and "endDate" format: YYYY-MM-DD.

Return JSON Array:
[{"resourceId": 1, "projectId": 1, "allocationPercentage": 100, "startDate": "2026-04-01", "endDate": "2026-04-14", "reason": "..."}]
`;

  console.log('[AI Phase 1] Starting initial draft pass...');
  return await callAI(
    "You are an expert scheduler. Return ONLY a JSON array of project allocations.",
    prompt,
    settings
  );
};

/**
 * Phase 2: Refine specific gaps
 */
export const refineGaps = async (
  gaps: any[], 
  idleResources: any[],
  year: number
): Promise<Partial<Allocation>[]> => {
  const settings = await getAISettings();
  if (!settings) throw new Error('AI API Key is not configured.');

  const prompt = `
GAP FILLING. Use idle capacity to satisfy remaining MD.
Year: ${year}
Remaining Gaps: ${JSON.stringify(gaps)}
Idle Resources: ${JSON.stringify(idleResources)}

Goal: Return NEW allocations (at least 1 MD each) to fill the gaps.
Return JSON Array only.
`;

  console.log('[AI Phase 2] Starting refinement pass...');
  return await callAI(
    "You are a gap-filling specialist. Focus purely on using idle resources to reduce remaining project gaps.",
    prompt,
    settings
  );
};
