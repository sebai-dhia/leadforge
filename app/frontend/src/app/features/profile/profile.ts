import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, Lang, Profile, ProfileStats, UsageMap } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { SpecializationKey, SpecializationPicker } from '../../shared/specialization-picker/specialization-picker';
import { I18n, I18nKey } from '../../i18n/i18n';
import { ProfileLinks } from './profile-links/profile-links';
import { TelegramCard } from './telegram-card/telegram-card';

@Component({
  selector: 'app-profile',
  imports: [FormsModule, RouterLink, SpecializationPicker, ProfileLinks, TelegramCard],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class ProfilePage {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;


  protected readonly languages: { value: Lang; label: string }[] = [
    { value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }, { value: 'ar', label: 'العربية' },
  ];

  protected readonly profile = signal<Profile | null>(null);
  private readonly stats = signal<ProfileStats | null>(null);
  private readonly usage = signal<UsageMap | null>(null);
  protected readonly loading = signal(true);
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly savingSpec = signal(false);
  protected readonly specError = signal<I18nKey | null>(null);
  protected readonly error = signal<I18nKey | null>(null);

  protected displayName = '';
  protected headline = '';
  protected city = '';
  protected about = '';
  protected readonly language = signal<Lang>('en');
  protected readonly initials = computed(() => {
    const p = this.profile();
    const source = (p?.displayName || p?.email || '?').trim();
    const parts = source.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  });

  protected readonly statList = computed(() => {
    const s = this.stats();
    return s ? [
      { value: s.leads, key: 'profile.statLeads' as I18nKey }, { value: s.drafted, key: 'profile.statDrafted' as I18nKey },
      { value: s.contacted, key: 'profile.statContacted' as I18nKey }, { value: s.replied, key: 'profile.statReplied' as I18nKey },
    ] : [];
  });

  protected readonly usageList = computed(() => {
    const u = this.usage();
    if (!u) return [];
    const row = (key: I18nKey, x: { used: number; limit: number }) => {
      const left = Math.max(0, x.limit - x.used);
      return { key, left, limit: x.limit, pct: x.limit ? (left / x.limit) * 100 : 0 };
    };
    return [row('menu.searches', u.search), row('menu.lookups', u.enrich), row('menu.messages', u.draft)];
  });

  constructor() {
    this.api.profile().subscribe({
      next: p => { this.profile.set(p); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set('profile.errLoad'); },
    });
    this.api.profileStats().subscribe({ next: s => this.stats.set(s), error: () => { /* the page works without it */ } });
    this.api.usage().subscribe({ next: u => this.usage.set(u), error: () => { /* the page works without it */ } });
  }

  /** A guest's default name is shown in the interface language. */
  protected shownName(p: Profile) {
    return this.auth.isGuest() && p.displayName === 'Guest' ? this.t('menu.guest') : (p.displayName || this.t('profile.yourName'));
  }

  protected langName(l: Lang) { return this.t(('lang.' + l) as I18nKey); }

  protected pickSpec(spec: SpecializationKey) {
    if (this.profile()?.specialization === spec) return;
    this.savingSpec.set(true);
    this.specError.set(null);
    this.api.setSpecialization(spec).subscribe({
      next: p => { this.profile.set(p); this.savingSpec.set(false); },
      error: () => { this.savingSpec.set(false); this.specError.set('spec.errSave'); },
    });
  }

  protected signInToEdit() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }

  protected startEdit() {
    const p = this.profile();
    if (!p) return;
    this.displayName = p.displayName;
    this.headline = p.headline;
    this.city = p.city;
    this.about = p.about;
    this.language.set(p.language);
    this.error.set(null);
    this.editing.set(true);
  }

  protected save() {
    this.saving.set(true);
    this.error.set(null);
    this.api.saveProfile({
      displayName: this.displayName, headline: this.headline, city: this.city, about: this.about,
      language: this.language(),
    }).subscribe({
      next: p => { this.profile.set(p); this.saving.set(false); this.editing.set(false); },
      error: e => {
        this.saving.set(false);
        this.error.set(e.status === 400 ? 'profile.err400' : e.status === 403 ? 'profile.err403' : 'profile.errSave');
      },
    });
  }
}
