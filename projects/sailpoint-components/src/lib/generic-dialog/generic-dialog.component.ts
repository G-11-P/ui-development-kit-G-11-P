
import { Component, Inject, ViewEncapsulation } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import * as Prism from 'prismjs';
import 'prismjs/components/prism-json';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatCardModule } from '@angular/material/card';

interface UsageNode {
  name: string;
  children?: UsageNode[];
}

export interface DialogData {
  title?: string;
  message: string;
  showSpinner?: boolean;
  showCancel?: boolean;
  disableClose?: boolean;
  confirmText?: string;
  cancelText?: string;
  isConfirmation?: boolean;

  treeData?: UsageNode[];
}

@Component({
  selector: 'app-generic-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatTooltipModule,
    MatExpansionModule,
    MatCardModule
],
  template: `
    <h1 mat-dialog-title>
      @if (data.showSpinner) {
        <mat-icon class="title-icon">{{
          getTitleIcon()
        }}</mat-icon>
      }
      {{ data.title || 'Notification' }}
    </h1>
    
    <div mat-dialog-content class="dialog-content">
      @if (data.showSpinner) {
        <div class="spinner-container">
          <mat-spinner diameter="40"></mat-spinner>
        </div>
      }
      @if (isJsonMessage) {
        <div class="copy-container">
          <button
            id="copyButton"
            mat-icon-button
            (click)="copyToClipboard()"
            matTooltip="Copy to clipboard"
            >
            <mat-icon>content_copy</mat-icon>
          </button>
        </div>
      }
      @if (!isUnsavedChangesPrompt) {
        @if (isJsonMessage) {
          <pre class="dialog-message json-message"><code class="language-json" [innerHTML]="highlightedJson"></code></pre>
        }
        @if (!isJsonMessage) {
          <pre class="dialog-message text-message">{{ formattedMessage }}</pre>
        }
      }
      @if (data.showSpinner && isOAuthFlow()) {
        <p class="oauth-instruction">
          <mat-icon class="info-icon">info</mat-icon>
          Please complete the authentication in your browser window and return
          here.
        </p>
      }
      @if (data.treeData?.length) {
        <mat-accordion class="usage-accordion">
          @for (root of data.treeData; track root) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>{{ root.name }}</mat-panel-title>
              </mat-expansion-panel-header>
              <div class="entry-cards">
                @for (entry of root.children; track entry) {
                  <mat-card class="entry-card mat-elevation-z2">
                    <mat-card-header>
                      <mat-card-title>{{ entry.name }}</mat-card-title>
                    </mat-card-header>
                    <mat-card-content>
                      @for (leaf of entry.children; track leaf) {
                        <div class="leaf-item">{{ leaf.name }}</div>
                      }
                    </mat-card-content>
                  </mat-card>
                }
              </div>
            </mat-expansion-panel>
          }
        </mat-accordion>
      }
    </div>
    <div mat-dialog-actions align="end">
      <!-- Confirmation Dialog Buttons -->
      @if (data.isConfirmation) {
        <button mat-button (click)="onCancel()">
          {{ data.cancelText || 'Cancel' }}
        </button>
        <button mat-raised-button color="warn" (click)="onConfirm()">
          {{ data.confirmText || 'Confirm' }}
        </button>
      }
      <!-- Standard Dialog Button -->
      @if (!data.isConfirmation && data.showCancel !== false) {
        <button
          id="closeButton"
          mat-button
          (click)="onClose()"
          >
          {{ data.showSpinner ? 'Cancel' : 'Close' }}
        </button>
      }
    
      @if (isUnsavedChangesPrompt) {
        <button mat-button color="warn" (click)="onDiscard()">Discard</button>
        <button mat-button color="primary" (click)="onSave()">Save</button>
      }
    </div>
    `,
  styles: [
    `
    .mat-dialog-container,
    .mat-mdc-dialog-container,
    .mat-dialog-container *,
    .mat-mdc-dialog-container * {
      font-family: "Poppins", sans-serif !important;
      text-transform: none !important;
      letter-spacing: normal !important;
    }
      :host {
        display: block;
      }

      .mat-mdc-dialog-content>:first-child {
        margin-top: 15px !important;
      }

      .mat-mdc-icon-button .mat-mdc-button-persistent-ripple {
        border-radius: 0.5rem !important;
      }
     

      .dark-theme #closeButton {
        color: var(--theme-primary) !important;;
        background-color: #1e1e1e !important;
        border-radius: 0.5rem;
        border: 1px solid var(--theme-primary) !important;
      }

      .dark-theme #closeButton:hover {
        background-color: var(--theme-primary) !important;;
        color: #ffffff;
        border: 1px solid var(--theme-primary) !important;;
      }

      #closeButton {
        color: #0033a1 !important;
        background-color: #ffffff !important;
        border-radius: 0.5rem;
        border: 1px solid #0033a1;
      }

      #closeButton:hover {
        background-color: #0033a1 !important;
        color: #ffffff !important;
      }
      
      .dialog-content {
        min-width: 300px;
        padding: 20px 0;
        position: relative;
        padding-bottom: 64px;
        box-sizing: border-box;
      }

      .spinner-container {
        display: flex;
        justify-content: center;
        margin: 20px 0;
      }

      .copy-container {
        display: flex;
        justify-content: flex-end;
        margin-bottom: -48px;
        margin-right: 20px;
      }

      .dialog-message {
        margin: 0;
        padding: 16px;
        overflow-x: auto;
        border-radius: 4px;
        white-space: pre-wrap;
        word-wrap: break-word;
        max-width: 100%;
        box-sizing: border-box;
      }

      /* Light theme styles */
      .dialog-message.json-message {
        background-color: #f8f8f2;
        color: #282c34;
        border: 1px solid #e0e0e0;
        max-height: 600px;
        overflow-y: auto;
      }

      .dialog-message.text-message {
        background: none;
        color: #333;
        border: none;
      }

      /* Dark theme styles */
      .dark-theme .dialog-message.json-message {
        background-color: #282c34;
        color: #f8f8f2;
        border: 1px solid #444;
      }

      .dark-theme .dialog-message.text-message {
        background: none;
        color: #f0f0f0;
        border: none;
      }

      .dark-theme .oauth-instruction {
        background-color: #1a237e;
        color: #90caf9;
        border-left-color: #2196f3;
      }

      .dialog-message code {
        display: block;
        padding: 0;
        background: none;
        font-size: 14px;
        line-height: 1.4;
      }

      .oauth-instruction {
        background-color: #e3f2fd;
        padding: 12px;
        border-radius: 4px;
        border-left: 3px solid #2196f3;
        margin: 16px 0 0 0;
        font-size: 13px;
        color: #1976d2;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .info-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        color: #2196f3;
      }

      .title-icon {
        margin-right: 8px;
        vertical-align: middle;
      }

      h1[mat-dialog-title] {
        display: flex;
        align-items: center;
        margin-bottom: 0;
      }

      #copyButton {
        border: none !important;
      }
    .entry-cards {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin-top: 16px;
    }

    .entry-card {
      flex: 0 1 auto;             
      width: auto;                 
      min-width: 180px;           
      max-width: calc(100% - 32px);
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      transition: transform .2s, box-shadow .2s;
    }
    .entry-card:hover {
      transform: translateY(-2px) scale(1.02);
      box-shadow: 0 4px 8px rgba(0,0,0,0.15);
    }

    .mat-card-title {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 600;
    }

    mat-card-content {
      padding: 8px 16px;
      white-space: normal;
    }

    .leaf-item {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 4px 0;
    }
    `,
  ],
  encapsulation: ViewEncapsulation.None,
})
export class GenericDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<GenericDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData
  ) { }

  get isUnsavedChangesPrompt(): boolean {
    return (
      this.data.message?.trim() ===
      'You have unsaved changes. Do you want to save them before leaving?'
    );
  }

  onSave() {
    this.dialogRef.close('confirm');
  }

  onDiscard() {
    this.dialogRef.close('discard');
  }
  onClose(): void {
    this.dialogRef.close();
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }

  onConfirm(): void {
    this.dialogRef.close(true);
  }

  getTitleIcon(): string {
    if (this.data.title?.includes('Successful')) {
      return 'check_circle';
    } else if (
      this.data.title?.includes('Failed') ||
      this.data.title?.includes('Error')
    ) {
      return 'error';
    } else {
      return 'login';
    }
  }

  get formattedMessage(): string {
    try {
      return JSON.stringify(JSON.parse(this.data.message), null, 2);
    } catch {
      return this.data.message;
    }
  }

  get isJsonMessage(): boolean {
    try {
      JSON.parse(this.data.message);
      return true;
    } catch {
      return false;
    }
  }

  get highlightedJson(): string {
    try {
      const json = JSON.stringify(JSON.parse(this.data.message), null, 2);
      return Prism.highlight(json, Prism.languages.json, 'json');
    } catch {
      return this.data.message;
    }
  }

  copyToClipboard(): void {
    const textToCopy = this.formattedMessage;
    void window.navigator.clipboard.writeText(textToCopy).then(() => {
    });
  }

  isOAuthFlow(): boolean {
    return (
      this.data.title?.includes('OAuth') ||
      this.data.message?.includes('OAuth') ||
      this.data.message?.includes('browser')
    );
  }
}