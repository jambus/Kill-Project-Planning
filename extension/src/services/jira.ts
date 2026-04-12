import { getStorageItem } from '../utils/storage';
import { db } from '../db';

interface JiraSettings {
  domain: string; // e.g., "https://your-domain.atlassian.net"
  email: string;
  apiToken: string;
}

export const getJiraSettings = async (): Promise<JiraSettings | null> => {
  const domain = await getStorageItem<string>('jiraDomain');
  const email = await getStorageItem<string>('jiraEmail');
  const apiToken = await getStorageItem<string>('jiraApiToken');

  if (!domain) return null;
  return { domain, email: email || '', apiToken: apiToken || '' };
};

const fetchFromJira = async (endpoint: string, settings: JiraSettings) => {
  const url = `${settings.domain.replace(/\/$/, '')}/rest/api/3/${endpoint}`;
  const headers: HeadersInit = {
    'Accept': 'application/json',
  };

  // Use Basic Auth if email and token are provided, otherwise rely on browser cookies
  if (settings.email && settings.apiToken) {
    headers['Authorization'] = `Basic ${btoa(`${settings.email}:${settings.apiToken}`)}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
};

/**
 * Fetch projects from Jira and sync them to the local database
 */
export const syncJiraProjects = async (): Promise<void> => {
  const settings = await getJiraSettings();
  if (!settings) throw new Error('Jira settings not configured.');

  try {
    const projectsData = await fetchFromJira('project/search?maxResults=50', settings);
    
    for (const p of projectsData.values) {
      const projectType = p.projectTypeKey === 'software' ? 'High' : 'Medium'; // naive priority logic
      
      const existing = await db.projects.where('jiraProjectId').equals(p.id).first();
      if (!existing) {
        await db.projects.add({
          jiraProjectId: p.id,
          jiraProjectKey: p.key,
          name: p.name,
          priority: projectType as any,
          startDate: new Date().toISOString().split('T')[0], // placeholder
          endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // placeholder +90 days
          status: 'To Do',
        });
      }
    }
    console.log(`Synced ${projectsData.values.length} projects from Jira.`);
  } catch (error) {
    console.error('Failed to sync Jira projects:', error);
    throw error;
  }
};

/**
 * Fetch active issues/worklogs (simplified for Phase 3)
 */
export const syncJiraIssues = async (projectKey: string): Promise<any> => {
  const settings = await getJiraSettings();
  if (!settings) throw new Error('Jira settings not configured.');

  const jql = `project = "${projectKey}" AND statusCategory != Done`;
  const data = await fetchFromJira(`search?jql=${encodeURIComponent(jql)}&fields=summary,status,assignee,timeoriginalestimate,timespent`, settings);
  return data.issues;
};
