import { getStorageItem } from '../utils/storage';

export interface AISettings {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export const DEFAULT_SCHEDULING_PROMPT = `YOUR TASK:
Match the best resources to fulfill the {{phase}} gaps for a BATCH of projects.
Rules:
1. DO NOT assign more MDs than a project needs.
2. DO NOT assign more MDs than a resource's "idleMd" across all projects they are assigned to.
3. {{skillRule}}
4. Phase rules:
   - If phase is 'dev', only assign Developers (前端/后端/APP/全栈).
   - If phase is 'test', only assign Testers (测试工程师). Testing can start as early as the same day as development, but MUST NOT start before development.
5. Provide the "allocatedMd" (must be an integer >= 1) and "allocationPercentage".
6. {{strategyInstruction}}

Return ONLY a JSON Array with this exact format (do not wrap in markdown blocks, just raw JSON):
[{"projectId": 1, "resourceId": 1, "targetGap": "{{phase}}", "allocatedMd": 5, "allocationPercentage": 100, "reason": "Reason..."}]`;

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
      temperature: 0.05,
    })
  });
  if (!response.ok) throw new Error(`AI API Error: ${response.status}`);
  const data = await response.json();
  return extractJsonArray(data.choices[0].message.content.trim());
};

export interface AIMicroAllocation {
  projectId?: number;
  resourceId: number;
  targetGap: 'dev' | 'test';
  allocatedMd: number;
  allocationPercentage: number;
  reason: string;
}

export type SchedulingStrategy = 'balanced' | 'focused' | 'urgent';

/**
 * Batch Scheduling with Adaptive Matching (Strict vs Relaxed)
 */
export const suggestAllocationsForBatch = async (
  projects: { id: number; name: string; gap: number; techStack?: string; domain?: string; startDate?: string; endDate?: string }[],
  idleResources: { id: number; name: string; role: string; idleMd: number; skills: string[] }[],
  phase: 'dev' | 'test',
  strategy: SchedulingStrategy = 'focused',
  isRelaxed: boolean = false
): Promise<AIMicroAllocation[]> => {
  const settings = await getAISettings();
  if (!settings) throw new Error('AI API Key is not configured.');

  let strategyInstruction = '';
  if (strategy === 'balanced') {
    strategyInstruction = 'BALANCED: Prefer 50% allocation for multitasking.';
  } else if (strategy === 'urgent') {
    strategyInstruction = 'URGENT: Maximize allocation to finish faster.';
  } else {
    strategyInstruction = 'FOCUSED: Prefer 100% allocation.';
  }

  // Adaptive Matching Logic
  const skillRule = isRelaxed 
    ? 'RELAXED MATCHING: IGNORE "skills" labels. Your ONLY priority is to use ALL idleMd to fill ALL gaps. Any resource with matching role can do any project task.' 
    : 'STRICT MATCHING: Prioritize resources whose "skills" match the project Tech Stack/Domain.';

  const customPromptTemplate = await getStorageItem<string>('aiPromptTemplate') || DEFAULT_SCHEDULING_PROMPT;
  const resolvedPromptRules = customPromptTemplate
    .replace(/\{\{phase\}\}/g, phase)
    .replace(/\{\{strategyInstruction\}\}/g, strategyInstruction)
    .replace(/\{\{skillRule\}\}/g, skillRule);

  const systemMsg = `You are an expert resource allocation optimizer.
Mode: ${isRelaxed ? 'MAX UTILIZATION (Greedy)' : 'PRECISION MATCHING'}.
  
Candidate Resources:
${JSON.stringify(idleResources)}

${resolvedPromptRules}`;

  const prompt = `Batch of ${projects.length} projects for ${phase.toUpperCase()}.
Projects:
${JSON.stringify(projects)}
Return ONLY a JSON Array.`;

  return await callAI(systemMsg, prompt, settings);
};
