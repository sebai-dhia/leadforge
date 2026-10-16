import { Component, input } from '@angular/core';

/** The Leadforge mark: an L with a forged, diagonal foot and a lead (the dot) waiting above it. */
@Component({
  selector: 'app-logo',
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M10 6h16v30h26L40 52H10Z" fill="currentColor" />
      <circle cx="46" cy="17" r="7" fill="currentColor" />
    </svg>
    @if (wordmark()) { <span class="word">leadforge</span> }
  `,
  styles: `
    :host { display: inline-flex; align-items: center; gap: 10px; color: var(--accent); }
    .word { color: var(--ink); font-family: var(--font-display); font-weight: 700; font-size: 21px; letter-spacing: -0.02em; line-height: 1; }
    svg { flex: none; }
  `,
})
export class Logo {
  readonly size = input(28);
  readonly wordmark = input(true);
}
