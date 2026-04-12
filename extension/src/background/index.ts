import { syncJiraProjects } from '../services/jira';

console.log('Background service worker started.');

// Set up periodic sync alarm
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed. Setting up alarms...');
  chrome.alarms.create('jira-sync-alarm', {
    periodInMinutes: 60 // Sync every hour
  });
});

// Listen for alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'jira-sync-alarm') {
    console.log('Triggering scheduled Jira Sync...');
    syncJiraProjects().catch(err => {
      console.error('Scheduled Jira sync failed (might not be configured yet):', err);
    });
  }
});
