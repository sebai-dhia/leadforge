import { Component, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/auth.service';
import { I18n, I18nKey } from '../../../i18n/i18n';
import { GoogleSignIn } from '../../../shared/google-sign-in/google-sign-in';
import { PasswordStrength } from '../../../shared/password-strength/password-strength';
import { Toasts } from '../../../shared/toast/toast';
import { passwordProblemKey } from '../../../shared/util/password-problem';

/**
 * Change the password in a popup, in two steps: the current password first (checked at once), then the new one with its
 * confirmation. The other devices are signed out. The card itself stays a single line until someone needs it.
 */
@Component({
  selector: 'app-password-card',
  imports: [FormsModule, PasswordStrength, GoogleSignIn],
  templateUrl: './password-card.html',
  styleUrl: './password-card.scss',
})
export class PasswordCard {
  protected readonly auth = inject(AuthService);
  private readonly toasts = inject(Toasts);
  protected readonly t = inject(I18n).t;
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  /** False for an account that only signs in with Google: the first step is a Google confirmation, not a password. */
  readonly hasPassword = input(true);
  protected readonly step = signal<1 | 2>(1);
  /** After the Google confirmation: what the new password is sent with. */
  private ticket: string | null = null;
  protected readonly googleUnavailable = signal(false);
  protected current = '';
  protected next = '';
  protected again = '';
  protected readonly show = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<I18nKey | null>(null);

  protected open() {
    this.reset();
    this.dlg().nativeElement.showModal();
    setTimeout(() => this.dlg().nativeElement.querySelector<HTMLInputElement>('input[name=current]')?.focus());
  }

  protected close() {
    const d = this.dlg().nativeElement;
    if (d.open) d.close();
    this.reset();
  }

  /** A click on the dimmed area outside the panel closes the popup. */
  protected onBackdrop(e: MouseEvent) {
    if (e.target === this.dlg().nativeElement && !this.busy()) this.close();
  }

  private reset() {
    this.step.set(1);
    this.current = '';
    this.next = '';
    this.again = '';
    this.show.set(false);
    this.busy.set(false);
    this.error.set(null);
    this.ticket = null;
    this.googleUnavailable.set(false);
  }

  /** Step 1 without a password: Google confirms the account, then the new password is chosen as in step 2. */
  protected google(credential: string) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.auth.googleReset(credential).subscribe({
      next: step => {
        this.busy.set(false);
        if (!step.ticket) return;
        this.ticket = step.ticket;
        this.step.set(2);
        setTimeout(() => this.dlg().nativeElement.querySelector<HTMLInputElement>('input[name=next]')?.focus());
      },
      error: e => {
        this.busy.set(false);
        this.error.set(e.status === 404 || e.status === 409 ? 'pwcard.errGoogleOther' : e.status === 401 ? 'login.errGoogle' : 'login.errServer');
      },
    });
  }

  /** Step 1: the current password. Only when it is right does the popup ask for the new one. */
  protected verify() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.auth.verifyPassword(this.current).subscribe({
      next: () => {
        this.busy.set(false);
        this.show.set(false);
        this.step.set(2);
        setTimeout(() => this.dlg().nativeElement.querySelector<HTMLInputElement>('input[name=next]')?.focus());
      },
      error: e => {
        this.busy.set(false);
        this.error.set(e.status === 401 ? 'pw.wrongCurrent' : e.status === 429 ? 'login.errLinkLater' : 'login.errServer');
      },
    });
  }

  /** Step 2: the new password, typed twice. */
  protected save() {
    if (this.busy()) return;
    if (this.next !== this.again) { this.error.set('pw.mismatch'); return; }
    this.busy.set(true);
    this.error.set(null);
    const done = this.ticket
      ? this.auth.choosePassword(this.ticket, this.next)
      : this.auth.changePassword(this.current, this.next);
    done.subscribe({
      next: () => {
        this.close();
        this.toasts.show(this.t(this.hasPassword() ? 'pwcard.done' : 'pwcard.doneSet'));
      },
      error: e => {
        this.busy.set(false);
        if (e.status === 410) { this.step.set(1); this.ticket = null; this.error.set('login.pwExpired'); return; }
        if (e.status === 401) { this.step.set(1); this.current = ''; }
        this.error.set(e.status === 401 ? 'pw.wrongCurrent'
          : e.status === 422 ? passwordProblemKey(e)
          : e.status === 429 ? 'login.errLinkLater'
          : 'login.errServer');
      },
    });
  }
}
