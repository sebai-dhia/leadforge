import { Component, ElementRef, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService, Profile, UsageMap } from './api.service';
import { AuthService } from './auth.service';
import { AppLang, I18n } from './i18n';

/** The round account button at the right of the app bar and the menu it opens. */
@Component({
  selector: 'app-user-menu',
  imports: [RouterLink],
  template: `
    <button #trigger type="button" class="avatar" [attr.aria-label]="t('menu.open')" aria-haspopup="menu"
      [attr.aria-expanded]="open()" aria-controls="account-menu" (click)="toggle()">{{ initials() }}</button>

    @if (open()) {
      <div id="account-menu" class="menu" role="menu" tabindex="-1" #menu (keydown)="onKey($event)">
        <div class="who">
          <div class="who-avatar" aria-hidden="true">{{ initials() }}</div>
          <div class="who-text">
            <strong>{{ displayName() }}</strong>
            <span class="mute">{{ auth.isGuest() ? t('menu.guest') : auth.email() }}</span>
          </div>
        </div>

        <div class="sep"></div>
        <div class="section" role="group" [attr.aria-label]="t('menu.allowance')">
          <div class="section-title">{{ t('menu.allowance') }}</div>
          @for (u of usageList(); track u.key) {
            <div class="use">
              <div class="use-row"><span>{{ t(u.key) }}</span><span class="mute">{{ t('menu.left', { left: u.left, limit: u.limit }) }}</span></div>
              <div class="meter" role="img" [attr.aria-label]="t(u.key) + ': ' + t('menu.left', { left: u.left, limit: u.limit })"><div class="fill" [style.width.%]="u.pct"></div></div>
            </div>
          }
          <p class="mute tiny">{{ t('menu.frees') }}</p>
        </div>

        <div class="sep"></div>
        <a role="menuitem" class="item" routerLink="/profile" (click)="close()">{{ t('menu.profile') }}</a>

        <div class="lang" role="group" [attr.aria-label]="t('menu.language')">
          <span>{{ t('menu.language') }}</span>
          <div class="seg">
            @for (l of langs; track l.value) {
              <button type="button" class="seg-btn" [class.on]="i18n.lang() === l.value" [attr.aria-pressed]="i18n.lang() === l.value"
                (click)="i18n.set(l.value)">{{ l.label }}</button>
            }
          </div>
        </div>

        <div class="sep"></div>
        @if (auth.isGuest()) {
          <button type="button" role="menuitem" class="item" (click)="keep()">{{ t('menu.keep') }}</button>
        }
        <button type="button" role="menuitem" class="item" (click)="logout()">{{ t('menu.logout') }}</button>
      </div>
    }
  `,
  styles: `
    :host { position: relative; display: inline-block; }
    .avatar { width: 44px; height: 44px; min-height: 44px; padding: 0; border-radius: 50%; background: var(--accent); color: var(--on-accent);
      font-family: var(--font-display); font-weight: 700; font-size: 16px; border: 2px solid var(--accent); }
    .avatar[aria-expanded="true"] { box-shadow: 0 0 0 3px var(--accent-soft); }
    .menu { position: absolute; right: 0; top: calc(100% + 10px); z-index: 30; width: min(320px, calc(100vw - 32px)); background: var(--card);
      border: 1px solid var(--line-strong); border-radius: 16px; padding: 10px; box-shadow: 0 24px 60px rgba(0, 0, 0, .45); }
    .who { display: flex; gap: 12px; align-items: center; padding: 8px 8px 10px; }
    .who-avatar { width: 40px; height: 40px; border-radius: 50%; background: var(--accent); color: var(--on-accent); display: flex; align-items: center; justify-content: center; font-family: var(--font-display); font-weight: 700; flex: none; }
    .who-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.3; }
    .who-text strong, .who-text span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sep { height: 1px; background: var(--line); margin: 6px 0; }
    .section { padding: 6px 8px; }
    .section-title { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--mute); margin-bottom: 8px; }
    .use { margin-bottom: 10px; } .use-row { display: flex; justify-content: space-between; gap: 8px; font-size: 14px; margin-bottom: 5px; }
    .meter { height: 5px; border-radius: 5px; background: var(--line); overflow: hidden; } .fill { height: 100%; background: var(--accent); border-radius: 5px; }
    .tiny { font-size: 12.5px; margin: 4px 0 0; }
    .item { display: flex; align-items: center; width: 100%; min-height: 44px; padding: 0 12px; border-radius: 10px; background: transparent; color: var(--ink);
      border: 0; font: inherit; font-weight: 500; text-align: left; text-decoration: none; cursor: pointer; justify-content: flex-start; }
    .item:hover, .item:focus-visible { background: var(--accent-soft); filter: none; }
    .lang { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 12px; min-height: 44px; font-weight: 500; }
  `,
})
export class UserMenu {
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');

  protected readonly langs: { value: AppLang; label: string }[] = [{ value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }];

  protected readonly open = signal(false);
  private readonly profile = signal<Profile | null>(null);
  private readonly usage = signal<UsageMap | null>(null);

  protected readonly displayName = computed(() => {
    const name = this.profile()?.displayName;
    return this.auth.isGuest() && (!name || name === 'Guest') ? this.t('menu.guest') : (name || this.auth.email() || '');
  });
  protected readonly initials = computed(() => {
    const source = (this.profile()?.displayName || this.auth.email() || '?').trim();
    const parts = source.split(/[\s@._-]+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '?') + (parts.length > 1 && this.profile()?.displayName ? parts[parts.length - 1][0] : '')).toUpperCase();
  });
  protected readonly usageList = computed(() => {
    const u = this.usage();
    if (!u) return [];
    const row = (key: 'menu.searches' | 'menu.lookups' | 'menu.messages', x: { used: number; limit: number }) => {
      const left = Math.max(0, x.limit - x.used);
      return { key, left, limit: x.limit, pct: x.limit ? (left / x.limit) * 100 : 0 };
    };
    return [row('menu.searches', u.search), row('menu.lookups', u.enrich), row('menu.messages', u.draft)];
  });

  constructor() {
    this.api.profile().subscribe({ next: p => this.profile.set(p), error: () => { /* initials fall back to the email */ } });
  }

  protected toggle() {
    if (this.open()) { this.close(true); return; }
    this.open.set(true);
    this.api.usage().subscribe({ next: u => this.usage.set(u), error: () => { /* the menu works without it */ } });
    setTimeout(() => this.menu()?.nativeElement.querySelector<HTMLElement>('[role=menuitem]')?.focus());
  }

  protected close(returnFocus = false) {
    this.open.set(false);
    if (returnFocus) this.trigger().nativeElement.focus();
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(e: Event) {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.close();
  }

  @HostListener('document:keydown.escape')
  protected onEscape() {
    if (this.open()) this.close(true);
  }

  /** Arrow keys move between the menu items. */
  protected onKey(e: KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...(this.menu()?.nativeElement.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
    e.preventDefault();
  }

  protected logout() { this.close(); this.auth.logout(); }
  protected keep() { this.close(); this.auth.logout(); this.router.navigateByUrl('/login'); }
}
