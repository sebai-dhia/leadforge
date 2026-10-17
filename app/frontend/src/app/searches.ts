import { Component, inject, signal } from '@angular/core';
import { AreaPipe } from './area.pipe';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, Job, NewSearch, Usage } from './api.service';
import { AreaMapSelector } from './area-map-selector';
import { I18n, I18nKey } from './i18n';

@Component({
  selector: 'app-searches',
  imports: [AreaPipe, FormsModule, RouterLink, AreaMapSelector],
  template: `
    <h1>{{ t('find.title') }}</h1>

    @if (profileReady() === false) {
      <div class="notice" role="status">
        {{ t('find.profileNotice') }}
        <a routerLink="/profile">{{ t('find.completeProfile') }}</a>
      </div>
    }

    <form class="card" (ngSubmit)="submit()">
      <div class="grid">
        <label for="niche" class="full">{{ t('find.nicheLabel') }}
          <input id="niche" name="niche" required list="niches" autocomplete="off" maxlength="120"
            [placeholder]="t('find.nichePh')" [(ngModel)]="niche">
        </label>
      </div>

      @if (suggested().length) {
        <div style="margin-top: -4px; margin-bottom: 10px;">
          <span class="help" style="margin-bottom: 6px;">{{ t('find.recommended') }}</span>
          <div class="row" style="gap: 6px; justify-content: flex-start;">
            @for (s of suggested(); track s) {
              <button type="button" class="btn ghost small" (click)="niche = i18n.niche(s)"
                style="min-height: 28px; padding: 3px 8px; font-size: 12px;">{{ i18n.niche(s) }}</button>
            }
          </div>
        </div>
      }

      <div class="row" style="margin-top: 8px; margin-bottom: 8px;">
        <span class="mute" style="font-size: 13px;">{{ t('find.areaMethod') }}</span>
        <div class="seg" role="group" [attr.aria-label]="t('find.areaAria')">
          <button type="button" class="seg-btn" [class.on]="mode() === 'city'" (click)="mode.set('city')">{{ t('find.modeCity') }}</button>
          <button type="button" class="seg-btn" [class.on]="mode() === 'map'" (click)="mode.set('map')">{{ t('find.modeMap') }}</button>
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

      <div class="actions" style="margin-top: 14px;">
        <button type="submit" [disabled]="busy() || profileReady() === false || limitReached() || isFormInvalid()">
          {{ busy() ? t('find.starting') : t('find.go') }}
        </button>
      </div>

      <datalist id="niches">
        @for (n of niches; track n) { <option [value]="n"></option> }
      </datalist>

      <p class="help">
        {{ t('find.source') }}
        @if (usage(); as u) {
          <span [class.err]="u.used >= u.limit">
            {{ u.used >= u.limit ? t('find.usedAll', { limit: u.limit }) : t('find.left', { left: u.limit - u.used, limit: u.limit }) }}
          </span>
        }
      </p>
      @if (error(); as e) { <p class="err" role="alert">{{ t(e) }}</p> }
    </form>

    <h2>{{ t('find.yourSearches') }}</h2>
    @if (loading()) {
      <div class="card skeleton-card" aria-busy="true" [attr.aria-label]="t('find.loadingAria')"><span></span><span></span></div>
    } @else {
      @for (j of jobs(); track j.id) {
        <a class="card row link" [routerLink]="['/searches', j.id]">
          <span>
            <strong>{{ i18n.niche(j.niche) }}</strong> {{ t('find.in') }} {{ j.city | area }}
            
          </span>
          <span class="mute">
            @if (j.status === 'DONE' && j.foundCount !== null) { {{ t('find.foundNew', { found: j.foundCount, new: j.newCount ?? 0 }) }} · }
            {{ i18n.date(j.createdAt, 'long') }} · <span [class]="'badge ' + j.status">{{ t(label(j.status)) }}</span>
          </span>
        </a>
      } @empty {
        <p class="mute">{{ t('find.none') }}</p>
      }
    }
  `,
})
export class Searches {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

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
