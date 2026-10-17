import { Component, inject } from '@angular/core';
import { I18n } from './i18n';

/** Small EN | FR switch for pages shown before sign-in. The green pill slides from one side to the other. */
@Component({
  selector: 'app-lang-switch',
  template: `
    <div class="switch" role="group" aria-label="Language" [attr.data-lang]="i18n.lang()">
      <span class="pills">
      <span class="thumb" aria-hidden="true"></span>
      <button type="button" [class.on]="i18n.lang() === 'en'" [attr.aria-pressed]="i18n.lang() === 'en'" (click)="i18n.set('en')" lang="en">EN</button>
      <button type="button" [class.on]="i18n.lang() === 'fr'" [attr.aria-pressed]="i18n.lang() === 'fr'" (click)="i18n.set('fr')" lang="fr">FR</button>
      </span>
    </div>
  `,
  styles: `
    :host { display: inline-flex; view-transition-name: lang-switch; }
    .switch { display: inline-flex; border: 1px solid var(--line-strong); border-radius: 999px; padding: 3px; }
    .pills { position: relative; display: inline-grid; grid-template-columns: 1fr 1fr; }
    .thumb { position: absolute; top: 0; bottom: 0; left: 0; width: 50%; border-radius: 999px; background: var(--accent);
      transition: transform .28s cubic-bezier(.4, 0, .2, 1); }
    .switch[data-lang="fr"] .thumb { transform: translateX(100%); }
    button { position: relative; z-index: 1; min-height: 38px; min-width: 44px; padding: 0 12px; border: 0; border-radius: 999px; background: transparent;
      color: var(--mute); font-weight: 600; font-size: 13px; transition: color .2s ease; }
    button:hover:not(.on) { color: var(--ink); filter: none; background: transparent; }
    button.on { color: var(--on-accent); background: transparent; }
    @media (pointer: coarse) { button { min-height: 44px; } }
    @media (prefers-reduced-motion: reduce) { .thumb, button { transition: none; } }
  `,
})
export class LangSwitch {
  protected readonly i18n = inject(I18n);
}
