import { Component, inject, signal, viewChild } from '@angular/core';
import { AdminOverview, ApiService } from '../../core/api.service';
import { AdminSettings } from './admin-settings/admin-settings';
import { AdminFailed } from './admin-failed/admin-failed';
import { AdminOverviewTab } from './admin-overview/admin-overview';
import { AdminUsers } from './admin-users/admin-users';
import { Tab } from './admin-model';
import { I18n, I18nKey } from '../../i18n/i18n';

/** Read-only numbers for the admin. The admin's own work stays on the normal pages. */
@Component({
  selector: 'app-admin',
  imports: [AdminOverviewTab, AdminUsers, AdminFailed, AdminSettings],
  styleUrl: './admin.scss',
  templateUrl: './admin.html',
})
export class AdminDashboard {
  private readonly api = inject(ApiService);
  protected readonly t = inject(I18n).t;

  protected readonly tabs: { id: Tab; label: I18nKey }[] = [
    { id: 'overview', label: 'admin.tabOverview' },
    { id: 'users', label: 'admin.tabUsers' },
    { id: 'failed', label: 'admin.tabFailed' },
    { id: 'settings', label: 'admin.tabSettings' },
  ];

  protected readonly tab = signal<Tab>('overview');
  protected readonly error = signal(false);
  /** Loaded here because the Searches tab shows how many failed in the last day. */
  protected readonly overview = signal<AdminOverview | null>(null);

  private readonly users = viewChild(AdminUsers);
  private readonly failed = viewChild(AdminFailed);

  constructor() {
    this.loadOverview();
  }

  protected open(tab: Tab) {
    this.tab.set(tab);
    this.error.set(false);
    if (tab === 'overview') this.loadOverview();
  }

  protected reload() {
    this.error.set(false);
    const tab = this.tab();
    if (tab === 'overview') this.loadOverview();
    if (tab === 'users') this.users()?.reload();
    if (tab === 'failed') this.failed()?.reload();
  }

  private loadOverview() {
    this.api.adminOverview().subscribe({
      next: o => { this.overview.set(o); this.error.set(false); },
      error: () => this.error.set(true),
    });
  }
}
