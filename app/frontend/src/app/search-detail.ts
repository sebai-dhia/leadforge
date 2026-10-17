import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { AreaPipe } from './area.pipe';
import { RouterLink } from '@angular/router';
import { ApiService, Job, Lang, Lead, LeadStatus } from './api.service';
import { LeadCard } from './lead-card';
import { I18n, I18nKey } from './i18n';

type Filter = LeadStatus | 'ALL';

@Component({
  selector: 'app-search-detail',
  imports: [AreaPipe, RouterLink, LeadCard],
  template: `
    <p><a routerLink="/searches">{{ t('sd.back') }}</a> · <a routerLink="/leads">{{ t('sd.all') }}</a></p>

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
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly job = signal<Job | null>(null);
  protected readonly leads = signal<Lead[]>([]);
  protected readonly lang = signal<Lang>('en');
  protected readonly filter = signal<Filter>('ALL');
  protected readonly reachable = signal(false);
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

