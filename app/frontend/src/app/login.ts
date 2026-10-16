import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <div class="card narrow">
      <h1>Leadforge</h1>
      <p class="lede">Discover local business leads and draft tailored outreach with zero auto-sending.</p>

      <section class="demo-box" aria-label="Demo Access">
        <h3>Public Demo Access</h3>
        <p class="mute">
          @if (demoFull()) {
            <span class="warn">Demo is currently full ({{ activeCount() }}/{{ maxCount() }} active sessions). Please wait a few minutes.</span>
          } @else {
            <span class="ok">Slots available ({{ activeCount() }}/{{ maxCount() }} active sessions). Sessions expire after {{ idleMinutes() }}m idle.</span>
          }
        </p>

        <div class="row" style="gap: 8px; margin-top: 8px;">
          <button type="button" class="btn ghost" [disabled]="busy() || demoFull()" (click)="quickLogin('demo1@leadforge.dev', 'demo1234')">
            Demo 1: Web Apps (EN)
          </button>
          <button type="button" class="btn ghost" [disabled]="busy() || demoFull()" (click)="quickLogin('demo2@leadforge.dev', 'demo1234')">
            Demo 2: Refonte Web (FR)
          </button>
        </div>
      </section>

      <hr style="margin: 20px 0; border: none; border-top: 1px solid var(--border, #eee);" />

      <form (ngSubmit)="submit()">
        <h3>Sign in</h3>
        <label>Email <input name="email" type="email" required autocomplete="email" [(ngModel)]="email"></label>
        <label>Password <input name="password" type="password" required minlength="8"
          autocomplete="current-password" [(ngModel)]="password"></label>
        @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
        <button type="submit" [disabled]="busy()">Sign in</button>
      </form>
    </div>
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

  quickLogin(email: string, pass: string) {
    this.email = email;
    this.password = pass;
    this.submit();
  }

  submit() {
    this.busy.set(true);
    this.error.set('');
    this.auth.login(this.email, this.password).subscribe({
      next: () => this.router.navigateByUrl('/'),
      error: e => {
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
      },
    });
  }
}
