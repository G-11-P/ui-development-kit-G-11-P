/**
 * GitHub API Integration for CoLab Deployment
 * 
 * This module handles fetching GitHub release information and artifacts
 * for deploying CoLab items (SaaS Connectors, Workflows, etc.)
 */

export interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  content_type: string;
  size: number;
}

export interface GitHubRelease {
  tag_name: string;
  name: string;
  assets: GitHubReleaseAsset[];
  published_at: string;
}

export interface GitHubReleaseArtifactResponse {
  success: boolean;
  downloadUrl?: string;
  filename?: string;
  tagName?: string;
  error?: string;
}

/**
 * Extract owner and repo from GitHub URL
 * Examples:
 * - https://github.com/sailpoint-oss/colab-saas-conn-genetec-clearid -> { owner: 'sailpoint-oss', repo: 'colab-saas-conn-genetec-clearid' }
 * - github.com/user/repo -> { owner: 'user', repo: 'repo' }
 */
function parseGitHubUrl(githubUrl: string): { owner: string; repo: string } | null {
  try {
    // Remove trailing slash and normalize
    const normalized = githubUrl.trim().replace(/\/$/, '');
    
    // Match GitHub URL patterns
    const patterns = [
      /github\.com\/([^\/]+)\/([^\/]+)/i,
      /^([^\/]+)\/([^\/]+)$/ // For owner/repo format
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match && match[1] && match[2]) {
        return {
          owner: match[1],
          repo: match[2].replace(/\.git$/, '') // Remove .git suffix if present
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error parsing GitHub URL:', error);
    return null;
  }
}

/**
 * Get the latest release from a GitHub repository and find the .zip artifact
 */
export async function getGitHubReleaseArtifact(
  githubRepoUrl: string
): Promise<GitHubReleaseArtifactResponse> {
  try {
    // Parse the GitHub URL to get owner and repo
    const parsed = parseGitHubUrl(githubRepoUrl);
    if (!parsed) {
      return {
        success: false,
        error: `Invalid GitHub repository URL: ${githubRepoUrl}`
      };
    }

    const { owner, repo } = parsed;

    // Fetch the latest release from GitHub API
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    console.log(`Fetching latest release from: ${apiUrl}`);

    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'SailPoint-UI-Development-Kit'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          error: `No releases found for repository ${owner}/${repo}`
        };
      }
      throw new Error(`GitHub API returned status ${response.status}: ${response.statusText}`);
    }

    const release: GitHubRelease = await response.json();

    if (!release.assets || release.assets.length === 0) {
      return {
        success: false,
        error: `No assets found in release ${release.tag_name}`
      };
    }

    // Find the .zip file in the release assets
    const zipAsset = release.assets.find(asset => 
      asset.name.toLowerCase().endsWith('.zip')
    );

    if (!zipAsset) {
      return {
        success: false,
        error: `No .zip file found in release ${release.tag_name}. Available assets: ${release.assets.map(a => a.name).join(', ')}`
      };
    }

    console.log(`Found release artifact: ${zipAsset.name} (${zipAsset.size} bytes)`);

    return {
      success: true,
      downloadUrl: zipAsset.browser_download_url,
      filename: zipAsset.name,
      tagName: release.tag_name
    };
  } catch (error) {
    console.error('Error fetching GitHub release artifact:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error fetching GitHub release'
    };
  }
}

export interface GitHubRepoFile {
  name: string;
  path: string;
  type: 'file' | 'dir';
  download_url: string | null;
  size: number;
}

export interface GitHubFilesResponse {
  success: boolean;
  files?: GitHubRepoFile[];
  error?: string;
}

export interface GitHubFileContentResponse {
  success: boolean;
  content?: string;
  filename?: string;
  error?: string;
}

/**
 * List all JSON files in a GitHub repository
 * Supports both root directory and subdirectory paths
 * @param githubRepoUrl - Can be:
 *   - https://github.com/owner/repo
 *   - https://github.com/owner/repo/tree/branch/path/to/dir
 */
export async function listGitHubJsonFiles(githubRepoUrl: string): Promise<GitHubFilesResponse> {
  try {
    // Parse the URL to extract owner, repo, and path
    const urlMatch = githubRepoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\/tree\/[^\/]+\/(.+))?/);
    
    if (!urlMatch) {
      return {
        success: false,
        error: 'Invalid GitHub repository URL format'
      };
    }

    const owner = urlMatch[1];
    const repo = urlMatch[2].replace(/\.git$/, ''); // Remove .git suffix if present
    const dirPath = urlMatch[3] || ''; // Optional directory path

    console.log(`Listing contents of ${owner}/${repo}${dirPath ? `/${dirPath}` : ''}`);

    // GitHub API endpoint to get repository contents
    const apiUrl = dirPath 
      ? `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}`
      : `https://api.github.com/repos/${owner}/${repo}/contents`;

    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'SailPoint-UI-Development-Kit'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API returned status ${response.status}: ${response.statusText}`);
    }

    const contents: GitHubRepoFile[] = await response.json();

    // Filter for JSON files only
    const jsonFiles = contents.filter(file => 
      file.type === 'file' && file.name.endsWith('.json')
    );

    console.log(`Found ${jsonFiles.length} JSON files in ${dirPath || 'root directory'}`);

    return {
      success: true,
      files: jsonFiles
    };
  } catch (error) {
    console.error('Error listing GitHub repository files:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error listing repository files'
    };
  }
}

/**
 * Get the content of a file from GitHub
 */
export async function getGitHubFileContent(downloadUrl: string, filename: string): Promise<GitHubFileContentResponse> {
  try {
    console.log(`Fetching content from: ${downloadUrl}`);

    const response = await fetch(downloadUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3.raw',
        'User-Agent': 'SailPoint-UI-Development-Kit'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch file content: ${response.status} ${response.statusText}`);
    }

    const content = await response.text();

    console.log(`Successfully fetched ${filename} (${content.length} bytes)`);

    return {
      success: true,
      content,
      filename
    };
  } catch (error) {
    console.error('Error fetching GitHub file content:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error fetching file content'
    };
  }
}

