import { Injectable, signal } from '@angular/core';
import { GitRepoSettings, GitCommit, BackupObject, BackupObjectType, CommitFile } from '../models/config-hub.models';

const SETTINGS_KEY = 'config-hub-git-settings';

@Injectable({ providedIn: 'root' })
export class ConfigHubGitService {
  readonly settings = signal<GitRepoSettings | null>(null);
  readonly branches = signal<string[]>([]);
  readonly loading = signal(false);

  loadSettings(): Promise<void> {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      this.settings.set(raw ? (JSON.parse(raw) as GitRepoSettings) : null);
    } catch {
      this.settings.set(null);
    }
    return Promise.resolve();
  }

  saveSettings(settings: GitRepoSettings): Promise<{ success: boolean; error?: string }> {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      this.settings.set(settings);
      return Promise.resolve({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to save settings';
      return Promise.resolve({ success: false, error: msg });
    }
  }

  async loadBranches(): Promise<void> {
    const s = this.settings();
    if (!s) return;
    const { owner, repo } = this.parseRepoUrl(s.repoUrl);
    if (!owner || !repo) return;
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`;
      const res = await fetch(url, { headers: this.githubHeaders(s) });
      if (!res.ok) return;
      const data = await res.json() as any[];
      this.branches.set(data.map((b: any) => b.name as string));
    } catch {
      this.branches.set([]);
    }
  }

  async getObjectTypes(): Promise<BackupObjectType[]> {
    const s = this.settings();
    if (!s) return [];
    const { owner, repo } = this.parseRepoUrl(s.repoUrl);
    if (!owner || !repo) return [];
    try {
      const basePath = s.backupsPath.replace(/^\/|\/$/g, '');
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${basePath}?ref=${encodeURIComponent(s.defaultBranch)}`;
      const res = await fetch(url, { headers: this.githubHeaders(s) });
      if (!res.ok) return [];
      const items = await res.json() as any[];
      return items
        .filter((i: any) => i.type === 'dir')
        .map((i: any) => ({ name: i.name as string, objectCount: 0 }));
    } catch {
      return [];
    }
  }

  async getObjectsForType(objectType: string): Promise<BackupObject[]> {
    const s = this.settings();
    if (!s) return [];
    const { owner, repo } = this.parseRepoUrl(s.repoUrl);
    if (!owner || !repo) return [];
    try {
      const basePath = s.backupsPath.replace(/^\/|\/$/g, '');
      const dirPath = `${basePath}/${objectType}`;
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}?ref=${encodeURIComponent(s.defaultBranch)}`;
      const res = await fetch(url, { headers: this.githubHeaders(s) });
      if (!res.ok) return [];
      const items = await res.json() as any[];
      return items
        .filter((i: any) => i.type === 'file' && (i.name as string).endsWith('.json'))
        .map((i: any) => ({
          objectType,
          objectId: (i.name as string).replace('.json', ''),
          name: (i.name as string).replace('.json', ''),
        }));
    } catch {
      return [];
    }
  }

  async getCommitHistory(objectType: string, objectId: string, branch?: string, limit = 30): Promise<GitCommit[]> {
    const s = this.settings();
    if (!s) return [];
    const { owner, repo } = this.parseRepoUrl(s.repoUrl);
    if (!owner || !repo) return [];
    try {
      const basePath = s.backupsPath.replace(/^\/|\/$/g, '');
      const filePath = `${basePath}/${objectType}/${objectId}.json`;
      const params = new URLSearchParams({ path: filePath, per_page: String(limit) });
      params.set('sha', branch ?? s.defaultBranch);
      const url = `https://api.github.com/repos/${owner}/${repo}/commits?${params}`;
      const res = await fetch(url, { headers: this.githubHeaders(s) });
      if (!res.ok) return [];
      const data = await res.json() as any[];
      return (data || []).map((c: any) => ({
        sha: c.sha as string,
        message: ((c.commit?.message as string) || '').split('\n')[0],
        author: (c.commit?.author?.name || c.author?.login || 'Unknown') as string,
        timestamp: (c.commit?.author?.date || '') as string,
      }));
    } catch {
      return [];
    }
  }

  async getFileAtCommit(objectType: string, objectId: string, ref: string): Promise<string> {
    const s = this.settings();
    if (!s) return '';
    const { owner, repo } = this.parseRepoUrl(s.repoUrl);
    if (!owner || !repo) return '';
    try {
      const basePath = s.backupsPath.replace(/^\/|\/$/g, '');
      const filePath = `${basePath}/${objectType}/${objectId}.json`;
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${encodeURIComponent(ref)}`;
      const res = await fetch(url, { headers: this.githubHeaders(s) });
      if (!res.ok) return '';
      const data = await res.json();
      return atob((data.content as string).replace(/\n/g, ''));
    } catch {
      return '';
    }
  }

  /**
   * Return the most recent commits that touch the configured backups path,
   * sorted newest-first.  Used by the "By Commit" view.
   */
  async getRecentCommits(limit = 50): Promise<GitCommit[]> {
    const s = this.settings();
    if (!s) return [];
    const { owner, repo } = this.parseRepoUrl(s.repoUrl);
    if (!owner || !repo) return [];
    try {
      const basePath = s.backupsPath.replace(/^\/|\/$/g, '');
      const params = new URLSearchParams({ sha: s.defaultBranch, path: basePath, per_page: String(limit) });
      const url = `https://api.github.com/repos/${owner}/${repo}/commits?${params}`;
      const res = await fetch(url, { headers: this.githubHeaders(s) });
      if (!res.ok) return [];
      const data = await res.json() as any[];
      return (data || []).map((c: any) => ({
        sha: c.sha as string,
        message: ((c.commit?.message as string) || '').split('\n')[0],
        author: (c.commit?.author?.name || c.author?.login || 'Unknown') as string,
        timestamp: (c.commit?.author?.date || '') as string,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Return the list of backup objects changed by a specific commit.
   * Parses file paths of the form `{backupsPath}/{OBJECT_TYPE}/{objectId}.json`.
   */
  async getCommitFiles(sha: string): Promise<CommitFile[]> {
    const s = this.settings();
    if (!s) return [];
    const { owner, repo } = this.parseRepoUrl(s.repoUrl);
    if (!owner || !repo) return [];
    try {
      const basePath = s.backupsPath.replace(/^\/|\/$/g, '');
      const url = `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`;
      const res = await fetch(url, { headers: this.githubHeaders(s) });
      if (!res.ok) return [];
      const data = await res.json();
      const escapedBase = basePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`^${escapedBase}/([^/]+)/([^/]+)\\.json$`);
      const files: CommitFile[] = [];
      for (const f of (data.files ?? [])) {
        const match = (f.filename as string).match(pattern);
        if (match) {
          files.push({
            objectType: match[1],
            objectId: match[2],
            filePath: f.filename as string,
            status: f.status as CommitFile['status'],
          });
        }
      }
      return files;
    } catch {
      return [];
    }
  }

  parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
    const clean = repoUrl.trim().replace(/\.git$/, '').replace(/\/$/, '');
    const httpsMatch = clean.match(/github\.com\/([^/]+)\/([^/]+)/i);
    if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };
    const sshMatch = clean.match(/git@github\.com:([^/]+)\/([^/]+)/i);
    if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };
    return { owner: '', repo: '' };
  }

  private githubHeaders(s: GitRepoSettings): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'SailPoint-UI-Development-Kit',
    };
    // Always use the PAT for REST API calls when one is available.
    // SSH keys are for local git operations only and cannot authenticate
    // the GitHub REST API — a PAT is required for private repo access.
    if (s.pat) {
      headers['Authorization'] = `Bearer ${s.pat}`;
    }
    return headers;
  }
}
