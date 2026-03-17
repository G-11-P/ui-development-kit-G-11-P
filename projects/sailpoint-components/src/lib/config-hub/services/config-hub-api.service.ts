import { Injectable, signal } from '@angular/core';
import { SailPointSDKService } from '../../sailpoint-sdk.service';
import { BackupObject, RestoreResult } from '../models/config-hub.models';

@Injectable({ providedIn: 'root' })
export class ConfigHubApiService {
  readonly restoring = signal(false);

  constructor(private sdkService: SailPointSDKService) {}

  /**
   * Restore a single config object to the active SailPoint tenant.
   *
   * Uses SailPointSDKService.createUploadedConfiguration which maps to
   * POST /configuration-hub/backups/uploads — the same endpoint used by
   * restore.mjs. Auth and tenant routing are handled automatically.
   *
   * The upload creates a named backup in Config Hub that the user can then
   * review and deploy via the SailPoint UI.
   */
  async restore(backupObject: BackupObject, objectContent: any): Promise<RestoreResult> {
    this.restoring.set(true);
    console.log('[ConfigHubApiService] restore() called for:', backupObject.objectType, backupObject.objectId, backupObject.name);
    try {
      const name = `Restore ${backupObject.objectType} - ${backupObject.name}`;

      // Bundle the single object in an array — same format as restore.mjs:
      // the raw backup file content (JWS envelope with self/object structure).
      const bundle = [objectContent];
      const jsonStr = JSON.stringify(bundle, null, 2);
      console.log('[ConfigHubApiService] Payload size:', jsonStr.length, 'chars');
      console.log('[ConfigHubApiService] objectContent keys:', Object.keys(objectContent ?? {}));

      // File/Blob objects lose their methods when serialised over Electron IPC
      // (structured clone preserves data properties but not prototype methods like
      // arrayBuffer()). Pass a plain object carrying the content as a string instead;
      // sailpoint-sdk.ts reconstructs a native Blob from it in the main process.
      const fileProxy: any = {
        content: jsonStr,
        name: `${name}.json`,
        type: 'application/json',
      };

      console.log('[ConfigHubApiService] Calling sdkService.createUploadedConfiguration...');
      const response = await this.sdkService.createUploadedConfiguration({ data: fileProxy as File, name });
      console.log('[ConfigHubApiService] SDK response:', response);

      if (response?.status && response.status >= 200 && response.status < 300) {
        return {
          success: true,
          message:
            `"${backupObject.name}" has been uploaded to Config Hub as "${name}". ` +
            `Open the SailPoint UI to review and deploy the configuration.`,
        };
      }

      const errDetail = (response?.data as any)?.messages?.[0]?.text
        ?? (response?.data as any)?.detailCode
        ?? response?.statusText
        ?? 'Unknown error';
      console.error('[ConfigHubApiService] Upload failed:', response?.status, errDetail, response?.data);
      return { success: false, error: `Upload failed (HTTP ${response?.status}): ${errDetail}` };

    } catch (error) {
      console.error('[ConfigHubApiService] Caught exception:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error during restore';
      return { success: false, error: msg };
    } finally {
      this.restoring.set(false);
    }
  }
}
