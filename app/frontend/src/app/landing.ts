import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { Dossier } from './dossier';
import { FitLinesDirective } from './fit-lines';
import { I18n, I18nKey } from './i18n';
import { LangSwitch } from './lang-switch';
import { Logo } from './logo';
import { Radar } from './radar';
import { ProgressDirective, RevealDirective, StepWatchDirective } from './scroll-fx';
import { SpecializationDialog } from './specialization-dialog';
import { SpecializationKey } from './specialization-picker';

/**
 * Landing page. Direction: a night map, editorial type, one emerald signal.
 * Motion follows the scroll: the hero map zooms and its layers drift at different speeds (parallax), a sticky
 * stage changes with the step being read, a line is drawn down the steps (scroll-linked), and blocks fade up
 * once as they arrive (scroll-triggered). Without motion everything shows in its finished state.
 */
@Component({
  selector: 'app-landing',
  imports: [RouterLink, Logo, LangSwitch, SpecializationDialog, Radar, Dossier, FitLinesDirective, ProgressDirective, RevealDirective, StepWatchDirective],
  template: `
    <div class="page">
      <header class="top">
        <a routerLink="/" class="brand" [attr.aria-label]="t('landing.home')"><app-logo [size]="30" /></a>
        <nav [attr.aria-label]="t('landing.siteNav')">
          <app-lang-switch />
          <div class="links">
            <a href="#how" class="plain">{{ t('landing.how') }}</a>
            <a href="#why" class="plain">{{ t('landing.why') }}</a>
            <a routerLink="/login" class="btn ghost signin">{{ t('landing.signin') }}</a>
          </div>
        </nav>
      </header>

      <!-- Hero -->
      <section class="hero" appProgress="leave" [settled]="0">
        <div class="copy">
          <span class="seats" role="status">
            <span class="dot" [class.full]="full()"></span>
            {{ seatsLabel() }}
          </span>
          <h1 [appFitLines]="3" [class.booting]="booting()" [attr.aria-label]="t('landing.title')">
            @for (w of titleWords(); track $index) { <span class="mask" aria-hidden="true"><span class="word" [style.--w]="$index">{{ w }}</span></span>{{ ' ' }} }
          </h1>
          <p class="sub">{{ t('landing.sub') }}</p>
          <div class="cta">
            <button type="button" class="btn big" [disabled]="busy() || full()" [attr.aria-expanded]="choosing()" (click)="choose()">
              {{ t('landing.guest') }}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
            </button>
            <a routerLink="/login" class="btn ghost big">{{ t('landing.signin') }}</a>
          </div>
          @if (error(); as e) { <p class="err" role="alert">{{ t(e) }}</p> }
          <p class="fine">{{ t('landing.fine') }}</p>
        </div>
        <div class="visual" aria-hidden="true"><app-radar /></div>
      </section>

      <!-- Business types, drifting past -->
      <section class="ticker" [attr.aria-label]="t('landing.tickerLabel')">
        <div class="track">
          @for (pass of [0, 1]; track pass) {
            <ul [attr.aria-hidden]="pass === 1">
              @for (k of niches; track k) { <li>{{ i18n.niche(k) }}</li> }
            </ul>
          }
        </div>
      </section>

      <!-- How it works: a sticky stage that changes with the step being read -->
      <section id="how" class="story">
        <div class="story-head" appReveal>
          <div class="eyebrow">{{ t('landing.howEyebrow') }}</div>
          <h2>{{ t('landing.howTitle') }}</h2>
        </div>
        <div class="story-grid">
          <ol class="steps" appProgress="through">
            <span class="thread" aria-hidden="true"><span class="fill"></span></span>
            @for (s of steps; track s.n; let i = $index) {
              <li class="step" [class.on]="active() === i" [appStepWatch]="i" (activated)="active.set($event)">
                <span class="num">0{{ s.n }}</span>
                <h3>{{ t(s.title) }}</h3>
                <p>{{ t(s.text) }}</p>
              </li>
            }
          </ol>

          <div class="stage" aria-hidden="true">
            <div class="frame">
              <div class="tabs">
                @for (s of steps; track s.n; let i = $index) { <span [class.on]="active() === i">{{ t(s.stage) }}</span> }
              </div>

              <div class="layer l1" [class.on]="active() === 0">
                @for (o of specs; track o.key; let i = $index) {
                  <div class="opt" [style.--i]="i">
                    <span class="check"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg></span>
                    <strong>{{ t(o.title) }}</strong>
                    <span>{{ t(o.text) }}</span>
                  </div>
                }
              </div>

              <div class="layer l2" [class.on]="active() === 1">
                <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
                  <defs>
                    <pattern id="g2" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="rgba(255,255,255,.06)" /></pattern>
                  </defs>
                  <rect width="400" height="300" fill="url(#g2)" />
                  <g fill="none" stroke="rgba(255,255,255,.13)" stroke-width="1.3" stroke-linecap="round">
                    <path d="M-10 90 C 120 60, 260 130, 410 80" /><path d="M150 -10 C 170 120, 130 200, 190 310" /><path d="M-10 210 L 410 170" />
                  </g>
                  <rect class="draw" x="70" y="52" width="250" height="176" rx="6" pathLength="100" fill="rgba(61,220,151,.05)" stroke="var(--accent)" stroke-width="1.6" />
                  @for (d of stageDots; track $index) {
                    <circle class="sd" [class.hot]="d[2]" [style.--k]="$index" [attr.cx]="d[0]" [attr.cy]="d[1]" r="4.5" />
                  }
                </svg>
                <span class="found">{{ t('landing.radarCount', { n: 14, m: 6 }) }}</span>
              </div>

              <div class="layer l3" [class.on]="active() === 2"><app-dossier [play]="active() === 2" /></div>
            </div>
          </div>
        </div>
      </section>

      <!-- Principles -->
      <section id="why" class="trust">
        <h2 class="trust-title" appReveal>{{ t('landing.whyTitle') }}</h2>
        <ol class="principles">
          @for (p of principles; track p.n; let i = $index) {
            <li [appReveal]="i * 120">
              <span class="idx">0{{ p.n }}</span>
              <h3>{{ t(p.title) }}</h3>
              <p>{{ t(p.text) }}</p>
            </li>
          }
        </ol>
      </section>

      <!-- Closing: the panel zooms in as it arrives -->
      <section class="final" appProgress="through">
        <div class="final-card">
          <h2>{{ t('landing.finalTitle') }}</h2>
          <p>{{ t('landing.finalText') }}</p>
          <button type="button" class="btn big" [disabled]="busy() || full()" (click)="choose()">
            {{ t('landing.guest') }}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
          </button>
        </div>
      </section>

      <app-specialization-dialog [open]="choosing()" [busy]="busy()" (closed)="choosing.set(false)" (picked)="tryDemo($event)" />

      <footer class="foot">
        <span>{{ t('landing.footDemo') }}</span>
        <span>{{ t('landing.mapData') }} <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">{{ t('landing.osm') }}</a></span>
      </footer>
    </div>
  `,
  styles: `
    :host { display: block; overflow-x: clip; }
    .page { font-size: 17px; line-height: 1.6; }
    .top, .hero, .story, .trust, .final, .foot { max-width: 1180px; margin: 0 auto; padding-left: 24px; padding-right: 24px; }
    .top { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: nowrap; padding-top: 20px; padding-bottom: 20px; position: relative; z-index: 5; }
    .brand { text-decoration: none; display: inline-flex; min-height: 44px; align-items: center; }
    .top nav { display: flex; align-items: center; gap: 28px; flex-wrap: nowrap; flex: none; }
    .top app-lang-switch { flex: none; }
    /* One fixed-width area for the links: the text changes with the language, the switch to its left does not move. */
    .links { display: flex; align-items: center; justify-content: space-between; width: 520px; }
    .signin { min-width: 156px; justify-content: center; }
    .plain { color: var(--mute); text-decoration: none; font-size: 15px; font-weight: 500; min-height: 44px; display: inline-flex; align-items: center; transition: color .2s ease; }
    .plain:hover { color: var(--ink); }
    @media (max-width: 960px) { .links { width: auto; } .top nav .plain { display: none; } }
    @media (max-width: 480px) { .top nav .signin { display: none; } .top { padding-left: 16px; padding-right: 16px; } }

    /* ---------- hero ---------- */
    .hero { position: relative; display: grid; grid-template-columns: minmax(0, 1.02fr) minmax(0, 1fr); gap: 56px; align-items: center; min-height: calc(100svh - 152px); padding-top: 8px; padding-bottom: 24px; }
    .hero::before { content: ''; position: absolute; z-index: -1; inset: -120px -20vw auto auto; width: 70vw; max-width: 900px; aspect-ratio: 1; pointer-events: none;
      background: radial-gradient(closest-side, rgba(61, 220, 151, .16), transparent); }
    .hero::after { content: ''; position: absolute; z-index: -1; inset: -80px -40vw 0; pointer-events: none; opacity: .5; mix-blend-mode: overlay;
      background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"); }
    .seats { display: inline-flex; align-items: center; gap: 10px; padding: 7px 14px; border: 1px solid var(--line-strong); border-radius: 999px; background: rgba(255, 255, 255, .03);
      font-family: var(--font-mono); font-size: 12px; letter-spacing: .04em; color: var(--mute); }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 0 rgba(61, 220, 151, .6); animation: beat 2.4s ease-out infinite; }
    .dot.full { background: var(--warn); animation: none; }
    @keyframes beat { 70%, 100% { box-shadow: 0 0 0 9px rgba(61, 220, 151, 0); } }
    h1 { font-size: clamp(32px, min(4.8vw, 6.8vh), 66px); line-height: 1; letter-spacing: -.04em; margin: 18px 0 16px; font-weight: 700; text-wrap: balance; }
    .mask { display: inline-block; overflow: hidden; vertical-align: top; padding-bottom: .12em; margin-bottom: -.12em; }
    .word { display: inline-block; }
    .booting .word { animation: rise 1s calc(.12s + var(--w) * .075s) cubic-bezier(.2, .9, .2, 1) backwards; }
    @keyframes rise { from { transform: translateY(112%); } }
    .sub { font-size: clamp(15px, 2.1vh, 19px); line-height: 1.5; color: var(--mute); max-width: 540px; margin: 0 0 22px; }
    .cta { display: flex; gap: 14px; flex-wrap: wrap; }
    .btn.big { min-height: 54px; padding: 0 28px; border-radius: 14px; font-size: 17px; }
    .fine { font-size: 14px; color: var(--mute); margin: 14px 0 0; max-width: 460px; }
    .visual { min-width: 0; }
    @media (max-width: 960px) { .hero { grid-template-columns: 1fr; gap: 36px; min-height: 0; padding-bottom: 72px; } }
    @media (max-width: 600px) { .hero { padding-top: 8px; } }

    /* ---------- ticker ---------- */
    .ticker { border-block: 1px solid var(--line); background: rgba(255, 255, 255, .015); overflow: hidden; -webkit-mask: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); mask: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); }
    .track { display: flex; width: max-content; animation: drift 46s linear infinite; }
    .ticker:hover .track { animation-play-state: paused; }
    .track ul { display: flex; list-style: none; margin: 0; padding: 0; }
    .track li { display: inline-flex; align-items: center; gap: 22px; padding: 18px 22px 18px 0; font-family: var(--font-mono); font-size: 13px; letter-spacing: .12em; text-transform: uppercase; color: var(--mute); white-space: nowrap; }
    .track li::after { content: ''; width: 5px; height: 5px; border-radius: 50%; background: var(--accent); opacity: .7; }
    @keyframes drift { to { transform: translateX(-50%); } }

    /* ---------- story ---------- */
    .story { padding-top: 88px; padding-bottom: 32px; }
    .eyebrow { font-family: var(--font-mono); font-size: 12px; letter-spacing: .14em; color: var(--accent); }
    .story-head h2, .trust-title { font-size: clamp(28px, 3.8vw, 46px); line-height: 1.04; letter-spacing: -.03em; margin: 14px 0 0; max-width: 760px; text-wrap: balance; }
    .story-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: 72px; margin-top: 56px; align-items: start; }
    .steps { position: relative; list-style: none; margin: 0; padding: 0 0 0 44px; }
    .thread { position: absolute; left: 11px; top: 0; bottom: 0; width: 2px; background: var(--line); border-radius: 2px; }
    .fill { position: absolute; inset: 0; background: var(--accent); border-radius: 2px; transform-origin: top; transform: scaleY(min(1, calc(var(--p, 1) * 1.35))); }
    .step { position: relative; min-height: 72vh; display: flex; flex-direction: column; justify-content: center; opacity: .38; transition: opacity .45s ease; }
    .step.on { opacity: 1; }
    .step::before { content: ''; position: absolute; left: -40px; top: calc(50% - 90px); width: 18px; height: 18px; border-radius: 50%; background: var(--bg); border: 2px solid var(--line-strong); transition: border-color .4s ease, background-color .4s ease, box-shadow .4s ease; }
    .step.on::before { border-color: var(--accent); background: var(--accent); box-shadow: 0 0 0 6px rgba(61, 220, 151, .16); }
    .num { font-family: var(--font-mono); font-size: 13px; letter-spacing: .12em; color: var(--accent); }
    .step h3 { font-size: clamp(24px, 2.6vw, 32px); letter-spacing: -.025em; line-height: 1.08; margin: 12px 0 14px; }
    .step p { color: var(--mute); font-size: 18px; max-width: 440px; margin: 0; }

    .stage { position: sticky; top: 92px; height: min(600px, calc(100vh - 124px)); }
    .frame { position: relative; height: 100%; border-radius: 28px; overflow: hidden; isolation: isolate; border: 1px solid rgba(255, 255, 255, .09);
      background: radial-gradient(110% 80% at 50% 0%, #0f1c17, #08110e 70%); box-shadow: 0 50px 100px -40px rgba(0, 0, 0, .8), 0 0 80px -34px rgba(61, 220, 151, .3); }
    .tabs { position: absolute; z-index: 3; left: 20px; right: 20px; top: 16px; display: flex; gap: 18px; font-family: var(--font-mono); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: rgba(255, 255, 255, .35); }
    .tabs span { padding-bottom: 6px; border-bottom: 1px solid transparent; transition: color .35s ease, border-color .35s ease; }
    .tabs .on { color: var(--accent); border-color: var(--accent); }
    .layer { position: absolute; inset: 0; padding: 64px 24px 24px; opacity: 0; transform: translateY(18px) scale(.985); transition: opacity .5s ease, transform .6s cubic-bezier(.2, .8, .2, 1); pointer-events: none; display: flex; flex-direction: column; justify-content: center; gap: 12px; }
    .layer.on { opacity: 1; transform: none; }
    .l1 .opt { position: relative; display: flex; flex-direction: column; gap: 3px; padding: 16px 18px 16px 52px; border-radius: 16px; border: 1px solid rgba(255, 255, 255, .1); background: rgba(255, 255, 255, .03); color: var(--mute); font-size: 14px;
      transform: translateX(26px); opacity: 0; transition: opacity .5s calc(var(--i) * .1s + .15s) ease, transform .6s calc(var(--i) * .1s + .15s) cubic-bezier(.2, .8, .2, 1), border-color .4s ease, background-color .4s ease; }
    .l1.on .opt { opacity: 1; transform: none; }
    .l1 .opt strong { color: var(--ink); font-family: var(--font-display); font-size: 18px; letter-spacing: -.01em; }
    .check { position: absolute; left: 16px; top: 50%; width: 24px; height: 24px; translate: 0 -50%; border-radius: 50%; display: grid; place-items: center; border: 1.5px solid rgba(255, 255, 255, .22); color: transparent; transition: all .4s .9s ease; }
    .l1.on .opt:nth-child(2) { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); transition-delay: .9s; }
    .l1.on .opt:nth-child(2) .check { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
    .l2 { padding: 0; }
    .l2 svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    .draw { stroke-dasharray: 100; stroke-dashoffset: 100; }
    .l2.on .draw { animation: drawn 1.3s .25s ease forwards; }
    @keyframes drawn { to { stroke-dashoffset: 0; } }
    .sd { fill: rgba(255, 255, 255, .5); opacity: 0; transform-box: fill-box; transform-origin: center; }
    .sd.hot { fill: var(--accent); }
    .l2.on .sd { animation: pop .5s calc(1.1s + var(--k) * .1s) cubic-bezier(.2, .9, .3, 1.4) forwards; }
    @keyframes pop { from { opacity: 0; transform: scale(.2); } to { opacity: 1; transform: none; } }
    .found { position: absolute; left: 20px; bottom: 18px; font-family: var(--font-mono); font-size: 12px; letter-spacing: .06em; color: var(--accent); padding: 7px 12px; border-radius: 999px; background: rgba(8, 17, 14, .85); border: 1px solid rgba(61, 220, 151, .35); }
    @media (max-width: 960px) {
      .story { padding-top: 88px; }
      .story-grid { grid-template-columns: 1fr; gap: 0; margin-top: 36px; }
      .stage { order: -1; top: 64px; height: 340px; z-index: 4; margin-bottom: 8px; }
      .step { min-height: 52vh; }
      .step::before { top: calc(50% - 40px); }
    }

    /* ---------- principles ---------- */
    .trust { padding-top: 96px; padding-bottom: 32px; display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: 72px; align-items: start; }
    .trust-title { position: sticky; top: 110px; }
    .principles { list-style: none; margin: 0; padding: 0; }
    .principles li { position: relative; display: grid; grid-template-columns: 64px 1fr; column-gap: 8px; padding: 34px 0 36px; border-top: 1px solid var(--line); }
    .principles li:last-child { border-bottom: 1px solid var(--line); }
    .principles li::after { content: ''; position: absolute; left: 0; top: -1px; height: 1px; width: 100%; background: var(--accent); transform: scaleX(0); transform-origin: left; transition: transform .8s .25s cubic-bezier(.2, .8, .2, 1); }
    .principles li.in::after { transform: scaleX(.22); }
    .idx { grid-row: span 2; font-family: var(--font-mono); font-size: 13px; letter-spacing: .1em; color: var(--accent); padding-top: 10px; }
    .principles h3 { font-size: clamp(22px, 2.4vw, 30px); letter-spacing: -.025em; line-height: 1.1; margin: 0 0 10px; }
    .principles p { margin: 0; color: var(--mute); font-size: 17px; max-width: 460px; }
    @media (max-width: 960px) { .trust { grid-template-columns: 1fr; gap: 32px; padding-top: 96px; } .trust-title { position: static; } }

    /* ---------- closing ---------- */
    .final { padding-top: 96px; padding-bottom: 96px; }
    .final-card { position: relative; text-align: center; padding: clamp(40px, 7vw, 88px) 24px; border-radius: 36px; overflow: hidden; isolation: isolate;
      border: 1px solid rgba(255, 255, 255, .1); background: radial-gradient(70% 100% at 50% 0%, rgba(61, 220, 151, .2), transparent 70%), linear-gradient(180deg, #0d1814, #08110e);
      transform: scale(calc(.9 + min(1, calc(var(--p, 1) * 1.7)) * .1)); will-change: transform; }
    .final-card::before { content: ''; position: absolute; inset: 0; z-index: -1; opacity: .5;
      background: repeating-linear-gradient(0deg, rgba(255, 255, 255, .03) 0 1px, transparent 1px 44px), repeating-linear-gradient(90deg, rgba(255, 255, 255, .03) 0 1px, transparent 1px 44px);
      -webkit-mask: radial-gradient(closest-side, #000, transparent); mask: radial-gradient(closest-side, #000, transparent); }
    .final h2 { font-size: clamp(30px, min(4.8vw, 8vh), 56px); line-height: 1; letter-spacing: -.04em; margin: 0 auto 16px; max-width: 880px; text-wrap: balance; }
    .final p { color: var(--mute); font-size: 19px; margin: 0 0 32px; }
    .foot { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; border-top: 1px solid var(--line); padding-top: 28px; padding-bottom: 44px; color: var(--mute); font-size: 14px; }

    /* ---------- scroll-triggered reveal: a short fade and a 20px rise, once ---------- */
    .reveal { opacity: 0; transform: translateY(20px); transition: opacity .7s var(--d, 0ms) cubic-bezier(.2, .8, .2, 1), transform .7s var(--d, 0ms) cubic-bezier(.2, .8, .2, 1); }
    .reveal.in { opacity: 1; transform: none; }

    @media (prefers-reduced-motion: reduce) {
      .reveal, .reveal.in { opacity: 1; transform: none; transition: none; }
      .track { animation: none; flex-wrap: wrap; width: auto; }
      .ticker { -webkit-mask: none; mask: none; }
      .dot, .booting .word, .draw, .sd, .layer, .l1 .opt, .step, .check { animation: none !important; transition: none !important; }
      .draw { stroke-dashoffset: 0; } .sd { opacity: 1; } .l1 .opt { opacity: 1; transform: none; } .step { opacity: 1; }
      .final-card { transform: none; } .fill { transform: none; }
    }
  `,
})
export class Landing implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  readonly busy = signal(false);
  protected readonly choosing = signal(false);
  readonly error = signal<I18nKey | null>(null);
  readonly full = signal(false);
  private readonly seats = signal<{ n: number; max: number; full: boolean } | null>(null);
  protected readonly seatsLabel = () => {
    const s = this.seats();
    return !s ? this.t('landing.seatsDefault') : this.t(s.full ? 'landing.seatsFull' : 'landing.seatsOpen', { n: s.n, max: s.max });
  };

  /** The headline rises word by word once, when the page opens. A language change afterwards does not replay it. */
  protected readonly booting = signal(true);
  protected readonly titleWords = () => this.t('landing.title').split(' ');
  protected readonly active = signal(0);

  protected readonly niches = ['dental clinics', 'hotels', 'restaurants', 'gyms', 'hair salons', 'beauty salons', 'lawyers', 'pharmacies', 'bakeries', 'car repair', 'schools', 'cafes'];
  protected readonly steps: { n: number; title: I18nKey; text: I18nKey; stage: I18nKey }[] = [
    { n: 1, title: 'landing.step1', text: 'landing.step1Text', stage: 'landing.stage1' },
    { n: 2, title: 'landing.step2', text: 'landing.step2Text', stage: 'landing.stage2' },
    { n: 3, title: 'landing.step3', text: 'landing.step3Text', stage: 'landing.stage3' },
  ];
  protected readonly specs: { key: string; title: I18nKey; text: I18nKey }[] = [
    { key: 'FULLSTACK', title: 'spec.fullstack', text: 'spec.fullstackText' },
    { key: 'UXUI', title: 'spec.uxui', text: 'spec.uxuiText' },
    { key: 'STRATEGY', title: 'spec.strategy', text: 'spec.strategyText' },
  ];
  protected readonly stageDots: [number, number, boolean][] = [
    [110, 90, true], [160, 130, false], [214, 84, true], [262, 142, false], [120, 178, true], [200, 190, false], [276, 196, true], [300, 98, false],
  ];
  protected readonly principles: { n: number; title: I18nKey; text: I18nKey }[] = [
    { n: 1, title: 'landing.why1', text: 'landing.why1Text' },
    { n: 2, title: 'landing.why2', text: 'landing.why2Text' },
    { n: 3, title: 'landing.why3', text: 'landing.why3Text' },
  ];

  ngOnInit() {
    setTimeout(() => this.booting.set(false), 2200);
    this.api.demoStatus().subscribe({
      next: s => {
        this.full.set(s.demoFull);
        this.seats.set({ n: s.activeSessions, max: s.maxSessions, full: s.demoFull });
      },
      error: () => { /* the page still works without the live count */ },
    });
  }

  /** The guest button first asks what the person does; picking one creates the guest. */
  protected choose() {
    this.choosing.set(true);
  }

  tryDemo(spec: SpecializationKey) {
    this.busy.set(true);
    this.error.set(null);
    this.auth.guest(spec).subscribe({
      next: () => this.router.navigateByUrl(this.auth.home()),
      error: e => {
        this.busy.set(false);
        this.choosing.set(false);
        this.error.set(e.status === 429 ? 'landing.errFull' : 'landing.errServer');
        if (e.status === 429) this.full.set(true);
      },
    });
  }
}
