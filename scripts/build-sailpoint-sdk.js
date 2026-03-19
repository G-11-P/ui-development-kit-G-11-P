#!/usr/bin/env node

/**
 * Script to automate the SailPoint SDK build process.
 * Generates SDK wrappers for both v2025 and NERM APIs, then merges
 * the NERM operations into the v2025 output files.
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
const NERM_TEMP_DIR = 'temp/nerm';

const MERGE_START_MARKER = '// --- GENERATED SDK METHODS START ---';
const MERGE_END_MARKER = '// --- GENERATED SDK METHODS END ---';

// Maps each v2025 output file to its NERM temp counterpart
const FILE_MERGE_MAP = [
  { primary: 'app/sailpoint-sdk/sailpoint-sdk.ts', nerm: `${NERM_TEMP_DIR}/sailpoint-sdk.ts` },
  { primary: 'app/sailpoint-sdk/ipc-handlers.ts', nerm: `${NERM_TEMP_DIR}/ipc-handlers.ts` },
  { primary: 'app/sailpoint-sdk/sdk-preload.ts', nerm: `${NERM_TEMP_DIR}/sdk-preload.ts` },
  { primary: 'server/sailpoint-sdk-web.ts', nerm: `${NERM_TEMP_DIR}/sailpoint-sdk-web.ts` },
  { primary: 'projects/sailpoint-components/src/lib/sailpoint-sdk.service.ts', nerm: `${NERM_TEMP_DIR}/sailpoint-sdk.service.ts` },
];

function downloadFile(url, outputPath) {
  console.log(`Downloading ${url} to ${outputPath}...`);
  
  return new Promise((resolve, reject) => {
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

/**
 * Extract content between the GENERATED SDK METHODS markers.
 */
function extractGeneratedBlock(fileContent) {
  const startIdx = fileContent.indexOf(MERGE_START_MARKER);
  const endIdx = fileContent.indexOf(MERGE_END_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    throw new Error('Could not find GENERATED SDK METHODS markers in file');
  }

  return fileContent.substring(startIdx + MERGE_START_MARKER.length, endIdx);
}

/**
 * Merge NERM-generated operations into the primary (v2025) file.
 * Inserts NERM operations right before the END marker in the primary file.
 */
function mergeGeneratedFiles(primaryPath, nermPath) {
  if (!fs.existsSync(nermPath)) {
    console.warn(`NERM temp file not found, skipping merge: ${nermPath}`);
    return;
  }

  console.log(`Merging: ${nermPath} → ${primaryPath}`);

  const primaryContent = fs.readFileSync(primaryPath, 'utf8');
  const nermContent = fs.readFileSync(nermPath, 'utf8');

  const nermOperations = extractGeneratedBlock(nermContent);

  const endIdx = primaryContent.indexOf(MERGE_END_MARKER);
  if (endIdx === -1) {
    throw new Error(`Could not find END marker in primary file: ${primaryPath}`);
  }

  const merged = primaryContent.slice(0, endIdx) + nermOperations + primaryContent.slice(endIdx);

  fs.writeFileSync(primaryPath, merged, 'utf8');
  console.log(`Merged successfully: ${primaryPath}`);
}

async function buildSdk() {
  try {
    if (!fs.existsSync('./temp')) {
      fs.mkdirSync('./temp');
    }
    if (!fs.existsSync(NERM_TEMP_DIR)) {
      fs.mkdirSync(NERM_TEMP_DIR, { recursive: true });
    }

    // Step 1: Download OpenAPI Generator CLI
    const jarPath = path.join('./temp', OPENAPI_GENERATOR_JAR);
    await downloadFile(OPENAPI_GENERATOR_URL, jarPath);

    // Step 2: Clone API specifications if they don't exist
    if (!fs.existsSync(API_SPECS_DIR)) {
      executeCommand(`git clone ${API_SPECS_REPO}`);
    } else {
      console.log(`Resetting and updating ${API_SPECS_DIR} repository...`);
      executeCommand(`cd ${API_SPECS_DIR} && git reset --hard && git clean -fd && git pull origin main`);
    }

    // Step 3: Use SDK version and release date to get matching API specs
    console.log('Determining compatible API specs for current SDK version...');
    try {
      const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
      const currentVersion = packageJson.dependencies['sailpoint-api-client'];
      
      console.log(`Current sailpoint-api-client version: ${currentVersion}`);
      
      const timeInfo = JSON.parse(execSync(`npm view sailpoint-api-client@${currentVersion} time --json`).toString().trim());
      const releaseDate = timeInfo[currentVersion];
      const releaseDateTime = new Date(releaseDate);
      console.log(`SDK release date: ${releaseDate}`);
      
      console.log('Finding API specs commit that matches SDK release date...');
      
      const currentDir = process.cwd();
      process.chdir(API_SPECS_DIR);
      
      const gitLogCommand = 'git log --format="%H %cI" --date=iso-strict';
      const commits = execSync(gitLogCommand).toString().trim().split('\n');
      
      let matchingCommit = null;
      
      for (const commit of commits) {
        const [hash, dateStr] = commit.split(' ');
        const commitDate = new Date(dateStr);
        
        if (commitDate <= releaseDateTime) {
          matchingCommit = hash;
          console.log(`Found matching commit: ${hash} (${dateStr})`);
          break;
        }
      }
      
      if (matchingCommit) {
        console.log(`Checking out API specs at commit: ${matchingCommit}`);
        execSync(`git checkout ${matchingCommit}`, { stdio: 'inherit' });
      } else {
        console.log('No matching commit found. Using latest API specs.');
      }
      
      process.chdir(currentDir);
      
    } catch (error) {
      console.warn('Failed to match API specs with SDK version:', error.message);
      console.warn('Continuing with current API specs...');
    }

    // Step 4: Run pre-script to prepare the v2025 specifications
    executeCommand(`node ./mustache_templates/prescript.js ${API_SPECS_DIR}/idn/v2025/paths`);

    // Step 5: Generate v2025 SDK (writes to final destinations)
    console.log('\n========== Generating v2025 SDK ==========');
    executeCommand(`java -jar ${jarPath} generate -i ${API_SPECS_DIR}/idn/sailpoint-api.v2025.yaml -g typescript-axios --global-property skipFormModel=false --config generator-config.yaml --api-name-suffix V2025Api --model-name-suffix V2025`);

    // Step 6: Generate NERM SDK (writes to temp/nerm/)
    console.log('\n========== Generating NERM SDK ==========');
    const nermSpecPath = `${API_SPECS_DIR}/nerm/openapi.yaml`;

    if (!fs.existsSync(nermSpecPath)) {
      console.error(`NERM API spec not found at: ${nermSpecPath}`);
      console.error('Please update the nermSpecPath variable in build-sailpoint-sdk.js to the correct location.');
      process.exit(1);
    }

    executeCommand(`java -jar ${jarPath} generate -i ${nermSpecPath} -g typescript-axios --global-property skipFormModel=false --config generator-config-nerm.yaml --api-name-suffix NERMApi --model-name-suffix NERM`);

    // Step 7: Merge NERM operations into the v2025 output files
    console.log('\n========== Merging NERM operations into SDK files ==========');
    for (const { primary, nerm } of FILE_MERGE_MAP) {
      mergeGeneratedFiles(primary, nerm);
    }

    // Step 8: Clean up NERM temp files
    console.log('\nCleaning up temp/nerm/...');
    fs.rmSync(NERM_TEMP_DIR, { recursive: true, force: true });

    console.log('\n✅ SailPoint SDK built successfully (v2025 + NERM)!');
  } catch (error) {
    console.error('Error building SailPoint SDK:', error);
    process.exit(1);
  }
}

buildSdk();