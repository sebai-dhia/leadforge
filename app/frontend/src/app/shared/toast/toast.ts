import { Component, Injectable, inject, signal } from '@angular/core';
import { I18n } from '../../i18n/i18n';

export interface Toast { id: number; message: string; action?: { label: string; run: () => void } }

/** Short messages at the bottom of the page, with an optional action such as Undo. They go away on their own. */
@Injectable({ providedIn: 'root' })
export class Toasts {
  readonly items = signal<Toast[]>([]);
  private next = 1;

  show(message: string, action?: Toast['action'], ms = 8000) {
    const id = this.next++;
    this.items.update(list => [...list.slice(-2), { id, message, action }]);
    setTimeout(() => this.dismiss(id), ms);
  }

  dismiss(id: number) {
    this.items.update(list => list.filter(t => t.id !== id));
  }
}

@Component({
  selector: 'app-toasts',
  templateUrl: './toast.html',
  styleUrl: './toast.scss',
})
export class ToastHost {
  protected readonly toasts = inject(Toasts);
  protected readonly t = inject(I18n).t;

  protected run(item: Toast, action: () => void) {
    this.toasts.dismiss(item.id);
    action();
  }
}
