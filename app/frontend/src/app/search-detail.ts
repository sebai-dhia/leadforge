import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { AreaPipe } from './area.pipe';
import { Router, RouterLink } from '@angular/router';
import { ApiService, Job, Lang, Lead, LeadStatus, NewSearch } from './api.service';
import { LeadCard } from './lead-card';
import { I18n, I18nKey } from './i18n';

type Filter = LeadStatus | 'ALL';

@Component({
  selector: 'app-search-detail',
  imports: [AreaPipe, RouterLink, LeadCard],
  template: `
    <nav class="page-nav" [attr.aria-label]="t('sd.navAria')">
      <a routerLink="/searches" class="nav-back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
        {{ t('sd.back') }}
      </a>
      <a routerLink="/leads" class="nav-leads">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/></svg>
        {{ t('sd.all') }}
      </a>
    </nav>

    @if (!job()) {
      <div class="card skeleton-card" aria-busy="true" [attr.aria-label]="t('sd.loadingAria')"><span></span><span></span><span></span></div>
    } @else {
      <h1>{{ t('find.searchIn', { niche: i18n.niche(job()!.niche), city: (job()!.city | area) }) }}</h1>

      @switch (job()!.status) {
        @case ('PENDING') {
          <div class="progress" role="status">
            <span class="dots" aria-hidden="true"></span>
            {{ t('sd.progress') }}
          </div>
          <div class="card skeleton-card"><span></span><span></span><span></span></div>
          <div class="card skeleton-card"><span></span><span></span><span></span></div>
        }
        @case ('FAILED') {
          <p class="err" role="alert">{{ t('sd.failed') }}</p>
          <div class="actions">
            <button type="button" [disabled]="retrying()" (click)="retry()">{{ retrying() ? t('sd.retrying') : t('sd.retry') }}</button>
          </div>
          @if (retryError(); as e) { <p class="err" role="alert">{{ t(e) }}</p> }
        }
        @default {
          @if (leads().length === 0) {
            <p class="mute">{{ t('sd.none') }}</p>
          } @else {
            <p class="mute">
              {{ t('sd.summary', { n: leads().length }) }}
              @if (job()!.newCount !== null) {
                <strong>{{ t('sd.newToYou', { n: job()!.newCount ?? 0 }) }}</strong>, {{ t('sd.already', { m: leads().length - (job()!.newCount ?? 0) }) }}
              }
              {{ t('sd.openHint') }}
            </p>

            <div class="chips" role="group" [attr.aria-label]="t('sd.filterAria')">
              @for (f of filters; track f.value) {
                <button type="button" class="chip" [class.on]="filter() === f.value"
                  [attr.aria-pressed]="filter() === f.value" (click)="filter.set(f.value)">
                  {{ t(f.key) }} <span class="num">{{ count(f.value) }}</span>
                </button>
              }
              <button type="button" class="chip" [class.on]="reachable()" [attr.aria-pressed]="reachable()"
                (click)="reachable.set(!reachable())">
                {{ t('leads.reachable') }} <span class="num">{{ reachableCount() }}</span>
              </button>
            </div>

            @for (l of visible(); track l.id) {
              <app-lead-card [lead]="l" [defaultLanguage]="lang()" [seenBefore]="isKnown(l)" (changed)="onChanged($event)" />
            } @empty {
              <div class="empty">
                <p>{{ t('sd.noMatch') }}</p>
                <button type="button" class="ghost" (click)="reset()">{{ t('sd.showAll') }}</button>
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
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly job = signal<Job | null>(null);
  protected readonly leads = signal<Lead[]>([]);
  protected readonly lang = signal<Lang>('en');
  protected readonly filter = signal<Filter>('ALL');
  protected readonly reachable = signal(false);
  protected readonly retrying = signal(false);
  protected readonly retryError = signal<I18nKey | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  protected readonly filters: { value: Filter; key: I18nKey }[] = [
    { value: 'ALL', key: 'status.all' }, { value: 'NEW', key: 'status.new' }, { value: 'CONTACTED', key: 'status.contacted' },
    { value: 'REPLIED', key: 'status.replied' }, { value: 'NOT_INTERESTED', key: 'status.notInterested' },
  ];

  private static isReachable(l: Lead) { return !!l.emails.length || !!l.phone || !!l.social.length; }

  protected readonly visible = computed(() => this.leads().filter(l =>
    (this.filter() === 'ALL' || l.status === this.filter()) && (!this.reachable() || SearchDetail.isReachable(l))));
  protected readonly reachableCount = computed(() => this.leads().filter(SearchDetail.isReachable).length);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
    this.api.profile().subscribe({ next: p => this.lang.set(p.language), error: () => { /* default stays English */ } });
    // the same page is reused when a retry moves to a new search, so load again whenever the id changes
    effect(() => {
      this.id();
      untracked(() => {
        clearTimeout(this.timer);
        this.job.set(null);
        this.leads.set([]);
        this.filter.set('ALL');
        this.reachable.set(false);
        this.load();
      });
    });
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

  /** Starts the same search again as a new one. The failed one was already refunded, so it costs nothing extra. */
  protected retry() {
    const job = this.job();
    if (!job) return;
    const payload: NewSearch = { niche: job.niche };
    if (job.bbox) {
      payload.bbox = job.bbox;
      payload.city = job.city;
    } else {
      const cities = job.city.split('|').map(c => c.trim()).filter(Boolean);
      payload.cities = cities;
      payload.city = cities.join(', ');
    }
    this.retrying.set(true);
    this.retryError.set(null);
    this.api.create(payload).subscribe({
      next: j => { this.retrying.set(false); this.router.navigate(['/searches', j.id]); },
      error: e => {
        this.retrying.set(false);
        this.retryError.set(e.status === 429 ? 'find.errLimit' : 'find.errStart');
      },
    });
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

