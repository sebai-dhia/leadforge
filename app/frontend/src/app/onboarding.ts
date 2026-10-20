import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, Lang, ProfileUpdate } from './api.service';
import { AuthService } from './auth.service';
import { Logo } from './logo';
import { I18n, I18nKey } from './i18n';
import { MAX_SERVICES, MAX_TARGETS, SERVICE_OPTIONS, SERVICE_TARGETS, TARGET_OPTIONS } from './profile-options';

/** First-run picker, also reused to change the chips later (?edit=1&step=1|2|3). */
@Component({
  selector: 'app-onboarding',
  imports: [FormsModule, RouterLink, Logo],
  template: `
    <div class="wrap">
      <header class="top">
        <a routerLink="/" class="brand" aria-label="Leadforge home"><app-logo [size]="28" /></a>
        <button type="button" class="skip" (click)="skip()">{{ editing ? t('ob.cancel') : t('ob.skip') }}</button>
      </header>

      <main class="main">
        <div class="progress" role="img" [attr.aria-label]="t('ob.step', { n: step() })">
          @for (n of [1, 2, 3]; track n) { <span class="bar" [class.on]="n <= step()"></span> }
          <span class="count">{{ t('ob.step', { n: step() }) }}</span>
        </div>

        @if (loading()) {
          <div class="card skeleton-card" aria-busy="true" [attr.aria-label]="t('sd.loadingAria')"><span></span><span></span><span></span></div>
        } @else {
          @switch (step()) {
            @case (1) {
              <h1>{{ t('ob.s1Title') }}</h1>
              <p class="sub">{{ t('ob.s1Sub', { max: maxServices }) }}</p>
              <div class="chips" role="group" [attr.aria-label]="t('ob.servicesAria')">
                @for (s of serviceChoices(); track s) {
                  <button type="button" class="pick" [class.on]="services().includes(s)"
                    [attr.aria-pressed]="services().includes(s)" [disabled]="locked(services(), s, maxServices)"
                    (click)="toggle(services, s, maxServices)">
                    <span class="mark" aria-hidden="true">{{ services().includes(s) ? '✓' : '+' }}</span>{{ i18n.chip(s) }}
                  </button>
                }
              </div>
              <form class="other" (ngSubmit)="addOther()">
                <label>{{ t('ob.other') }}
                  <input name="other" maxlength="40" [placeholder]="t('ob.otherPh')" [(ngModel)]="other">
                </label>
                <button type="submit" class="ghost" [disabled]="!other.trim() || services().length >= maxServices">{{ t('ob.add') }}</button>
              </form>
              <p class="count-note" role="status">{{ t('ob.selected', { n: services().length, max: maxServices }) }}</p>
            }
            @case (2) {
              <h1>{{ t('ob.s2Title') }}</h1>
              <p class="sub">{{ suggestedTargets().length ? t('ob.s2SubFor', { services: serviceList(), max: maxTargets }) : t('ob.s2Sub', { max: maxTargets }) }}</p>
              @if (suggestedTargets().length) {
                <p class="group-label">{{ t('ob.bestFit') }}</p>
              }
              <div class="chips" role="group" [attr.aria-label]="t('ob.kindsAria')">
                @for (tg of suggestedTargets(); track tg) {
                  <button type="button" class="pick" [class.on]="targets().includes(tg)"
                    [attr.aria-pressed]="targets().includes(tg)" [disabled]="locked(targets(), tg, maxTargets)"
                    (click)="toggle(targets, tg, maxTargets)">
                    <span class="mark" aria-hidden="true">{{ targets().includes(tg) ? '✓' : '+' }}</span>{{ i18n.chip(tg) }}
                  </button>
                }
              </div>
              @if (suggestedTargets().length && otherTargets().length) {
                <p class="group-label">{{ t('ob.otherKinds') }}</p>
              }
              <div class="chips" role="group" [attr.aria-label]="t('ob.kindsAria')">
                @for (tg of otherTargets(); track tg) {
                  <button type="button" class="pick" [class.on]="targets().includes(tg)"
                    [attr.aria-pressed]="targets().includes(tg)" [disabled]="locked(targets(), tg, maxTargets)"
                    (click)="toggle(targets, tg, maxTargets)">
                    <span class="mark" aria-hidden="true">{{ targets().includes(tg) ? '✓' : '+' }}</span>{{ i18n.chip(tg) }}
                  </button>
                }
              </div>
              <p class="count-note" role="status">{{ t('ob.selected', { n: targets().length, max: maxTargets }) }}</p>
            }
            @default {
              <h1>{{ t('ob.s3Title') }}</h1>
              <p class="sub">{{ t('ob.s3Sub') }}</p>
              @if (previewRows().length) {
                <section class="preview" [attr.aria-label]="t('ob.pvTitle')">
                  <p class="group-label">{{ t('ob.pvTitle') }}</p>
                  <dl class="rows" aria-live="polite">
                    @for (r of previewRows(); track r.label) {
                      <div class="prow"><dt>{{ t(r.label) }}</dt><dd>{{ r.value }}</dd></div>
                    }
                  </dl>
                  <p class="note">{{ t('ob.pvNote') }}</p>
                </section>
              }
              <div class="fields">
                <label>{{ t('ob.yourName') }} <input name="name" maxlength="100" autocomplete="name" [(ngModel)]="displayName"></label>
                <label>{{ t('ob.based') }} <input name="city" maxlength="120" [placeholder]="t('ob.basedPh')" [(ngModel)]="city"></label>
                <fieldset>
                  <legend>{{ t('ob.msgLang') }}</legend>
                  <div class="seg" role="group" [attr.aria-label]="t('ob.msgLang')">
                    @for (l of languages; track l.value) {
                      <button type="button" class="seg-btn" [class.on]="language() === l.value"
                        [attr.aria-pressed]="language() === l.value" (click)="language.set(l.value)">{{ l.label }}</button>
                    }
                  </div>
                </fieldset>
              </div>
            }
          }

          @if (error(); as e) { <p class="err" role="alert">{{ t(e) }}</p> }
          <div class="nav">
            @if (step() > 1 && !singleStep) { <button type="button" class="ghost" (click)="step.set(step() - 1)">{{ t('ob.back') }}</button> } @else { <span></span> }
            <button type="button" class="next" [disabled]="saving() || (step() === 1 && !services().length && !editing)" (click)="next()">
              {{ last() ? (saving() ? t('ob.saving') : (editing ? t('ob.save') : t('ob.finish'))) : t('ob.continue') }}
            </button>
          </div>
        }
      </main>
    </div>
  `,
  styles: `
    .wrap { min-height: 100vh; display: flex; flex-direction: column; }
    .top { display: flex; align-items: center; justify-content: space-between; max-width: 1160px; width: 100%; margin: 0 auto; padding: 20px 24px; box-sizing: border-box; }
    .brand { text-decoration: none; display: inline-flex; min-height: 44px; align-items: center; }
    .skip { background: transparent; border: 0; color: var(--mute); font-weight: 400; min-height: 44px; }
    .skip:hover { color: var(--ink); }
    .main { flex: 1; width: 100%; max-width: 760px; margin: 0 auto; padding: 16px 24px 64px; box-sizing: border-box; }
    .progress { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; }
    .bar { flex: 1; height: 4px; border-radius: 4px; background: var(--line); }
    .bar.on { background: var(--accent); }
    .count { font-size: 13px; color: var(--mute); margin-left: 6px; white-space: nowrap; }
    h1 { font-size: clamp(30px, 5vw, 44px); letter-spacing: -0.025em; line-height: 1.06; margin: 0 0 12px; }
    .sub { color: var(--mute); font-size: 18px; max-width: 560px; margin: 0 0 28px; }
    .chips { display: flex; flex-wrap: wrap; gap: 12px; }
    .pick { display: inline-flex; align-items: center; gap: 10px; min-height: 52px; padding: 0 20px; border-radius: 999px; font-size: 16px; font-weight: 500; background: var(--card); color: var(--ink); border: 1px solid var(--line-strong); transition: border-color .2s ease, color .2s ease, background-color .2s ease; }
    .pick:hover:not(:disabled) { border-color: var(--mute); filter: none; }
    .pick.on { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    .pick:disabled { opacity: .5; cursor: not-allowed; }
    .mark { width: 18px; text-align: center; }
    .other { display: flex; gap: 12px; align-items: flex-end; margin-top: 24px; flex-wrap: wrap; }
    .other label { flex: 1 1 260px; margin: 0; }
    .count-note { margin: 20px 0 0; font-size: 14px; color: var(--mute); }
    .group-label { margin: 22px 0 10px; font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--mute); }
    .group-label:first-of-type { margin-top: 0; }
    .preview { margin: 0 0 24px; padding: 16px 18px; border-radius: 16px; background: var(--card); box-shadow: inset 0 0 0 1px var(--line); }
    .preview .group-label { margin: 0 0 8px; }
    .rows { margin: 0; display: grid; gap: 10px; }
    .prow { display: grid; grid-template-columns: 150px 1fr; gap: 12px; align-items: baseline; }
    .prow dt { font-size: 13px; color: var(--mute); }
    .prow dd { margin: 0; font-size: 16px; line-height: 1.45; color: var(--ink); }
    @media (max-width: 520px) { .prow { grid-template-columns: 1fr; gap: 2px; } }
    .preview .note { margin: 10px 0 0; font-size: 13px; color: var(--mute); }
    .fields { display: grid; gap: 4px; max-width: 460px; }
    .nav { margin-top: 36px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .next { min-height: 52px; padding: 0 32px; border-radius: 12px; font-size: 16px; }
    @media (max-width: 520px) { .sub { font-size: 16px; } .pick { min-height: 48px; padding: 0 16px; } }
  `,
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
      const fits = SERVICE_TARGETS[service] ?? [];
      fits.forEach((t, i) => score.set(t, (score.get(t) ?? 0) + (fits.length - i)));
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
