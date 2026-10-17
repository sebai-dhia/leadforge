import { Component, ElementRef, OnInit, inject, output, viewChild } from '@angular/core';

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

/** Google's own "Continue with Google" button. Emits the signed ID token for the backend to verify. */
@Component({
  selector: 'app-google-sign-in',
  template: `<div #slot class="slot" aria-label="Continue with Google"></div>`,
  styles: `.slot { display: flex; justify-content: center; min-height: 44px; }`,
})
export class GoogleSignIn implements OnInit {
  readonly credential = output<string>();
  readonly failed = output<void>();
  private readonly slot = viewChild.required<ElementRef<HTMLElement>>('slot');

  ngOnInit() {
    this.load().then(() => this.render()).catch(() => this.failed.emit());
  }

  private load(): Promise<void> {
    if (window.google) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
      const script = existing ?? Object.assign(document.createElement('script'), { src: SCRIPT, async: true, defer: true });
      script.addEventListener('load', () => resolve());
      script.addEventListener('error', () => reject());
      if (!existing) document.head.appendChild(script);
      else if (window.google) resolve();
    });
  }

  private render() {
    const g = window.google;
    if (!g) { this.failed.emit(); return; }
    g.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: r => this.credential.emit(r.credential) });
    const width = Math.min(360, Math.max(240, this.slot().nativeElement.clientWidth || 360));
    g.accounts.id.renderButton(this.slot().nativeElement, {
      theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', width, logo_alignment: 'left',
    });
  }
}
