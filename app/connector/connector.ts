/**
 * Connector Deployment API Integration
 * 
 * This module handles creating and uploading SaaS Connectors to Identity Security Cloud
 * using the same API endpoints as the SailPoint CLI
 */

import { getConfigEnvironment, getConfig } from '../authentication/config';
import { getStoredOAuthTokens } from '../authentication/oauth';
import { getStoredPATTokens } from '../authentication/pat';
import { getActiveEnvironment } from '../authentication/auth';
import { getGitHubReleaseArtifact } from '../github/github';

export interface CreateConnectorRequest {
  alias: string;
}

export interface CreateConnectorResponse {
  id: string;
  alias: string;
  [key: string]: any;
}

export interface UploadConnectorResponse {
  version: number;
  [key: string]: any;
}

export interface ConnectorDeploymentResponse {
  success: boolean;
  connectorId?: string;
  version?: number;
  error?: string;
}

/**
 * Upload a connector from a GitHub repository URL
 * This function handles the complete deployment flow:
 * 1. Fetches the latest release artifact from GitHub
 * 2. Downloads the zip file
 * 3. Creates the connector
 * 4. Uploads the connector zip file
 */
export async function uploadConnectorFromGitHub(
  githubRepoUrl: string,
  connectorAlias?: string
): Promise<ConnectorDeploymentResponse> {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  let tempFilePath: string | null = null;

  try {
    // Get the active environment that was set during login
    const environment = getActiveEnvironment();
    if (!environment) {
      return {
        success: false,
        error: 'No active environment found. Please log in to an environment first.'
      };
    }

    // Step 1: Fetch the latest release artifact from GitHub
    console.log(`Fetching release artifact from GitHub: ${githubRepoUrl}`);
    const artifactResponse = await getGitHubReleaseArtifact(githubRepoUrl);
    
    if (!artifactResponse.success || !artifactResponse.downloadUrl) {
      return {
        success: false,
        error: artifactResponse.error || 'Failed to fetch GitHub release artifact'
      };
    }

    console.log(`Found release artifact: ${artifactResponse.filename} (${artifactResponse.tagName})`);

    // Step 2: Download the zip file to a temporary location
    if (!artifactResponse.downloadUrl) {
      return {
        success: false,
        error: 'No download URL found in release artifact'
      };
    }

    const tempDir = os.tmpdir();
    tempFilePath = path.join(tempDir, artifactResponse.filename || 'connector.zip');
    
    if (!tempFilePath) {
      return {
        success: false,
        error: 'Failed to generate temporary file path'
      };
    }
    
    console.log(`Downloading file from: ${artifactResponse.downloadUrl}`);
    const downloadResult = await downloadFile(artifactResponse.downloadUrl, tempFilePath);
    
    if (!downloadResult.success) {
      return {
        success: false,
        error: downloadResult.error || 'Failed to download connector artifact'
      };
    }

    // Step 3: Generate connector alias if not provided
    // Extract name from GitHub repo URL (e.g., "colab-saas-conn-genetec-clearid" -> "genetec-clearid")
    let alias = connectorAlias;
    if (!alias) {
      const repoMatch = githubRepoUrl.match(/github\.com\/[^\/]+\/([^\/]+)/i);
      if (repoMatch && repoMatch[1]) {
        // Remove common prefixes like "colab-saas-conn-" or "colab-"
        alias = repoMatch[1]
          .replace(/^colab-saas-conn-/, '')
          .replace(/^colab-/, '')
          .toLowerCase();
      } else {
        alias = 'connector';
      }
    }

    // Step 4: Create the connector
    console.log(`Creating connector "${alias}"...`);
    const createResult = await createConnector(alias);
    
    if (!createResult.success || !createResult.connectorId) {
      return {
        success: false,
        error: createResult.error || 'Failed to create connector'
      };
    }

    // Step 5: Upload the connector zip file
    if (!createResult.connectorId) {
      return {
        success: false,
        error: 'No connector ID returned from create operation'
      };
    }

    if (!tempFilePath) {
      return {
        success: false,
        error: 'Temporary file path is missing'
      };
    }

    console.log(`Uploading connector version...`);
    const uploadResult = await uploadConnector(createResult.connectorId, tempFilePath);

    // Clean up temporary file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log(`Cleaned up temporary file: ${tempFilePath}`);
      } catch (cleanupError) {
        console.warn('Failed to clean up temporary file:', cleanupError);
      }
    }

    if (!uploadResult.success) {
      return {
        success: false,
        error: uploadResult.error || 'Failed to upload connector'
      };
    }

    return {
      success: true,
      connectorId: createResult.connectorId,
      version: uploadResult.version
    };
  } catch (error) {
    // Clean up temporary file on error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        console.warn('Failed to clean up temporary file after error:', cleanupError);
      }
    }

    console.error('Error uploading connector from GitHub:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error uploading connector'
    };
  }
}

/**
 * Get an existing connector by alias
 */
async function getConnectorByAlias(
  connectorAlias: string
): Promise<ConnectorDeploymentResponse> {
  try {
    // Get the active environment that was set during login
    const environment = getActiveEnvironment();
    if (!environment) {
      return {
        success: false,
        error: 'No active environment found. Please log in to an environment first.'
      };
    }

    // Get environment configuration
    const envConfig = getConfigEnvironment(environment);
    if (!envConfig.baseurl) {
      return {
        success: false,
        error: `Environment configuration not found for: ${environment}`
      };
    }

    // Get access token based on auth type
    let accessToken: string | undefined;
    if (envConfig.authtype === 'oauth') {
      const oauthTokens = getStoredOAuthTokens(environment);
      if (!oauthTokens || !oauthTokens.accessToken) {
        return {
          success: false,
          error: 'No OAuth tokens found. Please ensure you are authenticated.'
        };
      }
      accessToken = oauthTokens.accessToken;
    } else if (envConfig.authtype === 'pat') {
      const patTokens = getStoredPATTokens(environment);
      if (!patTokens || !patTokens.accessToken) {
        return {
          success: false,
          error: 'No PAT tokens found. Please ensure you are authenticated.'
        };
      }
      accessToken = patTokens.accessToken;
    } else {
      return {
        success: false,
        error: `Unknown authentication type: ${envConfig.authtype}`
      };
    }

    // Build the API URL
    const baseUrl = envConfig.baseurl;
    const apiUrl = `${baseUrl}/beta/platform-connectors/${encodeURIComponent(connectorAlias)}`;

    console.log(`Getting connector "${connectorAlias}" from environment ${environment}`);

    // Make the API call
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        success: false,
        error: `Failed to get connector. Status: ${response.status} ${response.statusText}. ${errorBody}`
      };
    }

    const connectorData: CreateConnectorResponse = await response.json();
    console.log(`Connector found: ${connectorData.id}`);

    return {
      success: true,
      connectorId: connectorData.id || connectorData.alias
    };
  } catch (error) {
    console.error('Error getting connector:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error getting connector'
    };
  }
}

/**
 * Create a new connector in the environment
 */
export async function createConnector(
  connectorAlias: string
): Promise<ConnectorDeploymentResponse> {
  try {
    // Get the active environment that was set during login
    const environment = getActiveEnvironment();
    if (!environment) {
      return {
        success: false,
        error: 'No active environment found. Please log in to an environment first.'
      };
    }

    // Get environment configuration
    const envConfig = getConfigEnvironment(environment);
    if (!envConfig.baseurl) {
      return {
        success: false,
        error: `Environment configuration not found for: ${environment}`
      };
    }

    // Get access token based on auth type
    let accessToken: string | undefined;
    if (envConfig.authtype === 'oauth') {
      const oauthTokens = getStoredOAuthTokens(environment);
      if (!oauthTokens || !oauthTokens.accessToken) {
        return {
          success: false,
          error: 'No OAuth tokens found. Please ensure you are authenticated.'
        };
      }
      accessToken = oauthTokens.accessToken;
    } else if (envConfig.authtype === 'pat') {
      const patTokens = getStoredPATTokens(environment);
      if (!patTokens || !patTokens.accessToken) {
        return {
          success: false,
          error: 'No PAT tokens found. Please ensure you are authenticated.'
        };
      }
      accessToken = patTokens.accessToken;
    } else {
      return {
        success: false,
        error: `Unknown authentication type: ${envConfig.authtype}`
      };
    }

    // Build the API URL
    const baseUrl = envConfig.baseurl;
    const apiUrl = `${baseUrl}/beta/platform-connectors`;

    // Create the request body
    const requestBody: CreateConnectorRequest = {
      alias: connectorAlias
    };

    console.log(`Creating connector "${connectorAlias}" in environment ${environment}`);

    // Make the API call
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      
      // Check if the error is because the connector already exists
      if (response.status === 400 && errorBody.includes('connector alias already exist')) {
        console.log(`Connector "${connectorAlias}" already exists. Fetching existing connector...`);
        
        // Get the existing connector by alias
        const existingConnector = await getConnectorByAlias(connectorAlias);
        
        if (existingConnector.success) {
          console.log(`Using existing connector: ${existingConnector.connectorId}`);
          return existingConnector;
        } else {
          return {
            success: false,
            error: `Connector already exists but failed to retrieve it: ${existingConnector.error}`
          };
        }
      }
      
      // For other errors, return the error
      return {
        success: false,
        error: `Failed to create connector. Status: ${response.status} ${response.statusText}. ${errorBody}`
      };
    }

    const connectorData: CreateConnectorResponse = await response.json();
    console.log(`Connector created successfully: ${connectorData.id}`);

    return {
      success: true,
      connectorId: connectorData.id || connectorData.alias
    };
  } catch (error) {
    console.error('Error creating connector:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error creating connector'
    };
  }
}

/**
 * Upload a connector zip file to the environment
 * (Internal function used by uploadConnectorFromGitHub)
 */
async function uploadConnector(
  connectorId: string,
  zipFilePath: string
): Promise<ConnectorDeploymentResponse> {
  try {
    // Get the active environment that was set during login
    const environment = getActiveEnvironment();
    if (!environment) {
      return {
        success: false,
        error: 'No active environment found. Please log in to an environment first.'
      };
    }

    // Get environment configuration
    const envConfig = getConfigEnvironment(environment);
    if (!envConfig.baseurl) {
      return {
        success: false,
        error: `Environment configuration not found for: ${environment}`
      };
    }

    // Get access token based on auth type
    let accessToken: string | undefined;
    if (envConfig.authtype === 'oauth') {
      const oauthTokens = getStoredOAuthTokens(environment);
      if (!oauthTokens || !oauthTokens.accessToken) {
        return {
          success: false,
          error: 'No OAuth tokens found. Please ensure you are authenticated.'
        };
      }
      accessToken = oauthTokens.accessToken;
    } else if (envConfig.authtype === 'pat') {
      const patTokens = getStoredPATTokens(environment);
      if (!patTokens || !patTokens.accessToken) {
        return {
          success: false,
          error: 'No PAT tokens found. Please ensure you are authenticated.'
        };
      }
      accessToken = patTokens.accessToken;
    } else {
      return {
        success: false,
        error: `Unknown authentication type: ${envConfig.authtype}`
      };
    }

    // Read the zip file
    const fs = require('fs');
    const zipFileBuffer = fs.readFileSync(zipFilePath);

    // Build the API URL
    const baseUrl = envConfig.baseurl;
    const apiUrl = `${baseUrl}/beta/platform-connectors/${connectorId}/versions`;

    console.log(`Uploading connector zip file to ${connectorId} in environment ${environment}`);

    // Make the API call
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/zip',
        'Authorization': `Bearer ${accessToken}`
      },
      body: zipFileBuffer
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        success: false,
        error: `Failed to upload connector. Status: ${response.status} ${response.statusText}. ${errorBody}`
      };
    }

    const versionData: UploadConnectorResponse = await response.json();
    console.log(`Connector uploaded successfully. Version: ${versionData.version}`);

    return {
      success: true,
      connectorId: connectorId,
      version: versionData.version
    };
  } catch (error) {
    console.error('Error uploading connector:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error uploading connector'
    };
  }
}

/**
 * Download a file from a URL and save it to a temporary location
 */
export async function downloadFile(
  url: string,
  outputPath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`Downloading file from: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      return {
        success: false,
        error: `Failed to download file. Status: ${response.status} ${response.statusText}`
      };
    }

    const fs = require('fs');
    const path = require('path');
    
    // Ensure the directory exists before writing the file
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`Created directory: ${outputDir}`);
    }

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(outputPath, Buffer.from(buffer));

    console.log(`File downloaded successfully to: ${outputPath}`);
    return { success: true };
  } catch (error) {
    console.error('Error downloading file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error downloading file'
    };
  }
}

