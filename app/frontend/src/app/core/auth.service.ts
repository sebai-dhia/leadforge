import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { map, tap } from 'rxjs';

/** The API's address when the web app is hosted apart from it (Cloudflare Pages): written into index.html at build time. */
const hostedApi = globalThis.document?.querySelector<HTMLMetaElement>('meta[name="leadforge-api"]')?.content ?? '';

/** In development the web app (port 4200) and the API (8081) are separate; on a server, both are served from one address. */
export const API = globalThis.location?.port === '4200' ? 'http://localhost:8081/api'
  : hostedApi.startsWith('https://') ? hostedApi : '/api';

interface TokenResponse {
  /** Empty when the answer is a passwordTicket instead of a session. */
  token: string | null;
  email: string;
  role?: string | null;
  isDemo?: boolean;
  onboarded?: boolean;
  /** After a Google sign-in that needs a password first: what to send with the chosen password. */
  passwordTicket?: string | null;
}

/** What a Google step answers: signed in, or a ticket to exchange for a session once a password is chosen. */
export interface GoogleStep { ticket: string | null; email: string }

/** Why the server refused a new password. */
export type PasswordProblem = 'TOO_SHORT' | 'TOO_LONG' | 'SAME_AS_EMAIL' | 'LEAKED';

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null) {
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly token = signal<string | null>(read('lf_token'));
  readonly email = signal<string | null>(read('lf_email'));
  readonly role = signal<string | null>(read('lf_role'));
  readonly isDemo = signal<boolean>(read('lf_is_demo') === 'true');
  readonly loggedIn = computed(() => this.token() !== null);
  readonly isGuest = computed(() => this.role() === 'GUEST');
  /** Only decides what is shown: the API checks the role itself. */
  readonly isAdmin = computed(() => this.role() === 'ADMIN');
  readonly onboarded = signal<boolean>(read('lf_onboarded') !== 'false');

  /** Where to go after signing in: the first-run picker once, then the leads. */
  home(): string { return this.onboarded() ? '/leads' : '/welcome'; }

  /** After the admin changed the email: the account menu shows the new one. */
  setEmail(email: string) { this.email.set(email); write('lf_email', email); }

  markOnboarded() { this.onboarded.set(true); write('lf_onboarded', 'true'); }

  login(email: string, password: string) {
    return this.http.post<TokenResponse>(`${API}/auth/login`, { email, password })
      .pipe(tap(r => this.start(r)));
  }
  /**
   * Signs in with a Google ID token. A known account with a password is signed in; a new one (or one without a
   * password) gets a ticket, and the account only exists once a password is chosen (choosePassword).
   */
  google(credential: string) {
    return this.http.post<TokenResponse>(`${API}/auth/google`, { credential }).pipe(map(r => this.googleStep(r)));
  }
  /** Forgotten password: a Google sign-in with the account's address gives a ticket for a new password. */
  googleReset(credential: string) {
    return this.http.post<TokenResponse>(`${API}/auth/google/reset`, { credential }).pipe(map(r => this.googleStep(r)));
  }
  /** Ends the Google step with the chosen password: creates the account or replaces the old password, and signs in. */
  choosePassword(ticket: string, password: string) {
    return this.http.post<TokenResponse>(`${API}/auth/google/password`, { ticket, password }).pipe(tap(r => this.start(r)));
  }
  /** First step of a password change: is this the current password? Answers 204, or 401 when it is not. */
  verifyPassword(currentPassword: string) {
    return this.http.post<void>(`${API}/auth/password/verify`, { currentPassword }, { headers: this.bearer() });
  }
  /** A signed-in person changes the password (the current one is needed); the other sessions end, this one continues. */
  changePassword(currentPassword: string, newPassword: string) {
    return this.http.put<TokenResponse>(`${API}/auth/password`, { currentPassword, newPassword }, { headers: this.bearer() })
      .pipe(tap(r => this.start(r)));
  }
  /** Connects Google to an existing password account: needs the Google token and the account's password. */
  googleLink(credential: string, password: string) {
    return this.http.post<TokenResponse>(`${API}/auth/google/link`, { credential, password })
      .pipe(tap(r => this.start(r)));
  }
  /** One click: a private temporary account that is deleted after a short idle time. */
  guest(specialization?: string) {
    return this.http.post<TokenResponse>(`${API}/auth/guest`, specialization ? { specialization } : {})
      .pipe(tap(r => this.start(r)));
  }

  /** True from the moment someone logs out until the next page is on screen, so the page does not change shape in between. */
  readonly leaving = signal(false);

  logout() {
    // end the session on the server too, so a copied token stops working; a failure must not keep the person signed in
    const token = this.token();
    if (token) {
      this.http.post(`${API}/auth/logout`, {}, { headers: { Authorization: `Bearer ${token}` } }).subscribe({ error: () => {} });
    }
    this.leaving.set(true);
    this.set(null, null, null, false);
    this.router.navigateByUrl('/').finally(() => this.leaving.set(false));
  }

  /** The interceptor leaves /auth/ calls without the token (sign-in must not send an old one); the two that need it add it here. */
  private bearer() {
    return { Authorization: `Bearer ${this.token() ?? ''}` };
  }

  private googleStep(r: TokenResponse): GoogleStep {
    if (r.token) this.start(r);
    return { ticket: r.token ? null : (r.passwordTicket ?? null), email: r.email };
  }

  private start(r: TokenResponse) {
    if (r.token) this.set(r.token, r.email, r.role ?? null, r.isDemo ?? false, r.onboarded ?? true);
  }

  private set(token: string | null, email: string | null, role: string | null, isDemo: boolean, onboarded = true) {
    this.token.set(token);
    this.email.set(email);
    this.role.set(role);
    this.isDemo.set(isDemo);
    this.onboarded.set(onboarded);
    write('lf_onboarded', onboarded ? 'true' : 'false');
    write('lf_token', token);
    write('lf_email', email);
    write('lf_role', role);
    write('lf_is_demo', isDemo ? 'true' : 'false');
  }
}
