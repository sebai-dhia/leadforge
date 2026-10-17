import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, Lang, Profile, ProfileLink, ProfileStats, UsageMap } from './api.service';
import { AuthService } from './auth.service';
import { I18n, I18nKey } from './i18n';

@Component({
  selector: 'app-profile',
  imports: [FormsModule, RouterLink],
  template: `
    @if (loading()) {
      <div class="card skeleton-card" aria-busy="true" [attr.aria-label]="t('profile.loadingAria')"><span></span><span></span><span></span></div>
    } @else if (profile(); as p) {
      <section class="identity">
        <div class="banner"></div>
        <div class="id-body">
          <div class="avatar" aria-hidden="true">{{ initials() }}</div>
          <div class="who">
            <h1>{{ shownName(p) }}</h1>
            <p class="headline">{{ p.headline || (auth.isGuest() ? '' : t('profile.addHeadline')) }}</p>
            <div class="facts">
              @if (p.city) { <span>{{ p.city }}</span> }
              <span>{{ t('profile.writesIn', { lang: langName(p.language) }) }}</span>
              @if (auth.isGuest()) { <span class="guest">{{ t('profile.guestAccount') }}</span> }
            </div>
          </div>
          @if (!editing() && !auth.isGuest()) { <button type="button" class="ghost" (click)="startEdit()">{{ t('profile.edit') }}</button> }
        </div>
      </section>

      @if (auth.isGuest()) {
        <div class="notice guest-note" role="note">
          <span>{{ t('profile.guestLocked') }}</span>
          <button type="button" (click)="signInToEdit()">{{ t('profile.guestSignIn') }}</button>
        </div>
      }

      @if (editing() && !auth.isGuest()) {
        <form class="card edit" (ngSubmit)="save()">
          <h2>{{ t('profile.edit') }}</h2>
          <div class="two">
            <label>{{ t('profile.fieldName') }} <input name="displayName" required maxlength="100" autocomplete="name" [(ngModel)]="displayName"></label>
            <label>{{ t('profile.fieldCity') }} <input name="city" maxlength="120" [placeholder]="t('ob.basedPh')" [(ngModel)]="city"></label>
          </div>
          <label>{{ t('profile.fieldHeadline') }}
            <input name="headline" maxlength="160" [(ngModel)]="headline">
          </label>
          <label>{{ t('profile.fieldAbout') }}
            <textarea name="about" rows="3" maxlength="500" [(ngModel)]="about"
              placeholder="I design and build simple websites and booking tools for small local businesses."></textarea>
            <span class="help">{{ t('profile.aboutHelp') }}</span>
          </label>
          <fieldset>
            <legend>{{ t('profile.msgLang') }}</legend>
            <div class="seg" role="group" [attr.aria-label]="t('profile.msgLang')">
              @for (l of languages; track l.value) {
                <button type="button" class="seg-btn" [class.on]="language() === l.value"
                  [attr.aria-pressed]="language() === l.value" (click)="language.set(l.value)">{{ l.label }}</button>
              }
            </div>
          </fieldset>
          <fieldset>
            <legend>{{ t('profile.linksLegend') }}</legend>
            @for (l of links(); track $index) {
              <div class="link-row">
                <input [attr.aria-label]="t('profile.linkName', { n: $index + 1 })" maxlength="30" placeholder="Portfolio" [ngModel]="l.label"
                  (ngModelChange)="setLink($index, 'label', $event)" [ngModelOptions]="{ standalone: true }">
                <input [attr.aria-label]="t('profile.linkAddr', { n: $index + 1 })" maxlength="300" placeholder="https://" [ngModel]="l.url"
                  (ngModelChange)="setLink($index, 'url', $event)" [ngModelOptions]="{ standalone: true }">
                <button type="button" class="ghost icon" [attr.aria-label]="t('profile.removeLink')" (click)="removeLink($index)">✕</button>
              </div>
            }
            @if (links().length < 5) { <button type="button" class="ghost" (click)="addLink()">{{ t('profile.addLink') }}</button> }
          </fieldset>
          @if (error(); as e) { <p class="err" role="alert">{{ t(e) }}</p> }
          <div class="actions">
            <button type="submit" [disabled]="saving()">{{ saving() ? t('profile.saving') : t('profile.save') }}</button>
            <button type="button" class="ghost" (click)="editing.set(false)">{{ t('profile.cancel') }}</button>
          </div>
        </form>
      }

      <div class="cols">
        <div class="col main-col">
          <section class="card block">
            <div class="block-head"><h2>{{ t('profile.offer') }}</h2>@if (!auth.isGuest()) { <a routerLink="/welcome" [queryParams]="{ edit: 1, step: 1 }" class="btn ghost small">{{ t('profile.change') }}</a> }</div>
            @if (p.services.length) {
              <div class="chips">@for (s of p.services; track s) { <span class="chip on">{{ i18n.chip(s) }}</span> }</div>
            } @else if (auth.isGuest()) { <p class="mute">{{ p.offer }}</p> } @else { <p class="mute">{{ t('profile.offerEmpty') }}</p> }
          </section>

          @if (!auth.isGuest() || p.targets.length) {
          <section class="card block">
            <div class="block-head"><h2>{{ t('profile.reach') }}</h2>@if (!auth.isGuest()) { <a routerLink="/welcome" [queryParams]="{ edit: 1, step: 2 }" class="btn ghost small">{{ t('profile.change') }}</a> }</div>
            @if (p.targets.length) {
              <div class="chips">@for (tg of p.targets; track tg) { <span class="chip">{{ i18n.chip(tg) }}</span> }</div>
              <p class="mute note">{{ t('profile.reachNote') }}</p>
            } @else { <p class="mute">{{ t('profile.reachEmpty') }}</p> }
          </section>
          }

          @if (!auth.isGuest() || p.about) {
          <section class="card block">
            <h2>{{ t('profile.about') }}</h2>
            @if (p.about) { <div class="about">{{ p.about }}</div> }
            @else { <p class="mute">{{ t('profile.aboutEmpty') }}</p> }
          </section>
          }
        </div>

        <div class="col side-col">
          @if (!auth.isGuest() || p.links.length) {
          <section class="card block">
            <h2>{{ t('profile.myLinks') }}</h2>
            <p class="mute note">{{ t('profile.linksNote') }}</p>
            <div class="links">
              @for (l of p.links; track l.url) {
                <a class="link" [href]="l.url" target="_blank" rel="noopener noreferrer"><strong>{{ l.label }}</strong><span>{{ l.url }}</span></a>
              } @empty { <p class="mute">{{ t('profile.noLinks') }}</p> }
              @if (!auth.isGuest()) { <button type="button" class="link add" (click)="startEdit(true)">{{ t('profile.addLinkBtn') }}</button> }
            </div>
          </section>
          }

          <section class="card block">
            <h2>{{ t('profile.activity') }}</h2>
            <div class="stats">
              @for (s of statList(); track s.key) {
                <div class="stat"><div class="num big">{{ s.value }}</div><div class="mute">{{ t(s.key) }}</div></div>
              }
            </div>
          </section>

          <section class="card block">
            <h2>{{ t('menu.allowance') }}</h2>
            <p class="mute note">{{ t('menu.frees') }}</p>
            @for (u of usageList(); track u.key) {
              <div class="use">
                <div class="use-row"><span>{{ t(u.key) }}</span><span class="mute">{{ t('menu.left', { left: u.left, limit: u.limit }) }}</span></div>
                <div class="meter" role="img" [attr.aria-label]="t(u.key) + ': ' + t('menu.left', { left: u.left, limit: u.limit })"><div class="fill" [style.width.%]="u.pct"></div></div>
              </div>
            }
          </section>
        </div>
      </div>
    } @else {
      <p class="err" role="alert">{{ error() ? t(error()!) : '' }}</p>
    }
  `,
  styles: `
    :host { display: block; }
    .identity { background: var(--card); border: 1px solid var(--line); border-radius: 24px; overflow: hidden; margin-bottom: 24px; }
    .banner { height: 96px; background: linear-gradient(120deg, var(--accent-soft), var(--bg) 70%); }
    .id-body { display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-end; padding: 0 32px 28px; margin-top: -44px; }
    .avatar { width: 96px; height: 96px; border-radius: 50%; background: var(--accent); color: var(--on-accent); display: flex; align-items: center; justify-content: center; font-family: var(--font-display); font-weight: 700; font-size: 38px; border: 4px solid var(--card); flex: none; }
    .who { flex: 1 1 280px; min-width: 0; padding-top: 48px; }
    .who h1 { font-size: 32px; margin: 0; }
    .headline { margin: 6px 0 0; color: var(--ink); opacity: .85; font-size: 17px; }
    .facts { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 10px; color: var(--mute); font-size: 14px; }
    .guest { color: var(--warn); }
    .edit { margin-bottom: 24px; }
    .guest-note { display: flex; gap: 12px 20px; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-bottom: 24px; }
    .edit h2 { margin-top: 0; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    @media (max-width: 600px) { .two { grid-template-columns: 1fr; } }
    .link-row { display: grid; grid-template-columns: 1fr 2fr auto; gap: 10px; align-items: center; margin-bottom: 10px; }
    .link-row input { margin: 0; }
    .icon { min-width: 44px; padding: 0; }
    @media (max-width: 600px) { .link-row { grid-template-columns: 1fr auto; } .link-row input:nth-child(2) { grid-column: 1 / -1; grid-row: 2; } }
    .cols { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
    .main-col { flex: 2 1 540px; } .side-col { flex: 1 1 300px; }
    .col { min-width: 0; display: flex; flex-direction: column; gap: 24px; }
    .block { padding: 26px; margin: 0; }
    .block h2 { margin: 0 0 14px; font-size: 20px; }
    .block-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; }
    .block-head h2 { margin: 0; }
    .small { min-height: 40px; padding: 0 14px; font-size: 14px; }
    .chips { display: flex; flex-wrap: wrap; gap: 10px; }
    .chip { display: inline-flex; align-items: center; min-height: 40px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--bg); font-size: 15px; font-weight: 500; }
    .chip.on { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    .note { font-size: 14px; margin: 12px 0 0; } .block h2 + .note { margin: -8px 0 14px; }
    .about { background: var(--bg); border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; font-size: 15.5px; white-space: pre-line; }
    .links { display: flex; flex-direction: column; gap: 10px; }
    .link { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg); text-decoration: none; color: var(--ink); font: inherit; min-height: 44px; text-align: left; transition: border-color .2s ease; }
    .link:hover { border-color: var(--line-strong); filter: none; }
    .link span { color: var(--mute); font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .link.add { border-style: dashed; color: var(--mute); cursor: pointer; flex-direction: row; align-items: center; }
    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .stat { background: var(--bg); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
    .big { font-family: var(--font-display); font-weight: 700; font-size: 28px; line-height: 1.1; color: var(--accent); }
    .use { margin-top: 14px; } .use-row { display: flex; justify-content: space-between; gap: 8px; font-size: 14.5px; margin-bottom: 6px; }
    .meter { height: 6px; border-radius: 6px; background: var(--line); overflow: hidden; }
    .fill { height: 100%; background: var(--accent); border-radius: 6px; }
  `,
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
  protected readonly error = signal<I18nKey | null>(null);

  protected displayName = '';
  protected headline = '';
  protected city = '';
  protected about = '';
  protected readonly language = signal<Lang>('en');
  protected readonly links = signal<ProfileLink[]>([]);

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

  protected signInToEdit() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }

  protected startEdit(addLink = false) {
    const p = this.profile();
    if (!p) return;
    this.displayName = p.displayName;
    this.headline = p.headline;
    this.city = p.city;
    this.about = p.about;
    this.language.set(p.language);
    this.links.set(p.links.map(l => ({ ...l })));
    if (addLink && this.links().length < 5) this.addLink();
    this.error.set(null);
    this.editing.set(true);
  }

  protected addLink() { this.links.set([...this.links(), { label: '', url: '' }]); }
  protected removeLink(i: number) { this.links.set(this.links().filter((_, j) => j !== i)); }
  protected setLink(i: number, key: 'label' | 'url', value: string) {
    this.links.set(this.links().map((l, j) => (j === i ? { ...l, [key]: value } : l)));
  }

  protected save() {
    this.saving.set(true);
    this.error.set(null);
    this.api.saveProfile({
      displayName: this.displayName, headline: this.headline, city: this.city, about: this.about,
      language: this.language(), links: this.links().filter(l => l.label.trim() || l.url.trim()),
    }).subscribe({
      next: p => { this.profile.set(p); this.saving.set(false); this.editing.set(false); },
      error: e => {
        this.saving.set(false);
        this.error.set(e.status === 400 ? 'profile.err400' : e.status === 403 ? 'profile.err403' : 'profile.errSave');
      },
    });
  }
}
