import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';

export const API = 'http://localhost:8081/api';

interface TokenResponse {
  token: string;
  email: string;
  role?: string;
  isDemo?: boolean;
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

  login(email: string, password: string) { return this.auth('login', email, password); }
  register(email: string, password: string) { return this.auth('register', email, password); }
  /** One-click sign-in for the shared public demo accounts. */
  /** Signs in with a Google ID token; the backend verifies it and creates the account on first use. */
  google(credential: string) {
    return this.http.post<TokenResponse>(`${API}/auth/google`, { credential })
      .pipe(tap(r => this.set(r.token, r.email, r.role ?? null, r.isDemo ?? false)));
  }
  /** One click: a private temporary account that is deleted after a short idle time. */
  guest() {
    return this.http.post<TokenResponse>(`${API}/auth/guest`, {})
      .pipe(tap(r => this.set(r.token, r.email, r.role ?? null, r.isDemo ?? false)));
  }

  logout() {
    this.set(null, null, null, false);
    this.router.navigateByUrl('/');
  }

  private auth(kind: 'login' | 'register', email: string, password: string) {
    return this.http.post<TokenResponse>(`${API}/auth/${kind}`, { email, password })
      .pipe(tap(r => this.set(r.token, r.email, r.role ?? null, r.isDemo ?? false)));
  }

  private set(token: string | null, email: string | null, role: string | null, isDemo: boolean) {
    this.token.set(token);
    this.email.set(email);
    this.role.set(role);
    this.isDemo.set(isDemo);
    write('lf_token', token);
    write('lf_email', email);
    write('lf_role', role);
    write('lf_is_demo', isDemo ? 'true' : 'false');
  }
}
