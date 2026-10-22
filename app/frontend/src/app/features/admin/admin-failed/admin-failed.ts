import { Component, inject, output, signal } from '@angular/core';
import { AdminPage, AdminSearch, ApiService, JobStatus } from '../../../core/api.service';
import { I18n, I18nKey } from '../../../i18n/i18n';
import { AdminPager } from '../admin-pager/admin-pager';
import { PAGE, SearchStatus } from '../admin-model';

const STATUSES: { id: SearchStatus; label: I18nKey }[] = [
  { id: 'FAILED', label: 'admin.fStatusFailed' },
  { id: 'PENDING', label: 'admin.fStatusRunning' },
  { id: 'DONE', label: 'admin.fStatusDone' },
  { id: '', label: 'admin.roleAll' },
];

/** The searches tab: failed ones first, with the reason in plain words. */
@Component({
  selector: 'app-admin-failed',
  imports: [AdminPager],
  templateUrl: './admin-failed.html',
  styleUrl: './admin-failed.scss',
})
export class AdminFailed {
  private readonly api = inject(ApiService);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  /** True when a load failed, false when one worked; the page shows the retry notice. */
  readonly loadError = output<boolean>();

  protected readonly statuses = STATUSES;
  protected readonly failed = signal<AdminPage<AdminSearch> | null>(null);
  protected readonly failedLoading = signal(false);
  protected readonly fstatus = signal<SearchStatus>('FAILED');
  private failedRequest = 0;

  constructor() {
    this.loadFailed(0);
  }

  reload() {
    this.loadFailed(0);
  }

  protected setStatus(status: SearchStatus) {
    this.fstatus.set(status);
    this.loadFailed(0);
  }

  protected loadFailed(page: number) {
    const id = ++this.failedRequest;
    this.failedLoading.set(true);
    this.api.adminSearches(this.fstatus(), page, PAGE).subscribe({
      next: p => { if (id === this.failedRequest) { this.failed.set(p); this.failedLoading.set(false); this.loadError.emit(false); } },
      error: () => { if (id === this.failedRequest) { this.failedLoading.set(false); this.loadError.emit(true); } },
    });
  }

  protected statusKey(status: JobStatus): I18nKey {
    return `admin.st.${status}` as I18nKey;
  }

  /** The reason a search failed in plain words, with what to check; the raw text stays visible under it. */
  protected why(s: AdminSearch): { title: string; hint: I18nKey | null; raw: string | null } {
    const raw = s.failureReason;
    if (!raw) return { title: this.t('admin.noReason'), hint: null, raw: null };
    if (raw.startsWith('No result from the search workflow')) return { title: this.t('admin.why.timeout'), hint: 'admin.why.timeoutHint', raw };
    if (raw.startsWith('Could not reach the search service')) return { title: this.t('admin.why.unreachable'), hint: 'admin.why.unreachableHint', raw };
    return { title: raw, hint: null, raw: null };
  }
}
