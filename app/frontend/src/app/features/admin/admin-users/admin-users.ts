import { Component, ElementRef, effect, inject, output, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AdminPage, AdminUser, ApiService, Usage } from '../../../core/api.service';
import { I18n, I18nKey } from '../../../i18n/i18n';
import { Toasts } from '../../../shared/toast/toast';
import { AdminPager } from '../admin-pager/admin-pager';
import { KINDS, PAGE, ROLES, roleKey } from '../admin-model';

const ACTIVE_MS = 10 * 60_000;

/** The accounts tab: search, add and remove accounts, and how much each one used today. */
@Component({
  selector: 'app-admin-users',
  imports: [FormsModule, AdminPager],
  templateUrl: './admin-users.html',
  styleUrl: './admin-users.scss',
})
export class AdminUsers {
  private readonly api = inject(ApiService);
  private readonly toasts = inject(Toasts);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  /** True when a load failed, false when one worked; the page shows the retry notice. */
  readonly loadError = output<boolean>();

  protected readonly kinds = KINDS;
  protected readonly roles = ROLES;
  protected readonly roleKey = roleKey;

  protected readonly users = signal<AdminPage<AdminUser> | null>(null);
  protected readonly usersLoading = signal(false);
  protected readonly q = signal('');
  protected readonly role = signal('');
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private usersRequest = 0;

  protected readonly addOpen = signal(false);
  protected newEmail = '';
  protected newName = '';
  protected newPassword = '';
  protected readonly addBusy = signal(false);
  protected readonly addError = signal<I18nKey | null>(null);
  /** The account that was just added; the generated password is only shown here, once. */
  protected readonly created = signal<{ email: string; password: string | null } | null>(null);
  protected readonly copied = signal(false);
  /** The account waiting for the admin to confirm its removal; the dialog is open while this is set. */
  protected readonly removeTarget = signal<AdminUser | null>(null);
  private readonly dlg = viewChild<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly removeBusy = signal(false);

  constructor() {
    this.loadUsers(0);
    // the native dialog gives the focus trap, the Escape key and the backdrop
    effect(() => {
      const dialog = this.dlg()?.nativeElement;
      const wanted = this.removeTarget() !== null;
      if (!dialog) return;
      if (wanted && !dialog.open) {
        dialog.showModal();
        // the content is drawn just after the dialog opens, so Cancel is focused once it exists
        setTimeout(() => dialog.querySelector<HTMLElement>('[autofocus]')?.focus());
      }
      if (!wanted && dialog.open) dialog.close();
    });
  }

  reload() {
    this.loadUsers(0);
  }

  /** A click on the dialog itself, not on its content, is a click on the backdrop. */
  protected onBackdrop(e: MouseEvent) {
    if (e.target === this.dlg()?.nativeElement && !this.removeBusy()) this.removeTarget.set(null);
  }

  protected loadUsers(page: number) {
    const id = ++this.usersRequest; // an older answer that arrives late must not replace a newer one
    this.usersLoading.set(true);
    this.api.adminUsers(this.q(), this.role(), page, PAGE).subscribe({
      next: p => { if (id === this.usersRequest) { this.users.set(p); this.usersLoading.set(false); this.loadError.emit(false); } },
      error: () => { if (id === this.usersRequest) { this.usersLoading.set(false); this.loadError.emit(true); } },
    });
  }

  protected onSearch(value: string) {
    this.q.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.loadUsers(0), 300);
  }

  protected setRole(role: string) {
    this.role.set(role);
    this.loadUsers(0);
  }

  protected toggleAdd() {
    this.addOpen.update(v => !v);
    this.addError.set(null);
  }

  protected createUser() {
    const name = this.newName.trim();
    this.addBusy.set(true);
    this.addError.set(null);
    this.api.adminCreateUser({ email: this.newEmail.trim(), ...(name ? { displayName: name } : {}), ...(this.newPassword ? { password: this.newPassword } : {}) }).subscribe({
      next: r => {
        this.addBusy.set(false);
        this.addOpen.set(false);
        this.newEmail = this.newName = this.newPassword = '';
        this.created.set({ email: r.email, password: r.generatedPassword });
        this.copied.set(false);
        this.loadUsers(0);
      },
      error: (err: HttpErrorResponse) => {
        this.addBusy.set(false);
        this.addError.set(err.status === 409 ? 'admin.addErrTaken' : err.status === 400 ? 'admin.addErrInvalid' : 'admin.addErr');
      },
    });
  }

  protected async copyPassword(password: string) {
    try {
      await navigator.clipboard.writeText(password);
      this.copied.set(true);
    } catch { /* the password stays on screen to copy by hand */ }
  }

  /** Admin accounts are not removed from here. */
  protected canRemove(u: AdminUser): boolean { return u.role !== 'ADMIN'; }

  protected confirmRemove(u: AdminUser) {
    this.removeBusy.set(true);
    this.api.adminDeleteUser(u.id).subscribe({
      next: () => {
        const p = this.users();
        this.removeBusy.set(false);
        this.removeTarget.set(null);
        this.toasts.show(this.t('admin.removed'), undefined, 4000);
        this.loadUsers(p && p.items.length === 1 && p.page > 0 ? p.page - 1 : (p?.page ?? 0));
      },
      error: () => { this.removeBusy.set(false); this.toasts.show(this.t('admin.removeErr'), undefined, 6000); },
    });
  }

  /** How this account gets in, in words, so it is not mistaken for a role. */
  protected signInKey(u: AdminUser): I18nKey {
    if (u.role === 'GUEST') return 'admin.signGuest';
    return u.google ? 'admin.signGoogle' : 'admin.signPassword';
  }

  protected initials(u: AdminUser): string {
    if (u.role === 'GUEST') return 'G'; // its email is generated, so its letters mean nothing
    const source = (u.displayName && u.displayName !== 'Guest' ? u.displayName : u.email).trim();
    const parts = source.split(/[\s@._-]+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[1][0] : '')).toUpperCase();
  }

  /** Seen in the last few minutes (the time is saved at most every 5 minutes). */
  protected activeNow(u: AdminUser): boolean {
    return !!u.lastSeenAt && Date.now() - new Date(u.lastSeenAt).getTime() < ACTIVE_MS;
  }

  protected pctOf(x: Usage): number {
    return x.limit > 0 ? Math.min(100, (x.used / x.limit) * 100) : x.used > 0 ? 100 : 0;
  }
}
