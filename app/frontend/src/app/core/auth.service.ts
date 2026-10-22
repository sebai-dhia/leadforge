import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';

/** In development the web app (port 4200) and the API (8081) are separate; deployed, both are served from one address. */
export const API = globalThis.location?.port === '4200' ? 'http://localhost:8081/api' : '/api';

interface TokenResponse {
  token: string;
  email: string;
  role?: string;
  isDemo?: boolean;
  onboarded?: boolean;
}

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

  login(email: string, password: string) { return this.auth('login', email, password); }
  register(email: string, password: string) { return this.auth('register', email, password); }
  /** Signs in with a Google ID token; the backend verifies it and creates the account on first use. */
  google(credential: string) {
    return this.http.post<TokenResponse>(`${API}/auth/google`, { credential })
      .pipe(tap(r => this.set(r.token, r.email, r.role ?? null, r.isDemo ?? false, r.onboarded ?? true)));
  }
  /** Connects Google to an existing password account: needs the Google token and the account's password. */
  googleLink(credential: string, password: string) {
    return this.http.post<TokenResponse>(`${API}/auth/google/link`, { credential, password })
      .pipe(tap(r => this.set(r.token, r.email, r.role ?? null, r.isDemo ?? false, r.onboarded ?? true)));
  }
  /** One click: a private temporary account that is deleted after a short idle time. */
  guest(specialization?: string) {
    return this.http.post<TokenResponse>(`${API}/auth/guest`, specialization ? { specialization } : {})
      .pipe(tap(r => this.set(r.token, r.email, r.role ?? null, r.isDemo ?? false, r.onboarded ?? true)));
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

  private auth(kind: 'login' | 'register', email: string, password: string) {
    return this.http.post<TokenResponse>(`${API}/auth/${kind}`, { email, password })
      .pipe(tap(r => this.set(r.token, r.email, r.role ?? null, r.isDemo ?? false, r.onboarded ?? true)));
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
