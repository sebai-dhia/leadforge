import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { GoogleSignIn } from './google-sign-in';
import { I18n, I18nKey } from './i18n';
import { LangSwitch } from './lang-switch';
import { Logo } from './logo';
import { SpecializationDialog } from './specialization-dialog';
import { SpecializationKey } from './specialization-picker';

/**
 * Sign-in. Returning people sign in (Google first, then email); newcomers get the guest option below.
 * Same night-map look as the landing page, drawn for the dark theme only.
 */
@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, Logo, GoogleSignIn, LangSwitch, SpecializationDialog],
  template: `
    <div class="shell">
      <aside class="aside">
        <a routerLink="/" class="brand" [attr.aria-label]="t('landing.home')"><app-logo [size]="30" /></a>

        <svg class="map" viewBox="0 0 560 420" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
          <defs>
            <pattern id="lg" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="rgba(255,255,255,.05)" /></pattern>
            <radialGradient id="lglow" cx="50%" cy="55%" r="60%"><stop offset="0" stop-color="rgba(61,220,151,.22)" /><stop offset="1" stop-color="rgba(61,220,151,0)" /></radialGradient>
          </defs>
          <rect width="560" height="420" fill="url(#lg)" /><rect width="560" height="420" fill="url(#lglow)" />
          <g fill="none" stroke="rgba(255,255,255,.12)" stroke-width="1.4" stroke-linecap="round">
            <path d="M-10 70 L 580 130" /><path d="M-10 150 L 580 90" /><path d="M170 -10 L 215 200" /><path d="M390 -10 L 345 200" />
          </g>
          <g fill="none" stroke="rgba(255,255,255,.2)" stroke-width="2.6" stroke-linecap="round"><path d="M-10 120 C 140 90, 300 160, 580 110" /></g>
          @for (d of dots; track $index) {
            <g [attr.transform]="'translate(' + d[0] + ' ' + d[1] + ')'">
              <circle class="ping" [class.hot]="d[2]" [style.--k]="$index" r="5" />
              <circle [attr.r]="d[2] ? 5 : 3.6" [attr.fill]="d[2] ? '#3ddc97' : 'rgba(255,255,255,.5)'" />
            </g>
          }
        </svg>

        <div class="aside-body">
          <h2>{{ t('login.asideTitle') }}</h2>
          <p>{{ t('login.asideSub') }}</p>
          <ul class="points">
            @for (p of points; track p[0]) {
              <li>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>
                <span><strong>{{ t(p[0]) }}</strong> {{ t(p[1]) }}</span>
              </li>
            }
          </ul>
        </div>
      </aside>

      <main class="main">
        <div class="top">
          <a routerLink="/" class="brand brand-m" [attr.aria-label]="t('landing.home')"><app-logo [size]="28" /></a>
          <span class="right">
            <a routerLink="/" class="back">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m11 6-6 6 6 6"/></svg>
              {{ t('login.back') }}
            </a>
            <app-lang-switch />
          </span>
        </div>

        <div class="center">
          <div class="box">
            <h1>{{ t('login.title') }}</h1>
            <p class="lede">{{ t('login.lede') }}</p>

            <app-google-sign-in (credential)="google($event)" (failed)="googleUnavailable.set(true)" />
            @if (googleUnavailable()) { <p class="note">{{ t('login.googleUnavailable') }}</p> }
            @if (googleError(); as e) { <p class="problem" role="alert">{{ t(e) }}</p> }

            <div class="or"><span></span>{{ t('login.orEmail') }}<span></span></div>

            <form (ngSubmit)="submit()" [attr.aria-label]="t('login.formLabel')">
              <label>{{ t('login.email') }}
                <input name="email" type="email" required autocomplete="email" inputmode="email" placeholder="you@example.com" [(ngModel)]="email">
              </label>
              <label>{{ t('login.password') }}
                <span class="pw">
                  <input name="password" [type]="showPw() ? 'text' : 'password'" required minlength="8" autocomplete="current-password"
                    [placeholder]="t('login.passwordHint')" [(ngModel)]="password">
                  <button type="button" class="eye" [attr.aria-pressed]="showPw()" [attr.aria-label]="showPw() ? t('login.hidePw') : t('login.showPw')" (click)="showPw.set(!showPw())">
                    @if (showPw()) {
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.1 10.1 0 0 1 12 20c-6.5 0-10-8-10-8a18.5 18.5 0 0 1 5.1-5.9"/><path d="M9.9 4.2A9.1 9.1 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-2.2 3.2"/><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2"/><path d="m2 2 20 20"/></svg>
                    } @else {
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-8 10-8 10 8 10 8-3.6 8-10 8-10-8-10-8Z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </span>
              </label>
              @if (error(); as e) {
                <p class="problem" role="alert">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
                  {{ t(e) }}
                </p>
              }
              <button type="submit" class="btn submit" [disabled]="busy()">{{ busy() ? t('login.signingIn') : t('login.signin') }}</button>
            </form>

            <section class="guest" [attr.aria-label]="t('login.newHere')">
              <div class="guest-head">
                <strong>{{ t('login.newHere') }}</strong>
                <span class="seats" role="status"><span class="dot" [class.full]="demoFull()"></span>{{ t('login.seats', { n: activeCount(), max: maxCount() }) }}</span>
              </div>
              <p>{{ t('login.guestFine', { m: idleMinutes() }) }}</p>
              <button type="button" class="btn ghost guest-btn" [disabled]="busy() || demoFull()" [attr.aria-expanded]="choosing()" (click)="choosing.set(true)">
                {{ t('login.guest') }}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
              </button>
              @if (demoFull()) { <p class="problem" role="alert">{{ t('login.full') }}</p> }
            </section>
          </div>
        </div>
      </main>

      <app-specialization-dialog [open]="choosing()" [busy]="busy()" (closed)="choosing.set(false)" (picked)="guest($event)" />
    </div>
  `,
  styles: `
    /* Drawn for the dark theme only, like the landing page. */
    :host { display: block; min-height: 100vh; color-scheme: dark; color: var(--ink); background: var(--bg);
      --bg: #0a0f0e; --card: #111917; --ink: #ecf3f0; --mute: #93a59e; --line: #22302b; --line-strong: #2b3b35;
      --accent: #3ddc97; --warn: #f0a85a; --on-accent: #04120c; --accent-soft: #16201d; }
    .shell { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); }

    /* ---------- left: the brand side ---------- */
    .aside { position: relative; overflow: hidden; isolation: isolate; display: flex; flex-direction: column; justify-content: space-between; padding: 28px 48px 48px;
      background: radial-gradient(120% 80% at 15% 0%, #112219, #08110e 70%); border-right: 1px solid var(--line); }
    .brand { text-decoration: none; display: inline-flex; min-height: 44px; align-items: center; align-self: flex-start; }
    .map { position: absolute; inset: 0 0 auto 0; z-index: -1; width: 100%; height: 62%; opacity: .95;
      -webkit-mask: linear-gradient(#000 62%, transparent); mask: linear-gradient(#000 62%, transparent); }
    .ping { fill: none; stroke: rgba(255, 255, 255, .25); stroke-width: 1.2; transform-box: fill-box; transform-origin: center; }
    .ping.hot { stroke: var(--accent); animation: ping 3.2s calc(var(--k) * .5s) ease-out infinite; }
    @keyframes ping { 0% { transform: scale(1); opacity: .9; } 70%, 100% { transform: scale(4.4); opacity: 0; } }
    .aside-body { max-width: 440px; }
    .aside h2 { font-size: clamp(30px, 3.4vw, 46px); line-height: 1.04; letter-spacing: -.03em; margin: 0 0 14px; text-wrap: balance; }
    .aside-body > p { color: var(--mute); font-size: 17px; margin: 0 0 24px; }
    .points { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
    .points li { display: flex; gap: 12px; align-items: flex-start; font-size: 14.5px; color: var(--mute); line-height: 1.45; }
    .points svg { flex: none; margin-top: 3px; color: var(--accent); }
    .points strong { color: var(--ink); font-weight: 600; }

    /* ---------- right: the form ---------- */
    .main { display: flex; flex-direction: column; min-width: 0; }
    .top { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 32px; }
    .brand-m { display: none; }
    .right { display: inline-flex; align-items: center; gap: 20px; margin-left: auto; }
    .back { color: var(--mute); text-decoration: none; font-size: 15px; min-height: 44px; display: inline-flex; align-items: center; gap: 8px; padding-right: 20px; border-right: 1px solid var(--line); transition: color .2s ease; }
    .back svg { transition: transform .2s ease; }
    .back:hover svg { transform: translateX(-3px); }
    .back:hover { color: var(--ink); }
    .center { flex: 1; display: flex; align-items: center; justify-content: center; padding: 0 24px 28px; }
    .box { width: 100%; max-width: 400px; }
    h1 { font-size: 34px; letter-spacing: -.03em; line-height: 1.05; margin: 0 0 8px; }
    .lede { color: var(--mute); margin: 0 0 18px; font-size: 15.5px; line-height: 1.45; }
    .note { font-size: 13.5px; color: var(--mute); text-align: center; margin: 10px 0 0; }
    .problem { display: flex; gap: 8px; align-items: flex-start; font-size: 14px; line-height: 1.45; color: var(--warn); margin: 10px 0 0; }
    .problem svg { flex: none; margin-top: 2px; }
    .or { display: flex; align-items: center; gap: 14px; margin: 14px 0; color: var(--mute); font-size: 13px; }
    .or span { flex: 1; height: 1px; background: var(--line); }
    form label { display: block; font-size: 14px; font-weight: 500; color: #b7c6c0; margin-bottom: 12px; }
    form input { display: block; width: 100%; margin-top: 6px; min-height: 46px; padding: 0 14px; border-radius: 12px; font-size: 16px; background: #0d1513; border: 1px solid var(--line-strong); color: var(--ink); }
    form input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(61, 220, 151, .18); }
    .pw { position: relative; display: block; }
    .pw input { padding-right: 52px; }
    .eye { position: absolute; right: 2px; top: 6px; bottom: 0; margin: auto 0; width: 44px; height: 44px; min-height: 44px; padding: 0; border-radius: 10px; background: transparent; color: var(--mute); border: 0; }
    .eye:hover { color: var(--ink); background: var(--accent-soft); filter: none; }
    .submit { width: 100%; min-height: 48px; border-radius: 12px; font-size: 16px; margin-top: 2px; }

    .guest { margin-top: 16px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 16px; background: rgba(255, 255, 255, .025); }
    .guest-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .guest-head strong { font-family: var(--font-display); font-size: 17px; letter-spacing: -.01em; }
    .seats { display: inline-flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 11.5px; letter-spacing: .03em; color: var(--mute); }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
    .dot.full { background: var(--warn); }
    .guest p { color: var(--mute); font-size: 13px; line-height: 1.4; margin: 6px 0 10px; }
    .guest p.problem { margin: 10px 0 0; }
    .guest-btn { width: 100%; min-height: 44px; border-radius: 12px; }
    @media (max-height: 780px) and (min-width: 961px) { .lede { display: none; } h1 { margin-bottom: 14px; } }

    @media (max-width: 960px) {
      .shell { grid-template-columns: 1fr; }
      .aside { display: none; }
      .brand-m { display: inline-flex; }
      .top { padding: 16px 20px; }
      .center { align-items: flex-start; padding-top: 12px; }
    }
    @media (max-width: 480px) { .back { display: none; } h1 { font-size: 30px; } }
    @media (prefers-reduced-motion: reduce) { .back svg { transition: none; } }
    @media (prefers-reduced-motion: reduce) { .ping.hot { animation: none; } }
  `,
})
export class Login implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  protected readonly t = inject(I18n).t;

  email = '';
  password = '';
  protected readonly showPw = signal(false);
  readonly busy = signal(false);
  protected readonly choosing = signal(false);
  readonly error = signal<I18nKey | null>(null);
  readonly activeCount = signal(0);
  readonly maxCount = signal(5);
  readonly idleMinutes = signal(15);
  readonly demoFull = signal(false);
  readonly googleUnavailable = signal(false);
  readonly googleError = signal<I18nKey | null>(null);

  protected readonly dots: [number, number, boolean][] = [[150, 96, true], [255, 56, false], [340, 122, true], [205, 140, false], [430, 150, true], [300, 86, false], [95, 150, false]];
  protected readonly points: [I18nKey, I18nKey][] = [
    ['landing.why1', 'landing.why1Text'], ['landing.why2', 'landing.why2Text'], ['landing.why3', 'landing.why3Text'],
  ];

  ngOnInit() {
    this.refreshStatus();
  }

  refreshStatus() {
    this.api.demoStatus().subscribe({
      next: s => {
        this.activeCount.set(s.activeSessions);
        this.maxCount.set(s.maxSessions);
        this.idleMinutes.set(s.idleMinutes);
        this.demoFull.set(s.demoFull);
      },
      error: () => { /* status endpoint optional on initial load */ }
    });
  }

  guest(spec: SpecializationKey) {
    this.busy.set(true);
    this.error.set(null);
    this.auth.guest(spec).subscribe({
      next: () => this.router.navigateByUrl(this.auth.home()),
      error: e => { this.choosing.set(false); this.fail(e); },
    });
  }

  submit() {
    this.busy.set(true);
    this.error.set(null);
    this.auth.login(this.email, this.password).subscribe({
      next: () => this.router.navigateByUrl(this.auth.home()),
      error: e => this.fail(e),
    });
  }

  google(credential: string) {
    this.busy.set(true);
    this.googleError.set(null);
    this.auth.google(credential).subscribe({
      next: () => this.router.navigateByUrl(this.auth.home()),
      error: e => {
        this.busy.set(false);
        this.googleError.set(
          e.status === 429 ? 'login.full'
          : e.status === 409 ? 'login.errExists'
          : e.status === 401 ? 'login.errGoogle'
          : 'login.errServer');
        if (e.status === 429) this.refreshStatus();
      },
    });
  }

  private fail(e: { status: number }) {
    this.busy.set(false);
    if (e.status === 429) {
      this.error.set('login.full');
      this.refreshStatus();
      return;
    }
    if (e.status === 401) {
      this.error.set('login.errWrong');
      return;
    }
    this.error.set('login.errServer');
  }
}
