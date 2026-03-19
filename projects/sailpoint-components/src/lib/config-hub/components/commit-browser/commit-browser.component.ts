import { Component, OnInit, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import * as Diff from 'diff';
import { ConfigHubGitService } from '../../services/config-hub-git.service';
import { CommitFile, DiffLine, GitCommit } from '../../models/config-hub.models';

export interface CommitRestoreEvent {
  bundle: any[];
  bundleName: string;
  affectedObjects: Array<{ objectType: string; name: string }>;
  commitSha: string;
  commitMessage?: string;
  commitAuthor?: string;
  commitTimestamp?: string;
}

@Component({
  selector: 'app-commit-browser',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCheckboxModule,
    MatChipsModule,
    MatDividerModule,
    MatIconModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './commit-browser.component.html',
  styleUrl: './commit-browser.component.scss',
})
export class CommitBrowserComponent implements OnInit {
  readonly restoreRequested = output<CommitRestoreEvent>();

  // ── State ─────────────────────────────────────────────────────────────────

  commits = signal<GitCommit[]>([]);
  selectedSha = signal<string | null>(null);

  commitFiles = signal<CommitFile[]>([]);
  /** Set of filePaths that have their checkbox checked. */
  selectedFiles = signal<Set<string>>(new Set());
  /** The file currently shown in the inline diff panel. */
  focusedFile = signal<CommitFile | null>(null);
  /** Maps filePath → human-readable object name (resolved lazily). */
  fileNames = signal<Map<string, string>>(new Map());

  diffLines = signal<DiffLine[]>([]);

  loading = signal(false);
  loadingFiles = signal(false);
  loadingDiff = signal(false);
  buildingBundle = signal(false);
  errorMessage = signal<string | null>(null);

  constructor(private gitService: ConfigHubGitService) {}

  async ngOnInit(): Promise<void> {
    await this.loadCommits();
  }

  // ── Loaders ───────────────────────────────────────────────────────────────

  async loadCommits(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    const commits = await this.gitService.getRecentCommits(50);
    this.commits.set(commits);
    this.loading.set(false);
    if (commits.length > 0) {
      await this.onCommitSelect(commits[0].sha);
    }
  }

  async onCommitSelect(sha: string): Promise<void> {
    this.selectedSha.set(sha);
    this.focusedFile.set(null);
    this.diffLines.set([]);
    this.commitFiles.set([]);
    this.selectedFiles.set(new Set());
    this.fileNames.set(new Map());

    this.loadingFiles.set(true);
    const files = await this.gitService.getCommitFiles(sha);
    this.commitFiles.set(files);
    // Pre-select all files
    this.selectedFiles.set(new Set(files.map(f => f.filePath)));
    this.loadingFiles.set(false);

    // Auto-focus the first file so the diff is visible immediately
    if (files.length > 0) {
      await this.onFileFocus(files[0]);
    }
  }

  async onFileFocus(file: CommitFile): Promise<void> {
    this.focusedFile.set(file);
    this.diffLines.set([]);

    const sha = this.selectedSha();
    const branch = this.gitService.settings()?.defaultBranch ?? 'main';
    if (!sha) return;

    this.loadingDiff.set(true);
    const [headRaw, commitRaw] = await Promise.all([
      this.gitService.getFileAtCommit(file.objectType, file.objectId, branch),
      file.status === 'removed'
        ? Promise.resolve('')
        : this.gitService.getFileAtCommit(file.objectType, file.objectId, sha),
    ]);

    // Resolve the object name from JSON content
    const nameSource = commitRaw || headRaw;
    if (nameSource) {
      try {
        const parsed = JSON.parse(nameSource);
        const name = parsed?.object?.name ?? parsed?.self?.name ?? parsed?.name ?? file.objectId;
        const map = new Map(this.fileNames());
        map.set(file.filePath, name);
        this.fileNames.set(map);
      } catch { /* keep objectId as fallback */ }
    }

    this.diffLines.set(this.buildDiffLines(headRaw, commitRaw));
    this.loadingDiff.set(false);
  }

  // ── Selection ─────────────────────────────────────────────────────────────

  onFileToggle(filePath: string, checked: boolean): void {
    const next = new Set(this.selectedFiles());
    if (checked) {
      next.add(filePath);
    } else {
      next.delete(filePath);
    }
    this.selectedFiles.set(next);
  }

  toggleSelectAll(): void {
    if (this.allSelected) {
      this.selectedFiles.set(new Set());
    } else {
      this.selectedFiles.set(new Set(this.commitFiles().map(f => f.filePath)));
    }
  }

  get allSelected(): boolean {
    const all = this.commitFiles();
    return all.length > 0 && all.every(f => this.selectedFiles().has(f.filePath));
  }

  get noneSelected(): boolean {
    return this.selectedFiles().size === 0;
  }

  // ── Restore ───────────────────────────────────────────────────────────────

  async onRestoreSelected(): Promise<void> {
    const sha = this.selectedSha();
    if (!sha) return;

    const chosen = this.commitFiles().filter(f => this.selectedFiles().has(f.filePath));
    if (chosen.length === 0) return;

    this.buildingBundle.set(true);

    // Fetch content for each selected file at the commit SHA
    const rawContents = await Promise.all(
      chosen.map(f =>
        f.status === 'removed'
          ? Promise.resolve('')
          : this.gitService.getFileAtCommit(f.objectType, f.objectId, sha),
      ),
    );

    const bundle: any[] = [];
    const affectedObjects: Array<{ objectType: string; name: string }> = [];

    for (let i = 0; i < chosen.length; i++) {
      const raw = rawContents[i];
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        bundle.push(parsed);
        const name = this.fileNames().get(chosen[i].filePath) ?? chosen[i].objectId;
        affectedObjects.push({ objectType: chosen[i].objectType, name });
      } catch {
        console.warn('[CommitBrowser] Could not parse file:', chosen[i].filePath);
      }
    }

    this.buildingBundle.set(false);

    if (bundle.length === 0) return;

    const commit = this.selectedCommit();
    const bundleName = commit?.message
      ? `Restore: ${commit.message.slice(0, 50)}`
      : `Restore ${bundle.length} objects from ${sha.slice(0, 7)}`;

    this.restoreRequested.emit({
      bundle,
      bundleName,
      affectedObjects,
      commitSha: sha,
      commitMessage: commit?.message,
      commitAuthor: commit?.author,
      commitTimestamp: commit?.timestamp,
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  selectedCommit(): GitCommit | undefined {
    return this.commits().find(c => c.sha === this.selectedSha());
  }

  private buildDiffLines(oldText: string, newText: string): DiffLine[] {
    const changes = Diff.diffLines(oldText, newText);
    const result: DiffLine[] = [];
    let leftLine = 1;
    let rightLine = 1;
    for (const part of changes) {
      const lines = part.value.split('\n');
      if (lines[lines.length - 1] === '') lines.pop();
      for (const line of lines) {
        if (part.added) {
          result.push({ type: 'added', content: line, lineNumberRight: rightLine++ });
        } else if (part.removed) {
          result.push({ type: 'removed', content: line, lineNumberLeft: leftLine++ });
        } else {
          result.push({ type: 'unchanged', content: line, lineNumberLeft: leftLine++, lineNumberRight: rightLine++ });
        }
      }
    }
    return result;
  }

  get hasChanges(): boolean {
    return this.diffLines().some(l => l.type !== 'unchanged');
  }

  get addedCount(): number {
    return this.diffLines().filter(l => l.type === 'added').length;
  }

  get removedCount(): number {
    return this.diffLines().filter(l => l.type === 'removed').length;
  }

  formatTimestamp(iso: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleString();
  }

  formatRelativeTime(iso: string): string {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  }

  typeIcon(typeName: string): string {
    const icons: Record<string, string> = {
      ROLE: 'manage_accounts',
      RULE: 'code',
      SOURCE: 'device_hub',
      WORKFLOW: 'account_tree',
      TRIGGER_SUBSCRIPTION: 'notifications',
      IDENTITY_PROFILE: 'person',
      ACCESS_PROFILE: 'badge',
      TRANSFORM: 'transform',
      CONNECTOR_RULE: 'build',
    };
    return icons[typeName] ?? 'description';
  }
}
