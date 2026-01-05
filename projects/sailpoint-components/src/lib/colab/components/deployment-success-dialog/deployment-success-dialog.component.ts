import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface DeploymentSuccessData {
  connectorName: string;
  version?: number;
  connectorId: string;
  deploymentType?: 'connector' | 'workflow' | 'transform';
}

@Component({
  selector: 'app-deployment-success-dialog',
  standalone: true,
  imports: [
    CommonModule,
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
          The connector <strong>{{ data.connectorName }}</strong> has been successfully deployed to your environment.
        </p>
        
        <div class="deployment-details">
          <div class="detail-item">
            <span class="detail-label">{{ getIdLabel() }}:</span>
            <span class="detail-value">{{ data.connectorId }}</span>
          </div>
          <div class="detail-item" *ngIf="data.version">
            <span class="detail-label">Version:</span>
            <span class="detail-value">{{ data.version }}</span>
          </div>
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
      min-width: 400px;
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
      justify-content: space-between;
      align-items: center;
    }

    .detail-label {
      font-weight: 500;
      color: #666;
    }

    :host-context(.dark-theme) .detail-label {
      color: #aaa;
    }

    .detail-value {
      font-family: 'Courier New', monospace;
      font-size: 14px;
      color: #333;
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
      case 'connector':
      default:
        return 'Connector ID';
    }
  }

  close(): void {
    this.dialogRef.close();
  }
}

