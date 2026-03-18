import { Component, Inject } from '@angular/core';

import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface DeploymentSuccessData {
  connectorName: string;
  version?: number;
  connectorId: string;
  deploymentType?: 'connector' | 'workflow' | 'transform' | 'customizer';
}

export interface DeploymentErrorData {
  title: string;
  message: string;
  details?: string;
}

@Component({
  selector: 'app-deployment-success-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule
],
  template: `
    <div class="deployment-success-dialog">
      <div class="dialog-header">
        <mat-icon class="success-icon">check_circle</mat-icon>
        <h2 mat-dialog-title>Deployment Successful!</h2>
      </div>
    
      <mat-dialog-content>
        <p class="success-message">
          <strong>{{ data.connectorName }}</strong> {{ getSuccessMessage() }}
        </p>
    
        <div class="deployment-details">
          <div class="detail-item">
            <span class="detail-label">{{ getIdLabel() }}:</span>
            <div class="detail-value-wrapper">
              <span class="detail-value">{{ data.connectorId }}</span>
            </div>
          </div>
          @if (data.version) {
            <div class="detail-item">
              <span class="detail-label">Version:</span>
              <span class="detail-value">{{ data.version }}</span>
            </div>
          }
        </div>
      </mat-dialog-content>
    
      <mat-dialog-actions align="end">
        <button mat-raised-button color="primary" (click)="close()">
          <mat-icon>done</mat-icon>
          Done
        </button>
      </mat-dialog-actions>
    </div>
    `,
  styles: [`
    .deployment-success-dialog {
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

    .success-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: #4caf50;
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
      color: #4caf50;
    }

    mat-dialog-content {
      padding: 0 24px 24px;
    }

    .success-message {
      text-align: center;
      font-size: 16px;
      line-height: 1.5;
      margin-bottom: 24px;
    }

    .success-message strong {
      color: #1976d2;
      font-weight: 600;
    }

    .deployment-details {
      background: #f5f5f5;
      border-radius: 8px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    :host-context(.dark-theme) .deployment-details {
      background: rgba(255, 255, 255, 0.05);
    }

    .detail-item {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-start;
    }

    .detail-label {
      font-weight: 500;
      color: #666;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    :host-context(.dark-theme) .detail-label {
      color: #aaa;
    }

    .detail-value-wrapper {
      width: 100%;
      max-height: 150px;
      overflow-y: auto;
      padding: 8px;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
    }

    :host-context(.dark-theme) .detail-value-wrapper {
      background: rgba(0, 0, 0, 0.2);
      border-color: rgba(255, 255, 255, 0.1);
    }

    .detail-value {
      font-family: 'Courier New', monospace;
      font-size: 13px;
      color: #333;
      word-break: break-all;
      line-height: 1.6;
    }

    :host-context(.dark-theme) .detail-value {
      color: #ddd;
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
export class DeploymentSuccessDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<DeploymentSuccessDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DeploymentSuccessData
  ) {}

  getIdLabel(): string {
    switch (this.data.deploymentType) {
      case 'workflow':
        return 'Workflow ID';
      case 'transform':
        return 'Transform ID';
      case 'customizer':
        return 'Customizer ID';
      case 'connector':
      default:
        return 'Connector ID';
    }
  }

  getSuccessMessage(): string {
    switch (this.data.deploymentType) {
      case 'workflow':
        return 'has been successfully deployed to your environment.';
      case 'transform':
        return 'has been successfully deployed to your environment.';
      case 'connector':
      default:
        return 'has been successfully deployed to your environment.';
    }
  }

  close(): void {
    this.dialogRef.close();
  }
}

