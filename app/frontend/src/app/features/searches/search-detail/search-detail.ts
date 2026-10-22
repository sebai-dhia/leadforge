import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { AreaPipe } from '../../../shared/pipes/area.pipe';
import { Router, RouterLink } from '@angular/router';
import { ApiService, Job, Lang, Lead, LeadStatus, NewSearch } from '../../../core/api.service';
import { LeadCard } from '../../leads/lead-card/lead-card';
import { I18n, I18nKey } from '../../../i18n/i18n';

type Filter = LeadStatus | 'ALL';

@Component({
  selector: 'app-search-detail',
  imports: [AreaPipe, RouterLink, LeadCard],
  templateUrl: './search-detail.html',
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

