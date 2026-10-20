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
    .beta { align-self: center; margin-left: -2px; padding: 2px 7px; border-radius: 6px; box-shadow: inset 0 0 0 1px var(--accent); color: var(--accent); font: 600 10.5px/1.4 var(--font-mono); letter-spacing: .08em; text-transform: uppercase; cursor: default; }
  `,
})
export class Logo {
  protected readonly t = inject(I18n).t;
  protected readonly showBeta = SHOW_BETA;
  readonly size = input(28);
  readonly wordmark = input(true);
}
