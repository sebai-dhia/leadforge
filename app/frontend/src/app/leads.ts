import { Component, computed, inject, signal, DestroyRef } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, Job, Lang, Lead, LeadFilters, LeadSort, LeadStatus } from './api.service';
import { LeadCard } from './lead-card';

type StatusFilter = LeadStatus | 'ALL';

@Component({
  selector: 'app-leads',
  imports: [FormsModule, RouterLink, DatePipe, LeadCard],
  template: `
    <div class="page-head">
      <h1>Your leads</h1>
      <button type="button" class="ghost" (click)="download()" [disabled]="exporting() || total() === 0">
        {{ exporting() ? 'Preparing…' : 'Export CSV' }}
      </button>
    </div>

    @if (!loaded()) {
      <div class="card skeleton-card" aria-busy="true" aria-label="Loading leads"><span></span><span></span><span></span></div>
      <div class="card skeleton-card"><span></span><span></span><span></span></div>
    } @else if (everything() === 0 && !error()) {
      <div class="empty">
        <p><strong>No leads yet.</strong></p>
        <p>Every business you find is saved here once, even if several searches return it.</p>
        <a class="btn" routerLink="/searches">Find your first leads</a>
      </div>
    } @else {
      <div class="toolbar">
        <label class="grow" for="q">Search your leads
          <input id="q" type="search" placeholder="Name or address" autocomplete="off" [ngModel]="q()" (ngModelChange)="onQuery($event)">
        </label>
        <label for="search">From search
          <select id="search" [ngModel]="searchId()" (ngModelChange)="setSearch($event)">
            <option [ngValue]="0">All searches</option>
            @for (j of jobs(); track j.id) {
              <option [ngValue]="j.id">{{ j.niche }} in {{ j.city }} ({{ j.createdAt | date: 'MMM d, HH:mm' }})</option>
            }
          </select>
        </label>
        <label for="sort">Sort by
          <select id="sort" [ngModel]="sort()" (ngModelChange)="setSort($event)">
            <option value="score">Best fit</option>
            <option value="recent">Recently found</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>

      <div class="chips" role="group" aria-label="Filter by status">
        @for (f of statusFilters; track f.value) {
          <button type="button" class="chip" [class.on]="status() === f.value" [attr.aria-pressed]="status() === f.value"
            (click)="setStatus(f.value)">{{ f.label }} <span class="num">{{ countFor(f.value) }}</span></button>
        }
        <button type="button" class="chip" [class.on]="reachable()" [attr.aria-pressed]="reachable()"
          (click)="toggleReachable()">Has a way to contact</button>
      </div>

      @if (error()) { <p class="err" role="alert">{{ error() }} <button type="button" class="ghost" (click)="reload()">Try again</button></p> }

      <p class="mute" role="status">
        @if (loading()) { Updating… }
        @else { Showing {{ items().length }} of {{ total() }} {{ total() === 1 ? 'lead' : 'leads' }} }
      </p>

      @for (l of items(); track l.id) {
        <app-lead-card [lead]="l" [defaultLanguage]="lang()" [collapsible]="true" (changed)="onChanged($event)" />
      } @empty {
        @if (!loading()) {
          <div class="empty">
            <p>No leads match these filters.</p>
            <button type="button" class="ghost" (click)="clearFilters()">Clear filters</button>
          </div>
        }
      }

      @if (items().length < total()) {
        <div class="more">
          <button type="button" class="ghost" (click)="loadMore()" [disabled]="loadingMore()">
            {{ loadingMore() ? 'Loading…' : 'Load ' + remaining() + ' more' }}
          </button>
        </div>
      }
    }
  `,
})
export class LeadsPage {
  private readonly api = inject(ApiService);

  protected readonly statusFilters: { value: StatusFilter; label: string }[] = [
    { value: 'ALL', label: 'All' }, { value: 'NEW', label: 'New' }, { value: 'CONTACTED', label: 'Contacted' },
    { value: 'REPLIED', label: 'Replied' }, { value: 'NOT_INTERESTED', label: 'Not interested' },
  ];
  private static readonly PAGE = 40;

  protected readonly status = signal<StatusFilter>('ALL');
  protected readonly reachable = signal(false);
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
  protected readonly error = signal('');
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
  protected toggleReachable() { this.reachable.update(v => !v); this.fetch(true); }
  protected reload() { this.fetch(true); }
  protected loadMore() { this.fetch(false); }

  protected clearFilters() {
    this.status.set('ALL'); this.reachable.set(false); this.q.set(''); this.searchId.set(0);
    this.fetch(true);
  }

  /** A status change keeps the card where it is, so only the chip counts move. */
  protected onChanged(updated: Lead) {
    const before = this.items().find(l => l.id === updated.id);
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
      error: () => { this.exporting.set(false); this.error.set('Could not create the file.'); },
    });
  }

  private filters(): LeadFilters {
    return { status: this.status(), reachable: this.reachable(), q: this.q(), searchId: this.searchId(), sort: this.sort() };
  }

  /** Loads the first page again (reset) or the next page. A newer request makes older answers irrelevant. */
  private fetch(reset: boolean) {
    const ticket = ++this.ticket;
    const page = reset ? 0 : this.page + 1;
    (reset ? this.loading : this.loadingMore).set(true);
    this.error.set('');
    this.api.leads(this.filters(), page, LeadsPage.PAGE).subscribe({
      next: r => {
        if (ticket !== this.ticket) return;
        this.page = r.page;
        this.items.update(list => (reset ? r.items : [...list, ...r.items]));
        this.total.set(r.total);
        this.counts.set(r.counts);
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
        this.error.set('Could not load your leads. Check that the backend is running.');
      },
    });
  }

  private isUnfiltered() {
    return !this.reachable() && !this.q().trim() && this.searchId() === 0;
  }
}
