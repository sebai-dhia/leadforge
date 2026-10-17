import { Component, inject } from '@angular/core';
import { I18n } from './i18n';

/** Small EN | FR switch for pages shown before sign-in. */
@Component({
  selector: 'app-lang-switch',
  template: `
    <div class="switch" role="group" aria-label="Language">
      <button type="button" [class.on]="i18n.lang() === 'en'" [attr.aria-pressed]="i18n.lang() === 'en'" (click)="i18n.set('en')" lang="en">EN</button>
      <button type="button" [class.on]="i18n.lang() === 'fr'" [attr.aria-pressed]="i18n.lang() === 'fr'" (click)="i18n.set('fr')" lang="fr">FR</button>
    </div>
  `,
  styles: `
    :host { display: inline-flex; view-transition-name: lang-switch; }
    .switch { display: inline-flex; border: 1px solid var(--line-strong); border-radius: 999px; padding: 3px; }
    button { min-height: 38px; min-width: 44px; padding: 0 12px; border: 0; border-radius: 999px; background: transparent; color: var(--mute); font-weight: 600; font-size: 13px; }
    button:hover:not(.on) { color: var(--ink); filter: none; }
    button.on { background: var(--accent); color: var(--on-accent); }
    @media (pointer: coarse) { button { min-height: 44px; } }
  `,
})
export class LangSwitch {
  protected readonly i18n = inject(I18n);
}
