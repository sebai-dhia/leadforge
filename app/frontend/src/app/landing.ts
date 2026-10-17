import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { I18n, I18nKey } from './i18n';
import { LangSwitch } from './lang-switch';
import { Logo } from './logo';

@Component({
  selector: 'app-landing',
  imports: [RouterLink, Logo, LangSwitch],
  template: `
    <div class="page">
      <header class="top">
        <a routerLink="/" class="brand" [attr.aria-label]="t('landing.home')"><app-logo [size]="30" /></a>
        <nav [attr.aria-label]="t('landing.siteNav')">
          <app-lang-switch />
          <a href="#how" class="plain">{{ t('landing.how') }}</a>
          <a href="#why" class="plain">{{ t('landing.why') }}</a>
          <a routerLink="/login" class="btn ghost">{{ t('landing.signin') }}</a>
        </nav>
      </header>

      <section class="hero">
        <div class="copy">
          <span class="seats" role="status">
            <span class="dot" [class.full]="full()"></span>
            {{ seatsLabel() }}
          </span>
          <h1>{{ t('landing.title') }}</h1>
          <p class="sub">{{ t('landing.sub') }}</p>
          <div class="cta">
            <button type="button" class="btn big" [disabled]="busy() || full()" (click)="tryDemo()">
              {{ t('landing.guest') }}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
            </button>
            <a routerLink="/login" class="btn ghost big">{{ t('landing.signin') }}</a>
          </div>
          @if (error(); as e) { <p class="err" role="alert">{{ t(e) }}</p> }
          <p class="fine">{{ t('landing.fine') }}</p>
        </div>

        <div class="preview" aria-hidden="true">
          <div class="lead-sample">
            <div class="row-top">
              <div>
                <div class="name">{{ t('landing.sampleName') }}</div>
                <div class="meta">{{ t('landing.sampleMeta') }}</div>
              </div>
              <div class="score"><b>9</b><span>{{ t('landing.fit') }}</span></div>
            </div>
            <p class="reason">{{ t('landing.sampleReason') }}</p>
            <div class="chips-row">
              <span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>{{ t('landing.phone') }}</span>
              <span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>{{ t('landing.email') }}</span>
              <span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z"/></svg>{{ t('landing.social') }}</span>
            </div>
            <div class="draft">
              <div class="label">{{ t('landing.draftLabel') }}</div>
              <div class="bubble">{{ t('landing.draftText') }}</div>
            </div>
          </div>
        </div>
      </section>

      <section id="how" class="block">
        <div class="eyebrow">{{ t('landing.howEyebrow') }}</div>
        <h2>{{ t('landing.howTitle') }}</h2>
        <div class="steps">
          <div class="step">
            <div class="ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg></div>
            <h3>{{ t('landing.step1') }}</h3>
            <p>{{ t('landing.step1Text') }}</p>
          </div>
          <div class="step">
            <div class="ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div>
            <h3>{{ t('landing.step2') }}</h3>
            <p>{{ t('landing.step2Text') }}</p>
          </div>
          <div class="step">
            <div class="ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/></svg></div>
            <h3>{{ t('landing.step3') }}</h3>
            <p>{{ t('landing.step3Text') }}</p>
          </div>
        </div>
      </section>

      <section id="why" class="block">
        <div class="why">
          <h2>{{ t('landing.whyTitle') }}</h2>
          <div><h3>{{ t('landing.why1') }}</h3><p>{{ t('landing.why1Text') }}</p></div>
          <div><h3>{{ t('landing.why2') }}</h3><p>{{ t('landing.why2Text') }}</p></div>
          <div><h3>{{ t('landing.why3') }}</h3><p>{{ t('landing.why3Text') }}</p></div>
        </div>
      </section>

      <section class="final">
        <h2>{{ t('landing.finalTitle') }}</h2>
        <p>{{ t('landing.finalText') }}</p>
        <button type="button" class="btn big" [disabled]="busy() || full()" (click)="tryDemo()">{{ t('landing.guest') }}</button>
      </section>

      <footer class="foot">
        <span>{{ t('landing.footDemo') }}</span>
        <span>{{ t('landing.mapData') }} <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">{{ t('landing.osm') }}</a></span>
      </footer>
    </div>
  `,
  styles: `
    :host { display: block; }
    .page { font-size: 17px; line-height: 1.6; }
    .top, .hero, .block, .final, .foot { max-width: 1160px; margin: 0 auto; padding-left: 24px; padding-right: 24px; }
    .top { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding-top: 20px; padding-bottom: 20px; }
    .brand { text-decoration: none; display: inline-flex; min-height: 44px; align-items: center; }
    .top nav { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
    .plain { color: var(--mute); text-decoration: none; font-size: 15px; font-weight: 500; min-height: 44px; display: inline-flex; align-items: center; transition: color .2s ease; }
    .plain:hover { color: var(--ink); }

    .hero { display: flex; flex-wrap: wrap; gap: 56px; align-items: center; padding-top: 48px; padding-bottom: 88px; }
    .copy { flex: 1 1 440px; min-width: 0; }
    .seats { display: inline-flex; align-items: center; gap: 10px; padding: 6px 14px; border: 1px solid var(--line); border-radius: 999px; background: var(--card); font-size: 14px; color: var(--mute); }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
    .dot.full { background: var(--warn); }
    h1 { font-size: clamp(36px, 6vw, 60px); line-height: 1.04; letter-spacing: -0.03em; margin: 22px 0 18px; }
    .sub { font-size: 19px; color: var(--mute); max-width: 540px; margin: 0 0 32px; }
    .cta { display: flex; gap: 14px; flex-wrap: wrap; }
    .btn.big { min-height: 52px; padding: 0 28px; border-radius: 12px; font-size: 17px; }
    .fine { font-size: 14px; color: var(--mute); margin: 16px 0 0; }

    .preview { flex: 1 1 400px; min-width: 0; max-width: 520px; margin: 0 auto; }
    .lead-sample { background: var(--card); border: 1px solid var(--line); border-radius: 20px; padding: 24px; box-shadow: 0 30px 80px rgba(0,0,0,.35); }
    .row-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    .name { font-family: var(--font-display); font-weight: 700; font-size: 21px; letter-spacing: -0.01em; }
    .meta { color: var(--mute); font-size: 14px; margin-top: 4px; }
    .score { display: flex; flex-direction: column; align-items: center; min-width: 56px; padding: 8px 12px; border-radius: 12px; background: var(--accent-soft); border: 1px solid var(--line-strong); }
    .score b { font-family: var(--font-display); font-size: 24px; line-height: 1; color: var(--accent); }
    .score span { font-size: 11px; color: var(--mute); letter-spacing: .05em; }
    .reason { color: var(--mute); font-size: 15px; margin: 16px 0 18px; }
    .chips-row { display: flex; flex-wrap: wrap; gap: 10px; }
    .chips-row span { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border: 1px solid var(--line-strong); border-radius: 10px; font-size: 14px; background: var(--accent-soft); }
    .chips-row svg { color: var(--accent); }
    .draft { margin-top: 20px; border-top: 1px solid var(--line); padding-top: 18px; }
    .label { font-size: 12px; color: var(--mute); letter-spacing: .06em; margin-bottom: 8px; }
    .bubble { background: var(--bg); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; font-size: 14.5px; color: var(--ink); }

    .block { padding-top: 16px; padding-bottom: 88px; }
    .eyebrow { font-size: 14px; letter-spacing: .08em; color: var(--accent); font-weight: 600; }
    .block h2 { font-size: clamp(28px, 4vw, 40px); letter-spacing: -0.02em; line-height: 1.1; margin: 12px 0 36px; max-width: 640px; }
    .steps { display: flex; flex-wrap: wrap; gap: 20px; }
    .step { flex: 1 1 280px; background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 28px; }
    .step h3 { font-size: 21px; margin: 0 0 8px; }
    .step p, .why p { color: var(--mute); font-size: 16px; margin: 0; }
    .ico { width: 44px; height: 44px; border-radius: 12px; background: var(--accent-soft); border: 1px solid var(--line-strong); display: flex; align-items: center; justify-content: center; margin-bottom: 20px; color: var(--accent); }

    .why { background: var(--card); border: 1px solid var(--line); border-radius: 24px; padding: 44px; display: flex; flex-wrap: wrap; gap: 36px; }
    .why > * { flex: 1 1 240px; }
    .why h2 { flex: 1 1 100%; margin: 0 0 4px; font-size: clamp(26px, 3.4vw, 34px); max-width: 720px; color: var(--ink); }
    .why h3 { font-size: 17px; color: var(--accent); margin: 0 0 6px; }

    .final { text-align: center; padding-bottom: 88px; }
    .final h2 { font-size: clamp(30px, 4.4vw, 44px); letter-spacing: -0.025em; line-height: 1.08; margin: 0 auto 14px; max-width: 700px; }
    .final p { color: var(--mute); font-size: 18px; margin: 0 0 28px; }

    .foot { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; border-top: 1px solid var(--line); padding-top: 28px; padding-bottom: 44px; color: var(--mute); font-size: 14px; }
    @media (max-width: 600px) { .hero { gap: 36px; padding-top: 24px; padding-bottom: 56px; } .why { padding: 28px; } }
  `,
})
export class Landing implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  protected readonly t = inject(I18n).t;

  readonly busy = signal(false);
  readonly error = signal<I18nKey | null>(null);
  readonly full = signal(false);
  private readonly seats = signal<{ n: number; max: number; full: boolean } | null>(null);
  protected readonly seatsLabel = () => {
    const s = this.seats();
    return !s ? this.t('landing.seatsDefault') : this.t(s.full ? 'landing.seatsFull' : 'landing.seatsOpen', { n: s.n, max: s.max });
  };

  ngOnInit() {
    this.api.demoStatus().subscribe({
      next: s => {
        this.full.set(s.demoFull);
        this.seats.set({ n: s.activeSessions, max: s.maxSessions, full: s.demoFull });
      },
      error: () => { /* the page still works without the live count */ },
    });
  }

  tryDemo() {
    this.busy.set(true);
    this.error.set(null);
    this.auth.guest().subscribe({
      next: () => this.router.navigateByUrl(this.auth.home()),
      error: e => {
        this.busy.set(false);
        this.error.set(e.status === 429 ? 'landing.errFull' : 'landing.errServer');
        if (e.status === 429) this.full.set(true);
      },
    });
  }
}
