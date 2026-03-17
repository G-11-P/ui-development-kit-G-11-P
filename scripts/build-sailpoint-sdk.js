#!/usr/bin/env node

/**
 * Script to automate the SailPoint SDK build process
 * Based on instructions from README.md
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { createWriteStream } = require('fs');

// Configuration
const OPENAPI_GENERATOR_VERSION = '7.11.0';
const OPENAPI_GENERATOR_JAR = `openapi-generator-cli-${OPENAPI_GENERATOR_VERSION}.jar`;
const OPENAPI_GENERATOR_URL = `https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/${OPENAPI_GENERATOR_VERSION}/${OPENAPI_GENERATOR_JAR}`;
const API_SPECS_REPO = 'https://github.com/sailpoint-oss/api-specs.git';
const API_SPECS_DIR = 'api-specs';

// Function to download a file
function downloadFile(url, outputPath) {
  console.log(`Downloading ${url} to ${outputPath}...`);
  
  return new Promise((resolve, reject) => {
    // Check if the file already exists
    if (fs.existsSync(outputPath)) {
      console.log(`File ${outputPath} already exists, skipping download.`);
      return resolve(outputPath);
    }

    const file = createWriteStream(outputPath);
    
    https.get(url, (response) => {
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded ${outputPath} successfully.`);
        resolve(outputPath);
      });
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {});
      console.error(`Error downloading ${url}: ${err.message}`);
      reject(err);
    });
  });
}

// Function to execute shell commands
function executeCommand(command) {
  console.log(`Executing: ${command}`);
  try {
    execSync(command, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Command failed: ${command}`);
    console.error(error);
    process.exit(1);
  }
}

// Main function to build the SDK
async function buildSdk() {
  try {
    // Create necessary directories if they don't exist
    if (!fs.existsSync('./temp')) {
      fs.mkdirSync('./temp');
    }

    // Step 1: Download OpenAPI Generator CLI
    const jarPath = path.join('./temp', OPENAPI_GENERATOR_JAR);
    await downloadFile(OPENAPI_GENERATOR_URL, jarPath);

    // Step 2: Clone API specifications if they don't exist
    if (!fs.existsSync(API_SPECS_DIR)) {
      executeCommand(`git clone ${API_SPECS_REPO}`);
    } else {
      // Reset and update API specs repository if it exists
      console.log(`Resetting and updating ${API_SPECS_DIR} repository...`);
      executeCommand(`cd ${API_SPECS_DIR} && git reset --hard && git clean -fd && git pull origin main`);
    }

    // Step 3: Use SDK version and release date to get matching API specs
    console.log('Determining compatible API specs for current SDK version...');
    try {
      // Get the current version from package.json
      const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
      const currentVersion = packageJson.dependencies['sailpoint-api-client'];
      
      console.log(`Current sailpoint-api-client version: ${currentVersion}`);
      
      // Get release date of the current version
      const timeInfo = JSON.parse(execSync(`npm view sailpoint-api-client@${currentVersion} time --json`).toString().trim());
      const releaseDate = timeInfo[currentVersion];
      const releaseDateTime = new Date(releaseDate);
      console.log(`SDK release date: ${releaseDate}`);
      
      // Update API specs to the appropriate commit based on date
      console.log('Finding API specs commit that matches SDK release date...');
      
      // Save current directory
      const currentDir = process.cwd();
      
      // Navigate to API specs directory
      process.chdir(API_SPECS_DIR);
      
      // Find the closest commit before the SDK release date
      const gitLogCommand = 'git log --format="%H %cI" --date=iso-strict';
      const commits = execSync(gitLogCommand).toString().trim().split('\n');
      
      let matchingCommit = null;
      
      for (const commit of commits) {
        const [hash, dateStr] = commit.split(' ');
        const commitDate = new Date(dateStr);
        
        // Find the most recent commit that's before or equal to the SDK release date
        if (commitDate <= releaseDateTime) {
          matchingCommit = hash;
          console.log(`Found matching commit: ${hash} (${dateStr})`);
          break;
        }
      }
      
      // If we found a matching commit, checkout that specific commit
      if (matchingCommit) {
        console.log(`Checking out API specs at commit: ${matchingCommit}`);
        execSync(`git checkout ${matchingCommit}`, { stdio: 'inherit' });
      } else {
        console.log('No matching commit found. Using latest API specs.');
      }
      
      // Return to original directory
      process.chdir(currentDir);
      
    } catch (error) {
      console.warn('Failed to match API specs with SDK version:', error.message);
      console.warn('Continuing with current API specs...');
    }

    // Step 4: Run pre-script to prepare the specifications
    executeCommand(`node ./mustache_templates/prescript.js ${API_SPECS_DIR}/idn/v2025/paths`);

    // Step 5: Generate the SDK
    executeCommand(`java -jar ${jarPath} generate -i ${API_SPECS_DIR}/idn/sailpoint-api.v2025.yaml -g typescript-axios --global-property skipFormModel=false --config generator-config.yaml --api-name-suffix V2025Api --model-name-suffix V2025`);

    // Step 6: Apply targeted patches that cannot be expressed in Mustache templates
    // (multipart Content-Type fix for importSpConfig; fetch-based override for
    // createUploadedConfiguration to handle Electron IPC Blob serialisation).
    executeCommand('node ./mustache_templates/postscript.js');

    console.log('✅ SailPoint SDK built successfully!');
  } catch (error) {
    console.error('Error building SailPoint SDK:', error);
    process.exit(1);
  }
}

buildSdk();