import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { AreaPipe } from './area.pipe';
import { RouterLink } from '@angular/router';
import { ApiService, Job, Lang, Lead, LeadStatus } from './api.service';
import { LeadCard } from './lead-card';

type Filter = LeadStatus | 'ALL';

@Component({
  selector: 'app-search-detail',
  imports: [AreaPipe, RouterLink, LeadCard],
  template: `
    <p><a routerLink="/searches">← All searches</a> · <a routerLink="/leads">All your leads</a></p>

    @if (!job()) {
      <div class="card skeleton-card" aria-busy="true" aria-label="Loading"><span></span><span></span><span></span></div>
    } @else {
      <h1>{{ job()!.niche }} in {{ job()!.city | area }}</h1>

      @switch (job()!.status) {
        @case ('PENDING') {
          <div class="progress" role="status">
            <span class="dots" aria-hidden="true"></span>
            Finding businesses and scoring them. This page updates by itself, about a minute.
          </div>
          <div class="card skeleton-card"><span></span><span></span><span></span></div>
          <div class="card skeleton-card"><span></span><span></span><span></span></div>
        }
        @case ('FAILED') {
          <p class="err" role="alert">This search did not finish. Check that n8n is running, then start it again from the searches page.</p>
        }
        @default {
          @if (leads().length === 0) {
            <p class="mute">No businesses were found. Try a broader business type or a different city.</p>
          } @else {
            <p class="mute">
              {{ leads().length }} businesses, best fit first.
              @if (job()!.newCount !== null) {
                <strong>{{ job()!.newCount }} new to you</strong>, {{ leads().length - job()!.newCount! }} already in your leads.
              }
              Open a lead to write a message when you want to contact it.
            </p>

            <div class="chips" role="group" aria-label="Filter leads">
              @for (f of filters; track f.value) {
                <button type="button" class="chip" [class.on]="filter() === f.value"
                  [attr.aria-pressed]="filter() === f.value" (click)="filter.set(f.value)">
                  {{ f.label }} <span class="num">{{ count(f.value) }}</span>
                </button>
              }
              <button type="button" class="chip" [class.on]="reachable()" [attr.aria-pressed]="reachable()"
                (click)="reachable.set(!reachable())">
                Has a way to contact <span class="num">{{ reachableCount() }}</span>
              </button>
            </div>

            @for (l of visible(); track l.id) {
              <app-lead-card [lead]="l" [defaultLanguage]="lang()" [seenBefore]="isKnown(l)" (changed)="onChanged($event)" />
            } @empty {
              <div class="empty">
                <p>No leads match this filter.</p>
                <button type="button" class="ghost" (click)="reset()">Show all leads</button>
              </div>
            }
          }
        }
      }
    }
  `,
})
export class SearchDetail {
  readonly id = input.required<string>(); // bound from the route param

  private readonly api = inject(ApiService);
  protected readonly job = signal<Job | null>(null);
  protected readonly leads = signal<Lead[]>([]);
  protected readonly lang = signal<Lang>('en');
  protected readonly filter = signal<Filter>('ALL');
  protected readonly reachable = signal(false);
  private timer?: ReturnType<typeof setTimeout>;

  protected readonly filters: { value: Filter; label: string }[] = [
    { value: 'ALL', label: 'All' }, { value: 'NEW', label: 'New' }, { value: 'CONTACTED', label: 'Contacted' },
    { value: 'REPLIED', label: 'Replied' }, { value: 'NOT_INTERESTED', label: 'Not interested' },
  ];

  private static isReachable(l: Lead) { return !!l.emails.length || !!l.phone || !!l.social.length; }

  protected readonly visible = computed(() => this.leads().filter(l =>
    (this.filter() === 'ALL' || l.status === this.filter()) && (!this.reachable() || SearchDetail.isReachable(l))));
  protected readonly reachableCount = computed(() => this.leads().filter(SearchDetail.isReachable).length);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
    this.api.profile().subscribe({ next: p => this.lang.set(p.language), error: () => { /* default stays English */ } });
    queueMicrotask(() => this.load());
  }

  protected count(f: Filter) {
    return f === 'ALL' ? this.leads().length : this.leads().filter(l => l.status === f).length;
  }

  protected onChanged(updated: Lead) {
    this.leads.update(list => list.map(l => (l.id === updated.id ? updated : l)));
  }

  /** Found by an earlier search, so it was already in the user's leads. */
  protected isKnown(l: Lead): boolean {
    const created = this.job()?.createdAt;
    return !!l.firstSeenAt && !!created && new Date(l.firstSeenAt).getTime() < new Date(created).getTime();
  }

  protected reset() {
    this.filter.set('ALL');
    this.reachable.set(false);
  }

  private load() {
    this.api.get(this.id()).subscribe({
      next: r => {
        this.job.set(r.job);
        if (r.job.status !== 'PENDING') this.leads.set(r.leads);
        if (r.job.status === 'PENDING') this.timer = setTimeout(() => this.load(), 4000);
      },
    });
  }
}

