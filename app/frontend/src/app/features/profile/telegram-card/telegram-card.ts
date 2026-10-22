import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ApiService, TelegramStatus } from '../../../core/api.service';
import { I18n, I18nKey } from '../../../i18n/i18n';
import { Toasts } from '../../../shared/toast/toast';
import { linkSite } from '../../../shared/util/link-icons';

/** Telegram: the app opens a one-time t.me link, the person presses Start, and the card sees the chat arrive. */
@Component({
  selector: 'app-telegram-card',
  templateUrl: './telegram-card.html',
  styleUrl: './telegram-card.scss',
})
export class TelegramCard {
  private readonly api = inject(ApiService);
  private readonly toasts = inject(Toasts);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly tg = signal<TelegramStatus | null>(null);
  protected readonly tgLink = signal<string | null>(null);
  /** The link as a QR code image, on a computer only. */
  protected readonly tgQr = signal<string | null>(null);
  /** A phone or tablet: the link opens the Telegram app directly, no code to scan. */
  private readonly onPhone = typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;
  protected readonly tgBusy = signal(false);
  protected readonly tgError = signal<I18nKey | null>(null);
  protected readonly tgIcon = linkSite('https://t.me')?.path ?? '';
  private tgTimer: ReturnType<typeof setInterval> | null = null;
  private tgExpires = 0;
  private readonly onFocus = () => { if (this.tgLink()) this.checkTg(); };

  /** The hours offered, on the hour: 5:00 to 22:00 (the backend accepts the same range). */
  protected readonly tgHours = Array.from({ length: 18 }, (_, i) => i + 5);

  constructor() {
    this.api.telegram().subscribe({ next: s => this.tg.set(s), error: () => { /* the card stays hidden */ } });
    window.addEventListener('focus', this.onFocus);
    inject(DestroyRef).onDestroy(() => { this.stopWaiting(); window.removeEventListener('focus', this.onFocus); });
  }

  protected connectTg() {
    this.tgBusy.set(true);
    this.tgError.set(null);
    this.api.telegramLink(this.i18n.lang(), Intl.DateTimeFormat().resolvedOptions().timeZone).subscribe({
      next: l => {
        this.tgExpires = new Date(l.expiresAt).getTime();
        if (this.onPhone) {
          this.showLink(l.url);
          window.open(l.url, '_blank', 'noopener'); // if the browser blocks it, the card shows an "Open Telegram" link
          return;
        }
        // without the code (the library failed to load) the card falls back to the "Open Telegram" link
        this.qrFor(l.url).then(qr => { this.tgQr.set(qr); this.showLink(l.url); });
      },
      error: () => { this.tgBusy.set(false); this.tgError.set('tg.err'); },
    });
  }

  private showLink(url: string) {
    this.tgBusy.set(false);
    this.tgLink.set(url);
    this.tgTimer = setInterval(() => this.checkTg(), 3000);
  }

  /** Loaded only when someone connects, so the profile page does not carry the QR library. */
  private async qrFor(url: string): Promise<string | null> {
    try {
      const mod: any = await import('qrcode');
      const qr = (mod.default ?? mod) as typeof import('qrcode');
      return await qr.toDataURL(url, { margin: 1, width: 352, errorCorrectionLevel: 'M', color: { dark: '#0b1210', light: '#ffffff' } });
    } catch {
      return null;
    }
  }

  private checkTg() {
    if (Date.now() > this.tgExpires) {
      this.stopWaiting();
      this.tgError.set('tg.expired');
      return;
    }
    this.api.telegram().subscribe({
      next: s => {
        if (!s.connected || !this.tgLink()) return;
        this.stopWaiting();
        this.tg.set(s);
        this.toasts.show(this.t('tg.done'));
      },
      error: () => { /* the next check tries again */ },
    });
  }

  protected stopWaiting() {
    if (this.tgTimer) clearInterval(this.tgTimer);
    this.tgTimer = null;
    this.tgLink.set(null);
    this.tgQr.set(null);
  }

  /** "9:00 AM" in English, "9 h" in French, as the person's own clock would show it. */
  protected hourLabel(h: number): string {
    return new Date(2000, 0, 1, h).toLocaleTimeString(this.i18n.lang() === 'fr' ? 'fr-FR' : 'en-US', { hour: 'numeric', minute: '2-digit' });
  }

  protected setTgHour(value: string) {
    const hour = Number(value);
    if (!Number.isInteger(hour) || hour === this.tg()?.hour) return;
    this.tgBusy.set(true);
    this.tgError.set(null);
    this.api.setTelegram({ hour }).subscribe({
      next: r => { this.tg.set(r); this.tgBusy.set(false); this.toasts.show(this.t('tg.hourSaved', { time: this.hourLabel(r.hour) })); },
      error: () => { this.tgBusy.set(false); this.tgError.set('profile.errSave'); },
    });
  }

  protected toggleTg() {
    const s = this.tg();
    if (!s) return;
    this.tgBusy.set(true);
    this.tgError.set(null);
    this.api.setTelegram({ notifications: !s.notifications }).subscribe({
      next: r => { this.tg.set(r); this.tgBusy.set(false); },
      error: () => { this.tgBusy.set(false); this.tgError.set('profile.errSave'); },
    });
  }

  protected disconnectTg() {
    this.tgBusy.set(true);
    this.tgError.set(null);
    this.api.disconnectTelegram().subscribe({
      next: r => { this.tg.set(r); this.tgBusy.set(false); this.toasts.show(this.t('tg.removed')); },
      error: () => { this.tgBusy.set(false); this.tgError.set('profile.errSave'); },
    });
  }
}
