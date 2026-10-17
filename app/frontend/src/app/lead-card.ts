import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { AreaPipe } from './area.pipe';
import { FormsModule } from '@angular/forms';
import { ApiService, Channel, EnrichResult, Lang, Lead, LeadStatus } from './api.service';
import { AuthService } from './auth.service';
import { I18n, I18nKey } from './i18n';

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
  imports: [AreaPipe, FormsModule],
  template: `
    <article class="card lead" [class.dim]="current().status === 'NOT_INTERESTED'" [class.compact]="collapsible()">
      @if (collapsible()) {
        <div class="lead-row">
          <button type="button" class="lead-main" [attr.aria-expanded]="expanded()" (click)="expanded.set(!expanded())">
            <span class="ring" [attr.data-level]="fit().level" [style.--p]="(current().score ?? 0) * 10"
              [title]="t(fit().key) + ' · ' + t('card.scoreTitle', { s: current().score ?? 0 })"><span class="num">{{ current().score }}</span></span>
            <span class="lead-title">
              <bdi class="lead-name">{{ current().name }}</bdi>
              @if (current().niche) { <span class="mute">{{ i18n.niche(current().niche) }} · {{ current().city | area }}</span> }
            </span>
          </button>
          <div class="lead-actions">
            @if (telHref(); as tel) {
              <a class="qa" [href]="tel" [attr.aria-label]="t('card.call', { phone: current().phone ?? '' })" [title]="current().phone ?? ''">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>
              </a>
            }
            @if (waHref(); as wa) {
              <a class="qa" [href]="wa" target="_blank" rel="noopener" [attr.aria-label]="t('card.whatsapp')" [title]="t('card.whatsapp')">
                <svg class="wa" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              </a>
            }
            @if (mailHref(); as mail) {
              <a class="qa" [href]="mail" [attr.aria-label]="t('card.email', { email: current().emails[0] })" [title]="current().emails[0]">
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>
              </a>
            }
            @if (!reach().length) { <span class="reach none">{{ t('reach.none') }}</span> }
            <span class="pill" [attr.data-status]="current().status">{{ t(statusKey()) }}</span>
            <button type="button" class="chev-btn" [attr.aria-expanded]="expanded()" [attr.aria-label]="t('card.details', { name: current().name })"
              (click)="expanded.set(!expanded())"><span class="chev" [class.open]="expanded()" aria-hidden="true"></span></button>
          </div>
        </div>
      } @else {
        <div class="row">
          <h3 dir="auto">{{ current().name }}</h3>
          <span class="fit" [attr.data-level]="fit().level" [title]="t('card.scoreTitle', { s: current().score ?? 0 })">
            {{ t(fit().key) }} <span class="num">{{ current().score }}/10</span>
          </span>
        </div>
        @if (seenBefore()) { <span class="tag">{{ t('card.alreadyIn') }}</span> }
      }

      @if (showBody()) {
      <p class="mute">
        <bdi>{{ current().address }}</bdi>
        @if (!current().website) { · {{ t('card.noWebsite') }} }
        @if (current().rating) { · {{ t('card.rated', { r: current().rating ?? 0, n: current().reviews ?? 0 }) }} }
      </p>
      <p>{{ i18n.reason(current().reason) }}</p>

      <div class="contacts" [attr.aria-label]="t('card.contactAria')">
        @if (telHref(); as tel) {
          <a class="btn ghost" [href]="tel">{{ t('card.call', { phone: current().phone ?? '' }) }}</a>
        }
        @if (waHref(); as wa) {
          <a class="btn ghost" [href]="wa" target="_blank" rel="noopener">{{ t('card.whatsapp') }}</a>
        }
        @if (mailHref(); as mail) {
          <a class="btn ghost" [href]="mail">{{ t('card.email', { email: current().emails[0] }) }}</a>
        }
        @if (current().website; as site) {
          <a class="btn ghost" [href]="site" target="_blank" rel="noopener">{{ t('card.website') }}</a>
        }
        @for (s of socialLinks(); track s.url) {
          <a class="btn ghost" [href]="s.url" target="_blank" rel="noopener">{{ s.label }}</a>
        }
        @if (canEnrich()) {
          <button type="button" class="ghost" (click)="enrich()" [disabled]="enriching()">
            {{ enriching() ? t('card.looking') : (current().contactCheckedAt ? t('card.lookAgain') : t('card.findContact')) }}
          </button>
        }
        @if (!telHref() && !current().emails.length && !current().website && !current().social.length) {
          <span class="warn">{{ t('card.noneFound') }}</span>
        }
      </div>
      @if (socialLinks().length) {
        <p class="help">{{ t('card.socialNote') }}</p>
      }
      @if (enrichResult(); as r) {
        <p class="help" role="status">
          @if (r.found.length) { <strong>{{ t('card.found', { list: foundList(r.found) }) }}</strong> } @else { <strong>{{ t('card.nothingNew') }}</strong> }
          {{ i18n.note(r.note) }}
        </p>
      }
      @if (enrichError(); as e) { <p class="err" role="alert">{{ t(e) }}</p> }

      <div class="seg" role="group" [attr.aria-label]="t('card.outreachAria')">
        @for (s of statuses; track s.value) {
          <button type="button" class="seg-btn" [class.on]="current().status === s.value"
            [attr.aria-pressed]="current().status === s.value" (click)="setStatus(s.value)">{{ t(s.key) }}</button>
        }
      </div>
      @if (statusError(); as e) { <p class="err" role="alert">{{ t(e) }}</p> }

      <button type="button" class="toggle" [attr.aria-expanded]="open()" (click)="open.set(!open())">
        {{ open() ? t('card.hide') : (current().emailBody ? t('card.show') : t('card.write')) }}
      </button>

      @if (open()) {
        <div class="composer">
          <div class="composer-controls">
            <div class="seg" role="group" [attr.aria-label]="t('card.langAria')">
              @for (l of languages; track l.value) {
                <button type="button" class="seg-btn" [class.on]="language() === l.value" [attr.aria-label]="t(l.nameKey)"
                  [attr.aria-pressed]="language() === l.value" (click)="language.set(l.value)">{{ l.short }}</button>
              }
            </div>
            <div class="seg" role="group" [attr.aria-label]="t('card.channelAria')">
              <button type="button" class="seg-btn" [class.on]="channel() === 'email'"
                [attr.aria-pressed]="channel() === 'email'" (click)="channel.set('email')">{{ t('channel.email') }}</button>
              <button type="button" class="seg-btn" [class.on]="channel() === 'whatsapp'"
                [attr.aria-pressed]="channel() === 'whatsapp'" (click)="channel.set('whatsapp')">{{ t('channel.whatsapp') }}</button>
            </div>
            <button type="button" (click)="generate()" [disabled]="generating()">
              {{ generating() ? t('card.writing') : (current().emailBody ? t('card.writeAgain') : t('card.writeBtn')) }}
            </button>
          </div>

          @if (error(); as e) { <p class="err" role="alert">{{ t(e) }}</p> }

          @if (generating()) {
            <div class="skeleton-card" aria-busy="true" [attr.aria-label]="t('card.writingAria')"><span></span><span></span><span></span></div>
          } @else if (current().emailBody) {
            @if (channel() === 'email') {
              <label [attr.for]="'s' + current().id">{{ t('card.subject') }}
                <input [id]="'s' + current().id" dir="auto" [ngModel]="subject()" (ngModelChange)="subject.set($event)">
              </label>
            }
            <label [attr.for]="'b' + current().id">{{ t('card.message') }}
              <textarea [id]="'b' + current().id" dir="auto" rows="7" [ngModel]="body()" (ngModelChange)="body.set($event)"></textarea>
            </label>
            <p class="help">{{ t('card.aiNote') }}</p>
            <div class="actions">
              <button type="button" class="ghost" (click)="copy()">{{ copied() ? t('card.copied') : t('card.copy') }}</button>
              @if (channel() === 'email' && mailHref()) {
                <a class="btn" [href]="sendMail()">{{ t('card.openMail') }}</a>
              }
              @if (channel() === 'whatsapp' && waHref()) {
                <a class="btn" [href]="waHref()" target="_blank" rel="noopener">{{ t('card.sendWa') }}</a>
              }
            </div>
          } @else {
            <p class="mute">{{ t('card.chooseHint') }}</p>
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
  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly statuses: { value: LeadStatus; key: I18nKey }[] = [
    { value: 'NEW', key: 'status.new' }, { value: 'CONTACTED', key: 'status.contacted' },
    { value: 'REPLIED', key: 'status.replied' }, { value: 'NOT_INTERESTED', key: 'status.notInterested' },
  ];
  protected readonly languages: { value: Lang; short: string; nameKey: I18nKey }[] = [
    { value: 'en', short: 'EN', nameKey: 'lang.en' }, { value: 'fr', short: 'FR', nameKey: 'lang.fr' },
    { value: 'ar', short: 'AR', nameKey: 'lang.ar' },
  ];

  protected readonly current = linkedSignal(() => this.lead());
  protected readonly open = signal(false);
  protected readonly expanded = signal(false);
  protected readonly showBody = computed(() => !this.collapsible() || this.expanded());
  protected readonly generating = signal(false);
  protected readonly copied = signal(false);
  protected readonly error = signal<I18nKey | null>(null);
  protected readonly statusError = signal<I18nKey | null>(null);
  protected readonly enriching = signal(false);
  protected readonly enrichResult = signal<EnrichResult | null>(null);
  protected readonly enrichError = signal<I18nKey | null>(null);

  /** A guest cannot set a message language, so drafts follow the language of the interface. */
  protected readonly language = linkedSignal<Lang>(() =>
    this.current().draftLanguage ?? (this.auth.isGuest() ? this.i18n.lang() : this.defaultLanguage()));
  protected readonly channel = linkedSignal<Channel>(() =>
    this.current().draftChannel ?? (this.current().emails.length || !whatsappDigits(this.current().phone) ? 'email' : 'whatsapp'));
  protected readonly subject = linkedSignal(() => this.current().subject ?? '');
  protected readonly body = linkedSignal(() => this.current().emailBody ?? '');

  protected readonly fit = computed(() => {
    const s = this.current().score ?? 0;
    return s >= 8 ? { key: 'fit.strong' as I18nKey, level: 'high' } : s >= 6 ? { key: 'fit.possible' as I18nKey, level: 'mid' }
      : { key: 'fit.weak' as I18nKey, level: 'low' };
  });

  protected readonly reach = computed(() => {
    const l = this.current();
    return [l.phone ? this.t('reach.phone') : '', l.emails.length ? this.t('reach.email') : '', l.social.length ? this.t('reach.social') : ''].filter(Boolean);
  });

  protected readonly socialLinks = computed(() => this.current().social.map(url => ({
    url, label: /instagram\.com/i.test(url) ? 'Instagram' : 'Facebook',
  })));

  /** Offered while something useful is still missing. */
  protected readonly canEnrich = computed(() => {
    const l = this.current();
    return !l.website || !l.emails.length || !l.phone || !l.social.length;
  });

  protected readonly statusKey = computed(() => (this.statuses.find(s => s.value === this.current().status)?.key ?? 'status.new') as I18nKey);
  protected foundList(found: string[]) { return found.map(w => this.i18n.found(w)).join(', '); }

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
    this.statusError.set(null);
    this.current.set({ ...before, status });
    this.api.setStatus(before.id, status).subscribe({
      next: l => this.changed.emit({ ...l }),
      error: () => { this.current.set(before); this.statusError.set('card.errStatus'); },
    });
  }

  protected generate() {
    this.generating.set(true);
    this.error.set(null);
    this.api.draft(this.current().id, this.language(), this.channel()).subscribe({
      next: l => { this.current.set(l); this.generating.set(false); this.changed.emit(l); },
      error: e => {
        this.generating.set(false);
        this.error.set(e.status === 429 ? 'card.errMsgLimit' : e.status === 502 ? 'card.errMsgAi' : 'card.errOther');
      },
    });
  }

  protected enrich() {
    this.enriching.set(true);
    this.enrichError.set(null);
    this.api.enrich(this.current().id).subscribe({
      next: r => {
        this.current.set(r.lead);
        this.enrichResult.set(r);
        this.enriching.set(false);
        this.changed.emit(r.lead);
      },
      error: e => {
        this.enriching.set(false);
        this.enrichError.set(e.status === 429 ? 'card.errLookLimit' : 'card.errLookRun');
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
