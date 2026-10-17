import { Component, inject, input, output } from '@angular/core';
import { I18n, I18nKey } from './i18n';

export type SpecializationKey = 'FULLSTACK' | 'UXUI' | 'STRATEGY';

/** The three fixed specializations a guest can pick. One tap, no typing. */
@Component({
  selector: 'app-specialization-picker',
  template: `
    <div class="group" role="group" [attr.aria-label]="t('spec.aria')">
      @for (o of options; track o.key) {
        <button type="button" class="card-opt" [class.on]="selected() === o.key" [attr.aria-pressed]="selected() === o.key"
          [disabled]="disabled()" (click)="picked.emit(o.key)">
          <span class="icon" aria-hidden="true">
            @switch (o.key) {
              @case ('FULLSTACK') { <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/></svg> }
              @case ('UXUI') { <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg> }
              @default { <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0-4 10.5V17h8v-3.5A6 6 0 0 0 12 3Z"/><path d="M9 21h6"/></svg> }
            }
          </span>
          <strong>{{ t(o.title) }}</strong>
          <span class="text">{{ t(o.text) }}</span>
        </button>
      }
    </div>
  `,
  styles: `
    .group { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
    .card-opt { display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-start; gap: 6px; text-align: left; min-height: 116px; padding: 16px;
      border-radius: 14px; background: var(--card); color: var(--ink); border: 1px solid var(--line-strong); font-weight: 400;
      transition: border-color .2s ease, background-color .2s ease; }
    .card-opt:hover:not(:disabled) { border-color: var(--mute); filter: none; }
    .card-opt.on { border-color: var(--accent); background: var(--accent-soft); }
    .card-opt:disabled { opacity: .6; cursor: wait; }
    .icon { display: inline-flex; width: 40px; height: 40px; align-items: center; justify-content: center; border-radius: 10px; background: var(--bg); color: var(--accent); border: 1px solid var(--line); }
    strong { font-family: var(--font-display); font-size: 17px; letter-spacing: -0.01em; }
    .text { color: var(--mute); font-size: 14px; line-height: 1.4; }
  `,
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
