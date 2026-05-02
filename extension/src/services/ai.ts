import { getStorageItem } from '../utils/storage';

export interface AISettings {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export const DEFAULT_SCHEDULING_PROMPT = `YOUR TASK:
Match the best resources to fulfill the {{phase}} gaps for a BATCH of projects.

CRITICAL INSTRUCTIONS:
1. MAXIMIZE UTILIZATION: You MUST allocate ALL available "idleMd" across ALL candidate resources. 
2. NO WASTE: Leaving a resource with idleMd > 0 when projects still have gaps is a FAILURE. 
3. GREEDY MATCHING: If a resource has 20 idleMd and a project only needs 5, find other projects to fill the remaining 15. 
4. {{skillRule}}
5. Phase rules:
   - If phase is 'dev', only assign Developers (前端/后端/APP/全栈).
   - If phase is 'test', only assign Testers (测试工程师). Testing can start as early as the same day as development, but MUST NOT start before development.
6. Provide "allocatedMd" (integer >= 1) and "allocationPercentage".
7. {{strategyInstruction}}

Return ONLY a JSON Array with this exact format (do not wrap in markdown blocks, raw JSON only):
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
 * Enhanced Batch Scheduling with Calendar Awareness & Greedy Logic
 */
export const suggestAllocationsForBatch = async (
  projects: { id: number; name: string; gap: number; techStack?: string; domain?: string; startDate?: string; endDate?: string }[],
  idleResources: { id: number; name: string; role: string; idleMd: number; skills: string[]; scheduleSummary?: string }[],
  phase: 'dev' | 'test',
  strategy: SchedulingStrategy = 'focused',
  isRelaxed: boolean = false
): Promise<AIMicroAllocation[]> => {
  const settings = await getAISettings();
  if (!settings) throw new Error('AI API Key is not configured.');

  let strategyInstruction = '';
  if (strategy === 'balanced') {
    strategyInstruction = 'BALANCED MODE: You MUST prefer 50% allocation to allow resources to work on multiple projects concurrently.';
  } else if (strategy === 'urgent') {
    strategyInstruction = 'URGENT MODE: Prioritize 100% allocation to finish projects as early as possible.';
  } else {
    strategyInstruction = 'FOCUSED MODE: Prefer 100% allocation for one project at a time.';
  }

  const skillRule = isRelaxed 
    ? 'RELAXED MATCHING: IGNORE skills. Any resource with matching role can do any task.' 
    : 'STRICT MATCHING: Match skills to project Tech Stack/Domain first.';

  const customPromptTemplate = await getStorageItem<string>('aiPromptTemplate') || DEFAULT_SCHEDULING_PROMPT;
  const resolvedPromptRules = customPromptTemplate
    .replace(/\{\{phase\}\}/g, phase)
    .replace(/\{\{strategyInstruction\}\}/g, strategyInstruction)
    .replace(/\{\{skillRule\}\}/g, skillRule);

  const systemMsg = `You are an expert resource allocation optimizer.
Mode: ${isRelaxed ? 'MAX UTILIZATION' : 'PRECISION MATCHING'}.
  
Candidate Resources (Aware of their current busy/idle periods):
${JSON.stringify(idleResources)}

${resolvedPromptRules}`;

  const prompt = `Batch of ${projects.length} projects for ${phase.toUpperCase()}.
Projects to fulfill:
${JSON.stringify(projects)}
Return ONLY a JSON Array.`;

  return await callAI(systemMsg, prompt, settings);
};
