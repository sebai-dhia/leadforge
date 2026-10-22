import { Component, ElementRef, HostListener, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService, Profile, UsageMap } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { AppLang, I18n } from '../../i18n/i18n';

/** The round account button at the right of the app bar and the menu it opens. */
@Component({
  selector: 'app-user-menu',
  imports: [RouterLink],
  templateUrl: './user-menu.html',
  styleUrl: './user-menu.scss',
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
    effect(() => { const saved = this.api.savedProfile(); if (saved) this.profile.set(saved); });
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
