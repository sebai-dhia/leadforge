import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AdminConfig, AdminTelegramStatus, AdminTelegramTest, ApiService, SettingEntry, UsageKind } from '../../../core/api.service';
import { AuthService } from '../../../core/auth.service';
import { I18n, I18nKey } from '../../../i18n/i18n';
import { Toasts } from '../../../shared/toast/toast';

const GROUPS: SettingEntry['group'][] = ['limits', 'caps', 'guests', 'demo', 'throttle'];
type Section = SettingEntry['group'] | 'telegram' | 'account';
const SECTIONS: Section[] = [...GROUPS, 'telegram', 'account'];

/** What the number counts, shown next to it. */
const UNIT: Record<string, I18nKey> = {
  'guest.perIpPerHour': 'admin.unit.hour',
  'limits.registerPerHour': 'admin.unit.hour',
  'demo.maxSessions': 'admin.unit.seats',
  'demo.idleMinutes': 'admin.unit.min',
  'limits.loginWindowMinutes': 'admin.unit.min',
  'limits.loginFailures': 'admin.unit.tries',
};
/** The caps show how much of the cap is used right now. */
const CAP_KIND: Record<string, UsageKind> = { 'caps.searchesPerDay': 'search', 'caps.draftsPerDay': 'draft', 'caps.enrichPerDay': 'enrich' };

/**
 * The Settings tab: a section index on the left, one column of settings on the right. Values saved here are kept in the
 * database and apply at once; the admin's own account is the last section.
 */
@Component({
  selector: 'app-admin-settings',
  imports: [FormsModule],
  styleUrl: './admin-settings.scss',
  templateUrl: './admin-settings.html',
})
export class AdminSettings {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toasts = inject(Toasts);
  protected readonly t = inject(I18n).t;
  protected readonly Math = Math;
  protected readonly groups = GROUPS;
  protected readonly sections = SECTIONS;

  protected readonly config = signal<AdminConfig | null>(null);
  protected readonly loadError = signal(false);
  /** Use in the last 24 hours, to show next to the caps. */
  protected readonly usage = signal<Record<UsageKind, { used: number; refunded: number; cap: number }> | null>(null);
  /** What is in the fields now, by setting key. */
  protected readonly draft = signal<Record<string, string>>({});
  protected readonly saving = signal(false);
  protected readonly saveError = signal<I18nKey | null>(null);
  protected readonly active = signal<Section>('limits');

  protected readonly dirty = computed(() => {
    const d = this.draft();
    return (this.config()?.settings ?? []).filter(e => (d[e.key] ?? e.value) !== e.value);
  });
  protected readonly allValid = computed(() => this.dirty().every(e => this.valid(e)));

  protected email = '';
  protected newPassword = '';
  protected confirmPassword = '';
  protected currentPassword = '';
  private savedEmail = '';
  protected readonly accountBusy = signal(false);
  protected readonly accountError = signal<I18nKey | null>(null);
  protected readonly accountSaved = signal(false);

  protected readonly tg = signal<AdminTelegramStatus | null>(null);
  protected readonly tgTesting = signal(false);
  protected readonly tgResult = signal<AdminTelegramTest | null>(null);
  protected readonly tgTestError = signal(false);
  private tgHide?: ReturnType<typeof setTimeout>;

  private spy = 0;

  constructor() {
    this.load();
    this.loadUsage();
    this.loadTelegram();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.tgHide));
    this.api.adminAccount().subscribe({ next: a => { this.email = this.savedEmail = a.email; }, error: () => { /* the form stays empty */ } });
  }

  protected load() {
    this.loadError.set(false);
    this.api.adminConfig().subscribe({ next: c => this.apply(c), error: () => this.loadError.set(true) });
  }

  private loadTelegram() {
    this.api.adminTelegram().subscribe({ next: s => this.tg.set(s), error: () => { /* the section keeps its button */ } });
  }

  /** Sends one sample message to the admin, right now, only because the button was pressed. */
  protected testTelegram() {
    clearTimeout(this.tgHide);
    this.tgTesting.set(true);
    this.tgResult.set(null);
    this.tgTestError.set(false);
    this.api.adminTelegramTest().subscribe({
      next: r => {
        this.tgTesting.set(false);
        this.tgResult.set(r);
        this.loadTelegram();
        // a success disappears after 7 seconds; a problem stays until the next test
        if (r.result === 'SENT') this.tgHide = setTimeout(() => this.tgResult.set(null), 7000);
      },
      error: () => { this.tgTesting.set(false); this.tgTestError.set(true); },
    });
  }

  protected pollingKey(p: AdminTelegramStatus['polling']): I18nKey { return `admin.tgPolling.${p}` as I18nKey; }
  protected resultKey(r: AdminTelegramTest): I18nKey {
    return (r.result === 'SENT' ? `admin.tgSent.${r.via}` : `admin.tgFail.${r.result}`) as I18nKey;
  }

  private loadUsage() {
    this.api.adminOverview().subscribe({ next: o => this.usage.set(o.usage24h), error: () => { /* the meters stay hidden or keep the old numbers */ } });
  }

  private apply(c: AdminConfig) {
    this.config.set(c);
    this.draft.set(Object.fromEntries(c.settings.map(e => [e.key, e.value])));
  }

  protected entriesOf(group: SettingEntry['group']) {
    return (this.config()?.settings ?? []).filter(e => e.group === group);
  }

  protected groupKey(g: string) { return `admin.setGroup.${g}` as I18nKey; }
  protected groupHelpKey(g: string) { return `admin.setGroup.${g}Help` as I18nKey; }
  protected navKey(s: Section) { return `admin.nav.${s}` as I18nKey; }
  protected labelKey(key: string) { return `set.${key}` as I18nKey; }
  protected helpKey(key: string) { return `set.help.${key}` as I18nKey; }
  protected unitKey(key: string): I18nKey { return UNIT[key] ?? 'admin.unit.day'; }
  protected capKind(key: string): UsageKind | null { return CAP_KIND[key] ?? null; }

  /** The cap as typed; 0 (or something not valid yet) means no cap to compare with. */
  protected capValue(e: SettingEntry): number {
    const v = (this.draft()[e.key] ?? '').trim();
    return /^\d+$/.test(v) ? Number(v) : 0;
  }

  protected unsaved(e: SettingEntry): boolean { return (this.draft()[e.key] ?? e.value) !== e.value; }
  protected dirtyIn(s: Section): boolean { return s !== 'account' && s !== 'telegram' && this.dirty().some(e => e.group === s); }

  protected edit(key: string, value: string) {
    this.draft.update(d => ({ ...d, [key]: value }));
    this.saveError.set(null);
  }

  protected reset(e: SettingEntry) { this.edit(e.key, e.defaultValue); }

  private step(e: SettingEntry) { return e.max >= 10000 ? 10 : 1; }

  protected canStep(e: SettingEntry, dir: 1 | -1): boolean {
    const v = this.valid(e) ? Number(this.draft()[e.key].trim()) : null;
    return v === null || (dir === 1 ? v < e.max : v > e.min);
  }

  /** The plus and minus buttons and the arrow keys; from a value that is not a number they start at the minimum. */
  protected bump(e: SettingEntry, dir: 1 | -1) {
    const raw = (this.draft()[e.key] ?? '').trim();
    const now = /^\d+$/.test(raw) ? Number(raw) : e.min;
    this.edit(e.key, String(Math.min(e.max, Math.max(e.min, now + dir * this.step(e)))));
  }

  protected valid(e: SettingEntry): boolean {
    const v = (this.draft()[e.key] ?? '').trim();
    if (e.type === 'BOOL') return v === 'true' || v === 'false';
    if (!/^\d+$/.test(v)) return false;
    const n = Number(v);
    return n >= e.min && n <= e.max;
  }

  protected discard() {
    const c = this.config();
    if (c) this.apply(c);
    this.saveError.set(null);
  }

  protected save() {
    const changes = Object.fromEntries(this.dirty().map(e => [e.key, this.draft()[e.key].trim()]));
    this.saving.set(true);
    this.saveError.set(null);
    this.api.saveAdminConfig(changes).subscribe({
      next: c => {
        this.apply(c);
        this.saving.set(false);
        this.toasts.show(this.t('admin.setSaved'), undefined, 4000);
        this.loadUsage();
      },
      error: (err: HttpErrorResponse) => { this.saving.set(false); this.saveError.set(err.status === 400 ? 'admin.setErrInvalid' : 'admin.setErr'); },
    });
  }

  protected go(s: Section) {
    this.active.set(s);
    const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('sec-' + s)?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
  }

  /** The section index follows the page: the last section whose top has passed the top of the screen. */
  @HostListener('window:scroll')
  protected onScroll() {
    cancelAnimationFrame(this.spy);
    this.spy = requestAnimationFrame(() => {
      const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
      let current: Section = SECTIONS[0];
      for (const s of SECTIONS) {
        const el = document.getElementById('sec-' + s);
        if (el && el.getBoundingClientRect().top <= 120) current = s;
      }
      this.active.set(atEnd ? SECTIONS[SECTIONS.length - 1] : current);
    });
  }

  /** Shown once the second field has something in it, so it does not scold while the person is still typing. */
  protected confirmMismatch() {
    return this.confirmPassword.length > 0 && this.newPassword !== this.confirmPassword;
  }

  protected accountChanged() {
    return this.email.trim().toLowerCase() !== this.savedEmail.toLowerCase() || this.newPassword.length > 0;
  }

  protected changeAccount() {
    this.accountError.set(null);
    this.accountSaved.set(false);
    const email = this.email.trim();
    this.accountBusy.set(true);
    this.api.changeAdminAccount({
      currentPassword: this.currentPassword,
      ...(email.toLowerCase() !== this.savedEmail.toLowerCase() ? { email } : {}),
      ...(this.newPassword ? { newPassword: this.newPassword } : {}),
    }).subscribe({
      next: a => {
        this.accountBusy.set(false);
        this.accountSaved.set(true);
        this.email = this.savedEmail = a.email;
        this.auth.setEmail(a.email);
        this.newPassword = this.confirmPassword = this.currentPassword = '';
      },
      error: (err: HttpErrorResponse) => {
        this.accountBusy.set(false);
        this.accountError.set(err.status === 403 ? 'admin.acctWrongPw' : err.status === 409 ? 'admin.acctTaken'
          : err.status === 400 ? 'admin.acctInvalid' : err.status === 429 ? 'admin.acctThrottle' : 'admin.acctErr');
      },
    });
  }
}
