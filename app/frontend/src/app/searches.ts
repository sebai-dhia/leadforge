import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, Job, NewSearch, Usage } from './api.service';
import { AreaMapSelector } from './area-map-selector';

@Component({
  selector: 'app-searches',
  imports: [FormsModule, RouterLink, DatePipe, AreaMapSelector],
  template: `
    <h1>Find leads</h1>

    @if (profileReady() === false) {
      <div class="notice" role="status">
        Add what you offer and your name before searching, so every message can be written for you.
        <a routerLink="/profile">Complete your profile</a>
      </div>
    }

    <form class="card" (ngSubmit)="submit()">
      <div class="grid">
        <label for="niche" class="full">Business type
          <input id="niche" name="niche" required list="niches" autocomplete="off" maxlength="120"
            placeholder="dental clinics, hair salons, law firms…" [(ngModel)]="niche">
        </label>
      </div>

      @if (suggested().length) {
        <div style="margin-top: -4px; margin-bottom: 10px;">
          <span class="help" style="margin-bottom: 6px;">Recommended for your profile:</span>
          <div class="row" style="gap: 6px; justify-content: flex-start;">
            @for (s of suggested(); track s) {
              <button type="button" class="btn ghost small" (click)="niche = s"
                style="min-height: 28px; padding: 3px 8px; font-size: 12px;">{{ s }}</button>
            }
          </div>
        </div>
      }

      <div class="row" style="margin-top: 8px; margin-bottom: 8px;">
        <span class="mute" style="font-size: 13px;">Area Selection Method:</span>
        <div class="seg" role="group" aria-label="Area Mode">
          <button type="button" class="seg-btn" [class.on]="mode() === 'city'" (click)="mode.set('city')">Regions / Cities (up to 3)</button>
          <button type="button" class="seg-btn" [class.on]="mode() === 'map'" (click)="mode.set('map')">Map Bounding Box</button>
        </div>
      </div>

      @if (mode() === 'city') {
        <label for="city">Cities / Regions (up to 3, comma-separated)
          <input id="city" name="city" required maxlength="250" placeholder="e.g. Tunis, Ariana, La Marsa" [(ngModel)]="city">
          <span class="help">Enter up to 3 cities or districts. One discovery query runs per area.</span>
        </label>
      } @else {
        <app-area-map-selector (bboxChange)="onBboxChange($event)"></app-area-map-selector>
      }

      <div class="actions" style="margin-top: 14px;">
        <button type="submit" [disabled]="busy() || profileReady() === false || limitReached() || isFormInvalid()">
          {{ busy() ? 'Starting…' : 'Find leads' }}
        </button>
      </div>

      <datalist id="niches">
        @for (n of niches; track n) { <option [value]="n"></option> }
      </datalist>

      <p class="help">
        Each search queries OpenStreetMap / Geoapify places.
        @if (usage(); as u) {
          <span [class.err]="u.used >= u.limit">
            {{ u.used >= u.limit ? 'You have used all ' + u.limit + ' searches for today.' : (u.limit - u.used) + ' of ' + u.limit + ' searches left today.' }}
          </span>
        }
      </p>
      @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
    </form>

    <h2>Your searches</h2>
    @if (loading()) {
      <div class="card skeleton-card" aria-busy="true" aria-label="Loading searches"><span></span><span></span></div>
    } @else {
      @for (j of jobs(); track j.id) {
        <a class="card row link" [routerLink]="['/searches', j.id]">
          <span>
            <strong>{{ j.niche }}</strong> in {{ j.city }}
            @if (j.bbox) { <span class="mute" style="font-size: 11px;">[Map area]</span> }
          </span>
          <span class="mute">
            @if (j.status === 'DONE' && j.foundCount !== null) { {{ j.foundCount }} found, {{ j.newCount }} new · }
            {{ j.createdAt | date: 'short' }} · <span [class]="'badge ' + j.status">{{ label(j.status) }}</span>
          </span>
        </a>
      } @empty {
        <p class="mute">No searches yet. Choose a business type and an area above to find your first leads.</p>
      }
    }
  `,
})
export class Searches {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly niches = [
    'dental clinics', 'doctors and clinics', 'pharmacies', 'restaurants', 'cafes', 'hotels', 'gyms',
    'hair salons', 'lawyers', 'car repair', 'supermarkets', 'bakeries', 'schools',
  ];

  protected readonly jobs = signal<Job[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
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

  protected label(s: Job['status']) {
    return s === 'PENDING' ? 'Searching' : s === 'DONE' ? 'Done' : 'Failed';
  }

  protected submit() {
    this.busy.set(true);
    this.error.set('');

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
        else if (e.status === 429) this.error.set('You have reached today\'s search limit. It frees up gradually over 24 hours.');
        else this.error.set('Could not start the search. Check that the backend is running and try again.');
      },
    });
  }
}
