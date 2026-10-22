import { Component, computed, inject, signal, DestroyRef } from '@angular/core';
import { AreaPipe } from '../../shared/pipes/area.pipe';
import { I18n } from '../../i18n/i18n';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, Job, Lang, Lead, LeadFilters, LeadSort, LeadStatus } from '../../core/api.service';
import { Toasts } from '../../shared/toast/toast';
import { I18nKey } from '../../i18n/i18n';
import { LeadCard } from './lead-card/lead-card';

type StatusFilter = LeadStatus | 'ALL';

@Component({
  selector: 'app-leads',
  imports: [AreaPipe, FormsModule, RouterLink, LeadCard],
  templateUrl: './leads.html',
})
export class LeadsPage {
  private readonly api = inject(ApiService);
  private readonly toasts = inject(Toasts);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly statusFilters: { value: StatusFilter; key: I18nKey }[] = [
    { value: 'ALL', key: 'status.all' }, { value: 'NEW', key: 'status.new' }, { value: 'CONTACTED', key: 'status.contacted' },
    { value: 'REPLIED', key: 'status.replied' }, { value: 'NOT_INTERESTED', key: 'status.notInterested' },
  ];
  private static readonly PAGE = 40;

  protected readonly status = signal<StatusFilter>('ALL');
  /** Selection works on the leads shown on screen only; any new list clears it. */
  protected readonly selected = signal<ReadonlySet<number>>(new Set());
  protected readonly selectedCount = computed(() => this.selected().size);
  protected readonly allSelected = computed(() => this.items().length > 0 && this.items().every(l => this.selected().has(l.id)));
  protected readonly someSelected = computed(() => this.selectedCount() > 0 && !this.allSelected());
  protected readonly valuable = computed(() => this.items().filter(l => this.selected().has(l.id) && (l.status === 'CONTACTED' || l.status === 'REPLIED')).length);
  protected readonly confirming = signal(false);
  protected readonly ack = signal(false);
  protected readonly working = signal(false);
  protected shift = false;
  private lastPicked = -1;
  protected readonly reachable = signal(false);
  /** Showing the hidden leads instead of the others. */
  protected readonly hidden = signal(false);
  protected readonly hiddenCount = signal(0);
  protected readonly q = signal('');
  protected readonly searchId = signal(0);
  protected readonly sort = signal<LeadSort>('score');

  protected readonly items = signal<Lead[]>([]);
  protected readonly total = signal(0);
  protected readonly counts = signal<Record<LeadStatus, number>>({ NEW: 0, CONTACTED: 0, REPLIED: 0, NOT_INTERESTED: 0 });
  /** Leads the user has at all, with no filter applied. Decides between the empty state and the list. */
  protected readonly everything = signal(0);
  protected readonly jobs = signal<Job[]>([]);
  protected readonly lang = signal<Lang>('en');

  protected readonly loaded = signal(false);
  protected readonly loading = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly exporting = signal(false);
  protected readonly error = signal<I18nKey | null>(null);
  protected readonly remaining = computed(() => Math.min(LeadsPage.PAGE, this.total() - this.items().length));

  private page = 0;
  private ticket = 0;
  private debounce?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.debounce));
    const wanted = inject(ActivatedRoute).snapshot.queryParamMap.get('status');
    if (this.statusFilters.some(f => f.value === wanted)) this.status.set(wanted as StatusFilter);
    this.api.list().subscribe({ next: j => this.jobs.set(j.filter(x => x.status === 'DONE')), error: () => { /* filter simply stays empty */ } });
    this.api.profile().subscribe({ next: p => this.lang.set(p.language), error: () => { /* defaults to English */ } });
    this.fetch(true);
  }

  protected countFor(f: StatusFilter): number {
    const c = this.counts();
    return f === 'ALL' ? c.NEW + c.CONTACTED + c.REPLIED + c.NOT_INTERESTED : c[f];
  }

  protected onQuery(value: string) {
    this.q.set(value);
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.fetch(true), 300);
  }
  protected setStatus(s: StatusFilter) { this.status.set(s); this.fetch(true); }
  protected setSearch(id: number) { this.searchId.set(id); this.fetch(true); }
  protected setSort(s: LeadSort) { this.sort.set(s); this.fetch(true); }
  protected toggleReachable() { this.reachable.update(v => !v); this.fetch(true); }
  protected toggleHidden() { this.hidden.update(v => !v); this.status.set('ALL'); this.fetch(true); }
  protected reload() { this.fetch(true); }

  /** Remembers whether shift was held. It must return nothing: a template handler that returns false cancels the click. */
  protected trackShift(event: MouseEvent): void { this.shift = event.shiftKey; }

  protected isSelected(id: number) { return this.selected().has(id); }
  protected clearSelection() { this.selected.set(new Set()); this.lastPicked = -1; }
  protected toggleAll(event: Event) {
    // like Gmail: with anything selected the box clears the selection, with nothing selected it selects all
    this.selected.set(this.selectedCount() > 0 ? new Set() : new Set(this.items().map(l => l.id)));
    this.lastPicked = -1;
    // the browser already flipped the box; put it back in line with what is really selected
    const box = event.target as HTMLInputElement;
    box.checked = this.allSelected();
    box.indeterminate = this.someSelected();
  }
  /** The box decides: ticked adds the lead, unticked removes it. Shift-click applies the same to everything since the last click. */
  protected pick(event: Event, id: number, index: number) {
    const on = (event.target as HTMLInputElement).checked;
    const next = new Set(this.selected());
    const range = this.shift && this.lastPicked >= 0
      ? this.items().slice(Math.min(this.lastPicked, index), Math.max(this.lastPicked, index) + 1)
      : this.items().slice(index, index + 1);
    range.forEach(l => (on ? next.add(l.id) : next.delete(l.id)));
    this.selected.set(next);
    this.lastPicked = index;
  }

  private plural(one: I18nKey, many: I18nKey, n: number) { return this.t(n === 1 ? one : many, { n }); }

  /** Hide or restore the selection, with one Undo that reverses all of it. */
  protected bulk(action: 'hide' | 'restore') {
    const ids = [...this.selected()];
    if (!ids.length || this.working()) return;
    this.working.set(true);
    this.api.bulk(action, ids).subscribe({
      next: r => {
        this.working.set(false);
        const hide = action === 'hide';
        this.toasts.show(hide ? this.plural('leads.bulkHiddenOne', 'leads.bulkHidden', r.count) : this.plural('leads.bulkRestoredOne', 'leads.bulkRestored', r.count),
          { label: this.t('toast.undo'), run: () => this.api.bulk(hide ? 'restore' : 'hide', ids).subscribe({ next: () => this.fetch(true) }) });
        this.fetch(true);
      },
      error: () => { this.working.set(false); this.error.set('leads.errBulk'); },
    });
  }

  protected askDelete() {
    this.ack.set(false);
    this.confirming.set(true);
    setTimeout(() => document.getElementById('del-cancel')?.focus());
  }

  protected doDelete() {
    const ids = [...this.selected()];
    if (!ids.length || this.working()) return;
    this.working.set(true);
    this.api.bulk('delete', ids).subscribe({
      next: r => {
        this.working.set(false);
        this.confirming.set(false);
        this.toasts.show(this.plural('leads.bulkDeletedOne', 'leads.bulkDeleted', r.count));
        this.fetch(true);
      },
      error: () => { this.working.set(false); this.confirming.set(false); this.error.set('leads.errBulk'); },
    });
  }
  protected loadMore() { this.fetch(false); }

  protected clearFilters() {
    this.status.set('ALL'); this.reachable.set(false); this.hidden.set(false); this.q.set(''); this.searchId.set(0);
    this.fetch(true);
  }

  /**
   * A status change keeps the card where it is, so only the chip counts move.
   * Hiding or restoring takes the card out of this list, with a way to undo it.
   */
  protected onChanged(updated: Lead) {
    const before = this.items().find(l => l.id === updated.id);
    if (before && before.hidden !== updated.hidden) {
      this.items.update(list => list.filter(l => l.id !== updated.id));
      this.total.update(n => Math.max(0, n - 1));
      this.counts.update(c => ({ ...c, [updated.status]: Math.max(0, c[updated.status] - 1) }));
      this.hiddenCount.update(n => Math.max(0, n + (updated.hidden ? 1 : -1)));
      this.toasts.show(this.t(updated.hidden ? 'leads.hiddenToast' : 'leads.restoredToast'),
        { label: this.t('toast.undo'), run: () => this.api.setHidden(updated.id, !updated.hidden).subscribe({ next: () => this.fetch(true) }) });
      return;
    }
    this.items.update(list => list.map(l => (l.id === updated.id ? updated : l)));
    if (before && before.status !== updated.status) {
      this.counts.update(c => ({ ...c, [before.status]: Math.max(0, c[before.status] - 1), [updated.status]: c[updated.status] + 1 }));
    }
  }

  protected download() {
    this.exporting.set(true);
    this.api.exportLeads(this.filters(), this.i18n.lang()).subscribe({
      next: res => {
        const url = URL.createObjectURL(res.body as Blob);
        const a = document.createElement('a');
        a.href = url;
        // the server names the file after what is inside (business type, place, date)
        a.download = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? new Date().toISOString().slice(0, 10) + '-leadforge-leads.xlsx';
        a.click();
        URL.revokeObjectURL(url);
        this.exporting.set(false);
      },
      error: () => { this.exporting.set(false); this.error.set('leads.errExport'); },
    });
  }

  private filters(): LeadFilters {
    return { status: this.status(), reachable: this.reachable(), hidden: this.hidden(), q: this.q(), searchId: this.searchId(), sort: this.sort() };
  }

  /** Loads the first page again (reset) or the next page. A newer request makes older answers irrelevant. */
  private fetch(reset: boolean) {
    if (reset) this.clearSelection();
    const ticket = ++this.ticket;
    const page = reset ? 0 : this.page + 1;
    (reset ? this.loading : this.loadingMore).set(true);
    this.error.set(null);
    this.api.leads(this.filters(), page, LeadsPage.PAGE).subscribe({
      next: r => {
        if (ticket !== this.ticket) return;
        this.page = r.page;
        this.items.update(list => (reset ? r.items : [...list, ...r.items]));
        this.total.set(r.total);
        this.counts.set(r.counts);
        this.hiddenCount.set(r.hiddenCount);
        if (!this.loaded() || this.isUnfiltered()) {
          this.everything.set(r.counts.NEW + r.counts.CONTACTED + r.counts.REPLIED + r.counts.NOT_INTERESTED);
        }
        this.loaded.set(true);
        this.loading.set(false);
        this.loadingMore.set(false);
      },
      error: () => {
        if (ticket !== this.ticket) return;
        this.loaded.set(true);
        this.loading.set(false);
        this.loadingMore.set(false);
        this.error.set('leads.errLoad');
      },
    });
  }

  private isUnfiltered() {
    return !this.reachable() && !this.hidden() && !this.q().trim() && this.searchId() === 0;
  }
}
