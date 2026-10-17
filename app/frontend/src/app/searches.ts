import { Component, inject, signal } from '@angular/core';
import { AreaPipe } from './area.pipe';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, Job, NewSearch, Usage } from './api.service';
import { AreaMapSelector } from './area-map-selector';
import { I18n, I18nKey } from './i18n';

@Component({
  selector: 'app-searches',
  styles: `    :host { display: block; }
    .finder { padding: 24px; border-radius: 20px; }
    .big { font-size: 14px; font-weight: 500; color: var(--ink); margin-bottom: 10px; }
    .big input { min-height: 56px; font-size: 18px; border-radius: 14px; padding: 0 18px; }
    .sugg { margin-bottom: 18px; }
    .sugg-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
    .where { margin: 6px 0 16px; }
    .step-label { display: block; font-size: 14px; font-weight: 500; margin-bottom: 8px; }
    .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .tile { justify-content: flex-start; gap: 12px; min-height: 58px; padding: 0 16px; border-radius: 14px; background: transparent; color: var(--ink); border: 1px solid var(--line-strong); font-weight: 500; }
    .tile svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; color: var(--mute); }
    .tile:hover { background: var(--accent-soft); }
    .tile.on { border-color: var(--accent); background: var(--accent-soft); box-shadow: 0 0 0 1px var(--accent) inset; }
    .tile.on svg { color: var(--accent); }
    .go-row { display: flex; align-items: center; justify-content: space-between; gap: 16px 24px; flex-wrap: wrap; margin-top: 20px; }
    .meter { flex: 1 1 220px; min-width: 0; }
    .bar { display: block; height: 6px; border-radius: 999px; background: var(--skeleton); overflow: hidden; }
    .bar > span { display: block; height: 100%; border-radius: inherit; background: var(--accent); transition: width .4s ease; }
    .meter.out .bar > span { background: var(--warn); }
    .meter .txt { display: block; margin-top: 6px; font-size: 13px; color: var(--mute); }
    .meter.out .txt { color: var(--warn); }
    .go { min-height: 54px; padding: 0 28px; border-radius: 14px; font-size: 16px; }
    .go svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform .2s ease; }
    .go:hover:not(:disabled) svg { transform: translateX(3px); }
    .go:disabled { background: var(--skeleton); border-color: var(--line-strong); color: var(--mute); opacity: 1; cursor: not-allowed; }
    .past { display: flex; align-items: center; gap: 8px 20px; flex-wrap: wrap; padding: 16px 20px; transition: border-color .2s ease, transform .2s ease; }
    .past:hover { border-color: var(--accent); }
    .past-main { display: flex; flex-direction: column; flex: 1 1 240px; min-width: 0; }
    .past-main strong { font-size: 16px; }
    .past-main .mute { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .past-count { font-size: 13px; color: var(--mute); }
    .state { font-size: 12px; padding: 3px 10px; border-radius: 999px; background: var(--skeleton); color: var(--mute); }
    .state[data-status="DONE"] { background: var(--accent-soft); color: var(--accent); }
    .state[data-status="FAILED"] { color: var(--warn); }
    @media (max-width: 560px) { .finder { padding: 18px; } .tiles { grid-template-columns: 1fr; } .go { width: 100%; } }
    @media (prefers-reduced-motion: reduce) { .bar > span, .go svg { transition: none; } }
`,
  imports: [AreaPipe, FormsModule, RouterLink, AreaMapSelector],
  template: `
    <h1>{{ t('find.title') }}</h1>

    @if (profileReady() === false) {
      <div class="notice" role="status">
        {{ t('find.profileNotice') }}
        <a routerLink="/profile">{{ t('find.completeProfile') }}</a>
      </div>
    }

    <form class="card finder" (ngSubmit)="submit()">
      <label for="niche" class="big">{{ t('find.nicheLabel') }}
        <input id="niche" name="niche" required list="niches" autocomplete="off" maxlength="120"
          [placeholder]="t('find.nichePh')" [(ngModel)]="niche">
      </label>

      @if (suggested().length) {
        <div class="sugg">
          <span class="help">{{ t('find.recommended') }}</span>
          <div class="sugg-chips">
            @for (s of suggested(); track s) {
              <button type="button" class="chip" (click)="niche = i18n.niche(s)">{{ i18n.niche(s) }}</button>
            }
          </div>
        </div>
      }

      <div class="where" role="group" [attr.aria-label]="t('find.areaAria')">
        <span class="step-label">{{ t('find.areaMethod') }}</span>
        <div class="tiles">
          <button type="button" class="tile" [class.on]="mode() === 'city'" [attr.aria-pressed]="mode() === 'city'" (click)="mode.set('city')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V9l6-3v14M10 20V4l10 4v12M3 20h18M13 11h4M13 15h4"/></svg>
            {{ t('find.modeCity') }}
          </button>
          <button type="button" class="tile" [class.on]="mode() === 'map'" [attr.aria-pressed]="mode() === 'map'" (click)="mode.set('map')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4L3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5zM9 4v13.5M15 6.5V20"/></svg>
            {{ t('find.modeMap') }}
          </button>
        </div>
      </div>

      @if (mode() === 'city') {
        <label for="city">{{ t('find.citiesLabel') }}
          <input id="city" name="city" required maxlength="250" [placeholder]="t('find.citiesPh')" [(ngModel)]="city">
          <span class="help">{{ t('find.citiesHelp') }}</span>
        </label>
      } @else {
        <app-area-map-selector (bboxChange)="onBboxChange($event)"></app-area-map-selector>
      }

      <datalist id="niches">
        @for (n of niches; track n) { <option [value]="n"></option> }
      </datalist>

      <div class="go-row">
        @if (usage(); as u) {
          <div class="meter" [class.out]="u.used >= u.limit">
            <span class="bar"><span [style.width.%]="u.limit ? Math.min(100, (u.limit - u.used) / u.limit * 100) : 0"></span></span>
            <span class="txt">{{ u.used >= u.limit ? t('find.usedAll', { limit: u.limit }) : t('find.left', { left: u.limit - u.used, limit: u.limit }) }}</span>
          </div>
        }
        <button type="submit" class="go" [disabled]="busy() || profileReady() === false || limitReached() || isFormInvalid()">
          {{ busy() ? t('find.starting') : t('find.go') }}
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </button>
      </div>
      <p class="help">{{ t('find.source') }}</p>
      @if (error(); as e) { <p class="err" role="alert">{{ t(e) }}</p> }
    </form>

    <h2>{{ t('find.yourSearches') }}</h2>
    @if (loading()) {
      <div class="card skeleton-card" aria-busy="true" [attr.aria-label]="t('find.loadingAria')"><span></span><span></span></div>
    } @else {
      @for (j of jobs(); track j.id) {
        <a class="card past" [routerLink]="['/searches', j.id]">
          <span class="past-main">
            <strong>{{ i18n.niche(j.niche) }}</strong>
            <span class="mute">{{ t('find.in') }} {{ j.city | area }} · {{ i18n.date(j.createdAt, 'long') }}</span>
          </span>
          @if (j.status === 'DONE' && j.foundCount !== null) {
            <span class="past-count num">{{ t('find.foundNew', { found: j.foundCount, new: j.newCount ?? 0 }) }}</span>
          }
          <span class="state" [attr.data-status]="j.status">{{ t(label(j.status)) }}</span>
        </a>
      } @empty {
        <div class="empty"><p>{{ t('find.none') }}</p></div>
      }
    }
  `,
})
export class Searches {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly Math = Math;

  protected readonly niches = [
    'dental clinics', 'doctors and clinics', 'pharmacies', 'restaurants', 'cafes', 'hotels', 'gyms',
    'hair salons', 'lawyers', 'car repair', 'supermarkets', 'bakeries', 'schools',
  ];

  protected readonly jobs = signal<Job[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<I18nKey | null>(null);
  protected readonly mode = signal<'city' | 'map'>('city');
  protected readonly profileReady = signal<boolean | null>(null);
  protected readonly usage = signal<Usage | null>(null);
  protected readonly suggested = signal<string[]>([]);

  protected niche = '';
  protected city = 'Tunis';
  protected selectedBbox = '';

  constructor() {
    this.api.list().subscribe({
      next: j => { this.jobs.set(j); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    this.api.profile().subscribe(p => this.profileReady.set(!!p.offer.trim() && !!p.displayName.trim()));
    this.api.usage().subscribe({ next: u => this.usage.set(u.search), error: () => { /* optional */ } });
    this.api.suggestedNiches().subscribe({ next: s => this.suggested.set(s), error: () => { /* optional */ } });
  }

  protected limitReached() {
    const u = this.usage();
    return !!u && u.used >= u.limit;
  }

  protected isFormInvalid() {
    if (!this.niche.trim()) return true;
    if (this.mode() === 'city') return !this.city.trim();
    return !this.selectedBbox;
  }

  protected onBboxChange(bbox: string) {
    this.selectedBbox = bbox;
  }

  protected label(s: Job['status']): I18nKey {
    return s === 'PENDING' ? 'job.pending' : s === 'DONE' ? 'job.done' : 'job.failed';
  }

  protected submit() {
    this.busy.set(true);
    this.error.set(null);

    const payload: NewSearch = {
      niche: this.niche.trim(),
    };

    if (this.mode() === 'city') {
      const parts = this.city.split(',').map(s => s.trim()).filter(Boolean).slice(0, 3);
      payload.cities = parts;
      payload.city = parts.join(', ');
    } else {
      payload.bbox = this.selectedBbox;
      payload.city = `Map Area [${this.selectedBbox}]`;
    }

    this.api.create(payload).subscribe({
      next: job => this.router.navigate(['/searches', job.id]),
      error: e => {
        this.busy.set(false);
        if (e.status === 422) this.profileReady.set(false);
        else if (e.status === 429) this.error.set('find.errLimit');
        else this.error.set('find.errStart');
      },
    });
  }
}
