import { Component, ElementRef, effect, inject, input, output, viewChild } from '@angular/core';
import { I18n } from './i18n';
import { SpecializationKey, SpecializationPicker } from './specialization-picker';

/**
 * "What do you do?" as a modal over the page. It opens on top of the content, so nothing behind it moves.
 * The native dialog element handles focus trapping and the Escape key.
 */
@Component({
  selector: 'app-specialization-dialog',
  imports: [SpecializationPicker],
  template: `
    <dialog #dlg aria-labelledby="spec-title" (close)="closed.emit()" (click)="onBackdrop($event)">
      <div class="panel">
        <button type="button" class="x" [attr.aria-label]="t('spec.close')" (click)="closed.emit()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
        <h2 id="spec-title">{{ t('spec.title') }}</h2>
        <p class="sub">{{ t('spec.sub') }}</p>
        <app-specialization-picker [disabled]="busy()" (picked)="picked.emit($event)" />
      </div>
    </dialog>
  `,
  styles: `
    dialog { padding: 0; border: 1px solid var(--line-strong); border-radius: 20px; background: var(--card); color: var(--ink);
      width: min(720px, calc(100vw - 32px)); max-height: calc(100vh - 32px); box-shadow: 0 30px 80px rgba(0, 0, 0, .55); }
    dialog::backdrop { background: rgba(5, 9, 8, .72); }
    .panel { position: relative; padding: 28px; }
    h2 { font-size: 24px; margin: 0 40px 6px 0; }
    .sub { color: var(--mute); margin: 0 0 20px; }
    .x { position: absolute; top: 14px; right: 14px; width: 44px; height: 44px; min-height: 44px; padding: 0; border-radius: 50%;
      background: transparent; color: var(--mute); border: 0; }
    .x:hover { color: var(--ink); background: var(--accent-soft); filter: none; }
    @media (max-width: 520px) { .panel { padding: 20px; } h2 { font-size: 21px; } }
  `,
})
export class SpecializationDialog {
  readonly open = input(false);
  readonly busy = input(false);
  readonly closed = output<void>();
  readonly picked = output<SpecializationKey>();

  protected readonly t = inject(I18n).t;
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    effect(() => {
      const d = this.dlg().nativeElement;
      if (this.open() && !d.open) d.showModal();
      else if (!this.open() && d.open) d.close();
    });
  }

  /** A click on the dimmed area outside the panel closes the dialog. */
  protected onBackdrop(e: MouseEvent) {
    if (e.target === this.dlg().nativeElement) this.closed.emit();
  }
}
