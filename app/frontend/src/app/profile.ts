import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, Lang } from './api.service';

@Component({
  selector: 'app-profile',
  imports: [FormsModule, RouterLink],
  template: `
    <section class="narrow-page">
      <h1>Your profile</h1>
      <p class="lede">Saved once, used in every search and every message you write.</p>

      @if (loading()) {
        <div class="card skeleton-card" aria-busy="true" aria-label="Loading profile"><span></span><span></span><span></span></div>
      } @else {
        <form class="card" (ngSubmit)="save()">
          @if (isDemo()) {
            <p class="help warn" style="margin-bottom: 1rem;">
              <strong>Demo mode:</strong> Profile settings are read-only for shared demo accounts.
            </p>
          }

          <label for="offer">What you offer
            <textarea id="offer" name="offer" rows="4" required maxlength="2000" [(ngModel)]="offer"
              [disabled]="isDemo()"
              placeholder="Custom booking systems and internal tools for small clinics"></textarea>
            <span class="help">One or two plain sentences. The AI only uses what you write here, so be specific.</span>
          </label>

          <label for="displayName">Name used to sign messages
            <input id="displayName" name="displayName" required maxlength="100" autocomplete="name"
              [disabled]="isDemo()" [(ngModel)]="displayName">
          </label>

          <fieldset [disabled]="isDemo()">
            <legend>Language of your messages</legend>
            <div class="seg" role="group" aria-label="Default message language">
              @for (l of languages; track l.value) {
                <button type="button" class="seg-btn" [class.on]="language() === l.value"
                  [attr.aria-pressed]="language() === l.value" (click)="setLang(l.value)">{{ l.label }}</button>
              }
            </div>
            <span class="help">You can still change the language for each message.</span>
          </fieldset>

          @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
          <div class="actions">
            <button type="submit" [disabled]="saving() || isDemo()">{{ saving() ? 'Saving…' : 'Save profile' }}</button>
            @if (saved()) { <span class="ok" role="status">Saved. <a routerLink="/">Start a search</a></span> }
          </div>
        </form>
      }
    </section>
  `,
})
export class ProfilePage {
  private readonly api = inject(ApiService);

  protected readonly languages: { value: Lang; label: string }[] = [
    { value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }, { value: 'ar', label: 'العربية' },
  ];

  protected offer = '';
  protected displayName = '';
  protected readonly language = signal<Lang>('en');
  protected readonly isDemo = signal(false);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal('');

  constructor() {
    this.api.profile().subscribe({
      next: p => {
        this.offer = p.offer;
        this.displayName = p.displayName;
        this.language.set(p.language);
        this.isDemo.set(Boolean(p.isDemo));
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.error.set('Could not load your profile. Refresh the page.'); },
    });
  }

  protected setLang(val: Lang) {
    if (this.isDemo()) return;
    this.language.set(val);
  }

  protected save() {
    if (this.isDemo()) return;
    this.saving.set(true);
    this.saved.set(false);
    this.error.set('');
    this.api.saveProfile({ offer: this.offer, displayName: this.displayName, language: this.language() }).subscribe({
      next: () => { this.saving.set(false); this.saved.set(true); },
      error: e => {
        this.saving.set(false);
        this.error.set(e.status === 400 ? 'Fill in what you offer and your name.'
          : e.status === 403 ? 'Demo profile cannot be changed.'
          : 'Could not save. Try again.');
      },
    });
  }
}
