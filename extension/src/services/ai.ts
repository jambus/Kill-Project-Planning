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
You are an expert AI Project Resource Scheduler. 
Goal: Precise resource plan for ${year} with INTEGER Man-Days.

### Input Data
1. **Available Resources**: ${JSON.stringify(resources)}
2. **Projects to Schedule**: ${JSON.stringify(projectsWithPriority)}

### Scheduling Rules (CRITICAL)
1. **STRICT PRIORITY ORDER**: Follow priorityOrder (1=Highest).
2. **INTEGER MAN-DAYS ONLY**: The result of (Working Days * allocationPercentage / 100) MUST be an INTEGER. No decimals like 0.5 or 1.2.
   - *Example*: 10 MD at 100% = 10 working days duration.
3. **Role Mapping**:
   - **前端工程师**, **后端工程师**, **APP工程师**: Use "devTotalMd".
   - **测试工程师**: Use "testTotalMd".
   - **全栈工程师**: Flexible.
4. **Duration vs MD Constraint**: Duration * Percentage / 100 MUST exactly match the project's MD requirement.
5. **Resource Capacity**: Max 100% per resource at any date.
6. **Dates**: "${year}-MM-DD" format.

### Output Format
Return ONLY a valid JSON array of objects.
JSON Schema:
[
  {
    "resourceId": number,
    "projectId": number,
    "allocationPercentage": number,
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "reason": "Explain how this duration results in an INTEGER Man-Day value"
  }
]
`;

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
        { role: 'system', content: "You are a precise resource planning assistant. All Man-Day calculations MUST result in integers (1, 2, 3...). No decimals allowed." }, 
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API Error: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  const rawContent = data.choices[0].message.content.trim();
  
  try {
    const cleanContent = rawContent.replace(/^```json/, '').replace(/```$/, '').trim();
    const allocations = JSON.parse(cleanContent) as Partial<Allocation>[];
    return allocations;
  } catch (err) {
    console.error('Failed to parse AI response:', rawContent);
    throw new Error('AI returned an invalid JSON format.');
  }
};
