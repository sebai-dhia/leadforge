import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { AreaPipe } from '../../../shared/pipes/area.pipe';
import { FormsModule } from '@angular/forms';
import { ApiService, Channel, EnrichResult, Lang, Lead, LeadStatus, Approach } from '../../../core/api.service';
import { AuthService } from '../../../core/auth.service';
import { I18n, I18nKey } from '../../../i18n/i18n';
import { Toasts } from '../../../shared/toast/toast';

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
  templateUrl: './lead-card.html',
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
  protected readonly signalKey = { gap: 'leads.signal.gap', pain: 'leads.signal.pain', neglect: 'leads.signal.neglect', momentum: 'leads.signal.momentum' } as const;
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
  protected readonly approaches: Approach[] = ['auto', 'missing', 'success', 'fresh', 'timing', 'tip', 'curiosity'];
  protected readonly approachKey = { auto: 'card.approach.auto', missing: 'card.approach.missing', success: 'card.approach.success', fresh: 'card.approach.fresh', timing: 'card.approach.timing', tip: 'card.approach.tip', curiosity: 'card.approach.curiosity' } as const;
  protected readonly approach = signal<Approach>('auto');
  protected readonly approachHint = { auto: 'card.approachHint.auto', missing: 'card.approachHint.missing', success: 'card.approachHint.success', fresh: 'card.approachHint.fresh', timing: 'card.approachHint.timing', tip: 'card.approachHint.tip', curiosity: 'card.approachHint.curiosity' } as const;
  /** Open while there is no message yet; after that it folds away until the person asks for it. */
  private readonly settingsToggled = signal<boolean | null>(null);
  protected readonly showSettings = computed(() => this.settingsToggled() ?? !this.current().emailBody);
  protected toggleSettings() { this.settingsToggled.set(!this.showSettings()); }
  protected readonly summary = computed(() => {
    const lang = this.languages.find(l => l.value === this.language())?.short ?? '';
    const ch = this.t(this.channel() === 'email' ? 'channel.email' : 'channel.whatsapp');
    return [lang, ch, this.t(this.approachKey[this.approach()]), this.note().trim() ? '+' : ''].filter(Boolean).join(' · ');
  });
  protected readonly note = signal('');
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

  /** After a few seconds the person is told why it takes a while, instead of staring at a skeleton. */
  protected readonly slowWrite = signal(false);
  private slowTimer?: ReturnType<typeof setTimeout>;

  protected generate() {
    this.slowWrite.set(false);
    clearTimeout(this.slowTimer);
    this.slowTimer = setTimeout(() => this.slowWrite.set(true), 12000);
    this.generating.set(true);
    this.error.set(null);
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    this.api.draft(this.current().id, this.language(), this.channel(), this.approach(), this.note()).subscribe({
      next: l => { clearTimeout(this.slowTimer); this.slowWrite.set(false); this.current.set(l); this.generating.set(false); this.saveState.set('idle'); this.changed.emit(l); },
      error: e => {
        this.generating.set(false);
        clearTimeout(this.slowTimer); this.slowWrite.set(false);
        this.error.set(e.status === 429 ? 'card.errMsgLimit' : e.status === 503 ? 'card.errMsgBusy' : e.status === 502 ? 'card.errMsgAi' : 'card.errOther');
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
