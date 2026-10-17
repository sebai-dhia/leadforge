import { Component, inject } from '@angular/core';
import { Dossier } from './dossier';
import { I18n } from './i18n';

/**
 * The hero picture: a night map of a city with businesses lighting up as they are found, and a lead dossier
 * laid over it. The layers sit at different depths, so scrolling moves them at different speeds (parallax) and
 * the map slowly zooms. The page sets --p (0 at the top, 1 when the hero has gone) on a parent.
 */
@Component({
  selector: 'app-radar',
  imports: [Dossier],
  template: `
    <div class="radar">
      <div class="panel">
        <svg class="map" viewBox="0 0 520 560" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M40 0H0V40" fill="none" stroke="rgba(255,255,255,.055)" stroke-width="1" />
            </pattern>
            <radialGradient id="glow" cx="52%" cy="46%" r="60%">
              <stop offset="0" stop-color="rgba(61,220,151,.20)" />
              <stop offset="1" stop-color="rgba(61,220,151,0)" />
            </radialGradient>
          </defs>
          <rect width="520" height="560" fill="url(#grid)" />
          <rect width="520" height="560" fill="url(#glow)" />
          <!-- water -->
          <path d="M-20 392 C 70 360, 130 420, 210 396 S 330 330, 400 372 S 500 410, 560 380 V 600 H -20 Z" fill="rgba(61,220,151,.05)" stroke="rgba(61,220,151,.22)" stroke-width="1.2" />
          <!-- streets -->
          <g fill="none" stroke="rgba(255,255,255,.12)" stroke-width="1.4" stroke-linecap="round">
            <path d="M-10 120 L 540 210" /><path d="M-10 250 L 540 150" /><path d="M110 -10 L 190 570" />
            <path d="M330 -10 L 270 570" /><path d="M40 330 L 540 300" /><path d="M450 -10 L 500 360" />
          </g>
          <g fill="none" stroke="rgba(255,255,255,.2)" stroke-width="2.6" stroke-linecap="round">
            <path d="M-10 186 C 140 150, 300 230, 540 176" /><path d="M222 -10 C 236 160, 190 300, 244 570" />
          </g>
          <!-- the area the person searches -->
          <rect class="area" x="92" y="104" width="300" height="236" rx="6" fill="rgba(61,220,151,.045)" stroke="var(--accent)" stroke-width="1.3" stroke-dasharray="5 6" />
          @for (c of corners; track c) { <rect [attr.x]="c[0] - 4" [attr.y]="c[1] - 4" width="8" height="8" rx="2" fill="var(--accent)" /> }
          <!-- businesses -->
          @for (d of dots; track $index) {
            <g [attr.transform]="'translate(' + d.x + ' ' + d.y + ')'"><g class="dot" [class.reach]="d.reach" [style.--k]="$index">
              @if (d.reach) { <circle class="ping" r="5" /> }
              <circle class="core" [attr.r]="d.reach ? 5 : 3.6" />
              @if (d.rank) {
                <g class="rank" transform="translate(9 -22)">
                  <rect width="26" height="18" rx="9" />
                  <text x="13" y="12.6" text-anchor="middle">{{ d.rank }}</text>
                </g>
              }
            </g></g>
          }
        </svg>
        <div class="sweep" aria-hidden="true"></div>
        <div class="coords" aria-hidden="true">{{ t('landing.coords') }}</div>
        <div class="count">{{ t('landing.radarCount', { n: 14, m: 6 }) }}</div>
      </div>

      <app-dossier class="float-card" [compact]="true" />
      <div class="chip chip-a">{{ t('landing.chipReach') }}</div>
      <div class="chip chip-b">{{ t('landing.chipDraft') }}</div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .radar { --w: min(540px, calc((100svh - 220px) / 1.24)); position: relative; width: 100%; max-width: var(--w); aspect-ratio: 520 / 560; margin: 0 auto calc(var(--w) * .16); }
    .panel { position: absolute; inset: 0; border-radius: 30px; overflow: hidden; isolation: isolate;
      background: radial-gradient(120% 90% at 50% 0%, #0f1c17 0%, #08110e 70%);
      border: 1px solid rgba(255, 255, 255, .09); box-shadow: 0 60px 120px -40px rgba(0, 0, 0, .8), 0 0 90px -30px rgba(61, 220, 151, .28); }
    .map { position: absolute; inset: 0; width: 100%; height: 100%; will-change: transform;
      transform: translate3d(0, calc(var(--p, 0) * -34px), 0) scale(calc(1 + var(--p, 0) * .12)); }

    /* businesses light up one after the other, then the reachable ones keep pinging */
    .dot { transform-box: fill-box; }
    .core { fill: rgba(255, 255, 255, .5); }
    .reach .core { fill: var(--accent); }
    .ping { fill: none; stroke: var(--accent); stroke-width: 1.4; transform-box: fill-box; transform-origin: center; animation: ping 3.2s calc(var(--k) * .45s) ease-out infinite; }
    .dot { animation: pop .6s calc(.35s + var(--k) * .12s) cubic-bezier(.2, .9, .3, 1.4) backwards; }
    .rank rect { fill: rgba(7, 14, 11, .92); stroke: var(--accent); stroke-width: 1; }
    .rank text { fill: var(--accent); font-family: var(--font-mono); font-size: 11px; font-weight: 500; }
    .area { animation: area 1.4s .1s ease backwards; stroke-dashoffset: 0; }
    @keyframes pop { from { opacity: 0; transform: scale(.2); } }
    @keyframes ping { 0% { transform: scale(1); opacity: .9; } 70%, 100% { transform: scale(4.2); opacity: 0; } }
    @keyframes area { from { opacity: 0; stroke-dashoffset: 40; } }

    .sweep { position: absolute; left: 50%; top: 46%; width: 150%; aspect-ratio: 1; translate: -50% -50%; border-radius: 50%; pointer-events: none;
      background: conic-gradient(from 0deg, transparent 0 78%, rgba(61, 220, 151, .16) 100%);
      -webkit-mask: radial-gradient(circle, #000 0 38%, transparent 62%); mask: radial-gradient(circle, #000 0 38%, transparent 62%);
      animation: spin 9s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .coords, .count { position: absolute; font-family: var(--font-mono); font-size: 11px; letter-spacing: .06em; color: rgba(255, 255, 255, .5); }
    .coords { left: 18px; top: 16px; }
    .count { right: 18px; top: 16px; color: var(--accent); }

    /* layers above the map move faster than the map: depth */
    .float-card { position: absolute; left: -12%; bottom: -20%; width: 76%; z-index: 2; will-change: transform;
      transform: translate3d(0, calc(var(--p, 0) * -74px), 0); animation: float-in .9s .9s cubic-bezier(.2, .8, .2, 1) backwards; }
    .chip { position: absolute; z-index: 3; font-size: 13px; font-weight: 500; padding: 8px 14px; border-radius: 999px; white-space: nowrap; will-change: transform;
      background: rgba(10, 20, 16, .82); border: 1px solid rgba(61, 220, 151, .4); color: var(--ink); backdrop-filter: blur(10px);
      box-shadow: 0 14px 40px -12px rgba(0, 0, 0, .7); animation: float-in .8s cubic-bezier(.2, .8, .2, 1) backwards; }
    .chip::before { content: ''; display: inline-block; width: 7px; height: 7px; margin-right: 8px; border-radius: 50%; background: var(--accent); }
    .chip-a { right: -5%; top: 26%; transform: translate3d(0, calc(var(--p, 0) * -120px), 0); animation-delay: 1.4s; }
    .chip-b { right: 3%; bottom: 9%; transform: translate3d(0, calc(var(--p, 0) * -48px), 0); animation-delay: 1.7s; }
    @keyframes float-in { from { opacity: 0; translate: 0 26px; } }

    @media (max-width: 960px) { .float-card { left: 0; width: 90%; bottom: -22%; } .radar { --w: 540px; max-width: 540px; margin-bottom: 22%; } .chip-a { right: 0; } }
    @media (max-width: 520px) { .chip-b { display: none; } .float-card { width: 100%; } }
    @media (prefers-reduced-motion: reduce) {
      .map, .float-card, .chip { transform: none !important; }
      .sweep, .ping, .dot, .area, .float-card, .chip { animation: none !important; }
    }
  `,
})
export class Radar {
  protected readonly t = inject(I18n).t;
  protected readonly corners: [number, number][] = [[92, 104], [392, 104], [92, 340], [392, 340]];
  protected readonly dots: { x: number; y: number; reach: boolean; rank?: number }[] = [
    { x: 150, y: 150, reach: true, rank: 9 }, { x: 236, y: 134, reach: false }, { x: 318, y: 176, reach: true, rank: 8 },
    { x: 190, y: 236, reach: true }, { x: 280, y: 262, reach: false }, { x: 352, y: 290, reach: true, rank: 7 },
    { x: 126, y: 300, reach: false }, { x: 240, y: 318, reach: true }, { x: 372, y: 130, reach: false },
    { x: 420, y: 232, reach: false }, { x: 60, y: 210, reach: false }, { x: 210, y: 70, reach: false },
    { x: 302, y: 372, reach: false }, { x: 140, y: 430, reach: false },
  ];
}
