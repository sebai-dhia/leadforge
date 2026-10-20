import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { AreaPipe } from './area.pipe';
import { FormsModule } from '@angular/forms';
import { ApiService, Channel, EnrichResult, Lang, Lead, LeadStatus } from './api.service';
import { AuthService } from './auth.service';
import { I18n, I18nKey } from './i18n';
import { Toasts } from './toast';

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
  imports: [AreaPipe, FormsModule, NgTemplateOutlet],
  host: { '(document:click)': 'menuOpen.set(false)' },
  template: `
    <article class="card lead" [class.dim]="current().status === 'NOT_INTERESTED' || current().hidden" [class.compact]="collapsible()" [class.open]="showBody()">
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
            @if (!expanded()) {
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
            }
            <span class="pill" [attr.data-status]="current().hidden ? 'HIDDEN' : current().status">{{ current().hidden ? t('card.hiddenPill') : t(statusKey()) }}</span>
            <ng-container *ngTemplateOutlet="menu" />
            <button type="button" class="chev-btn" [attr.aria-expanded]="expanded()" [attr.aria-label]="t('card.details', { name: current().name })"
              (click)="expanded.set(!expanded())"><span class="chev" [class.open]="expanded()" aria-hidden="true"></span></button>
          </div>
        </div>
      } @else {
        <div class="row">
          <h3 dir="auto">{{ current().name }}</h3>
          <span class="head-end">
            <span class="fit" [attr.data-level]="fit().level" [title]="t('card.scoreTitle', { s: current().score ?? 0 })">
              {{ t(fit().key) }} <span class="num">{{ current().score }}/10</span>
            </span>
            <ng-container *ngTemplateOutlet="menu" />
          </span>
        </div>
        @if (seenBefore()) { <span class="tag">{{ t('card.alreadyIn') }}</span> }
      }

      @if (showBody()) {
      @if (current().hidden) {
        <div class="hidden-note" role="status">
          <span>{{ t('card.hiddenNote') }}</span>
          <button type="button" class="ghost" (click)="setHidden(false)" [disabled]="busy()">{{ t('card.restoreLead') }}</button>
        </div>
      }

      <p class="mute meta">
        <bdi>{{ current().address }}</bdi>
        @if (current().rating) { · {{ t('card.rated', { r: current().rating ?? 0, n: current().reviews ?? 0 }) }} }
      </p>

      @if (why(); as w) {
        <section class="why" [attr.aria-label]="t('card.whyAria')">
          @if (w.kind) { <span class="why-kind">{{ w.kind }}</span> }
          <div class="rtags">
            @for (tag of w.tags; track tag.text) { <span class="rtag" [attr.data-level]="tag.level">{{ tag.text }}</span> }
            @if (w.ai) {
              <span class="rtag ai-tag" [title]="t('card.aiNote')">
                <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/></svg>
                <span class="sr-only">{{ t('card.aiBadge') }}: </span>{{ w.ai }}
              </span>
            }
          </div>
        </section>
      }

      <div class="contacts" [attr.aria-label]="t('card.contactAria')">
        @if (telHref(); as tel) {
          <a class="btn ghost" [href]="tel" (click)="reached()">
            <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>
            {{ t('card.call', { phone: current().phone ?? '' }) }}</a>
        }
        @if (waHref(); as wa) {
          <a class="btn ghost" [href]="wa" target="_blank" rel="noopener" (click)="reached()">
            <svg class="ic wa" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            {{ t('card.whatsapp') }}</a>
        }
        @if (mailHref(); as mail) {
          <a class="btn ghost" [href]="mail" (click)="reached()">
            <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>
            {{ t('card.email', { email: current().emails[0] }) }}</a>
        }
        @if (current().website; as site) {
          <a class="btn ghost" [href]="site" target="_blank" rel="noopener">
            <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            {{ t('card.website') }}</a>
        }
        @for (s of socialLinks(); track s.url) {
          <a class="btn ghost" [href]="s.url" target="_blank" rel="noopener" [title]="t('card.socialNote')">
            @if (s.label === 'Instagram') {
              <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><path d="M17.5 6.5h.01"/></svg>
            } @else {
              <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
            }
            {{ s.label }}</a>
        }
        @if (canEnrich()) {
          <button type="button" class="ghost quiet" (click)="enrich()" [disabled]="enriching()">
            <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>
            {{ enriching() ? t('card.looking') : (current().contactCheckedAt ? t('card.lookAgain') : t('card.findContact')) }}
          </button>
        }
        @if (!telHref() && !current().emails.length && !current().website && !current().social.length) {
          <span class="warn">{{ t('card.noneFound') }}</span>
        }
      </div>
      @if (enrichResult(); as r) {
        <p class="help" role="status">
          @if (r.found.length) { <strong>{{ t('card.found', { list: foundList(r.found) }) }}</strong> } @else { <strong>{{ t('card.nothingNew') }}</strong> }
          {{ i18n.note(r.note) }}
        </p>
      }
      @if (enrichError(); as e) { <p class="err" role="alert">{{ t(e) }}</p> }

      <div class="field-row">
        <span class="sec-label" [id]="'st' + current().id">{{ t('card.statusLabel') }}</span>
        <div class="seg" role="group" [attr.aria-labelledby]="'st' + current().id">
          @for (s of statuses; track s.value) {
            <button type="button" class="seg-btn" [class.on]="current().status === s.value"
              [attr.aria-pressed]="current().status === s.value" (click)="setStatus(s.value)">{{ t(s.key) }}</button>
          }
        </div>
      </div>
      @if (sentAsk() && current().status === 'NEW') {
        <div class="sent" role="status">
          <span>{{ t('card.sentAsk') }}</span>
          <button type="button" (click)="markContacted()">{{ t('card.markContacted') }}</button>
          <button type="button" class="ghost" (click)="sentAsk.set(false)">{{ t('card.notNow') }}</button>
        </div>
      }
      @if (statusError(); as e) { <p class="err" role="alert">{{ t(e) }}</p> }
      @if (actionError(); as e) { <p class="err" role="alert">{{ t(e) }}</p> }

      <button type="button" class="msg-toggle" [attr.aria-expanded]="open()" (click)="open.set(!open())">
        <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span class="msg-title">{{ open() ? t('card.hide') : (current().emailBody ? t('card.show') : t('card.write')) }}</span>
        @if (current().emailBody && current().draftLanguage) {
          <span class="msg-meta">{{ current().draftLanguage?.toUpperCase() }} · {{ t(current().draftChannel === 'whatsapp' ? 'channel.whatsapp' : 'channel.email') }}</span>
        }
        <span class="chev" [class.open]="open()" aria-hidden="true"></span>
      </button>

      @if (open()) {
        <div class="composer">
          <div class="composer-controls">
            <div class="ctl">
              <span class="ctl-label">{{ t('card.langAria') }}</span>
              <div class="seg" role="group" [attr.aria-label]="t('card.langAria')">
                @for (l of languages; track l.value) {
                  <button type="button" class="seg-btn" [class.on]="language() === l.value" [attr.aria-label]="t(l.nameKey)"
                    [attr.aria-pressed]="language() === l.value" (click)="language.set(l.value)">{{ l.short }}</button>
                }
              </div>
            </div>
            <div class="ctl">
              <span class="ctl-label">{{ t('card.channelAria') }}</span>
              <div class="seg" role="group" [attr.aria-label]="t('card.channelAria')">
                <button type="button" class="seg-btn" [class.on]="channel() === 'email'"
                  [attr.aria-pressed]="channel() === 'email'" (click)="channel.set('email')">{{ t('channel.email') }}</button>
                <button type="button" class="seg-btn" [class.on]="channel() === 'whatsapp'"
                  [attr.aria-pressed]="channel() === 'whatsapp'" (click)="channel.set('whatsapp')">{{ t('channel.whatsapp') }}</button>
              </div>
            </div>
            <button type="button" class="write-btn" [class.ghost]="!!current().emailBody" [class.quiet]="!!current().emailBody" (click)="generate()" [disabled]="generating()" [attr.aria-busy]="generating()">
              @if (generating()) {
                <svg class="ic spin" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.2-8.55"/></svg>
              } @else if (current().emailBody) {
                <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>
              } @else {
                <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              }
              {{ generating() ? t('card.writing') : (current().emailBody ? t('card.writeAgain') : t('card.writeBtn')) }}
            </button>
          </div>

          @if (error(); as e) { <p class="err" role="alert">{{ t(e) }}</p> }

          @if (generating()) {
            <div class="skeleton-card" aria-busy="true" [attr.aria-label]="t('card.writingAria')"><span></span><span></span><span></span></div>
          } @else if (current().emailBody) {
            <p class="to">
              <span class="to-label">{{ t('card.to') }}</span>
              @if (recipient(); as r) { <bdi class="to-who">{{ r }}</bdi> } @else { <span class="warn">{{ t(channel() === 'email' ? 'card.noEmailTo' : 'card.noPhoneTo') }}</span> }
            </p>
            @if (channel() === 'email') {
              <label [attr.for]="'s' + current().id">{{ t('card.subject') }}
                <input [id]="'s' + current().id" dir="auto" [ngModel]="subject()" (ngModelChange)="subject.set($event); onEdit()" (blur)="saveNow()">
              </label>
            }
            <label [attr.for]="'b' + current().id">{{ t('card.message') }}
              <textarea [id]="'b' + current().id" dir="auto" [attr.rows]="rows()" [ngModel]="body()" (ngModelChange)="body.set($event); onEdit()" (blur)="saveNow()"></textarea>
            </label>
            <div class="msg-foot">
              <p class="ai-note"><span class="ai-badge">{{ t('card.aiBadge') }}</span> {{ t('card.aiNote') }}</p>
              <span class="save-state" role="status" [attr.data-state]="saveState()">
                @switch (saveState()) {
                  @case ('saving') { {{ t('card.saving') }} }
                  @case ('saved') { <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg> {{ t('card.saved') }} }
                  @case ('error') { {{ t('card.saveErr') }} }
                }
              </span>
            </div>
            <div class="actions">
              <button type="button" class="ghost" (click)="copy()">
                <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
                  @if (copied()) { <path d="M20 6 9 17l-5-5"/> } @else { <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/> }
                </svg>
                {{ copied() ? t('card.copied') : t('card.copy') }}</button>
              @if (channel() === 'email' && mailHref()) {
                <a class="btn" [href]="sendMail()" (click)="reached()">
                  <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                  {{ t('card.openMail') }}</a>
              }
              @if (channel() === 'whatsapp' && waHref()) {
                <a class="btn" [href]="waHref()" target="_blank" rel="noopener" (click)="reached()">
                  <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                  {{ t('card.sendWa') }}</a>
              }
            </div>
          } @else {
            <p class="mute">{{ t('card.chooseHint') }}</p>
          }
        </div>
      }
      }
    </article>

    <ng-template #menu>
      <span class="menu-wrap" (keydown.escape)="menuOpen.set(false)">
        <button type="button" class="menu-btn" aria-haspopup="menu" [attr.aria-expanded]="menuOpen()" [attr.aria-label]="t('card.more')"
          (click)="toggleMenu($event)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
        </button>
        @if (menuOpen()) {
          <div class="menu" role="menu">
            @if (current().emailBody) {
              <button type="button" role="menuitem" (click)="clearMessage()">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
                {{ t('card.clearMessage') }}</button>
            }
            @if (current().hidden) {
              <button type="button" role="menuitem" (click)="setHidden(false)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                {{ t('card.restoreLead') }}</button>
            } @else {
              <button type="button" role="menuitem" class="danger" (click)="setHidden(true)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>
                {{ t('card.hideLead') }}</button>
            }
          </div>
        }
      </span>
    </ng-template>
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
  private readonly toasts = inject(Toasts);
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
  protected readonly menuOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly generating = signal(false);
  protected readonly copied = signal(false);
  protected readonly error = signal<I18nKey | null>(null);
  protected readonly statusError = signal<I18nKey | null>(null);
  protected readonly actionError = signal<I18nKey | null>(null);
  protected readonly enriching = signal(false);
  protected readonly enrichResult = signal<EnrichResult | null>(null);
  protected readonly enrichError = signal<I18nKey | null>(null);
  /** After the person reached out, offer to move the lead on to "Contacted". */
  protected readonly sentAsk = signal(false);
  protected readonly saveState = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  private saveTimer?: ReturnType<typeof setTimeout>;

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

  /** The reason as a kind of business, one tag per fact and the AI sentence apart. */
  protected readonly why = computed(() => {
    const p = this.i18n.reasonParts(this.current().reason);
    return p.kind || p.tags.length || p.ai ? p : null;
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

  /** Who the message goes to, for the channel that is selected. */
  protected readonly recipient = computed(() =>
    this.channel() === 'email' ? (this.current().emails[0] ?? null) : (whatsappDigits(this.current().phone) ? this.current().phone : null));

  protected readonly rows = computed(() => {
    const b = this.body();
    return Math.max(5, Math.min(14, b.split('\n').length + Math.floor(b.length / 70)));
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.saveTimer) this.saveNow();
    });
  }

  protected sendMail(): string {
    const to = this.current().emails[0];
    return `mailto:${to}?subject=${encodeURIComponent(this.subject())}&body=${encodeURIComponent(this.body())}`;
  }

  protected setStatus(status: LeadStatus) {
    const before = this.current();
    if (before.status === status) return;
    this.statusError.set(null);
    this.sentAsk.set(false);
    this.current.set({ ...before, status });
    this.api.setStatus(before.id, status).subscribe({
      next: l => this.changed.emit({ ...l }),
      error: () => { this.current.set(before); this.statusError.set('card.errStatus'); },
    });
  }

  /** The person just called, wrote or opened a message: offer to mark the lead as contacted. */
  protected reached() {
    if (this.current().status === 'NEW') this.sentAsk.set(true);
  }

  protected markContacted() {
    this.sentAsk.set(false);
    this.setStatus('CONTACTED');
  }

  protected toggleMenu(event: Event) {
    event.stopPropagation();
    this.menuOpen.update(v => !v);
  }

  protected setHidden(hidden: boolean) {
    this.menuOpen.set(false);
    this.actionError.set(null);
    this.busy.set(true);
    this.api.setHidden(this.current().id, hidden).subscribe({
      next: l => { this.busy.set(false); this.current.set(l); this.changed.emit({ ...l }); },
      error: () => { this.busy.set(false); this.actionError.set('card.errAction'); },
    });
  }

  protected clearMessage() {
    this.menuOpen.set(false);
    this.actionError.set(null);
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    this.api.clearMessage(this.current().id).subscribe({
      next: l => {
        this.current.set(l);
        this.open.set(false);
        this.saveState.set('idle');
        this.changed.emit({ ...l });
        this.toasts.show(this.t('card.msgCleared'));
      },
      error: () => this.actionError.set('card.errAction'),
    });
  }

  protected generate() {
    this.generating.set(true);
    this.error.set(null);
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    this.api.draft(this.current().id, this.language(), this.channel()).subscribe({
      next: l => { this.current.set(l); this.generating.set(false); this.saveState.set('idle'); this.changed.emit(l); },
      error: e => {
        this.generating.set(false);
        this.error.set(e.status === 429 ? 'card.errMsgLimit' : e.status === 502 ? 'card.errMsgAi' : 'card.errOther');
      },
    });
  }

  /** The person edits the message: save it a moment after they stop typing, and when they leave the field. */
  protected onEdit() {
    clearTimeout(this.saveTimer);
    this.saveState.set('idle');
    this.saveTimer = setTimeout(() => this.saveNow(), 1200);
  }

  protected saveNow() {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    const cur = this.current();
    const subject = this.subject();
    const body = this.body();
    if (!body.trim() || (body === (cur.emailBody ?? '') && subject === (cur.subject ?? ''))) return;
    this.saveState.set('saving');
    this.api.saveMessage(cur.id, subject, body).subscribe({
      next: l => {
        // typed more in the meantime: the next save carries it, and the field must not be reset under the cursor
        if (this.subject() !== subject || this.body() !== body) { this.saveState.set('idle'); return; }
        this.current.set(l);
        this.saveState.set('saved');
        this.changed.emit({ ...l });
      },
      error: () => this.saveState.set('error'),
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
