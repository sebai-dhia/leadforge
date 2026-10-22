import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, Lang, ProfileUpdate } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Logo } from '../../shared/logo/logo';
import { I18n, I18nKey } from '../../i18n/i18n';
import { MAX_SERVICES, MAX_TARGETS, SERVICE_OPTIONS, SERVICE_TARGETS, TARGET_OPTIONS, closestServices, hintedTargets } from '../../shared/util/profile-options';

/** First-run picker, also reused to change the chips later (?edit=1&step=1|2|3). */
@Component({
  selector: 'app-onboarding',
  imports: [FormsModule, RouterLink, Logo],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.scss',
})
export class Onboarding {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly maxServices = MAX_SERVICES;
  protected readonly maxTargets = MAX_TARGETS;
  protected readonly targetChoices = TARGET_OPTIONS;
  protected readonly languages: { value: Lang; label: string }[] = [
    { value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }, { value: 'ar', label: 'العربية' },
  ];

  protected readonly editing = this.route.snapshot.queryParamMap.get('edit') === '1';
  protected readonly singleStep = this.editing && this.route.snapshot.queryParamMap.has('step');
  protected readonly step = signal(Math.min(3, Math.max(1, Number(this.route.snapshot.queryParamMap.get('step')) || 1)));
  private readonly firstStep = this.step();

  protected readonly services = signal<string[]>([]);
  protected readonly targets = signal<string[]>([]);

  /** How well each business type fits the chosen services: a type listed high by several services scores most. */
  private readonly targetScores = computed(() => {
    const score = new Map<string, number>();
    for (const service of this.services()) {
      // a service the person typed is read as the standard services it is closest to
      const known = SERVICE_TARGETS[service] ? [service] : closestServices(service);
      // a typed service that names its clients puts those business types ahead of everything else
      if (!SERVICE_TARGETS[service]) for (const t of hintedTargets(service)) score.set(t, (score.get(t) ?? 0) + 30);
      for (const key of known) {
        const fits = SERVICE_TARGETS[key] ?? [];
        fits.forEach((t, i) => score.set(t, (score.get(t) ?? 0) + (fits.length - i)));
      }
    }
    return score;
  });
  /** All business types, the best fit first (ties keep the usual order). */
  private readonly rankedTargets = computed(() => {
    const score = this.targetScores();
    return [...TARGET_OPTIONS].sort((x, y) => (score.get(y) ?? 0) - (score.get(x) ?? 0));
  });
  /**
   * Only the clear best fits get the label: those scoring at least 60% of the top score, between 3 and 6 of them.
   * With several services nearly everything is listed by someone, so a plain "listed at all" would label every type.
   */
  protected readonly suggestedTargets = computed(() => {
    const score = this.targetScores();
    const ranked = this.rankedTargets().filter(t => (score.get(t) ?? 0) > 0);
    if (!ranked.length) return [];
    const top = score.get(ranked[0]) ?? 0;
    const strong = ranked.filter(t => (score.get(t) ?? 0) >= top * 0.6);
    return ranked.slice(0, Math.min(6, Math.max(3, strong.length)));
  });
  protected readonly OTHERS_SHOWN = 6;
  protected readonly showAllOthers = signal(false);
  /** The rest start folded to six, so the page stays short. A type that is already chosen is always shown. */
  protected readonly visibleOthers = computed(() => {
    const all = this.otherTargets();
    return this.showAllOthers() ? all : all.filter((t, i) => i < this.OTHERS_SHOWN || this.targets().includes(t));
  });
  /** How each typed service was understood, shown in step 1 so a wrong guess is visible. */
  protected readonly readings = computed(() => this.services().filter(s => !SERVICE_TARGETS[s]).map(service => {
    const as = closestServices(service).map(s => this.i18n.chip(s));
    const suits = hintedTargets(service).map(t => this.i18n.chip(t));
    const text = !as.length && !suits.length
      ? this.t('ob.readNone', { service })
      : [as.length ? this.t('ob.readAs', { service, as: as.join(', ') }) : '', suits.length ? this.t('ob.readSuits', { targets: suits.join(', ') }) : ''].filter(Boolean).join(' ');
    return { service, text };
  }));
  protected readonly otherTargets = computed(() => this.rankedTargets().filter(t => !this.suggestedTargets().includes(t)));

  /** "photography, copywriting and SEO" in the interface language, for use in the middle of a sentence. */
  protected serviceList() { return this.words(this.services()); }

  private words(items: string[]) {
    const soft = (v: string) => (v.length > 1 && /[A-Z]/.test(v[1]) ? v : v.charAt(0).toLowerCase() + v.slice(1));
    return new Intl.ListFormat(this.i18n.lang() === 'fr' ? 'fr' : 'en', { style: 'long', type: 'conjunction' })
      .format(items.map(i => soft(this.i18n.chip(i))));
  }

  /** What the messages will be built from, in the person's own words: who they are, what they offer, who it is for. Empty until a service is chosen. */
  protected readonly previewRows = computed<{ label: I18nKey; value: string }[]>(() => {
    if (!this.services().length) return [];
    const name = this.displayNameSignal().trim();
    const city = this.citySignal().trim();
    const rows: { label: I18nKey; value: string }[] = [];
    if (name || city) rows.push({ label: 'ob.pvIntro', value: [name, city].filter(Boolean).join(' · ') });
    rows.push({ label: 'ob.pvOffer', value: this.services().map(v => this.i18n.chip(v)).join(' · ') });
    if (this.targets().length) rows.push({ label: 'ob.pvFor', value: this.targets().map(v => this.i18n.chip(v)).join(' · ') });
    return rows;
  });
  protected readonly language = signal<Lang>('en');
  private readonly displayNameSignal = signal('');
  private readonly citySignal = signal('');
  protected get displayName() { return this.displayNameSignal(); }
  protected set displayName(v: string) { this.displayNameSignal.set(v); }
  protected get city() { return this.citySignal(); }
  protected set city(v: string) { this.citySignal.set(v); }
  protected other = '';
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<I18nKey | null>(null);

  constructor() {
    this.api.profile().subscribe({
      next: p => {
        this.services.set(p.services);
        this.targets.set(p.targets);
        this.language.set(p.language);
        this.displayName = p.displayName;
        this.city = p.city;
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.error.set('ob.errLoad'); },
    });
  }

  /** The standard chips, plus anything the person typed earlier. */
  protected serviceChoices() {
    return [...SERVICE_OPTIONS, ...this.services().filter(s => !SERVICE_OPTIONS.includes(s))];
  }

  protected locked(list: string[], item: string, max: number) {
    return !list.includes(item) && list.length >= max;
  }

  protected toggle(target: { (): string[]; set(v: string[]): void }, item: string, max: number) {
    const cur = target();
    if (cur.includes(item)) target.set(cur.filter(x => x !== item));
    else if (cur.length < max) target.set([...cur, item]);
  }

  protected addOther() {
    const v = this.other.trim();
    if (v && !this.services().includes(v) && this.services().length < MAX_SERVICES) this.services.set([...this.services(), v]);
    this.other = '';
  }

  protected last() { return this.singleStep ? true : this.step() === 3; }

  protected next() {
    if (!this.last()) { this.step.set(this.step() + 1); return; }
    this.saving.set(true);
    this.error.set(null);
    const body: ProfileUpdate = { onboarded: true };
    if (!this.singleStep || this.firstStep === 1) body.services = this.services();
    if (!this.singleStep || this.firstStep === 2) body.targets = this.targets();
    if (!this.singleStep || this.firstStep === 3) {
      body.language = this.language();
      body.city = this.city;
      if (this.displayName.trim()) body.displayName = this.displayName;
    }
    this.api.saveProfile(body).subscribe({
      next: () => { this.auth.markOnboarded(); this.router.navigateByUrl(this.editing ? '/profile' : '/searches'); },
      error: () => { this.saving.set(false); this.error.set('ob.errSave'); },
    });
  }

  protected skip() {
    if (this.editing) { this.router.navigateByUrl('/profile'); return; }
    this.api.saveProfile({ onboarded: true }).subscribe({
      next: () => { this.auth.markOnboarded(); this.router.navigateByUrl('/leads'); },
      error: () => this.router.navigateByUrl('/leads'),
    });
  }
}
