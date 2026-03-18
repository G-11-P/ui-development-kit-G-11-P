import { Component } from '@angular/core';

import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ConnectionService } from '../../../services/connection.service';

@Component({
  selector: 'app-shortcuts',
  imports: [MatCardModule, MatIconModule, MatButtonModule, MatTooltipModule],
  templateUrl: './shortcuts.component.html',
  styleUrl: './shortcuts.component.scss'
})
export class ShortcutsComponent {
  tenantUrl: string = '';

  constructor(private connectionService: ConnectionService) {
    this.connectionService.currentEnvironmentSubject$.subscribe((environment) => {
      if (environment) {
        this.tenantUrl = environment.baseUrl;
        console.log('tenantUrl', this.tenantUrl);
      }
    });
  }

  shortcutCategories = [
    {
      title: 'Tenant Management',
      icon: 'admin_panel_settings',
      shortcuts: [
        {
          icon: 'vpn_key',
          label: 'Grant Tenant Access',
          url: `:TENANTURL:/ui/a/admin/global/grant-tenant-access`
        },
        {
          icon: 'dashboard',
          label: 'Dashboard',
          url: `:TENANTURL:/ui/admin#admin:dashboard:overview`
        },
        {
          icon: 'person',
          label: 'Identity Profiles',
          url: `:TENANTURL:/ui/admin#admin:identities:profiles`
        },
        {
          icon: 'list_alt',
          label: 'Identity List',
          url: `:TENANTURL:/ui/a/admin/identities/all-identities`
        },
        {
          icon: 'admin_panel_settings',
          label: 'Access Profiles',
          url: `:TENANTURL:/ui/a/admin/access/access-profiles/landing`
        },
        {
          icon: 'security',
          label: 'Roles',
          url: `:TENANTURL:/ui/a/admin/access/roles/landing-page`
        },
        {
          icon: 'link',
          label: 'Sources',
          url: `:TENANTURL:/ui/a/admin/connections/sources-list/configured-sources`
        },
        {
          icon: 'computer',
          label: 'Virtual Appliances',
          url: `:TENANTURL:/ui/a/admin/connections/virtual-appliances/clusters-list`
        }
      ]
    },
    {
      title: 'Developer Resources',
      icon: 'code',
      shortcuts: [
        {
          icon: 'groups',
          label: 'Developer Community',
          url: 'https://developer.sailpoint.com/discuss/'
        },
        {
          icon: 'description',
          label: 'API Documentation',
          url: 'https://developer.sailpoint.com/idn/api/v3'
        },
        {
          icon: 'terminal',
          label: 'CLI Documentation',
          url: 'https://developer.sailpoint.com/idn/tools/cli'
        },
        {
          icon: 'extension',
          label: 'Connector Reference',
          url: 'https://community.sailpoint.com/t5/IdentityNow-Connectors/IdentityNow-Connectors/ta-p/80019'
        },
        {
          icon: 'functions',
          label: 'Transform Guides',
          url: 'https://developer.sailpoint.com/docs/extensibility/transforms/'
        },
        {
          icon: 'library_books',
          label: 'Rules Documentation',
          url: 'https://developer.sailpoint.com/docs/extensibility/rules'
        },
        {
          icon: 'lock',
          label: 'User Level Access Matrix',
          url: 'https://documentation.sailpoint.com/saas/help/common/users/user_level_matrix.html'
        }
      ]
    },
    {
      title: 'Support & Help',
      icon: 'help',
      shortcuts: [
        {
          icon: 'support_agent',
          label: 'Submit a ticket',
          url: 'https://support.sailpoint.com/csm?id=sc_cat_item&sys_id=a78364e81bec151050bcc8866e4bcb5c&referrer=popular_items'
        },
        {
          icon: 'visibility',
          label: 'Scope of SaaS Support',
          url: 'https://community.sailpoint.com/t5/IdentityNow-Wiki/What-is-supported-by-SaaS-Support/ta-p/198779'
        },
        {
          icon: 'help',
          label: 'Support Knowledge Base',
          url: 'https://support.sailpoint.com/'
        }
      ]
    }
  ];

  onShortcutClick(shortcut: { icon: string; label: string; url: string }): void {
    window.open(shortcut.url.replace(':TENANTURL:', this.tenantUrl), '_blank');
  }
} 