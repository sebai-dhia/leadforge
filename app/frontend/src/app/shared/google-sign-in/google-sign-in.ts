import { Component, ElementRef, OnInit, effect, inject, output, viewChild } from '@angular/core';
import { I18n } from '../../i18n/i18n';

/** Public OAuth client ID. It is not a secret: it is visible in the page by design. */
export const GOOGLE_CLIENT_ID = '605376343630-5bt8rvi8dhvdjvlj2tu3sauv34dou3j2.apps.googleusercontent.com';

interface GoogleId {
  accounts: { id: {
    initialize(config: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }): void;
    renderButton(el: HTMLElement, options: Record<string, unknown>): void;
  } };
}

declare global { interface Window { google?: GoogleId } }

const SCRIPT = 'https://accounts.google.com/gsi/client';

/**
 * Google's own "Continue with Google" button. Emits the signed ID token for the backend to verify.
 * Google writes the button text in the language of the script it was loaded with (the hl parameter), so the script
 * is loaded again when the app language changes. Otherwise the button would follow the browser's language.
 */
@Component({
  selector: 'app-google-sign-in',
  templateUrl: './google-sign-in.html',
  styleUrl: './google-sign-in.scss',
})
export class GoogleSignIn implements OnInit {
  readonly credential = output<string>();
  readonly failed = output<void>();
  private readonly slot = viewChild.required<ElementRef<HTMLElement>>('slot');
  private readonly lang = inject(I18n).lang;
  private started = false;
  private loadedLang = '';

  constructor() {
    effect(() => { const l = this.lang(); if (this.started) this.show(l); });
  }

  ngOnInit() {
    this.started = true;
    this.show(this.lang());
  }

  private show(lang: string) {
    this.load(lang).then(() => this.render(lang)).catch(() => this.failed.emit());
  }

  private load(lang: string): Promise<void> {
    if (window.google && this.loadedLang === lang) return Promise.resolve();
    return new Promise((resolve, reject) => {
      document.querySelectorAll(`script[src^="${SCRIPT}"]`).forEach(s => s.remove());
      delete window.google;
      const script = Object.assign(document.createElement('script'), { src: `${SCRIPT}?hl=${lang}`, async: true, defer: true });
      script.addEventListener('load', () => { this.loadedLang = lang; resolve(); });
      script.addEventListener('error', () => reject());
      document.head.appendChild(script);
    });
  }

  private render(lang: string) {
    const g = window.google;
    if (!g || this.loadedLang !== lang) return;
    g.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: r => this.credential.emit(r.credential) });
    const width = Math.min(400, Math.max(240, this.slot().nativeElement.clientWidth || 400));
    this.slot().nativeElement.innerHTML = '';
    g.accounts.id.renderButton(this.slot().nativeElement, {
      theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', width, logo_alignment: 'left',
    });
  }
}
