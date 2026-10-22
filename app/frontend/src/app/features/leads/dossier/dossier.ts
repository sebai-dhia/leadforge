import { Component, inject, input } from '@angular/core';
import { I18n } from '../../../i18n/i18n';

/**
 * A sample lead, drawn as a dossier: a score gauge, the reasons it ranks high, the ways to reach it and the
 * drafted message arriving word by word. Everything here is illustration, and says so.
 */
@Component({
  selector: 'app-dossier',
  templateUrl: './dossier.html',
  styleUrl: './dossier.scss',
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
