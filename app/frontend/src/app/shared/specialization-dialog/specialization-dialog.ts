import { Component, ElementRef, effect, inject, input, output, viewChild } from '@angular/core';
import { I18n } from '../../i18n/i18n';
import { SpecializationKey, SpecializationPicker } from '../specialization-picker/specialization-picker';

/**
 * "What do you do?" as a modal over the page. It opens on top of the content, so nothing behind it moves.
 * The native dialog element handles focus trapping and the Escape key.
 */
@Component({
  selector: 'app-specialization-dialog',
  imports: [SpecializationPicker],
  templateUrl: './specialization-dialog.html',
  styleUrl: './specialization-dialog.scss',
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
