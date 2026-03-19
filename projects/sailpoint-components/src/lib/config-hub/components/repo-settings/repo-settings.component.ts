import { Component, OnInit, Optional, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ConfigHubGitService } from '../../services/config-hub-git.service';
import { GitRepoSettings } from '../../models/config-hub.models';

@Component({
  selector: 'app-repo-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './repo-settings.component.html',
  styleUrl: './repo-settings.component.scss',
})
export class RepoSettingsComponent implements OnInit {
  readonly saved = output<GitRepoSettings>();

  form!: FormGroup;
  saving = false;
  hidePatValue = true;

  constructor(
    private fb: FormBuilder,
    private gitService: ConfigHubGitService,
    private snackBar: MatSnackBar,
    @Optional() private dialogRef?: MatDialogRef<RepoSettingsComponent>,
  ) {}

  ngOnInit(): void {
    const required = (ctrl: AbstractControl): ValidationErrors | null => Validators.required(ctrl);
    this.form = this.fb.group({
      repoUrl: ['', required],
      authMethod: ['pat'],
      pat: [''],
      sshKeyPath: [''],
      defaultBranch: ['main', required],
      backupsPath: ['backups', required],
    });

    const existing = this.gitService.settings();
    if (existing) {
      this.form.patchValue(existing);
    }
  }

  async onSave(): Promise<void> {
    if (this.form.invalid) return;
    this.saving = true;
    const settings = this.form.value as GitRepoSettings;
    const result = await this.gitService.saveSettings(settings);
    this.saving = false;
    if (result.success) {
      this.snackBar.open('Repository settings saved', 'Dismiss', { duration: 3000 });
      this.saved.emit(settings);
      await this.gitService.loadBranches();
      this.dialogRef?.close(settings);
    } else {
      this.snackBar.open(`Failed to save: ${result.error}`, 'Dismiss', { duration: 5000 });
    }
  }
}
