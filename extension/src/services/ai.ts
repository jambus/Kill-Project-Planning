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
 * Generate a schedule using AI (OpenAI compatible)
 */
export const generateSchedule = async (
  resources: Resource[],
  projects: Project[],
  year: number
): Promise<Partial<Allocation>[]> => {
  const settings = await getAISettings();
  if (!settings) {
    throw new Error('AI API Key is not configured. Please set it in Options.');
  }

  const projectsWithPriority = projects.map((p, index) => ({
    ...p,
    priorityOrder: index + 1
  }));

  const prompt = `
You are an expert Project Resource Optimizer. 
Goal: Fully satisfy project Man-Day (MD) requirements for the year ${year} with ZERO idle time.

### Input Data
1. **Resources**: ${JSON.stringify(resources)}
2. **Projects**: ${JSON.stringify(projectsWithPriority)}

### Scheduling Rules (STRICT)
1. **ROLE RESPONSIBILITY MATRIX**:
   - **开发人员 (Developers)**: Includes "前端工程师", "后端工程师", "APP工程师", and **"全栈工程师"**. They are responsible for satisfying **"devTotalMd"**.
   - **全栈工程师 (Fullstack)**: Specifically, they are developers who can handle ANY frontend or backend tasks within the "devTotalMd" scope.
   - **测试人员 (Testers)**: "测试工程师" is responsible for **"testTotalMd"**.
   - **Flexibility**: If "devTotalMd" is fully satisfied but "testTotalMd" has gaps, "全栈工程师" can optionally assist with testing if they have capacity.
2. **MAXIMIZE FULFILLMENT**: Sum of allocated MD must match Project MD. Start from priorityOrder 1.
3. **EXHAUST CAPACITY**: Use all available capacity (up to 100%) of relevant roles to fill MD gaps.
4. **INTEGER MAN-DAYS ONLY**: (Working Days * allocationPercentage / 100) MUST be an INTEGER.
5. **Timeline**: All dates in "${year}-MM-DD". 

### Output Format
Return ONLY a valid JSON array.
JSON Schema:
[
  {
    "resourceId": number,
    "projectId": number,
    "allocationPercentage": number,
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "reason": "Explain how this role (especially Fullstack) was used to fill the MD gap."
  }
]
`;

  console.log('[AI Service] 🚀 Preparing request for year:', year);
  console.log('[AI Service] 📦 Input Resources Count:', resources.length);
  console.log('[AI Service] 📦 Input Projects Count:', projects.length);

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
        { 
          role: 'system', 
          content: "You are a precise resource optimizer. Fullstack Engineers (全栈工程师) are primarily Developers (开发) and must be prioritized for devTotalMd tasks. Accuracy in integer MD calculation is mandatory." 
        }, 
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[AI Service] ❌ API Error:', response.status, errorBody);
    throw new Error(`OpenAI API Error: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  const rawContent = data.choices[0].message.content.trim();
  
  console.log('[AI Service] 📥 Raw AI Response Content:', rawContent);

  try {
    const cleanContent = rawContent.replace(/^```json/, '').replace(/```$/, '').trim();
    const allocations = JSON.parse(cleanContent) as Partial<Allocation>[];
    console.log('[AI Service] ✅ Successfully parsed allocations:', allocations);
    return allocations;
  } catch (err) {
    console.error('[AI Service] ❌ Failed to parse AI response:', rawContent);
    throw new Error('AI returned an invalid JSON format.');
  }
};
