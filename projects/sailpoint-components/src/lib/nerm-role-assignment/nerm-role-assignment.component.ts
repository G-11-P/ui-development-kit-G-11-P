import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import {
  UserNERM,
  RoleNERM,
  Permission1NERMSubjectNerm,
  Permission1NERMValueNerm,
  Role1NERMTypeNerm,
} from 'sailpoint-api-client';

import { SailPointSDKService } from '../sailpoint-sdk.service';

const SUPER_GLOBAL_ADMIN_UID = 'super_global';
const SUPER_GLOBAL_ADMIN_NAME = 'Super Global Administrator';
const ALL_PERMISSION_VALUE = Permission1NERMValueNerm.NUMBER_7;
const ALL_PERMISSION_SUBJECTS: Permission1NERMSubjectNerm[] = Object.values(
  Permission1NERMSubjectNerm
) as Permission1NERMSubjectNerm[];

@Component({
  selector: 'app-nerm-role-assignment',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTableModule,
    MatToolbarModule,
    MatProgressSpinnerModule,
    MatPaginatorModule,
    MatSnackBarModule,
  ],
  templateUrl: './nerm-role-assignment.component.html',
  styleUrl: './nerm-role-assignment.component.scss',
})
export class NermRoleAssignmentComponent implements OnInit {
  title = 'NERM Role Assignment';
  loading = false;
  users: UserNERM[] = [];
  error = false;
  errorMessage = '';
  assigningUserId: string | null = null;
  displayedColumns: string[] = ['name', 'email', 'status', 'type', 'actions'];

  pageSize = 10;
  pageIndex = 0;
  totalCount = 0;

  constructor(
    private sdk: SailPointSDKService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    void this.loadUsers();
  }

  async loadUsers(): Promise<void> {
    this.loading = true;
    this.error = false;
    this.errorMessage = '';
    try {
      const response = await this.sdk.getUsersNerm({
        limit: this.pageSize,
        offset: this.pageIndex * this.pageSize,
        metadata: true,
      });
      if (response.status !== 200) {
        throw new Error(`Failed to load users: ${response.statusText}`);
      }
      const data = response.data as { users?: UserNERM[]; total?: number };
      this.users = data?.users ?? [];
      this.totalCount = data?.total ?? this.users.length;
    } catch (error) {
      console.error('Error loading NERM users:', error);
      this.error = true;
      this.errorMessage =
        error instanceof Error ? error.message : String(error);
      this.users = [];
    } finally {
      this.loading = false;
    }
  }

  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.pageIndex = event.pageIndex;
    void this.loadUsers();
  }

  async assignSuperGlobalAdminRole(user: UserNERM): Promise<void> {
    if (!user.id) {
      this.snackBar.open('User ID is missing', 'Close', { duration: 4000 });
      return;
    }

    this.assigningUserId = user.id;
    try {
      const roleId = await this.getOrCreateSuperGlobalAdminRole();

      await this.sdk.submitUserRoleNerm({
        submitUserRoleRequestNERM: {
          user_role: {
            user_id: user.id,
            role_id: roleId,
          },
        },
      });

      this.snackBar.open(
        `Super Global Administrator role assigned to ${user.name || user.login || user.id}`,
        'Close',
        { duration: 5000, panelClass: 'success-snackbar' }
      );
    } catch (error) {
      console.error('Error assigning Super Global Admin role:', error);
      const message =
        error instanceof Error ? error.message : String(error);
      this.snackBar.open(`Error: ${message}`, 'Close', {
        duration: 6000,
        panelClass: 'error-snackbar',
      });
    } finally {
      this.assigningUserId = null;
    }
  }

  private async getOrCreateSuperGlobalAdminRole(): Promise<string> {
    const rolesResponse = await this.sdk.getRolesNerm({
      type: Role1NERMTypeNerm.NeaccessRole as any,
    });

    if (rolesResponse.status === 200) {
      const data = rolesResponse.data as { roles?: RoleNERM[] };
      const existingRole = (data?.roles ?? []).find(
        (r: RoleNERM) => r.uid === SUPER_GLOBAL_ADMIN_UID
      );
      if (existingRole?.id) {
        return existingRole.id;
      }
    }

    return this.createSuperGlobalAdminRole();
  }

  private async createSuperGlobalAdminRole(): Promise<string> {
    const createRoleResponse = await this.sdk.submitRoleNerm({
      submitRoleRequestNERM: {
        role: {
          uid: SUPER_GLOBAL_ADMIN_UID,
          name: SUPER_GLOBAL_ADMIN_NAME,
          type: Role1NERMTypeNerm.NeaccessRole,
        },
      },
    });

    if (
      createRoleResponse.status !== 200 &&
      createRoleResponse.status !== 201
    ) {
      throw new Error(
        `Failed to create role: ${createRoleResponse.statusText}`
      );
    }

    const roleData = createRoleResponse.data as { role?: RoleNERM };
    const roleId = roleData?.role?.id;
    if (!roleId) {
      throw new Error('Role was created but ID is missing from the response');
    }

    await this.createAllPermissions(roleId);

    return roleId;
  }

  private async createAllPermissions(roleId: string): Promise<void> {
    const permissionRequests = ALL_PERMISSION_SUBJECTS.map((subject) =>
      this.sdk.createPermissionNerm({
        createPermissionRequestNERM: {
          permission: {
            role_id: roleId,
            value: ALL_PERMISSION_VALUE,
            subject,
          },
        },
      })
    );
    await Promise.all(permissionRequests);
  }
}
