import { Component, Inject } from '@angular/core';

import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface DeploymentErrorData {
  title: string;
  message: string;
  details?: string;
}

@Component({
  selector: 'app-deployment-error-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule
],
  template: `
    <div class="deployment-error-dialog">
      <div class="dialog-header">
        <mat-icon class="error-icon">error</mat-icon>
        <h2 mat-dialog-title>{{ data.title }}</h2>
      </div>
    
      <mat-dialog-content>
        <p class="error-message">{{ data.message }}</p>
    
        @if (data.details) {
          <div class="error-details">
            <div class="details-label">Details:</div>
            <div class="details-content">{{ data.details }}</div>
          </div>
        }
      </mat-dialog-content>
    
      <mat-dialog-actions align="end">
        <button mat-raised-button color="warn" (click)="close()">
          <mat-icon>close</mat-icon>
          Close
        </button>
      </mat-dialog-actions>
    </div>
    `,
  styles: [`
    .deployment-error-dialog {
      min-width: 500px;
      max-width: 700px;
    }

    .dialog-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
    }

    .error-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: #f44336;
      animation: scaleIn 0.3s ease-out;
    }

    @keyframes scaleIn {
      from {
        transform: scale(0);
      }
      to {
        transform: scale(1);
      }
    }

    h2 {
      margin: 0;
      text-align: center;
      color: #f44336;
    }

    mat-dialog-content {
      padding: 0 24px 24px;
    }

    .error-message {
      text-align: center;
      font-size: 16px;
      line-height: 1.5;
      margin-bottom: 24px;
      color: #333;
    }

    :host-context(.dark-theme) .error-message {
      color: #ddd;
    }

    .error-details {
      background: #ffebee;
      border-left: 4px solid #f44336;
      border-radius: 4px;
      padding: 16px;
      margin-top: 16px;
    }

    :host-context(.dark-theme) .error-details {
      background: rgba(244, 67, 54, 0.1);
    }

    .details-label {
      font-weight: 600;
      color: #c62828;
      margin-bottom: 8px;
      font-size: 14px;
    }

    :host-context(.dark-theme) .details-label {
      color: #ef5350;
    }

    .details-content {
      font-family: 'Courier New', monospace;
      font-size: 13px;
      color: #666;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.6;
    }

    :host-context(.dark-theme) .details-content {
      color: #aaa;
    }

    mat-dialog-actions {
      padding: 16px 24px;
      margin: 0;
    }

    mat-dialog-actions button {
      min-width: 120px;
    }
  `]
})
export class DeploymentErrorDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<DeploymentErrorDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DeploymentErrorData
  ) {}

  close(): void {
    this.dialogRef.close();
  }
}

