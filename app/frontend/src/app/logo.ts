import { Component, inject, input } from '@angular/core';
import { I18n } from './i18n';

/** One switch for the Beta tag next to the name. Set it to false when the product is ready to drop it. */
export const SHOW_BETA = true;

/** The Leadforge mark: an L with a forged, diagonal foot and a lead (the dot) waiting above it. */
@Component({
  selector: 'app-logo',
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M10 6h16v30h26L40 52H10Z" fill="currentColor" />
      <circle cx="46" cy="17" r="7" fill="currentColor" />
    </svg>
    @if (wordmark()) { <span class="word">leadforge</span> }
    @if (wordmark() && showBeta) { <span class="beta" [title]="t('beta.hint')">{{ t('beta.label') }}</span> }
  `,
  styles: `
    :host { display: inline-flex; align-items: center; gap: 10px; color: var(--accent); }
    .word { color: var(--ink); font-family: var(--font-display); font-weight: 700; font-size: 21px; letter-spacing: -0.02em; line-height: 1; }
    svg { flex: none; }
    /* A real 1px border (snapped to whole device pixels, so it stays crisp when the browser is zoomed) and whole-pixel sizes.
       Hanken Grotesk at 11px stays sharp where a monospace face at 10.5px turned blocky. */
    .beta { align-self: center; box-sizing: border-box; height: 20px; padding: 0 8px; display: inline-flex; align-items: center; border: 1px solid color-mix(in srgb, var(--accent) 60%, transparent); border-radius: 999px; background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); font: 600 11px/1 var(--font-body, 'Hanken Grotesk', system-ui, sans-serif); letter-spacing: .06em; text-transform: uppercase; cursor: default; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
  `,
})
export class Logo {
  protected readonly t = inject(I18n).t;
  protected readonly showBeta = SHOW_BETA;
  readonly size = input(28);
  readonly wordmark = input(true);
}
