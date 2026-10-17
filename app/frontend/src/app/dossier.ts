import { Component, inject, input } from '@angular/core';
import { I18n } from './i18n';

/**
 * A sample lead, drawn as a dossier: a score gauge, the reasons it ranks high, the ways to reach it and the
 * drafted message arriving word by word. Everything here is illustration, and says so.
 */
@Component({
  selector: 'app-dossier',
  template: `
    <article class="dossier" [class.play]="play()" [class.compact]="compact()">
      <header>
        <div class="gauge" role="img" aria-label="9 / 10">
          <svg viewBox="0 0 56 56" aria-hidden="true">
            <circle class="track" cx="28" cy="28" r="23" />
            <circle class="arc" cx="28" cy="28" r="23" pathLength="100" />
          </svg>
          <b>9</b>
        </div>
        <div class="id">
          <h3>{{ t('landing.sampleName') }}</h3>
          <p>{{ t('landing.sampleMeta') }}</p>
        </div>
        <span class="tag">{{ t('landing.sample') }}</span>
      </header>

      <ul class="reasons">
        @for (r of reasons; track r; let i = $index) {
          <li [style.--i]="i">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>
            {{ t(r) }}
          </li>
        }
      </ul>

      <div class="contacts">
        <span class="c"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>{{ t('landing.phone') }}</span>
        <span class="c"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>{{ t('landing.email') }}</span>
        <span class="c"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z"/></svg>{{ t('landing.social') }}</span>
      </div>

      <div class="draft">
        <div class="label">{{ t('landing.draftLabel') }}</div>
        <p class="bubble" [attr.aria-label]="t('landing.draftText')">
          @for (w of words(); track $index) { <span class="w" aria-hidden="true" [style.--w]="$index">{{ w }}</span>{{ ' ' }} }
        </p>
      </div>
    </article>
  `,
  styles: `
    :host { display: block; container-type: inline-size; }
    .dossier { position: relative; padding: 22px; border-radius: 22px; color: var(--ink);
      background: linear-gradient(165deg, rgba(255, 255, 255, .075), rgba(255, 255, 255, .02));
      border: 1px solid rgba(255, 255, 255, .11); backdrop-filter: blur(16px) saturate(1.2);
      box-shadow: 0 1px 0 rgba(255, 255, 255, .12) inset, 0 40px 90px -20px rgba(0, 0, 0, .65), 0 0 0 1px rgba(0, 0, 0, .35); }
    header { display: flex; align-items: center; gap: 14px; }
    .gauge { position: relative; width: 56px; height: 56px; flex: none; }
    .gauge svg { width: 100%; height: 100%; transform: rotate(-90deg); }
    .track { fill: none; stroke: rgba(255, 255, 255, .1); stroke-width: 5; }
    .arc { fill: none; stroke: var(--accent); stroke-width: 5; stroke-linecap: round; stroke-dasharray: 100; stroke-dashoffset: 100; }
    .gauge b { position: absolute; inset: 0; display: grid; place-items: center; font-family: var(--font-display); font-size: 21px; color: var(--accent); }
    .id { min-width: 0; flex: 1; }
    h3 { font-size: 18px; letter-spacing: -.01em; margin: 0; line-height: 1.2; }
    .id p { margin: 3px 0 0; color: var(--mute); font-size: 13.5px; }
    .tag { align-self: flex-start; font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--mute);
      border: 1px dashed rgba(255, 255, 255, .22); border-radius: 999px; padding: 3px 9px; white-space: nowrap; }
    .reasons { list-style: none; margin: 18px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
    .reasons li { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; padding: 5px 11px 5px 9px; border-radius: 999px;
      background: color-mix(in srgb, var(--accent) 13%, transparent); color: var(--accent); opacity: 0; transform: translateY(6px); }
    .contacts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    .c { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; padding: 7px 12px; border-radius: 10px; color: var(--ink);
      border: 1px solid rgba(255, 255, 255, .13); background: rgba(255, 255, 255, .035); }
    .c svg { color: var(--accent); }
    .compact .contacts { display: none; }
    .compact .reasons { margin-top: 14px; }
    @container (min-width: 440px) {
      .compact { display: grid; grid-template-columns: minmax(0, 1.12fr) minmax(0, 1fr); column-gap: 22px; align-items: center; padding: 20px 22px; }
      .compact .tag { position: absolute; top: 12px; right: 14px; }
      .compact .id h3 { font-size: 17px; }
      .compact .reasons { gap: 6px; margin-top: 12px; }
      .compact .reasons li { font-size: 12.5px; padding: 4px 9px 4px 8px; }
      .compact .bubble { font-size: 14px; padding: 11px 13px; }
      .compact header, .compact .reasons, .compact .contacts { grid-column: 1; }
      .compact .contacts { display: flex; gap: 6px; margin-top: 12px; }
      .compact .c { font-size: 12.5px; padding: 6px 10px; }
      .compact .draft { grid-column: 2; grid-row: 1 / span 3; margin: 0; padding: 0 0 0 20px; border-top: 0; border-left: 1px solid rgba(255, 255, 255, .09); }
    }
    .draft { margin-top: 18px; padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, .09); }
    .label { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .08em; color: var(--mute); margin-bottom: 9px; }
    .bubble { margin: 0; padding: 13px 15px; border-radius: 14px 14px 14px 4px; background: rgba(0, 0, 0, .35); border: 1px solid rgba(255, 255, 255, .08);
      font-size: 14.5px; line-height: 1.55; }
    .w { opacity: 0; }

    /* the sequence: gauge fills, reasons arrive one by one, the draft is written word by word */
    .play .arc { animation: gauge 1.1s .25s cubic-bezier(.2, .7, .2, 1) forwards; }
    .play .reasons li { animation: rise .5s calc(.55s + var(--i) * .14s) cubic-bezier(.2, .7, .2, 1) forwards; }
    .play .w { animation: word .3s calc(1.2s + var(--w) * 38ms) ease forwards; }
    @keyframes gauge { to { stroke-dashoffset: 10; } }
    @keyframes rise { to { opacity: 1; transform: none; } }
    @keyframes word { to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) {
      .arc { stroke-dashoffset: 10; } .reasons li, .w { opacity: 1; transform: none; }
      .play .arc, .play .reasons li, .play .w { animation: none; }
    }
  `,
})
export class Dossier {
  readonly play = input(true);
  /** The hero shows a shorter version, so the map behind it stays visible. */
  readonly compact = input(false);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly reasons = ['landing.reasonNoSite', 'landing.reasonPhone', 'landing.reasonSocial'] as const;
  protected readonly words = () => this.t('landing.draftText').split(' ');
}
