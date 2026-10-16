import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Channel, EnrichResult, Lang, Lead, LeadStatus } from './api.service';

/** WhatsApp needs an international number. Only trust numbers that already carry a country code. */
export function whatsappDigits(phone: string | null): string | null {
  if (!phone) return null;
  const p = phone.trim();
  if (!p.startsWith('+') && !p.startsWith('00')) return null;
  const d = p.replace(/\D/g, '').replace(/^00/, '');
  return d.length >= 8 ? d : null;
}

@Component({
  selector: 'app-lead-card',
  imports: [FormsModule],
  template: `
    <article class="card lead" [class.dim]="current().status === 'NOT_INTERESTED'" [class.compact]="collapsible()">
      @if (collapsible()) {
        <button type="button" class="lead-head" [attr.aria-expanded]="expanded()" (click)="expanded.set(!expanded())">
          <span class="lead-title">
            <bdi class="lead-name">{{ current().name }}</bdi>
            @if (current().niche) { <span class="mute">{{ current().niche }} · {{ current().city }}</span> }
          </span>
          <span class="lead-meta">
            <span class="fit" [attr.data-level]="fit().level">{{ fit().label }} <span class="num">{{ current().score }}/10</span></span>
            <span class="reach" [class.none]="reach() === 'No contact'">{{ reach() }}</span>
            <span class="pill" [attr.data-status]="current().status">{{ statusLabel() }}</span>
            <span class="chev" [class.open]="expanded()" aria-hidden="true"></span>
          </span>
        </button>
      } @else {
        <div class="row">
          <h3 dir="auto">{{ current().name }}</h3>
          <span class="fit" [attr.data-level]="fit().level" [title]="'Score ' + current().score + ' out of 10'">
            {{ fit().label }} <span class="num">{{ current().score }}/10</span>
          </span>
        </div>
        @if (seenBefore()) { <span class="tag">Already in your leads</span> }
      }

      @if (showBody()) {
      <p class="mute">
        <bdi>{{ current().address }}</bdi>
        @if (!current().website) { · no website listed }
        @if (current().rating) { · rated {{ current().rating }} ({{ current().reviews }}) }
      </p>
      <p>{{ current().reason }}</p>

      <div class="contacts" aria-label="Contact options">
        @if (telHref(); as tel) {
          <a class="btn ghost" [href]="tel">Call {{ current().phone }}</a>
        }
        @if (waHref(); as wa) {
          <a class="btn ghost" [href]="wa" target="_blank" rel="noopener">WhatsApp</a>
        }
        @if (mailHref(); as mail) {
          <a class="btn ghost" [href]="mail">Email {{ current().emails[0] }}</a>
        }
        @if (current().website; as site) {
          <a class="btn ghost" [href]="site" target="_blank" rel="noopener">Website</a>
        }
        @for (s of socialLinks(); track s.url) {
          <a class="btn ghost" [href]="s.url" target="_blank" rel="noopener">{{ s.label }}</a>
        }
        @if (canEnrich()) {
          <button type="button" class="ghost" (click)="enrich()" [disabled]="enriching()">
            {{ enriching() ? 'Looking…' : (current().contactCheckedAt ? 'Look again' : 'Find contact info') }}
          </button>
        }
        @if (!telHref() && !current().emails.length && !current().website && !current().social.length) {
          <span class="warn">No phone, email, website or social page found yet.</span>
        }
      </div>
      @if (socialLinks().length) {
        <p class="help">Social pages come from the business's own website or a web search. Check they are the right ones before writing.</p>
      }
      @if (enrichResult(); as r) {
        <p class="help" role="status">
          @if (r.found.length) { <strong>Found: {{ r.found.join(', ') }}.</strong> } @else { <strong>Nothing new found.</strong> }
          {{ r.note }}
        </p>
      }
      @if (enrichError()) { <p class="err" role="alert">{{ enrichError() }}</p> }

      <div class="seg" role="group" aria-label="Outreach status">
        @for (s of statuses; track s.value) {
          <button type="button" class="seg-btn" [class.on]="current().status === s.value"
            [attr.aria-pressed]="current().status === s.value" (click)="setStatus(s.value)">{{ s.label }}</button>
        }
      </div>
      @if (statusError()) { <p class="err" role="alert">{{ statusError() }}</p> }

      <button type="button" class="toggle" [attr.aria-expanded]="open()" (click)="open.set(!open())">
        {{ open() ? 'Hide message' : (current().emailBody ? 'Show message' : 'Write a message') }}
      </button>

      @if (open()) {
        <div class="composer">
          <div class="composer-controls">
            <div class="seg" role="group" aria-label="Message language">
              @for (l of languages; track l.value) {
                <button type="button" class="seg-btn" [class.on]="language() === l.value" [attr.aria-label]="l.name"
                  [attr.aria-pressed]="language() === l.value" (click)="language.set(l.value)">{{ l.short }}</button>
              }
            </div>
            <div class="seg" role="group" aria-label="Message channel">
              <button type="button" class="seg-btn" [class.on]="channel() === 'email'"
                [attr.aria-pressed]="channel() === 'email'" (click)="channel.set('email')">Email</button>
              <button type="button" class="seg-btn" [class.on]="channel() === 'whatsapp'"
                [attr.aria-pressed]="channel() === 'whatsapp'" (click)="channel.set('whatsapp')">WhatsApp</button>
            </div>
            <button type="button" (click)="generate()" [disabled]="generating()">
              {{ generating() ? 'Writing…' : (current().emailBody ? 'Write again' : 'Write message') }}
            </button>
          </div>

          @if (error()) { <p class="err" role="alert">{{ error() }}</p> }

          @if (generating()) {
            <div class="skeleton-card" aria-busy="true" aria-label="Writing the message"><span></span><span></span><span></span></div>
          } @else if (current().emailBody) {
            @if (channel() === 'email') {
              <label [attr.for]="'s' + current().id">Subject
                <input [id]="'s' + current().id" dir="auto" [ngModel]="subject()" (ngModelChange)="subject.set($event)">
              </label>
            }
            <label [attr.for]="'b' + current().id">Message
              <textarea [id]="'b' + current().id" dir="auto" rows="7" [ngModel]="body()" (ngModelChange)="body.set($event)"></textarea>
            </label>
            <p class="help">Written by AI from the facts above. Read it and fix anything that is not true before sending.</p>
            <div class="actions">
              <button type="button" class="ghost" (click)="copy()">{{ copied() ? 'Copied' : 'Copy' }}</button>
              @if (channel() === 'email' && mailHref()) {
                <a class="btn" [href]="sendMail()">Open in mail app</a>
              }
              @if (channel() === 'whatsapp' && waHref()) {
                <a class="btn" [href]="waHref()" target="_blank" rel="noopener">Send on WhatsApp</a>
              }
            </div>
          } @else {
            <p class="mute">Choose a language and channel, then write the message. It takes a few seconds.</p>
          }
        </div>
      }
      }
    </article>
  `,
})
export class LeadCard {
  readonly lead = input.required<Lead>();
  readonly defaultLanguage = input<Lang>('en');
  /** Compact row that opens on click, used in long lists. */
  readonly collapsible = input(false);
  /** The business was already in the user's leads before this search found it. */
  readonly seenBefore = input(false);
  readonly changed = output<Lead>();

  private readonly api = inject(ApiService);

  protected readonly statuses: { value: LeadStatus; label: string }[] = [
    { value: 'NEW', label: 'New' }, { value: 'CONTACTED', label: 'Contacted' },
    { value: 'REPLIED', label: 'Replied' }, { value: 'NOT_INTERESTED', label: 'Not interested' },
  ];
  protected readonly languages: { value: Lang; short: string; name: string }[] = [
    { value: 'en', short: 'EN', name: 'English' }, { value: 'fr', short: 'FR', name: 'French' },
    { value: 'ar', short: 'AR', name: 'Arabic' },
  ];

  protected readonly current = linkedSignal(() => this.lead());
  protected readonly open = signal(false);
  protected readonly expanded = signal(false);
  protected readonly showBody = computed(() => !this.collapsible() || this.expanded());
  protected readonly generating = signal(false);
  protected readonly copied = signal(false);
  protected readonly error = signal('');
  protected readonly statusError = signal('');
  protected readonly enriching = signal(false);
  protected readonly enrichResult = signal<EnrichResult | null>(null);
  protected readonly enrichError = signal('');

  protected readonly language = linkedSignal<Lang>(() => this.current().draftLanguage ?? this.defaultLanguage());
  protected readonly channel = linkedSignal<Channel>(() =>
    this.current().draftChannel ?? (this.current().emails.length || !whatsappDigits(this.current().phone) ? 'email' : 'whatsapp'));
  protected readonly subject = linkedSignal(() => this.current().subject ?? '');
  protected readonly body = linkedSignal(() => this.current().emailBody ?? '');

  protected readonly fit = computed(() => {
    const s = this.current().score ?? 0;
    return s >= 8 ? { label: 'Strong fit', level: 'high' } : s >= 6 ? { label: 'Possible fit', level: 'mid' }
      : { label: 'Weak fit', level: 'low' };
  });

  protected readonly reach = computed(() => {
    const l = this.current();
    const ways = [l.phone ? 'Phone' : '', l.emails.length ? 'Email' : '', l.social.length ? 'Social' : ''].filter(Boolean);
    return ways.length ? ways.join(' + ') : 'No contact';
  });

  protected readonly socialLinks = computed(() => this.current().social.map(url => ({
    url, label: /instagram\.com/i.test(url) ? 'Instagram' : 'Facebook',
  })));

  /** Offered while something useful is still missing. */
  protected readonly canEnrich = computed(() => {
    const l = this.current();
    return !l.website || !l.emails.length || !l.phone || !l.social.length;
  });

  protected readonly statusLabel = computed(() => this.statuses.find(s => s.value === this.current().status)?.label ?? '');

  protected readonly telHref = computed(() => {
    const p = this.current().phone;
    return p ? 'tel:' + p.replace(/[^\d+]/g, '') : null;
  });

  protected readonly waHref = computed(() => {
    const d = whatsappDigits(this.current().phone);
    if (!d) return null;
    const text = this.channel() === 'whatsapp' ? this.body() : '';
    return `https://wa.me/${d}` + (text ? `?text=${encodeURIComponent(text)}` : '');
  });

  protected readonly mailHref = computed(() => {
    const to = this.current().emails[0];
    return to ? 'mailto:' + to : null;
  });

  protected sendMail(): string {
    const to = this.current().emails[0];
    return `mailto:${to}?subject=${encodeURIComponent(this.subject())}&body=${encodeURIComponent(this.body())}`;
  }

  protected setStatus(status: LeadStatus) {
    const before = this.current();
    if (before.status === status) return;
    this.statusError.set('');
    this.current.set({ ...before, status });
    this.api.setStatus(before.id, status).subscribe({
      next: l => this.changed.emit({ ...l }),
      error: () => { this.current.set(before); this.statusError.set('Could not save the status. Try again.'); },
    });
  }

  protected generate() {
    this.generating.set(true);
    this.error.set('');
    this.api.draft(this.current().id, this.language(), this.channel()).subscribe({
      next: l => { this.current.set(l); this.generating.set(false); this.changed.emit(l); },
      error: e => {
        this.generating.set(false);
        this.error.set(e.status === 429 ? 'You have used all messages for today. The limit frees up gradually over 24 hours.'
          : e.status === 502 ? 'The AI could not write this message. Try again in a moment.'
          : 'Something went wrong. Try again.');
      },
    });
  }

  protected enrich() {
    this.enriching.set(true);
    this.enrichError.set('');
    this.api.enrich(this.current().id).subscribe({
      next: r => {
        this.current.set(r.lead);
        this.enrichResult.set(r);
        this.enriching.set(false);
        this.changed.emit(r.lead);
      },
      error: e => {
        this.enriching.set(false);
        this.enrichError.set(e.status === 429 ? 'You have used all contact lookups for today. The limit frees up gradually over 24 hours.'
          : 'The lookup could not run. Check that n8n is running and try again.');
      },
    });
  }

  protected copy() {
    const text = this.channel() === 'email' && this.subject() ? this.subject() + '\n\n' + this.body() : this.body();
    navigator.clipboard.writeText(text).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }
}
