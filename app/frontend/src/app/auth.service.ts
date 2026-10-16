import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';

export const API = 'http://localhost:8081/api';

interface TokenResponse { token: string; email: string; }

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
  readonly loggedIn = computed(() => this.token() !== null);

  login(email: string, password: string) { return this.auth('login', email, password); }
  register(email: string, password: string) { return this.auth('register', email, password); }

  logout() {
    this.set(null, null);
    this.router.navigateByUrl('/login');
  }

  private auth(kind: 'login' | 'register', email: string, password: string) {
    return this.http.post<TokenResponse>(`${API}/auth/${kind}`, { email, password })
      .pipe(tap(r => this.set(r.token, r.email)));
  }

  private set(token: string | null, email: string | null) {
    this.token.set(token);
    this.email.set(email);
    write('lf_token', token);
    write('lf_email', email);
  }
}
