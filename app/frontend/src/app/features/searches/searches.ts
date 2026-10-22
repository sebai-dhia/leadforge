import { Component, computed, inject, signal } from '@angular/core';
import { AreaPipe } from '../../shared/pipes/area.pipe';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, Job, NewSearch, Usage } from '../../core/api.service';
import { AreaMapSelector } from '../../shared/area-map-selector/area-map-selector';
import { I18n, I18nKey } from '../../i18n/i18n';

@Component({
  selector: 'app-searches',
  styleUrl: './searches.scss',
  imports: [AreaPipe, FormsModule, RouterLink, AreaMapSelector],
  templateUrl: './searches.html',
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

  protected readonly nicheText = signal('');
  protected get niche(): string { return this.nicheText(); }
  protected set niche(v: string) { this.nicheText.set(v ?? ''); }

  protected readonly comboOpen = signal(false);
  protected readonly activeOpt = signal(-1);
  /** The suggestions that contain what was typed; none once the text is exactly one of them. */
  protected readonly options = computed(() => {
    const q = this.nicheText().trim().toLowerCase();
    if (this.niches.some(n => n === q)) return [];
    return this.niches.filter(n => n.includes(q));
  });

  protected pickNiche(n: string): void { this.niche = n; this.comboOpen.set(false); this.activeOpt.set(-1); }
  protected closeCombo(): void { this.comboOpen.set(false); this.activeOpt.set(-1); }
  protected comboKey(e: KeyboardEvent): void {
    const n = this.options().length;
    if (e.key === 'Escape') { this.closeCombo(); return; }
    if (!n) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); this.comboOpen.set(true); this.activeOpt.set((this.activeOpt() + 1) % n); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.comboOpen.set(true); this.activeOpt.set((this.activeOpt() - 1 + n) % n); }
    else if (e.key === 'Enter' && this.comboOpen() && this.activeOpt() >= 0) { e.preventDefault(); this.pickNiche(this.options()[this.activeOpt()]); }
  }
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
