import { Component, computed, inject, input, output, signal } from '@angular/core';
import { AdminOverview as Overview, ApiProvider, UsageKind } from '../../../core/api.service';
import { DayBars } from '../../../shared/day-bars/day-bars';
import { I18n, I18nKey } from '../../../i18n/i18n';
import { KINDS, ROLES, Tab, roleKey } from '../admin-model';

type ApiMetric = 'tokens' | 'gemini' | 'serper' | 'geoapify';

interface Kpi {
  id: string; label: string; value: string; dim: boolean;
  /** Two small figures under the number, each with a caption saying what it counts; up = a real increase. */
  stats: { caption: string; value: string; up?: boolean }[];
  /** A small tag at the top right of the tile: the period the big number covers. */
  tag?: string;
  /** Shown instead of the figures when there is nothing to count yet. */
  note?: string;
}

/** go and goLabel are missing when the alert has nothing to open (a service that must be fixed in n8n). */
interface Alert { id: string; text: string; go?: Tab; goLabel?: I18nKey; bad: boolean; }

/** The overview tab: the tiles, what needs attention, use per day, and what the outside services were used for. */
@Component({
  selector: 'app-admin-overview',
  imports: [DayBars],
  templateUrl: './admin-overview.html',
  styleUrl: './admin-overview.scss',
})
export class AdminOverviewTab {
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  readonly overview = input<Overview | null>(null);
  /** The skeleton is only drawn while nothing failed. */
  readonly error = input(false);
  /** Asks the page to open another tab (an alert points at it). */
  readonly navigate = output<Tab>();

  protected readonly kinds = KINDS;
  protected readonly roleKey = roleKey;
  protected readonly kind = signal<UsageKind>('search');
  protected readonly kindLabel = computed(() => KINDS.find(k => k.kind === this.kind())!.label);

  /** One row per kind of use: what was used in the last 24 hours against the cap for everyone. */
  protected readonly usageRows = computed(() => {
    const o = this.overview();
    if (!o) return [];
    return KINDS.map(k => {
      const u = o.usage24h[k.kind];
      return { kind: k.kind, label: k.label, used: u.used, refunded: u.refunded, cap: u.cap,
        pct: u.cap > 0 ? Math.min(100, (u.used / u.cap) * 100) : 0, hot: u.cap > 0 && u.used >= u.cap * 0.9 };
    });
  });

  private numberFormat() { return new Intl.NumberFormat(this.i18n.lang() === 'fr' ? 'fr-FR' : 'en-US'); }
  /** 1 234 567 written in the language of the page. */
  protected readonly num = (n: number): string => this.numberFormat().format(n);
  /** 12.4k, 3.1M: for numbers that would not fit on a tile or a grid line. */
  protected readonly compact = (n: number): string =>
    new Intl.NumberFormat(this.i18n.lang() === 'fr' ? 'fr-FR' : 'en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  protected readonly dayTip = (day: string, n: number): string => this.t('admin.dayTip', { day, n, kind: this.t(this.kindLabel()).toLowerCase() });
  protected readonly apiTip = (day: string, n: number): string => this.t('admin.dayTip', { day, n: this.num(n), kind: this.t(this.apiMetricLabel()) });

  protected readonly apiMetrics: { id: ApiMetric; label: I18nKey }[] = [
    { id: 'tokens', label: 'admin.mTokens' },
    { id: 'gemini', label: 'admin.mGemini' },
    { id: 'serper', label: 'admin.mSerper' },
    { id: 'geoapify', label: 'admin.mGeoapify' },
  ];
  protected readonly apiMetric = signal<ApiMetric>('tokens');
  protected readonly apiMetricLabel = computed(() => this.apiMetrics.find(m => m.id === this.apiMetric())!.label);

  /** One bar per day of the metric that is selected. */
  protected readonly apiChart = computed(() => {
    const m = this.apiMetric();
    const rows = this.overview()?.api.daily ?? [];
    const value = (d: (typeof rows)[number]) => (m === 'tokens' ? d.geminiTokens : d[m]);
    const max = Math.max(0, ...rows.map(value));
    const peak = rows.find(d => value(d) === max);
    return {
      max,
      total: rows.reduce((s, d) => s + value(d), 0),
      peakDay: peak ? this.dayLabel(peak.day) : '',
      days: rows.map(d => ({ label: this.dayLabel(d.day), n: value(d) })),
    };
  });

  /** The four tiles at the top: who, how many are active, and what the outside services were used for. */
  protected readonly kpis = computed<Kpi[]>(() => {
    const o = this.overview();
    if (!o) return [];
    const a = o.active;
    const api = o.api;
    const tokens = api.gemini.inputTokens24h + api.gemini.outputTokens24h;
    const requests = api.serper.calls24h + api.geoapify.calls24h;
    const dash = '–';
    const sign = (n: number) => (n > 0 ? '+' : '') + n;
    return [
      { id: 'registered', label: this.t('admin.tileRegistered'), value: this.num(a.registered), dim: false,
        stats: [
          { caption: this.t('admin.stNew30'), value: sign(a.registeredNew30d), up: a.registeredNew30d > 0 },
          { caption: this.t('admin.stGuests'), value: this.num(a.guests) },
        ] },
      { id: 'active', label: this.t('admin.tileActive'), value: this.num(a.last24h), dim: false,
        tag: this.t('admin.tagDay'),
        stats: [
          { caption: this.t('admin.stOnline'), value: this.num(a.now) },
          { caption: this.t('admin.stWeek'), value: this.num(a.last7d) },
        ] },
      { id: 'tokens', label: this.t('admin.tileTokens'), value: api.tracked ? this.compact(tokens) : dash, dim: !api.tracked,
        stats: api.tracked ? [
          { caption: this.t('admin.stAiRequests'), value: this.num(api.gemini.calls24h) },
          { caption: this.t('admin.stMonth'), value: this.compact(api.gemini.inputTokens30d + api.gemini.outputTokens30d) },
        ] : [], tag: api.tracked ? this.t('admin.tagDay') : undefined, note: this.t('admin.notTracked') },
      { id: 'requests', label: this.t('admin.tileRequests'), value: api.tracked ? this.num(requests) : dash, dim: !api.tracked,
        stats: api.tracked ? [
          { caption: 'Serper / Geoapify', value: this.num(api.serper.calls24h) + ' / ' + this.num(api.geoapify.calls24h) },
          { caption: this.t('admin.stMonth'), value: this.num(api.serper.calls30d + api.geoapify.calls30d) },
        ] : [], tag: api.tracked ? this.t('admin.tagDay') : undefined, note: this.t('admin.notTracked') },
    ];
  });

  /** What needs attention now: failed searches and caps that are nearly used up. */
  protected readonly alerts = computed<Alert[]>(() => {
    const o = this.overview();
    if (!o) return [];
    const out: Alert[] = [];
    const failed = o.searches.failed24h;
    if (failed > 0) {
      out.push({ id: 'failed', go: 'failed', goLabel: 'admin.alertFailedGo', bad: true,
        text: failed === 1 ? this.t('admin.alertFailedOne') : this.t('admin.alertFailedMany', { n: failed }) });
    }
    const locale = this.i18n.lang() === 'fr' ? 'fr' : 'en';
    for (const r of this.usageRows()) {
      if (r.hot) {
        out.push({ id: 'cap-' + r.kind, go: 'settings', goLabel: 'admin.alertCapGo', bad: r.used >= r.cap,
          text: this.t('admin.alertCap', { kind: this.t(r.label).toLocaleLowerCase(locale), pct: Math.round((r.used / r.cap) * 100) }) });
      }
    }
    // the demo seats are only worth a line when visitors are about to be turned away
    const seats = o.users.seats;
    if (seats.max > 0 && seats.active >= Math.ceil(seats.max * 0.8)) {
      const full = seats.active >= seats.max;
      out.push({ id: 'seats', go: 'settings', goLabel: 'admin.alertSeatsGo', bad: full,
        text: full ? this.t('admin.alertSeatsFull', { max: seats.max }) : this.t('admin.alertSeats', { active: seats.active, max: seats.max }) });
    }
    // a service that answered nothing although the work that needs it was done: its key probably expired or its credits ran out
    const services: { id: string; name: string; p: ApiProvider; text: I18nKey }[] = [
      { id: 'serper', name: 'Serper', p: o.api.serper, text: 'admin.alertSilentSearches' },
      { id: 'geoapify', name: 'Geoapify', p: o.api.geoapify, text: 'admin.alertSilentSearches' },
      { id: 'gemini', name: 'Gemini', p: o.api.gemini, text: 'admin.alertSilentMessages' },
    ];
    for (const sv of services) {
      if (sv.p.silent) out.push({ id: 'silent-' + sv.id, bad: true, text: this.t(sv.text, { service: sv.name }) });
    }
    return out;
  });

  protected readonly roleSegments = computed(() => {
    const by = this.overview()?.users.byRole ?? {};
    const order: string[] = [...ROLES];
    const merged: Record<string, number> = {};
    for (const [role, n] of Object.entries(by)) {
      const known = order.includes(role) ? role : 'USER';
      merged[known] = (merged[known] ?? 0) + n;
    }
    return Object.entries(merged).map(([role, n]) => ({ role, n }))
      .sort((a, b) => (order.indexOf(a.role) + 1 || 99) - (order.indexOf(b.role) + 1 || 99));
  });

  /** One column per day; the tallest day fills the plot. */
  protected readonly chart = computed(() => {
    const k = this.kind();
    const rows = this.overview()?.daily ?? [];
    const max = Math.max(0, ...rows.map(d => d[k]));
    const peak = rows.find(d => d[k] === max);
    return {
      max,
      peakDay: peak ? this.dayLabel(peak.day) : '',
      total: rows.reduce((s, d) => s + d[k], 0),
      days: rows.map(d => ({ label: this.dayLabel(d.day), n: d[k] })),
    };
  });

  /** Chart or the same numbers as a table. */
  protected readonly view = signal<'chart' | 'table'>('chart');
  /** The table skips days with no use at all (today stays), so it is short enough to read without scrolling inside it. */
  protected readonly hideEmpty = signal(true);

  protected readonly table = computed(() => {
    const all = [...(this.overview()?.daily ?? [])].reverse().map((d, i) => ({ ...d, today: i === 0 }));
    const rows = this.hideEmpty() ? all.filter(d => d.today || d.search + d.draft + d.enrich > 0) : all;
    const totals = all.reduce((t, d) => ({ search: t.search + d.search, draft: t.draft + d.draft, enrich: t.enrich + d.enrich }), { search: 0, draft: 0, enrich: 0 });
    return { rows, hidden: all.length - rows.length, totals };
  });

  /** When a service last answered, or a warning when it has not although it was needed. */
  protected answered(p: ApiProvider): string {
    if (p.silent) return this.t('admin.apiSilent');
    return p.lastAnswered ? this.t('admin.apiLastOk', { when: this.i18n.ago(p.lastAnswered) }) : this.t('admin.apiNever');
  }

  /** "Oct 16" or "16 oct.": the day is a UTC date, shown as is. */
  protected dayLabel(day: string): string {
    const [y, m, d] = day.split('-').map(Number);
    return new Intl.DateTimeFormat(this.i18n.lang() === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(y, m - 1, d)));
  }
}
