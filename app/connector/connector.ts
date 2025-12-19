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
 */
export async function uploadConnector(
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

