import { Component, OnInit, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatBadgeModule } from '@angular/material/badge';
import { MatChipsModule } from '@angular/material/chips';
import { ConfigHubGitService } from '../../services/config-hub-git.service';
import { BackupObject, BackupObjectType, GitCommit } from '../../models/config-hub.models';

@Component({
  selector: 'app-object-browser',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatBadgeModule,
    MatChipsModule,
  ],
  templateUrl: './object-browser.component.html',
  styleUrl: './object-browser.component.scss',
})
export class ObjectBrowserComponent implements OnInit {
  readonly objectSelected = output<BackupObject>();

  objectTypes = signal<BackupObjectType[]>([]);
  objects = signal<BackupObject[]>([]);
  selectedType = signal<string | null>(null);
  selectedObject = signal<BackupObject | null>(null);
  loadingTypes = signal(false);
  loadingObjects = signal(false);
  historyMap = signal<Map<string, GitCommit>>(new Map());

  constructor(private gitService: ConfigHubGitService) {}

  ngOnInit(): void {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.gitService.settings()) return;
    this.loadingTypes.set(true);
    const types = await this.gitService.getObjectTypes();
    this.objectTypes.set(types);
    this.loadingTypes.set(false);
    if (this.selectedType()) {
      await this.loadObjectsForType(this.selectedType()!);
    }
  }

  async selectType(typeName: string): Promise<void> {
    this.selectedType.set(typeName);
    this.selectedObject.set(null);
    await this.loadObjectsForType(typeName);
  }

  private async loadObjectsForType(typeName: string): Promise<void> {
    this.loadingObjects.set(true);
    this.objects.set([]);
    this.historyMap.set(new Map());
    const objs = await this.gitService.getObjectsForType(typeName);
    this.objects.set(objs);
    this.loadingObjects.set(false);

    const defaultBranch = this.gitService.settings()?.defaultBranch ?? 'main';

    // Fetch last-commit info AND file content concurrently per object (batched)
    // so we can show the human-readable name from the JSON instead of the GUID.
    const BATCH = 5;
    for (let i = 0; i < objs.length; i += BATCH) {
      const batch = objs.slice(i, i + BATCH);
      await Promise.all(batch.map(async (obj) => {
        const [history, rawJson] = await Promise.all([
          this.gitService.getCommitHistory(obj.objectType, obj.objectId, undefined, 1),
          this.gitService.getFileAtCommit(obj.objectType, obj.objectId, defaultBranch),
        ]);

        const idx = this.objects().findIndex(o => o.objectId === obj.objectId);
        if (idx >= 0) {
          let displayName = obj.objectId;
          if (rawJson) {
            try {
              const parsed = JSON.parse(rawJson);
              // SailPoint sp-config exports wrap the object under an "object"
              // key — check there first, then "self", then top-level "name".
              displayName =
                parsed?.object?.name ||
                parsed?.self?.name ||
                parsed?.name ||
                obj.objectId;
            } catch { /* fall back to objectId */ }
          }

          const updated = [...this.objects()];
          updated[idx] = {
            ...updated[idx],
            name: displayName,
            lastCommit: history.length > 0 ? history[0] : updated[idx].lastCommit,
          };
          this.objects.set(updated);

          if (history.length > 0) {
            const map = new Map(this.historyMap());
            map.set(obj.objectId, history[0]);
            this.historyMap.set(map);
          }
        }
      }));
    }
  }

  selectObject(obj: BackupObject): void {
    this.selectedObject.set(obj);
    this.objectSelected.emit(obj);
  }

  getLastCommit(objectId: string): GitCommit | undefined {
    return this.historyMap().get(objectId);
  }

  formatTimestamp(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
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
    return Math.floor(days / 30) + 'mo ago';
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
