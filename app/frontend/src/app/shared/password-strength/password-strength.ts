import { Component, computed, inject, input } from '@angular/core';
import { I18n, I18nKey } from '../../i18n/i18n';
import { Strength, strengthOf } from '../util/password-strength';

/** A thin three-part bar under a new password: weak, medium or strong. Hidden until something is typed. */
@Component({
  selector: 'app-password-strength',
  template: `
    @if (password()) {
      <div class="meter" [class]="level()" role="status" aria-live="polite">
        <span class="bar" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="word">{{ t(word[level()]) }}</span>
      </div>
      @if (missing() > 0) { <p class="need">{{ t('pw.more', { n: missing() }) }}</p> }
    }
  `,
  styleUrl: './password-strength.scss',
})
export class PasswordStrength {
  readonly password = input('');
  readonly email = input('');
  protected readonly t = inject(I18n).t;
  protected readonly word: Record<Strength, I18nKey> = { weak: 'pw.strength.weak', medium: 'pw.strength.medium', strong: 'pw.strength.strong' };
  protected readonly level = computed(() => strengthOf(this.password(), this.email()));
  /** How many characters are still missing to reach the minimum. */
  protected readonly missing = computed(() => Math.max(0, 12 - [...this.password()].length));
}
