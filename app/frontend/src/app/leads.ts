import { Component, computed, inject, signal, DestroyRef } from '@angular/core';
import { AreaPipe } from './area.pipe';
import { I18n } from './i18n';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, Job, Lang, Lead, LeadFilters, LeadSort, LeadStatus } from './api.service';
import { Toasts } from './toast';
import { I18nKey } from './i18n';
import { LeadCard } from './lead-card';

type StatusFilter = LeadStatus | 'ALL';

@Component({
  selector: 'app-leads',
  imports: [AreaPipe, FormsModule, RouterLink, LeadCard],
  template: `
    <div class="page-head">
      <h1>{{ t('leads.title') }}</h1>
      <button type="button" class="ghost" (click)="download()" [disabled]="exporting() || total() === 0">
        {{ exporting() ? t('leads.preparing') : t('leads.export') }}
      </button>
    </div>

    @if (!loaded()) {
      <div class="card skeleton-card" aria-busy="true" [attr.aria-label]="t('leads.loadingAria')"><span></span><span></span><span></span></div>
      <div class="card skeleton-card"><span></span><span></span><span></span></div>
    } @else if (everything() === 0 && hiddenCount() === 0 && !error()) {
      <div class="empty">
        <p><strong>{{ t('leads.emptyTitle') }}</strong></p>
        <p>{{ t('leads.emptyText') }}</p>
        <a class="btn" routerLink="/searches">{{ t('leads.emptyCta') }}</a>
      </div>
    } @else {
      <div class="toolbar">
        <label class="grow search" for="q">{{ t('leads.searchLabel') }}
          <span class="field">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>
            <input id="q" type="search" [placeholder]="t('leads.searchPh')" autocomplete="off" [ngModel]="q()" (ngModelChange)="onQuery($event)">
          </span>
        </label>
        <label for="search">{{ t('leads.fromSearch') }}
          <select id="search" [ngModel]="searchId()" (ngModelChange)="setSearch($event)">
            <option [ngValue]="0">{{ t('leads.allSearches') }}</option>
            @for (j of jobs(); track j.id) {
              <option [ngValue]="j.id">{{ t('leads.searchOption', { niche: i18n.niche(j.niche), city: (j.city | area), date: i18n.date(j.createdAt) }) }}</option>
            }
          </select>
        </label>
        <label for="sort">{{ t('leads.sortBy') }}
          <select id="sort" [ngModel]="sort()" (ngModelChange)="setSort($event)">
            <option value="score">{{ t('leads.sortScore') }}</option>
            <option value="recent">{{ t('leads.sortRecent') }}</option>
            <option value="name">{{ t('leads.sortName') }}</option>
          </select>
        </label>
      </div>

      <div class="chips" role="group" [attr.aria-label]="t('status.filterAria')">
        @for (f of statusFilters; track f.value) {
          <button type="button" class="chip" [class.on]="status() === f.value" [attr.aria-pressed]="status() === f.value"
            (click)="setStatus(f.value)">{{ t(f.key) }} <span class="num">{{ countFor(f.value) }}</span></button>
        }
        <span class="sp"></span>
        @if (hiddenCount() > 0 || hidden()) {
          <button type="button" class="chip hidden-chip" [class.on]="hidden()" [attr.aria-pressed]="hidden()"
            (click)="toggleHidden()">{{ t('leads.hiddenChip') }} <span class="num">{{ hiddenCount() }}</span></button>
        }
        @for (g of signalGroups; track g) {
          <button type="button" class="chip" [class.on]="signal() === g" [attr.aria-pressed]="signal() === g" [title]="t('leads.signalHint')"
            (click)="setSignal(g)">{{ t(signalKey[g]) }}</button>
        }
        <button type="button" class="chip reach-chip" [class.on]="reachable()" [attr.aria-pressed]="reachable()"
          (click)="toggleReachable()">{{ t('leads.reachable') }}</button>
      </div>

      @if (error(); as e) { <p class="err" role="alert">{{ t(e) }} <button type="button" class="ghost" (click)="reload()">{{ t('leads.tryAgain') }}</button></p> }

      <p class="mute" role="status">
        @if (loading()) { {{ t('leads.updating') }} }
        @else { {{ t(total() === 1 ? 'leads.showingOne' : 'leads.showing', { n: items().length, total: total() }) }} }
      </p>

      @for (l of items(); track l.id; let i = $index) {
        <app-lead-card class="enter" [style.--i]="i % 12" [lead]="l" [defaultLanguage]="lang()" [collapsible]="true" (changed)="onChanged($event)" />
      } @empty {
        @if (!loading()) {
          <div class="empty">
            <p>{{ t('leads.noMatch') }}</p>
            <button type="button" class="ghost" (click)="clearFilters()">{{ t('leads.clear') }}</button>
          </div>
        }
      }

      @if (items().length < total()) {
        <div class="more">
          <button type="button" class="ghost" (click)="loadMore()" [disabled]="loadingMore()">
            {{ loadingMore() ? t('leads.loadingMore') : t('leads.loadMore', { n: remaining() }) }}
          </button>
        </div>
      }
    }
  `,
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
  protected readonly reachable = signal(false);
  protected readonly signalGroups = ['gap', 'pain', 'neglect', 'momentum'] as const;
  protected readonly signalKey = { gap: 'leads.signal.gap', pain: 'leads.signal.pain', neglect: 'leads.signal.neglect', momentum: 'leads.signal.momentum' } as const;
  protected readonly signal = signal<'' | 'gap' | 'pain' | 'neglect' | 'momentum'>('');
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
  protected setSignal(g: 'gap' | 'pain' | 'neglect' | 'momentum') { this.signal.update(v => (v === g ? '' : g)); this.fetch(true); }
  protected toggleReachable() { this.reachable.update(v => !v); this.fetch(true); }
  protected toggleHidden() { this.hidden.update(v => !v); this.status.set('ALL'); this.fetch(true); }
  protected reload() { this.fetch(true); }
  protected loadMore() { this.fetch(false); }

  protected clearFilters() {
    this.status.set('ALL'); this.reachable.set(false); this.signal.set(''); this.hidden.set(false); this.q.set(''); this.searchId.set(0);
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
    this.api.exportCsv(this.filters()).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'leads.csv';
        a.click();
        URL.revokeObjectURL(url);
        this.exporting.set(false);
      },
      error: () => { this.exporting.set(false); this.error.set('leads.errExport'); },
    });
  }

  private filters(): LeadFilters {
    return { status: this.status(), reachable: this.reachable(), signal: this.signal(), hidden: this.hidden(), q: this.q(), searchId: this.searchId(), sort: this.sort() };
  }

  /** Loads the first page again (reset) or the next page. A newer request makes older answers irrelevant. */
  private fetch(reset: boolean) {
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
    return !this.reachable() && !this.signal() && !this.hidden() && !this.q().trim() && this.searchId() === 0;
  }
}
