import { Component, inject, input } from '@angular/core';
import { I18n } from '../../i18n/i18n';

/** One switch for the Beta tag next to the name. Set it to false when the product is ready to drop it. */
export const SHOW_BETA = true;

/** The Leadforge mark: an L with a forged, diagonal foot and a lead (the dot) waiting above it. */
@Component({
  selector: 'app-logo',
  templateUrl: './logo.html',
  styleUrl: './logo.scss',
})
export class Logo {
  protected readonly t = inject(I18n).t;
  protected readonly showBeta = SHOW_BETA;
  readonly size = input(28);
  readonly wordmark = input(true);
}
