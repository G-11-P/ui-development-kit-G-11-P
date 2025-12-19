import { UpdateEnvironmentRequest } from "./authentication/config";
import { FilterConfig, ColabCategory } from "./discourse/discourse";
import { GitHubReleaseArtifactResponse } from "./github/github";
import { ConnectorDeploymentResponse } from "./connector/connector";

const { contextBridge, ipcRenderer: ipcMain } = require('electron');
const sdkPreloader = require('./sailpoint-sdk/sdk-preload');

contextBridge.exposeInMainWorld('electronAPI', {
  // Unified authentication and connection
  unifiedLogin: (environment: string) => ipcMain.invoke('unified-login', environment),
  disconnectFromISC: () => ipcMain.invoke('disconnect-from-isc'),
  checkAccessTokenStatus: () => ipcMain.invoke('check-access-token-status'),
  getCurrentTokenDetails: (environment: string) => ipcMain.invoke('get-current-token-details', environment),
  // Token management
  refreshTokens: () => ipcMain.invoke('refresh-tokens'),
  validateTokens: (environment: string) => ipcMain.invoke('validate-tokens', environment),
  checkOauthCodeFlowComplete: (uuid: string, environment: string) => ipcMain.invoke('check-oauth-code-flow-complete', uuid, environment),

  // Environment management
  getTenants: () => ipcMain.invoke('get-tenants'),
  updateEnvironment: (config: UpdateEnvironmentRequest) => ipcMain.invoke('update-environment', config),
  deleteEnvironment: (environment: string) => ipcMain.invoke('delete-environment', environment),
  setActiveEnvironment: (environment: string) => ipcMain.invoke('set-active-environment', environment),
  
  // config file management
  readConfig: () => ipcMain.invoke('read-config'),
  writeConfig: (config: any) => ipcMain.invoke('write-config', config),
  
  // file browser
  browseForFile: () => ipcMain.invoke('browse-for-file'),

  // Discourse/CoLab marketplace
  getColabPosts: (filter: FilterConfig, limit?: number) => ipcMain.invoke('get-colab-posts', filter, limit),
  getColabPostsByCategory: (category: ColabCategory, limit?: number) => ipcMain.invoke('get-colab-posts-by-category', category, limit),
  getColabTopicRaw: (topicId: number) => ipcMain.invoke('get-colab-topic-raw', topicId),
  getColabTopic: (topicId: number) => ipcMain.invoke('get-colab-topic', topicId),
  getDiscourseUserTitle: (primaryGroupName: string) => ipcMain.invoke('get-discourse-user-title', primaryGroupName),

  // GitHub operations
  getGitHubReleaseArtifact: (githubRepoUrl: string) => ipcMain.invoke('get-github-release-artifact', githubRepoUrl),
  listGitHubJsonFiles: (githubRepoUrl: string) => ipcMain.invoke('list-github-json-files', githubRepoUrl),
  getGitHubFileContent: (downloadUrl: string, filename: string) => ipcMain.invoke('get-github-file-content', downloadUrl, filename),

  // Connector deployment
  uploadConnector: (githubRepoUrl: string, connectorAlias?: string) => ipcMain.invoke('upload-connector', githubRepoUrl, connectorAlias),

  // SDK functions
  ...sdkPreloader,
});
