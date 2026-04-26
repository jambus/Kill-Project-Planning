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

  // Add an explicit priority index to ensure AI understands the order
  const projectsWithPriority = projects.map((p, index) => ({
    ...p,
    priorityOrder: index + 1 // 1 is highest priority
  }));

  const prompt = `
You are an expert AI Project Resource Scheduler. 
Your goal is to create a Realistic and Precise resource plan for the year ${year}.

### Input Data
1. **Available Resources**: ${JSON.stringify(resources)}
2. **Projects to Schedule**: 
${JSON.stringify(projectsWithPriority)}

### Scheduling Rules (CRITICAL)
1. **STRICT PRIORITY ORDER**: Projects are provided in order of priority. The "priorityOrder" field (1 = Highest) represents this. You MUST allocate resources to projects with lower "priorityOrder" first.
2. **Role Responsibility Matrix**:
   - **前端工程师**, **后端工程师**, **APP工程师**: Responsible for "devTotalMd".
   - **测试工程师**: Responsible for "testTotalMd".
   - **全栈工程师**: Can handle BOTH "devTotalMd" and "testTotalMd", but prioritize "devTotalMd" if developers are short.
3. **Duration vs MD Constraint**: For each allocation, (Working Days between startDate/endDate) * (allocationPercentage / 100) MUST roughly equal the project's MD requirement.
   - *Example*: 10 MD at 100% = 10 working days duration.
4. **Resource Capacity**: A resource's total "allocationPercentage" across ALL projects at any given date range must not exceed 100%.
5. **Dates**: All dates must be in "${year}-MM-DD" format.
6. **No Overlapping for same task**: Do not assign multiple people to the exact same MD unless the task is large (>20 MD).

### Output Format
Return ONLY a valid JSON array of objects. No markdown, no conversational text.
JSON Schema:
[
  {
    "resourceId": number,
    "projectId": number,
    "allocationPercentage": number,
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "reason": "Explain why this duration was chosen based on the specific role (Dev or Test) and the priorityOrder"
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
        { role: 'system', content: "You are a precise resource planning assistant. Strict adherence to the provided priorityOrder and accurate mapping of roles (前端/后端/APP/全栈/测试) to MD types (devTotalMd/testTotalMd) are your top priorities." }, 
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
