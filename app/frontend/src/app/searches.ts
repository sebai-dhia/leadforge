import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, Job, Usage } from './api.service';

@Component({
  selector: 'app-searches',
  imports: [FormsModule, RouterLink, DatePipe],
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
        <label for="niche">Business type
          <input id="niche" name="niche" required list="niches" autocomplete="off" maxlength="120"
            placeholder="dental clinics" [(ngModel)]="form.niche">
        </label>
        <label for="city">City
          <input id="city" name="city" required maxlength="120" placeholder="Tunis, Tunisia" [(ngModel)]="form.city">
        </label>
        <div class="end">
          <button type="submit" [disabled]="busy() || profileReady() === false || limitReached()">{{ busy() ? 'Starting…' : 'Find leads' }}</button>
        </div>
      </div>
      <datalist id="niches">
        @for (n of niches; track n) { <option [value]="n"></option> }
      </datalist>
      <p class="help">
        Each search returns up to 20 businesses. Pick a type from the list for the best match.
        @if (usage(); as u) {
          <span [class.err]="u.used >= u.limit">{{ u.used >= u.limit ? 'You have used all ' + u.limit + ' searches for today.' : (u.limit - u.used) + ' of ' + u.limit + ' searches left today.' }}</span>
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
          <span><strong>{{ j.niche }}</strong> in {{ j.city }}</span>
          <span class="mute">
            @if (j.status === 'DONE' && j.foundCount !== null) { {{ j.foundCount }} found, {{ j.newCount }} new · }
            {{ j.createdAt | date: 'short' }} · <span [class]="'badge ' + j.status">{{ label(j.status) }}</span>
          </span>
        </a>
      } @empty {
        <p class="mute">No searches yet. Choose a business type and a city above to find your first leads.</p>
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
  /** null until the profile has loaded, then true or false */
  protected readonly profileReady = signal<boolean | null>(null);
  protected readonly usage = signal<Usage | null>(null);
  protected limitReached() { const u = this.usage(); return !!u && u.used >= u.limit; }
  protected form = { niche: '', city: '' };

  constructor() {
    this.api.list().subscribe({
      next: j => { this.jobs.set(j); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    this.api.profile().subscribe(p => this.profileReady.set(!!p.offer.trim() && !!p.displayName.trim()));
    this.api.usage().subscribe({ next: u => this.usage.set(u.search), error: () => { /* the limit simply is not shown */ } });
  }

  protected label(s: Job['status']) {
    return s === 'PENDING' ? 'Searching' : s === 'DONE' ? 'Done' : 'Failed';
  }

  protected submit() {
    this.busy.set(true);
    this.error.set('');
    this.api.create(this.form).subscribe({
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
