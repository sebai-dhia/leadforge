import { Component, inject } from '@angular/core';
import { I18n } from '../../i18n/i18n';

/** Small EN | FR switch for pages shown before sign-in. The green pill slides from one side to the other. */
@Component({
  selector: 'app-lang-switch',
  templateUrl: './lang-switch.html',
  styleUrl: './lang-switch.scss',
})
export class LangSwitch {
  protected readonly i18n = inject(I18n);
}
