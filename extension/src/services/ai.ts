import { getStorageItem } from '../utils/storage';

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

const extractJsonArray = (text: string): any[] => {
  try {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1) return [];
    return JSON.parse(text.substring(start, end + 1));
  } catch (err) {
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
      messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: prompt }],
      temperature: 0.1, // Keep it low for math/logic
    })
  });
  if (!response.ok) throw new Error(`AI API Error: ${response.status}`);
  const data = await response.json();
  return extractJsonArray(data.choices[0].message.content.trim());
};

export interface AIMicroAllocation {
  resourceId: number;
  targetGap: 'dev' | 'test';
  allocatedMd: number;
  allocationPercentage: number;
  reason: string;
}

/**
 * Step-by-Step Micro Scheduling: Suggest allocations for a SINGLE project.
 */
export const suggestAllocationForProject = async (
  project: { id: number; name: string; devGap: number; testGap: number },
  idleResources: { id: number; name: string; role: string; idleMd: number; skills: string[] }[]
): Promise<AIMicroAllocation[]> => {
  const settings = await getAISettings();
  if (!settings) throw new Error('AI API Key is not configured.');

  const prompt = `
We are scheduling ONE project. 
Project Name: ${project.name}
Needs: ${project.devGap} Dev MDs (devGap), ${project.testGap} Test MDs (testGap).

Candidate Resources (with remaining idle capacity):
${JSON.stringify(idleResources)}

YOUR TASK:
Match the best resources to fulfill the project's devGap and testGap.
Rules:
1. DO NOT assign more MDs than the project needs.
2. DO NOT assign more MDs than a resource's "idleMd".
3. Role matching:
   - 前端/后端/APP/全栈工程师 -> devGap ONLY (they NEVER do testing).
   - 测试工程师 -> testGap ONLY.
4. Provide the "allocatedMd" (must be an integer >= 1) and "allocationPercentage" (usually 100, but can be 50 if they are multitasking).

Return ONLY a JSON Array with this exact format:
[{"resourceId": 1, "targetGap": "dev", "allocatedMd": 5, "allocationPercentage": 100, "reason": "Best fit for dev task"}]
`;

  return await callAI(
    "You are a strict resource allocation algorithm. You only output valid JSON arrays. You never over-allocate.", 
    prompt, 
    settings
  );
};
