import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, Job, Lead } from './api.service';

@Component({
  selector: 'app-search-detail',
  imports: [RouterLink],
  template: `
    <p><a routerLink="/">← All searches</a></p>
    @if (job(); as j) {
      <h1>{{ j.niche }} in {{ j.city }}</h1>
      @switch (j.status) {
        @case ('PENDING') { <p class="mute" role="status">Searching and drafting emails. This page updates by itself (about a minute).</p> }
        @case ('FAILED') { <p class="err" role="alert">The search failed. Check that n8n is running, then try again.</p> }
        @default { <p class="mute">{{ leads().length }} leads, best fit first. Review each draft before sending.</p> }
      }
      @for (l of leads(); track l.id) {
        <article class="card">
          <div class="row">
            <strong>{{ l.name }}</strong>
            <span class="score">Fit {{ l.score }}/10</span>
          </div>
          <div class="mute">
            {{ l.address }} · <a [href]="l.website" target="_blank" rel="noopener">website</a>
            @if (l.phone) { · {{ l.phone }} }
            @if (l.rating) { · ★ {{ l.rating }} ({{ l.reviews }}) }
          </div>
          <p>{{ l.reason }}</p>
          @if (l.emails.length) {
            <div class="mute">Email found: {{ l.emails.join(', ') }}</div>
          } @else {
            <div class="warn">No email found on the website. Try the contact form or phone.</div>
          }
          <details>
            <summary>Draft email</summary>
            <label>Subject <input #subj [value]="l.subject"></label>
            <label>Body <textarea #body rows="7" [value]="l.emailBody"></textarea></label>
            <div class="actions">
              <button type="button" class="ghost" (click)="copy(subj.value, body.value, $event)">Copy</button>
              @if (l.emails.length) {
                <button type="button" (click)="mail(l, subj.value, body.value)">Open in mail app</button>
              }
            </div>
          </details>
        </article>
      }
    } @else {
      <p class="mute">Loading…</p>
    }
  `,
})
export class SearchDetail {
  readonly id = input.required<string>(); // bound from the route param

  private readonly api = inject(ApiService);
  readonly job = signal<Job | null>(null);
  readonly leads = signal<Lead[]>([]);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
    queueMicrotask(() => this.load());
  }

  private load() {
    this.api.get(this.id()).subscribe({
      next: r => {
        this.job.set(r.job);
        this.leads.set(r.leads);
        if (r.job.status === 'PENDING') this.timer = setTimeout(() => this.load(), 4000);
      },
    });
  }

  copy(subject: string, body: string, ev: Event) {
    navigator.clipboard.writeText(subject + '\n\n' + body);
    (ev.target as HTMLButtonElement).textContent = 'Copied';
  }

  mail(l: Lead, subject: string, body: string) {
    location.href = `mailto:${l.emails[0]}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
}
