import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <form class="card narrow" (ngSubmit)="submit()">
      <h1>{{ mode() === 'login' ? 'Log in' : 'Create account' }}</h1>
      <label>Email <input name="email" type="email" required autocomplete="email" [(ngModel)]="email"></label>
      <label>Password <input name="password" type="password" required minlength="8"
        [autocomplete]="mode() === 'login' ? 'current-password' : 'new-password'" [(ngModel)]="password"></label>
      @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
      <button type="submit" [disabled]="busy()">{{ mode() === 'login' ? 'Log in' : 'Sign up' }}</button>
      <button type="button" class="ghost" (click)="toggle()">
        {{ mode() === 'login' ? 'No account? Sign up' : 'Have an account? Log in' }}
      </button>
    </form>
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  readonly mode = signal<'login' | 'register'>('login');
  readonly busy = signal(false);
  readonly error = signal('');

  toggle() { this.mode.update(m => (m === 'login' ? 'register' : 'login')); this.error.set(''); }

  submit() {
    this.busy.set(true);
    this.error.set('');
    const call = this.mode() === 'login'
      ? this.auth.login(this.email, this.password)
      : this.auth.register(this.email, this.password);
    call.subscribe({
      next: () => this.router.navigateByUrl('/'),
      error: e => {
        this.busy.set(false);
        this.error.set(e.status === 401 ? 'Wrong email or password.'
          : e.status === 409 ? 'That email is already registered.'
          : e.status === 400 ? 'Enter a valid email and a password of at least 8 characters.'
          : 'Could not reach the server.');
      },
    });
  }
}
