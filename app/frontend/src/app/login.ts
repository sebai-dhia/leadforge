import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Logo } from './logo';
import { GoogleSignIn } from './google-sign-in';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, Logo, GoogleSignIn],
  template: `
    <div class="wrap">
      <header class="top">
        <a routerLink="/" class="brand" aria-label="Leadforge home"><app-logo [size]="28" /></a>
        <a routerLink="/" class="back">Back to home</a>
      </header>

      <div class="center">
        <div class="box">
          <h1>Welcome to Leadforge</h1>
          <p class="lede">Open the demo in one click, or sign in with your account.</p>

          <section class="demo" aria-label="Public demo">
            <div class="demo-head">
              <span>Public demo</span>
              <span class="seats" role="status"><span class="dot" [class.full]="demoFull()"></span>{{ activeCount() }} of {{ maxCount() }} seats in use</span>
            </div>
            @if (demoFull()) {
              <div class="alert" role="alert">The demo is full right now. Please try again in a few minutes.</div>
            }
            <div class="demo-buttons">
              <button type="button" class="btn demo-btn" [disabled]="busy() || demoFull()" (click)="demo(1)">
                <span>Demo · Web apps (English)</span><span aria-hidden="true">→</span>
              </button>
              <button type="button" class="btn ghost demo-btn" [disabled]="busy() || demoFull()" (click)="demo(2)">
                <span>Demo · Refonte web (Français)</span><span aria-hidden="true">→</span>
              </button>
            </div>
            <p class="fine">Sessions end after {{ idleMinutes() }} minutes without activity.</p>
          </section>

          <div class="or"><span></span>or<span></span></div>
          <app-google-sign-in (credential)="google($event)" (failed)="googleUnavailable.set(true)" />
          @if (googleUnavailable()) { <p class="fine center-text">Google sign-in could not load. Use email and password instead.</p> }
          @if (googleError()) { <p class="err center-text" role="alert">{{ googleError() }}</p> }

          <div class="or"><span></span>or sign in with email<span></span></div>

          <form (ngSubmit)="submit()">
            <label>Email <input name="email" type="email" required autocomplete="email" placeholder="you@example.com" [(ngModel)]="email"></label>
            <label>Password <input name="password" type="password" required minlength="8"
              autocomplete="current-password" placeholder="Your password" [(ngModel)]="password"></label>
            @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
            <button type="submit" class="btn ghost submit" [disabled]="busy()">Sign in</button>
          </form>
        </div>
      </div>
    </div>
  `,
  styles: `
    .wrap { min-height: 100vh; display: flex; flex-direction: column; }
    .top { display: flex; align-items: center; justify-content: space-between; gap: 16px; max-width: 1160px; width: 100%; margin: 0 auto; padding: 20px 24px; box-sizing: border-box; }
    .brand { text-decoration: none; display: inline-flex; min-height: 44px; align-items: center; }
    .back { color: var(--mute); text-decoration: none; font-size: 15px; min-height: 44px; display: inline-flex; align-items: center; }
    .back:hover { color: var(--ink); }
    .center { flex: 1; display: flex; align-items: center; justify-content: center; padding: 16px 24px 64px; }
    .box { width: 100%; max-width: 440px; }
    h1 { font-size: 34px; margin: 0 0 10px; }
    .lede { margin-bottom: 26px; }
    .demo { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 22px; }
    .demo-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; font-weight: 600; font-size: 15px; flex-wrap: wrap; }
    .seats { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 400; color: var(--mute); }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
    .dot.full { background: var(--warn); }
    .alert { border: 1px solid color-mix(in srgb, var(--warn) 45%, transparent); background: color-mix(in srgb, var(--warn) 10%, transparent); color: var(--warn); border-radius: 12px; padding: 12px 14px; font-size: 14.5px; margin-bottom: 14px; }
    .demo-buttons { display: flex; flex-direction: column; gap: 10px; }
    .demo-btn { justify-content: space-between; min-height: 52px; border-radius: 12px; padding: 0 18px; font-size: 16px; }
    .center-text { text-align: center; }
    .fine { font-size: 13px; color: var(--mute); margin: 14px 0 0; }
    .or { display: flex; align-items: center; gap: 14px; margin: 24px 0; color: var(--mute); font-size: 13px; }
    .or span { flex: 1; height: 1px; background: var(--line); }
    form label { font-size: 14px; font-weight: 500; }
    form input { min-height: 48px; border-radius: 12px; font-size: 16px; }
    .submit { width: 100%; min-height: 50px; border-radius: 12px; font-size: 16px; margin-top: 4px; }
  `,
})
export class Login implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  readonly busy = signal(false);
  readonly error = signal('');
  readonly activeCount = signal(0);
  readonly maxCount = signal(5);
  readonly idleMinutes = signal(15);
  readonly demoFull = signal(false);
  readonly googleUnavailable = signal(false);
  readonly googleError = signal('');

  ngOnInit() {
    this.refreshStatus();
  }

  refreshStatus() {
    this.api.demoStatus().subscribe({
      next: s => {
        this.activeCount.set(s.activeSessions);
        this.maxCount.set(s.maxSessions);
        this.idleMinutes.set(s.idleMinutes);
        this.demoFull.set(s.demoFull);
      },
      error: () => { /* status endpoint optional on initial load */ }
    });
  }

  demo(which: 1 | 2) {
    this.busy.set(true);
    this.error.set('');
    this.auth.demoLogin(which).subscribe({
      next: () => this.router.navigateByUrl('/leads'),
      error: e => this.fail(e),
    });
  }

  submit() {
    this.busy.set(true);
    this.error.set('');
    this.auth.login(this.email, this.password).subscribe({
      next: () => this.router.navigateByUrl('/leads'),
      error: e => this.fail(e),
    });
  }

  google(credential: string) {
    this.busy.set(true);
    this.googleError.set('');
    this.auth.google(credential).subscribe({
      next: () => this.router.navigateByUrl('/leads'),
      error: e => {
        this.busy.set(false);
        this.googleError.set(
          e.status === 429 ? 'The demo is full right now. Please try again in a few minutes.'
          : e.status === 409 ? 'An account with this email already exists. Sign in with its password instead.'
          : e.status === 401 ? 'Google could not confirm your sign-in. Please try again.'
          : 'Could not reach the server. Please try again.');
        if (e.status === 429) this.refreshStatus();
      },
    });
  }

  private fail(e: { status: number }) {
    this.busy.set(false);
    if (e.status === 429) {
      this.error.set('Demo is currently full (5 active sessions). Please try again in a few minutes.');
      this.refreshStatus();
      return;
    }
    if (e.status === 401) {
      this.error.set('Wrong email or password.');
      return;
    }
    this.error.set('Could not reach the server. Please try again.');
  }
}
