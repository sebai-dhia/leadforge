import { Injectable, signal } from '@angular/core';

export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'lf-theme';

/** Light or dark, or whatever the device uses. The choice is kept in this browser; public/theme.js applies it before the first paint. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly choice = signal<ThemeChoice>(this.saved());

  set(choice: ThemeChoice) {
    this.choice.set(choice);
    try { choice === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, choice); } catch { /* not saved */ }
    if (choice === 'system') delete document.documentElement.dataset['theme'];
    else document.documentElement.dataset['theme'] = choice;
  }

  private saved(): ThemeChoice {
    try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch { return 'system'; }
  }
}
