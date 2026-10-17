import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, Lang, ProfileUpdate } from './api.service';
import { AuthService } from './auth.service';
import { Logo } from './logo';
import { MAX_SERVICES, MAX_TARGETS, SERVICE_OPTIONS, TARGET_OPTIONS } from './profile-options';

/** First-run picker, also reused to change the chips later (?edit=1&step=1|2|3). */
@Component({
  selector: 'app-onboarding',
  imports: [FormsModule, RouterLink, Logo],
  template: `
    <div class="wrap">
      <header class="top">
        <a routerLink="/" class="brand" aria-label="Leadforge home"><app-logo [size]="28" /></a>
        <button type="button" class="skip" (click)="skip()">{{ editing ? 'Cancel' : 'Skip for now' }}</button>
      </header>

      <main class="main">
        <div class="progress" role="img" [attr.aria-label]="'Step ' + step() + ' of 3'">
          @for (n of [1, 2, 3]; track n) { <span class="bar" [class.on]="n <= step()"></span> }
          <span class="count">Step {{ step() }} of 3</span>
        </div>

        @if (loading()) {
          <div class="card skeleton-card" aria-busy="true" aria-label="Loading"><span></span><span></span><span></span></div>
        } @else {
          @switch (step()) {
            @case (1) {
              <h1>What do you offer?</h1>
              <p class="sub">Pick up to {{ maxServices }}. We use them to suggest the businesses most likely to need you, and to write messages that sound like you.</p>
              <div class="chips" role="group" aria-label="Services you offer">
                @for (s of serviceChoices(); track s) {
                  <button type="button" class="pick" [class.on]="services().includes(s)"
                    [attr.aria-pressed]="services().includes(s)" [disabled]="locked(services(), s, maxServices)"
                    (click)="toggle(services, s, maxServices)">
                    <span class="mark" aria-hidden="true">{{ services().includes(s) ? '✓' : '+' }}</span>{{ s }}
                  </button>
                }
              </div>
              <form class="other" (ngSubmit)="addOther()">
                <label>Something else?
                  <input name="other" maxlength="40" placeholder="For example: Data dashboards" [(ngModel)]="other">
                </label>
                <button type="submit" class="ghost" [disabled]="!other.trim() || services().length >= maxServices">Add</button>
              </form>
              <p class="count-note" role="status">{{ services().length }} of {{ maxServices }} selected</p>
            }
            @case (2) {
              <h1>Who do you want to work with?</h1>
              <p class="sub">Pick up to {{ maxTargets }} kinds of business. Your searches will suggest these first.</p>
              <div class="chips" role="group" aria-label="Kinds of business">
                @for (t of targetChoices; track t) {
                  <button type="button" class="pick" [class.on]="targets().includes(t)"
                    [attr.aria-pressed]="targets().includes(t)" [disabled]="locked(targets(), t, maxTargets)"
                    (click)="toggle(targets, t, maxTargets)">
                    <span class="mark" aria-hidden="true">{{ targets().includes(t) ? '✓' : '+' }}</span>{{ t }}
                  </button>
                }
              </div>
              <p class="count-note" role="status">{{ targets().length }} of {{ maxTargets }} selected</p>
            }
            @default {
              <h1>A little about you</h1>
              <p class="sub">This signs your messages. You can change everything later on your profile.</p>
              <div class="fields">
                <label>Your name <input name="name" maxlength="100" autocomplete="name" [(ngModel)]="displayName"></label>
                <label>Where are you based? <input name="city" maxlength="120" placeholder="Tunis, Tunisia" [(ngModel)]="city"></label>
                <fieldset>
                  <legend>Language of your messages</legend>
                  <div class="seg" role="group" aria-label="Default message language">
                    @for (l of languages; track l.value) {
                      <button type="button" class="seg-btn" [class.on]="language() === l.value"
                        [attr.aria-pressed]="language() === l.value" (click)="language.set(l.value)">{{ l.label }}</button>
                    }
                  </div>
                </fieldset>
              </div>
            }
          }

          @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
          <div class="nav">
            @if (step() > 1 && !singleStep) { <button type="button" class="ghost" (click)="step.set(step() - 1)">Back</button> } @else { <span></span> }
            <button type="button" class="next" [disabled]="saving() || (step() === 1 && !services().length && !editing)" (click)="next()">
              {{ last() ? (saving() ? 'Saving…' : (editing ? 'Save' : 'Finish')) : 'Continue' }}
            </button>
          </div>
        }
      </main>
    </div>
  `,
  styles: `
    .wrap { min-height: 100vh; display: flex; flex-direction: column; }
    .top { display: flex; align-items: center; justify-content: space-between; max-width: 1160px; width: 100%; margin: 0 auto; padding: 20px 24px; box-sizing: border-box; }
    .brand { text-decoration: none; display: inline-flex; min-height: 44px; align-items: center; }
    .skip { background: transparent; border: 0; color: var(--mute); font-weight: 400; min-height: 44px; }
    .skip:hover { color: var(--ink); }
    .main { flex: 1; width: 100%; max-width: 760px; margin: 0 auto; padding: 16px 24px 64px; box-sizing: border-box; }
    .progress { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; }
    .bar { flex: 1; height: 4px; border-radius: 4px; background: var(--line); }
    .bar.on { background: var(--accent); }
    .count { font-size: 13px; color: var(--mute); margin-left: 6px; white-space: nowrap; }
    h1 { font-size: clamp(30px, 5vw, 44px); letter-spacing: -0.025em; line-height: 1.06; margin: 0 0 12px; }
    .sub { color: var(--mute); font-size: 18px; max-width: 560px; margin: 0 0 28px; }
    .chips { display: flex; flex-wrap: wrap; gap: 12px; }
    .pick { display: inline-flex; align-items: center; gap: 10px; min-height: 52px; padding: 0 20px; border-radius: 999px; font-size: 16px; font-weight: 500; background: var(--card); color: var(--ink); border: 1px solid var(--line-strong); transition: border-color .2s ease, color .2s ease, background-color .2s ease; }
    .pick:hover:not(:disabled) { border-color: var(--mute); filter: none; }
    .pick.on { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    .pick:disabled { opacity: .5; cursor: not-allowed; }
    .mark { width: 18px; text-align: center; }
    .other { display: flex; gap: 12px; align-items: flex-end; margin-top: 24px; flex-wrap: wrap; }
    .other label { flex: 1 1 260px; margin: 0; }
    .count-note { margin: 20px 0 0; font-size: 14px; color: var(--mute); }
    .fields { display: grid; gap: 4px; max-width: 460px; }
    .nav { margin-top: 36px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .next { min-height: 52px; padding: 0 32px; border-radius: 12px; font-size: 16px; }
    @media (max-width: 520px) { .sub { font-size: 16px; } .pick { min-height: 48px; padding: 0 16px; } }
  `,
})
export class Onboarding {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly maxServices = MAX_SERVICES;
  protected readonly maxTargets = MAX_TARGETS;
  protected readonly targetChoices = TARGET_OPTIONS;
  protected readonly languages: { value: Lang; label: string }[] = [
    { value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }, { value: 'ar', label: 'العربية' },
  ];

  protected readonly editing = this.route.snapshot.queryParamMap.get('edit') === '1';
  protected readonly singleStep = this.editing && this.route.snapshot.queryParamMap.has('step');
  protected readonly step = signal(Math.min(3, Math.max(1, Number(this.route.snapshot.queryParamMap.get('step')) || 1)));
  private readonly firstStep = this.step();

  protected readonly services = signal<string[]>([]);
  protected readonly targets = signal<string[]>([]);
  protected readonly language = signal<Lang>('en');
  protected displayName = '';
  protected city = '';
  protected other = '';
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  constructor() {
    this.api.profile().subscribe({
      next: p => {
        this.services.set(p.services);
        this.targets.set(p.targets);
        this.language.set(p.language);
        this.displayName = p.displayName;
        this.city = p.city;
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.error.set('Could not load your profile. Refresh the page.'); },
    });
  }

  /** The standard chips, plus anything the person typed earlier. */
  protected serviceChoices() {
    return [...SERVICE_OPTIONS, ...this.services().filter(s => !SERVICE_OPTIONS.includes(s))];
  }

  protected locked(list: string[], item: string, max: number) {
    return !list.includes(item) && list.length >= max;
  }

  protected toggle(target: { (): string[]; set(v: string[]): void }, item: string, max: number) {
    const cur = target();
    if (cur.includes(item)) target.set(cur.filter(x => x !== item));
    else if (cur.length < max) target.set([...cur, item]);
  }

  protected addOther() {
    const v = this.other.trim();
    if (v && !this.services().includes(v) && this.services().length < MAX_SERVICES) this.services.set([...this.services(), v]);
    this.other = '';
  }

  protected last() { return this.singleStep ? true : this.step() === 3; }

  protected next() {
    if (!this.last()) { this.step.set(this.step() + 1); return; }
    this.saving.set(true);
    this.error.set('');
    const body: ProfileUpdate = { onboarded: true };
    if (!this.singleStep || this.firstStep === 1) body.services = this.services();
    if (!this.singleStep || this.firstStep === 2) body.targets = this.targets();
    if (!this.singleStep || this.firstStep === 3) {
      body.language = this.language();
      body.city = this.city;
      if (this.displayName.trim()) body.displayName = this.displayName;
    }
    this.api.saveProfile(body).subscribe({
      next: () => { this.auth.markOnboarded(); this.router.navigateByUrl(this.editing ? '/profile' : '/searches'); },
      error: () => { this.saving.set(false); this.error.set('Could not save. Try again.'); },
    });
  }

  protected skip() {
    if (this.editing) { this.router.navigateByUrl('/profile'); return; }
    this.api.saveProfile({ onboarded: true }).subscribe({
      next: () => { this.auth.markOnboarded(); this.router.navigateByUrl('/leads'); },
      error: () => this.router.navigateByUrl('/leads'),
    });
  }
}
