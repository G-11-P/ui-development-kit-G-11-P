import { Injectable, signal } from '@angular/core';
import { SailPointSDKService } from '../../sailpoint-sdk.service';
import { BackupObject, RestoreResult } from '../models/config-hub.models';

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 150; // ~5 minutes
const TERMINAL_STATUSES = new Set(['COMPLETE', 'CANCELLED', 'FAILED']);

@Injectable({ providedIn: 'root' })
export class ConfigHubApiService {
  /** True while the upload or polling is in flight. */
  readonly restoring = signal(false);
  /** Human-readable phase message shown in the restore dialog. */
  readonly restoreStatusMessage = signal('');

  constructor(private sdkService: SailPointSDKService) {}

  /**
   * Upload a single config object to Config Hub and poll until the job
   * reaches a terminal state (COMPLETE / CANCELLED / FAILED).
   *
   * Flow:
   *   1. POST /v2025/configuration-hub/backups/uploads  → BackupResponseV2025 with jobId
   *   2. Poll GET /v2025/configuration-hub/backups/uploads/{id} every 2 s
   *   3. Resolve with success/failure once the job finishes (or times out).
   */
  async restore(backupObject: BackupObject, objectContent: any): Promise<RestoreResult> {
    this.restoring.set(true);
    this.restoreStatusMessage.set('Uploading configuration…');
    console.log('[ConfigHubApiService] restore() called for:',
      backupObject.objectType, backupObject.objectId, backupObject.name);

    try {
      const name = `Restore ${backupObject.objectType} - ${backupObject.name}`;

      const bundle = [objectContent];
      const jsonStr = JSON.stringify(bundle, null, 2);
      console.log('[ConfigHubApiService] Payload size:', jsonStr.length, 'chars');

      // File/Blob objects lose their prototype methods over Electron IPC structured
      // clone.  Pass a plain object; the SDK wrapper reconstructs a Blob from it.
      const fileProxy: any = {
        content: jsonStr,
        name: `${name}.json`,
        type: 'application/json',
      };

      console.log('[ConfigHubApiService] Calling sdkService.createUploadedConfiguration…');
      const response = await this.sdkService.createUploadedConfiguration({ data: fileProxy as File, name });
      console.log('[ConfigHubApiService] SDK response:', response);

      if (!(response?.status && response.status >= 200 && response.status < 300)) {
        const errDetail = (response?.data as any)?.messages?.[0]?.text
          ?? (response?.data as any)?.detailCode
          ?? response?.statusText
          ?? 'Unknown error';
        console.error('[ConfigHubApiService] Upload failed:', response?.status, errDetail, response?.data);
        return { success: false, error: `Upload failed (HTTP ${response?.status}): ${errDetail}` };
      }

      const jobId: string | undefined = (response.data as any)?.jobId;
      console.log('[ConfigHubApiService] Upload accepted, jobId:', jobId);

      if (!jobId) {
        // No jobId — upload was accepted but polling isn't possible.
        return {
          success: true,
          message: `"${backupObject.name}" has been uploaded to Config Hub as "${name}". `
            + `Open the SailPoint UI to review and deploy the configuration.`,
        };
      }

      // ── Polling phase ────────────────────────────────────────────────────
      const finalStatus = await this.pollUploadStatus(jobId);

      if (finalStatus === 'COMPLETE') {
        return {
          success: true,
          message: `"${backupObject.name}" has been successfully processed by Config Hub as "${name}".`,
        };
      }

      if (finalStatus === 'TIMEOUT') {
        return {
          success: false,
          error: `Upload was accepted (job ${jobId}) but did not complete within the timeout window. `
            + `Check Config Hub for the current status.`,
        };
      }

      return {
        success: false,
        error: `Upload processing ended with status: ${finalStatus}. Check Config Hub for details.`,
      };

    } catch (error) {
      console.error('[ConfigHubApiService] Caught exception:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error during restore' };
    } finally {
      this.restoring.set(false);
      this.restoreStatusMessage.set('');
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async pollUploadStatus(jobId: string): Promise<string> {
    for (let attempt = 1; attempt <= MAX_POLLS; attempt++) {
      await new Promise<void>(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

      try {
        const res = await this.sdkService.getUploadedConfiguration({ id: jobId });
        const status = (res?.data as any)?.status as string | undefined;
        console.log(`[ConfigHubApiService] Poll ${attempt}/${MAX_POLLS}: status =`, status);

        this.restoreStatusMessage.set(
          `Processing… ${status ?? 'checking'} (${attempt}/${MAX_POLLS})`
        );

        if (status && TERMINAL_STATUSES.has(status)) {
          return status;
        }
      } catch (err) {
        console.warn('[ConfigHubApiService] Poll error (will retry):', err);
        this.restoreStatusMessage.set(`Polling… (attempt ${attempt}/${MAX_POLLS})`);
      }
    }

    return 'TIMEOUT';
  }
}
