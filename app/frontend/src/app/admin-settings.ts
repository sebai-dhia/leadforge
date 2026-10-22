import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AdminConfig, AdminTelegramStatus, AdminTelegramTest, ApiService, SettingEntry, UsageKind } from './api.service';
import { AuthService } from './auth.service';
import { I18n, I18nKey } from './i18n';
import { Toasts } from './toast';

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
  styles: `
    :host { display: block; }
    .intro { margin: 0 0 20px; max-width: 70ch; }
    .tg-facts { display: grid; gap: 0; margin: 0 0 20px; }
    .tg-facts > div { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 12px 0; border-top: 1px solid var(--line); }
    .tg-facts > div:first-child { border-top: 0; }
    .tg-facts dt { color: var(--mute); font-size: 14.5px; }
    .tg-facts dd { margin: 0; text-align: right; font-size: 15px; }
    .tg-facts dd.bad, .tg-result.bad { color: var(--warn); }
    .tg-test { display: flex; align-items: center; gap: 12px 16px; flex-wrap: wrap; }
    .tg-test .mute { font-size: 14px; }
    .tg-result { margin: 14px 0 0; padding: 10px 14px; border-radius: 12px; font-size: 14.5px; box-shadow: inset 0 0 0 1px var(--line-strong); }
    .tg-result.ok { color: var(--accent); background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent); }
    .layout { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 8px 40px; align-items: start; }
    .content { display: flex; flex-direction: column; gap: 32px; max-width: 760px; min-width: 0; padding-bottom: 80px; }

    /* section index: sticky list on wide screens, a row of chips on narrow ones */
    .rail { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 2px; }
    .rail button { justify-content: flex-start; gap: 10px; min-height: 40px; padding: 6px 12px; background: transparent; color: var(--mute); border: 0; border-radius: 10px; font-weight: 500; text-align: left; }
    .rail button:hover { color: var(--ink); background: var(--accent-soft); filter: none; }
    .rail button[aria-current="true"] { color: var(--ink); background: var(--accent-soft); box-shadow: inset 2px 0 0 var(--accent); font-weight: 600; }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); margin-left: auto; flex: none; }

    .sheet { scroll-margin-top: 16px; }
    .sheet-head { margin-bottom: 4px; padding-bottom: 12px; border-bottom: 1px solid var(--line-strong); }
    .sheet-head h2 { margin: 0 0 2px; font-size: 20px; }
    .sheet-head p { margin: 0; max-width: 62ch; }

    .row { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 24px; align-items: center; padding: 16px 0 16px 16px; border-bottom: 1px solid var(--line); }
    .row::before { content: ""; position: absolute; left: 0; top: 14px; bottom: 14px; width: 2px; border-radius: 2px; background: transparent; transition: background-color .2s ease; }
    .row.unsaved::before { background: var(--accent); }
    .meta { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .name { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-weight: 600; font-size: 15px; }
    .tag { font-size: 11.5px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; padding: 1px 8px; border-radius: 999px; background: var(--skeleton); color: var(--mute); }
    .tag.on { background: var(--accent-soft); color: var(--accent); }
    .help { margin: 0; font-size: 13.5px; color: var(--mute); max-width: 52ch; }
    .def { font-size: 13px; color: var(--mute); display: flex; gap: 10px; align-items: center; min-height: 22px; font-family: var(--font-mono); }
    .link { background: none; border: 0; padding: 0; min-height: 0; color: var(--accent); font: inherit; font-family: var(--font-body); font-size: 13px; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
    .link:hover { filter: none; text-decoration-thickness: 2px; }

    .ctl { display: flex; align-items: center; gap: 10px; }
    .unit { font-size: 13px; color: var(--mute); min-width: 4.5em; }
    .stepper { display: inline-flex; align-items: stretch; border: 1px solid var(--line-strong); border-radius: 12px; background: var(--bg); overflow: hidden; }
    .stepper:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
    .stepper.bad { border-color: var(--warn); }
    .stepper input { width: 84px; min-height: 44px; margin: 0; padding: 0 4px; border: 0; border-radius: 0; background: transparent; text-align: center;
      font-family: var(--font-mono); font-size: 18px; font-weight: 500; font-variant-numeric: tabular-nums; }
    .stepper input:focus-visible { outline: none; }
    .step { min-height: 44px; width: 40px; padding: 0; border: 0; border-radius: 0; background: transparent; color: var(--mute); font-size: 20px; font-weight: 400; line-height: 1; }
    .step:hover:not(:disabled) { background: var(--accent-soft); color: var(--ink); filter: none; }
    .step:disabled { opacity: .35; cursor: not-allowed; }

    .switch { position: relative; width: 48px; height: 28px; min-height: 0; padding: 0; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--skeleton); transition: background-color .2s ease, border-color .2s ease; }
    .switch .knob { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: var(--ink); transition: transform .2s ease; }
    .switch[aria-checked="true"] { background: var(--accent); border-color: var(--accent); }
    .switch[aria-checked="true"] .knob { transform: translateX(20px); background: var(--on-accent); }
    .switch:hover:not(:disabled) { filter: none; border-color: var(--accent); }
    .switch:focus-visible { outline-offset: 3px; }

    .meter { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 6px; margin-top: 2px; }
    .track { height: 6px; border-radius: 999px; background: var(--skeleton); overflow: hidden; }
    .track > span { display: block; height: 100%; border-radius: inherit; background: var(--accent); transition: width .4s ease; }
    .meter.hot .track > span { background: var(--warn); }
    .meter-txt { font-size: 12.5px; color: var(--mute); font-variant-numeric: tabular-nums; }
    .meter.hot .meter-txt { color: var(--warn); }

    /* the account: the fields under their own heading */
    .acct { padding-top: 16px; max-width: 420px; }
    .acct form { display: flex; flex-direction: column; gap: 14px; }
    .acct label { display: block; font-weight: 500; font-size: 14px; }
    .acct input { width: 100%; min-height: 44px; margin-top: 5px; }
    .acct .note.warn { color: var(--warn); }
    .acct .note { display: block; font-weight: 400; font-size: 13px; color: var(--mute); margin-top: 4px; }
    .acct-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; }
    .ok { color: var(--accent); }
    .err { color: var(--warn); }

    /* the save bar only exists while something is waiting to be saved */
    .savebar { position: sticky; bottom: 16px; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 10px 12px 10px 18px;
      background: var(--card); border: 1px solid var(--line-strong); border-radius: 16px; box-shadow: 0 18px 50px rgba(0, 0, 0, .45); animation: rise .22s ease both; }
    .savebar .count { font-weight: 600; margin-right: auto; }
    @keyframes rise { from { opacity: 0; transform: translateY(10px); } }

    .load-err { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

    @media (max-width: 900px) {
      .layout { grid-template-columns: minmax(0, 1fr); }
      .rail { position: static; flex-direction: row; gap: 6px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 16px; scrollbar-width: thin; }
      .rail button { flex: none; border: 1px solid var(--line-strong); border-radius: 999px; }
      .rail button[aria-current="true"] { box-shadow: none; border-color: var(--accent); }
    }
    @media (max-width: 560px) {
      .row { grid-template-columns: minmax(0, 1fr); }
      .stepper input { flex: 1; width: 100%; }
      .stepper { flex: 1; }
      .ctl { width: 100%; }
    }
    @media (prefers-reduced-motion: reduce) { .savebar { animation: none; } .track > span, .switch, .switch .knob, .row::before { transition: none; } }
  `,
  template: `
    @if (loadError()) {
      <div class="notice load-err" role="alert">
        <span class="err">{{ t('admin.errLoad') }}</span>
        <button type="button" class="ghost" (click)="load()">{{ t('admin.retry') }}</button>
      </div>
    }

    @if (config()) {
      <p class="mute intro">{{ t('admin.setIntro') }}</p>

      <div class="layout">
        <nav class="rail" [attr.aria-label]="t('admin.setNavAria')">
          @for (s of sections; track s) {
            <button type="button" [attr.aria-current]="active() === s" (click)="go(s)">
              {{ t(navKey(s)) }}
              @if (dirtyIn(s)) { <span class="dot" aria-hidden="true"></span> }
            </button>
          }
        </nav>

        <div class="content">
          @for (g of groups; track g) {
            @if (entriesOf(g).length) {
              <section class="sheet" [id]="'sec-' + g" [attr.aria-labelledby]="'h-' + g">
                <header class="sheet-head">
                  <h2 [id]="'h-' + g">{{ t(groupKey(g)) }}</h2>
                  <p class="mute">{{ t(groupHelpKey(g)) }}</p>
                </header>

                @for (e of entriesOf(g); track e.key) {
                  <div class="row" [class.unsaved]="unsaved(e)">
                    <div class="meta">
                      <span class="name" [id]="'l-' + e.key">
                        {{ t(labelKey(e.key)) }}
                        @if (unsaved(e)) { <span class="tag on">{{ t('admin.setUnsaved') }}</span> }
                        @else if (e.overridden) { <span class="tag">{{ t('admin.setCustom') }}</span> }
                      </span>
                      <p class="help">{{ t(helpKey(e.key)) }}</p>
                      <span class="def">
                        {{ t('admin.setEnv', { value: e.type === 'BOOL' ? t(e.defaultValue === 'true' ? 'admin.setOn' : 'admin.setOff') : e.defaultValue }) }}
                        @if (draft()[e.key] !== e.defaultValue) { <button type="button" class="link" (click)="reset(e)">{{ t('admin.setReset') }}</button> }
                      </span>
                    </div>

                    <div class="ctl">
                      @if (e.type === 'BOOL') {
                        <button type="button" class="switch" role="switch" [attr.aria-checked]="draft()[e.key] === 'true'" [attr.aria-labelledby]="'l-' + e.key"
                          (click)="edit(e.key, draft()[e.key] === 'true' ? 'false' : 'true')"><span class="knob"></span></button>
                        <span class="unit">{{ t(draft()[e.key] === 'true' ? 'admin.setOn' : 'admin.setOff') }}</span>
                      } @else {
                        <span class="stepper" [class.bad]="!valid(e)">
                          <button type="button" class="step" [disabled]="!canStep(e, -1)" [attr.aria-label]="t('admin.setDec')" (click)="bump(e, -1)">&minus;</button>
                          <input type="text" inputmode="numeric" autocomplete="off" spellcheck="false" [attr.aria-labelledby]="'l-' + e.key" [attr.aria-invalid]="!valid(e)"
                            [attr.title]="t('admin.setBetween', { min: e.min, max: e.max })" [value]="draft()[e.key]"
                            (input)="edit(e.key, $any($event.target).value)" (keydown.arrowup)="bump(e, 1); $event.preventDefault()" (keydown.arrowdown)="bump(e, -1); $event.preventDefault()">
                          <button type="button" class="step" [disabled]="!canStep(e, 1)" [attr.aria-label]="t('admin.setInc')" (click)="bump(e, 1)">+</button>
                        </span>
                        <span class="unit">{{ t(unitKey(e.key)) }}</span>
                      }
                    </div>

                    @if (capKind(e.key); as k) {
                      @if (usage()?.[k]; as u) {
                        @let cap = capValue(e);
                        <div class="meter" [class.hot]="cap > 0 && u.used >= cap * 0.9">
                          <div class="track" aria-hidden="true"><span [style.width.%]="cap > 0 ? Math.min(100, u.used / cap * 100) : 0"></span></div>
                          <span class="meter-txt">{{ cap > 0 ? t('admin.meterOf', { used: u.used, cap: cap }) : t('admin.meterNoCap', { used: u.used }) }}</span>
                        </div>
                      }
                    }
                  </div>
                }
              </section>
            }
          }

          <section class="sheet" id="sec-telegram" aria-labelledby="h-telegram">
            <header class="sheet-head">
              <h2 id="h-telegram">{{ t('admin.tgTitle') }}</h2>
              <p class="mute">{{ t('admin.tgHelp') }}</p>
            </header>
            @if (tg(); as s) {
              <dl class="tg-facts">
                <div><dt>{{ t('admin.tgBot') }}</dt>
                  <dd [class.bad]="!s.tokenSet || !s.botName">@if (!s.tokenSet) { {{ t('admin.tgNoToken') }} } @else if (!s.botName) { {{ t('admin.tgBadToken') }} } @else { <strong>&#64;{{ s.botName }}</strong> }</dd></div>
                <div><dt>{{ t('admin.tgPolling') }}</dt>
                  <dd [class.bad]="s.polling === 'FAILING'">{{ t(pollingKey(s.polling)) }}</dd></div>
                <div><dt>{{ t('admin.tgYourChat') }}</dt>
                  <dd>{{ s.adminConnected ? t('admin.tgYourChatYes') : s.alertChatSet ? t('admin.tgYourChatAlert') : t('admin.tgYourChatNo') }}</dd></div>
                <div><dt>{{ t('admin.tgPeople') }}</dt>
                  <dd class="num">{{ s.connectedPeople }}</dd></div>
              </dl>
            }
            <div class="tg-test">
              <button type="button" (click)="testTelegram()" [disabled]="tgTesting()">{{ tgTesting() ? t('admin.tgSending') : t('admin.tgTest') }}</button>
              <span class="mute">{{ t('admin.tgTestHelp') }}</span>
            </div>
            @if (tgResult(); as r) {
              <p class="tg-result" [class.ok]="r.result === 'SENT'" [class.bad]="r.result !== 'SENT'" role="status">{{ t(resultKey(r)) }}</p>
            } @else if (tgTestError()) {
              <p class="tg-result bad" role="alert">{{ t('admin.tgTestErr') }}</p>
            }
          </section>

          <section class="sheet" id="sec-account" aria-labelledby="h-account">
            <header class="sheet-head">
              <h2 id="h-account">{{ t('admin.acctTitle') }}</h2>
              <p class="mute">{{ t('admin.acctHelp') }}</p>
            </header>
            <div class="acct">
              <form (ngSubmit)="changeAccount()" autocomplete="off">
                <label for="acct-email">{{ t('admin.acctEmail') }}
                  <input id="acct-email" name="email" type="email" autocomplete="username" maxlength="255" required [(ngModel)]="email">
                </label>
                <label for="acct-new">{{ t('admin.acctNewPw') }}
                  <input id="acct-new" name="newPassword" type="password" autocomplete="new-password" minlength="12" maxlength="100" [(ngModel)]="newPassword">
                  <span class="note">{{ t('admin.acctNewPwHelp') }}</span>
                </label>
                @if (newPassword) {
                  <label for="acct-confirm">{{ t('admin.acctConfirmPw') }}
                    <input id="acct-confirm" name="confirmPassword" type="password" autocomplete="new-password" maxlength="100"
                      [attr.aria-invalid]="confirmMismatch()" aria-describedby="acct-confirm-note" [(ngModel)]="confirmPassword">
                    @if (confirmMismatch()) { <span class="note warn" id="acct-confirm-note" role="alert">{{ t('admin.acctMismatch') }}</span> }
                  </label>
                }
                <label for="acct-current">{{ t('admin.acctCurrentPw') }}
                  <input id="acct-current" name="currentPassword" type="password" autocomplete="current-password" maxlength="100" required [(ngModel)]="currentPassword">
                </label>
                <div class="acct-actions">
                  <button type="submit" [disabled]="!currentPassword || !email.trim() || accountBusy() || !accountChanged() || (newPassword.length > 0 && newPassword !== confirmPassword)">{{ t('admin.acctSave') }}</button>
                  @if (accountError(); as m) { <span class="err" role="alert">{{ t(m) }}</span> }
                  @if (accountSaved()) { <span class="ok" role="status">{{ t('admin.acctSaved') }}</span> }
                </div>
              </form>
            </div>
          </section>

          @if (dirty().length) {
            <div class="savebar" role="region" [attr.aria-label]="t('admin.setSave')">
              <span class="count">{{ dirty().length === 1 ? t('admin.setDirtyOne') : t('admin.setDirtyMany', { n: dirty().length }) }}</span>
              @if (saveError(); as m) { <span class="err" role="alert">{{ t(m) }}</span> }
              <button type="button" class="ghost" (click)="discard()" [disabled]="saving()">{{ t('admin.setDiscard') }}</button>
              <button type="button" (click)="save()" [disabled]="!allValid() || saving()">{{ saving() ? t('admin.setSaving') : t('admin.setSave') }}</button>
            </div>
          }
        </div>
      </div>
    } @else if (!loadError()) {
      <div class="card skeleton-card" aria-busy="true" [attr.aria-label]="t('admin.loadingAria')"><span></span><span></span><span></span></div>
    }
  `,
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
