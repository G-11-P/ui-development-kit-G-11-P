#!/usr/bin/env node
/**
 * Post-generation script for the SailPoint SDK wrappers.
 *
 * Run automatically by scripts/build-sailpoint-sdk.js after the OpenAPI Generator
 * produces the base TypeScript files from the Mustache templates.
 *
 * Applies two targeted patches that cannot be expressed generically in Mustache:
 *
 * 1. importSpConfig (electron + web)
 *    The generated SDK sets `Content-Type: multipart/form-data` WITHOUT the
 *    boundary token, causing a 400 from the server. Passing `null` tells Axios
 *    to remove the override so it can compute the correct boundary itself.
 *
 * 2. createUploadedConfiguration (electron + web)
 *    Axios in the Electron main process cannot reliably handle native Node.js
 *    FormData (Node 18+), and File objects lose their Blob prototype methods
 *    when transferred over Electron IPC structured clone. The replacement
 *    implementation uses fetch() directly (matching restore.mjs) and accepts
 *    either a real File/Blob or a plain { content, name, type } proxy object
 *    from the Angular renderer.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Shared custom implementation body (used by both wrappers)
// ---------------------------------------------------------------------------

const CUSTOM_IMPL = `\
    // Uses fetch() directly to avoid Axios multipart boundary issues in Node.js
    // and IPC Blob serialisation limitations.  Mirrors the restore.mjs approach.
    console.log('[createUploadedConfiguration] Starting upload:', {
        name: requestParameters.name,
        fileName: (requestParameters.data as any)?.name,
    });
    try {
        const anyConfig = apiConfig as any;
        const basePath: string = anyConfig.baseurl || anyConfig.basePath || '';
        console.log('[createUploadedConfiguration] basePath:', basePath);
        console.log('[createUploadedConfiguration] apiConfig keys:', Object.keys(anyConfig).filter((k: string) => anyConfig[k] != null));

        let accessToken: string;
        if (anyConfig.accessToken) {
            console.log('[createUploadedConfiguration] Using existing accessToken');
            const raw = anyConfig.accessToken;
            accessToken = typeof raw === 'function' ? await raw() : await Promise.resolve(raw);
            console.log('[createUploadedConfiguration] accessToken resolved, length:', accessToken?.length);
        } else if (anyConfig.clientId && anyConfig.clientSecret && anyConfig.tokenUrl) {
            console.log('[createUploadedConfiguration] Fetching PAT token from:', anyConfig.tokenUrl);
            const tokenRes = await fetch(anyConfig.tokenUrl as string, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'client_credentials',
                    client_id: anyConfig.clientId,
                    client_secret: anyConfig.clientSecret,
                }).toString(),
            });
            console.log('[createUploadedConfiguration] Token response status:', tokenRes.status);
            if (!tokenRes.ok) {
                const errBody = await tokenRes.text().catch(() => '');
                throw new Error(\`Token request failed: HTTP \${tokenRes.status} \${errBody}\`);
            }
            const tokenData = await tokenRes.json() as any;
            accessToken = tokenData.access_token;
            console.log('[createUploadedConfiguration] PAT token obtained, length:', accessToken?.length);
        } else {
            console.error('[createUploadedConfiguration] No usable credentials:', {
                hasAccessToken: !!anyConfig.accessToken,
                hasClientId: !!anyConfig.clientId,
                hasClientSecret: !!anyConfig.clientSecret,
                hasTokenUrl: !!anyConfig.tokenUrl,
            });
            throw new Error('No authentication credentials found in apiConfig');
        }

        // Accept either a real Blob/File or the plain proxy { content, name, type }
        // that the Angular renderer sends (File methods are stripped by IPC clone).
        const anyData = requestParameters.data as any;
        const fileName: string = anyData.name ?? 'upload.json';
        const fileType: string = anyData.type ?? 'application/json';
        let blob: Blob;
        if (typeof anyData.content === 'string') {
            blob = new Blob([anyData.content], { type: fileType });
        } else if (typeof anyData.arrayBuffer === 'function') {
            blob = new Blob([await anyData.arrayBuffer()], { type: fileType });
        } else {
            throw new Error('Cannot read file content: no .content string or .arrayBuffer() method');
        }

        const form = new FormData();
        form.append('data', blob, fileName);
        form.append('name', requestParameters.name);
        console.log('[createUploadedConfiguration] FormData built — file:', fileName, 'size:', blob.size,
            'bytes, POSTing to:', \`\${basePath}/v2025/configuration-hub/backups/uploads\`);

        const response = await fetch(\`\${basePath}/v2025/configuration-hub/backups/uploads\`, {
            method: 'POST',
            headers: {
                Authorization: \`Bearer \${accessToken}\`,
                Accept: 'application/json',
                // No Content-Type — the runtime sets it with the multipart boundary
            },
            body: form,
        });

        console.log('[createUploadedConfiguration] Response status:', response.status, response.statusText);
        const responseText = await response.text();
        console.log('[createUploadedConfiguration] Response body:', responseText);

        let responseData: sdk.BackupResponseV2025;
        try { responseData = JSON.parse(responseText); }
        catch { responseData = {} as sdk.BackupResponseV2025; }

        return {
            data: responseData,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries((response.headers as any).entries()),
        };
    } catch (error) {
        console.error('[createUploadedConfiguration] Error:', error);
        return generateErrorResponse(error);
    }`;

// ---------------------------------------------------------------------------
// Patch helpers
// ---------------------------------------------------------------------------

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`  ✅ Patched ${path.relative(process.cwd(), filePath)}`);
}

/**
 * Patch 1 – importSpConfig: add Content-Type:null axiosOptions so Axios
 * doesn't override the multipart boundary when calling the SDK method.
 */
function patchImportSpConfig(content) {
  return content.replace(
    /return handleApiCall\(\(\) => spconfigv2025api\.importSpConfig\(requestParameters\)\);/g,
    `return handleApiCall(() => spconfigv2025api.importSpConfig(requestParameters, { headers: { 'Content-Type': null } } as any));`
  );
}

// ---------------------------------------------------------------------------
// Electron wrapper (app/sailpoint-sdk/sailpoint-sdk.ts)
// ---------------------------------------------------------------------------

function patchElectronSdk(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠️  File not found, skipping: ${filePath}`);
    return;
  }

  let content = readFile(filePath);

  // 1. importSpConfig — Content-Type:null fix
  content = patchImportSpConfig(content);

  // 2. createUploadedConfiguration — replace generated body with fetch-based impl.
  //    The generated function is:
  //      export const createUploadedConfiguration = (...) => {
  //          const configurationhubv2025api = ...
  //          return handleApiCall(() => configurationhubv2025api.createUploadedConfiguration(...));
  //      }
  //    We change `const` → `let` and replace the body, then append the real
  //    async override at the end so the `let` binding can be reassigned.
  content = content.replace(
    /export const (createUploadedConfiguration) = \(([^)]+)\) => \{[\s\S]*?return handleApiCall\(\(\) => configurationhubv2025api\.createUploadedConfiguration\(requestParameters\)\);\n\}/,
    (_, name, params) =>
      `export let ${name} = (${params}) => {\n    const configurationhubv2025api = new sdk.ConfigurationHubV2025Api(apiConfig);\n    return handleApiCall(() => configurationhubv2025api.createUploadedConfiguration(requestParameters));\n}`
  );

  const ELECTRON_OVERRIDE = `
// =============================================================================
// Patches applied by mustache_templates/postscript.js — do not edit manually.
// Re-run \`npm run build:sdk\` to regenerate with these patches applied.
// =============================================================================

// Override: replace the generated stub with a fetch-based implementation that
// works correctly in Electron's main process (avoids Axios/FormData boundary
// issues and handles IPC-cloned File objects that lose their Blob methods).
createUploadedConfiguration = async (requestParameters: sdk.ConfigurationHubV2025ApiCreateUploadedConfigurationRequest, apiConfig: sdk.Configuration): Promise<ApiResponse<sdk.BackupResponseV2025>> => {
${CUSTOM_IMPL}
};
`;

  if (!content.includes('Patches applied by mustache_templates/postscript.js')) {
    content += ELECTRON_OVERRIDE;
  }

  writeFile(filePath, content);
}

// ---------------------------------------------------------------------------
// Web wrapper (server/sailpoint-sdk-web.ts)
// ---------------------------------------------------------------------------

function patchWebSdk(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠️  File not found, skipping: ${filePath}`);
    return;
  }

  let content = readFile(filePath);

  // 1. importSpConfig — Content-Type:null fix
  content = patchImportSpConfig(content);

  // 2. createUploadedConfiguration — override the sdkFunctionsObject entry and
  //    update the sdkFunctions Map so executeSdkMethod picks up the new impl.
  const WEB_OVERRIDE = `
// =============================================================================
// Patches applied by mustache_templates/postscript.js — do not edit manually.
// Re-run \`npm run build:sdk\` to regenerate with these patches applied.
// =============================================================================

// Override: replace the generated stub with a fetch-based implementation.
sdkFunctionsObject.createUploadedConfiguration = async (requestParameters: sdk.ConfigurationHubV2025ApiCreateUploadedConfigurationRequest, apiConfig: sdk.Configuration): Promise<ApiResponse<sdk.BackupResponseV2025>> => {
${CUSTOM_IMPL}
};
// Keep the Map in sync so executeSdkMethod routes through the new implementation.
sdkFunctions.set('createUploadedConfiguration', sdkFunctionsObject.createUploadedConfiguration as any);
`;

  if (!content.includes('Patches applied by mustache_templates/postscript.js')) {
    content += WEB_OVERRIDE;
  }

  writeFile(filePath, content);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('Running postscript patches...');

const root = path.join(__dirname, '..');
patchElectronSdk(path.join(root, 'app', 'sailpoint-sdk', 'sailpoint-sdk.ts'));
patchWebSdk(path.join(root, 'server', 'sailpoint-sdk-web.ts'));

console.log('Postscript complete.');
