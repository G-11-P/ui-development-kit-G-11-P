import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { ConfigHubApiService } from '../../services/config-hub-api.service';
import { BackupObject, RestoreResult } from '../../models/config-hub.models';

export interface RestoreDialogData {
  // ── Single-object mode ──────────────────────────────────────────────────
  object?: BackupObject;
  content?: any;

  // ── Multi-object / commit-bundle mode ──────────────────────────────────
  /** Pre-fetched array of parsed config objects to restore together. */
  bundle?: any[];
  /** Human-readable name for the bundle upload. */
  bundleName?: string;
  /** Summary rows shown in the confirmation — one per affected object. */
  affectedObjects?: Array<{ objectType: string; name: string }>;

  // ── Shared commit metadata ──────────────────────────────────────────────
  commitSha: string;
  commitMessage?: string;
  commitAuthor?: string;
  commitTimestamp?: string;
}

@Component({
  selector: 'app-restore-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatChipsModule,
  ],
  templateUrl: './restore-dialog.component.html',
  styleUrl: './restore-dialog.component.scss',
})
export class RestoreDialogComponent {
  readonly data: RestoreDialogData = inject(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<RestoreDialogComponent>);
  private apiService = inject(ConfigHubApiService);

  readonly restoring = this.apiService.restoring;
  readonly statusMessage = this.apiService.restoreStatusMessage;

  result = signal<RestoreResult | null>(null);

  get isBundle(): boolean {
    return Array.isArray(this.data.bundle);
  }

  async onConfirm(): Promise<void> {
    let outcome: RestoreResult;
    if (this.isBundle) {
      outcome = await this.apiService.restoreBundle(
        this.data.bundle!,
        this.data.bundleName ?? `Restore ${this.data.bundle!.length} objects`,
      );
    } else {
      outcome = await this.apiService.restore(this.data.object!, this.data.content);
    }
    this.result.set(outcome);
  }

  onClose(): void {
    this.dialogRef.close(this.result());
  }

  formatTimestamp(iso: string | undefined): string {
    if (!iso) return '';
    return new Date(iso).toLocaleString();
  }
}
