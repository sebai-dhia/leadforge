import { Component, Injectable, inject, signal } from '@angular/core';
import { I18n } from './i18n';

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
  template: `
    <div class="toasts" role="region" aria-live="polite" [attr.aria-label]="t('toast.region')">
      @for (item of toasts.items(); track item.id) {
        <div class="toast" role="status">
          <span class="msg">{{ item.message }}</span>
          @if (item.action; as a) {
            <button type="button" class="act" (click)="run(item, a.run)">{{ a.label }}</button>
          }
          <button type="button" class="x" [attr.aria-label]="t('toast.close')" (click)="toasts.dismiss(item.id)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    /* top right, below the top bar: it does not cover the list or the profile circle */
    .toasts { position: fixed; z-index: 50; top: 76px; right: 24px; display: grid; gap: 8px; width: min(380px, calc(100vw - 32px)); pointer-events: none; }
    @media (max-width: 560px) { .toasts { right: 16px; left: 16px; width: auto; } }
    .toast { pointer-events: auto; display: flex; align-items: center; gap: 10px; padding: 10px 10px 10px 16px; background: var(--card); color: var(--ink);
      border-radius: 14px; box-shadow: inset 0 0 0 1px var(--line-strong), 0 12px 32px rgb(0 0 0 / .35); animation: up .22s ease both; }
    .msg { flex: 1; min-width: 0; font-size: 14px; }
    .act { min-height: 34px; padding: 4px 12px; border-radius: 999px; background: transparent; color: var(--accent); border: 0; box-shadow: inset 0 0 0 1px var(--accent); font-weight: 600; }
    .act:hover { background: var(--accent-soft); filter: none; }
    .x { min-height: 34px; width: 34px; padding: 0; border-radius: 50%; background: transparent; border: 0; color: var(--mute); }
    .x:hover { background: var(--accent-soft); color: var(--ink); filter: none; }
    .x svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
    @keyframes up { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
  `,
})
export class ToastHost {
  protected readonly toasts = inject(Toasts);
  protected readonly t = inject(I18n).t;

  protected run(item: Toast, action: () => void) {
    this.toasts.dismiss(item.id);
    action();
  }
}
