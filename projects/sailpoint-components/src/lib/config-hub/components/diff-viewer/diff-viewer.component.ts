import { Component, input, OnChanges, output, signal, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatListModule } from '@angular/material/list';
import * as Diff from 'diff';
import { ConfigHubGitService } from '../../services/config-hub-git.service';
import { BackupObject, DiffLine, GitCommit } from '../../models/config-hub.models';

export type DiffViewMode = 'unified' | 'split';

interface CommitEntry {
  commit: GitCommit;
}

@Component({
  selector: 'app-diff-viewer',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDividerModule,
    MatChipsModule,
  ],
  templateUrl: './diff-viewer.component.html',
  styleUrl: './diff-viewer.component.scss',
})
export class DiffViewerComponent implements OnChanges {
  readonly backupObject = input<BackupObject | null>(null);
  readonly restoreRequested = output<{ object: BackupObject; content: any; commitSha: string }>();

  commits = signal<CommitEntry[]>([]);
  selectedCommitSha = signal<string | null>(null);
  viewMode = signal<DiffViewMode>('unified');

  diffLines = signal<DiffLine[]>([]);
  /** Left pane = HEAD (current deployed state). */
  leftContent = signal('');
  /** Right pane = selected historical commit. */
  rightContent = signal('');

  loading = signal(false);
  loadingDiff = signal(false);
  errorMessage = signal<string | null>(null);

  constructor(private gitService: ConfigHubGitService) {}

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['backupObject']) {
      const obj = this.backupObject();
      if (obj) {
        await this.loadHistory(obj);
      } else {
        this.reset();
      }
    }
  }

  private reset(): void {
    this.commits.set([]);
    this.selectedCommitSha.set(null);
    this.diffLines.set([]);
    this.leftContent.set('');
    this.rightContent.set('');
    this.errorMessage.set(null);
  }

  private async loadHistory(obj: BackupObject): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.reset();

    const history = await this.gitService.getCommitHistory(obj.objectType, obj.objectId, undefined, 50);
    if (history.length === 0) {
      this.loading.set(false);
      this.errorMessage.set('No commit history found for this object.');
      return;
    }

    this.commits.set(history.map(c => ({ commit: c })));
    this.loading.set(false);

    // Default: select the most recent (non-HEAD) commit so the diff is visible immediately.
    // If there is only one commit the diff will show "identical" which is correct.
    const defaultSha = history.length > 1 ? history[1].sha : history[0].sha;
    this.selectedCommitSha.set(defaultSha);
    await this.computeDiff();
  }

  async onCommitSelect(sha: string): Promise<void> {
    this.selectedCommitSha.set(sha);
    await this.computeDiff();
  }

  /** Always diffs HEAD (left) against the selected commit (right). */
  private async computeDiff(): Promise<void> {
    const obj = this.backupObject();
    const entries = this.commits();
    const rightSha = this.selectedCommitSha();
    if (!obj || entries.length === 0 || !rightSha) return;

    const headSha = entries[0].commit.sha;

    this.loadingDiff.set(true);
    const [leftRaw, rightRaw] = await Promise.all([
      this.gitService.getFileAtCommit(obj.objectType, obj.objectId, headSha),
      this.gitService.getFileAtCommit(obj.objectType, obj.objectId, rightSha),
    ]);

    this.leftContent.set(leftRaw);
    this.rightContent.set(rightRaw);
    this.diffLines.set(this.buildDiffLines(leftRaw, rightRaw));
    this.loadingDiff.set(false);
  }

  private buildDiffLines(oldText: string, newText: string): DiffLine[] {
    const changes = Diff.diffLines(oldText, newText);
    const result: DiffLine[] = [];
    let leftLine = 1;
    let rightLine = 1;

    for (const part of changes) {
      const lines = part.value.split('\n');
      // diffLines includes a trailing empty string when value ends with \n
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

  get headSha(): string | null {
    return this.commits()[0]?.commit.sha ?? null;
  }

  formatTimestamp(iso: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleString();
  }

  onRestoreClick(): void {
    const obj = this.backupObject();
    const sha = this.selectedCommitSha();
    if (!obj || !sha) return;
    const raw = this.rightContent();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      this.restoreRequested.emit({ object: obj, content: parsed, commitSha: sha });
    } catch {
      this.errorMessage.set('Could not parse object JSON for restore.');
    }
  }

  selectedCommit(): GitCommit | undefined {
    const sha = this.selectedCommitSha();
    return this.commits().find(c => c.commit.sha === sha)?.commit;
  }

  splitLeftLines(): DiffLine[] {
    return this.diffLines().filter(l => l.type !== 'added');
  }

  splitRightLines(): DiffLine[] {
    return this.diffLines().filter(l => l.type !== 'removed');
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
