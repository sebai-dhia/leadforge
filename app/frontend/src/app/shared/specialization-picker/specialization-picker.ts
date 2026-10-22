import { Component, inject, input, output } from '@angular/core';
import { I18n, I18nKey } from '../../i18n/i18n';

export type SpecializationKey = 'FULLSTACK' | 'UXUI' | 'STRATEGY';

/** The three fixed specializations a guest can pick. One tap, no typing. */
@Component({
  selector: 'app-specialization-picker',
  templateUrl: './specialization-picker.html',
  styleUrl: './specialization-picker.scss',
})
export class SpecializationPicker {
  readonly selected = input<string | null>(null);
  readonly disabled = input(false);
  readonly picked = output<SpecializationKey>();

  protected readonly t = inject(I18n).t;
  protected readonly options: { key: SpecializationKey; title: I18nKey; text: I18nKey }[] = [
    { key: 'FULLSTACK', title: 'spec.fullstack', text: 'spec.fullstackText' },
    { key: 'UXUI', title: 'spec.uxui', text: 'spec.uxuiText' },
    { key: 'STRATEGY', title: 'spec.strategy', text: 'spec.strategyText' },
  ];
}
