export type AuthMethod = 'pat' | 'ssh';

export interface GitRepoSettings {
  repoUrl: string;
  authMethod: AuthMethod;
  pat?: string;
  sshKeyPath?: string;
  defaultBranch: string;
  backupsPath: string;
}

export interface GitCommit {
  sha: string;
  message: string;
  author: string;
  timestamp: string;
}

export interface BackupObjectType {
  name: string;
  objectCount: number;
}

export interface BackupObject {
  objectType: string;
  objectId: string;
  name: string;
  lastCommit?: GitCommit;
}

export interface ObjectContent {
  object: BackupObject;
  content: any;
  rawJson: string;
}

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  lineNumberLeft?: number;
  lineNumberRight?: number;
}

export interface RestoreResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface CommitFile {
  objectType: string;
  objectId: string;
  filePath: string;
  /** GitHub change status for this file in the commit. */
  status: 'added' | 'modified' | 'removed' | 'renamed';
}
