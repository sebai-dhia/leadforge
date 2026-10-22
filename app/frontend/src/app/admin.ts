import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AdminOverview, AdminPage, AdminSearch, AdminUser, ApiProvider, ApiService, JobStatus, Usage, UsageKind } from './api.service';
import { AdminSettings } from './admin-settings';
import { DayBars } from './day-bars';
import { I18n, I18nKey } from './i18n';
import { Toasts } from './toast';

type Tab = 'overview' | 'users' | 'failed' | 'settings';
type SearchStatus = JobStatus | '';

const ROLES = ['USER', 'GUEST', 'ADMIN'] as const;
const KINDS: { kind: UsageKind; label: I18nKey }[] = [
  { kind: 'search', label: 'admin.kindSearch' },
  { kind: 'draft', label: 'admin.kindDraft' },
  { kind: 'enrich', label: 'admin.kindEnrich' },
];
const STATUSES: { id: SearchStatus; label: I18nKey }[] = [
  { id: 'FAILED', label: 'admin.fStatusFailed' },
  { id: 'PENDING', label: 'admin.fStatusRunning' },
  { id: 'DONE', label: 'admin.fStatusDone' },
  { id: '', label: 'admin.roleAll' },
];
const PAGE = 25;
const ACTIVE_MS = 10 * 60_000;

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

/** Read-only numbers for the admin. The admin's own work stays on the normal pages. */
@Component({
  selector: 'app-admin',
  imports: [FormsModule, AdminSettings, DayBars],
  styles: `
    :host { display: block; --danger: #d6383d; }
    @media (prefers-color-scheme: light) { :host { --danger: #b42318; } }
    .head p { margin: 0 0 18px; max-width: 70ch; }
    .tabs { margin-bottom: 20px; }
    .count { display: inline-block; min-width: 20px; margin-left: 8px; padding: 0 6px; border-radius: 999px; font-size: 12px; font-weight: 700; line-height: 20px; text-align: center; background: var(--warn); color: var(--bg); }
    .panel { margin: 0; padding: 20px; min-width: 0; }
    /* panels that stand on their own (not in a row) keep the usual space under a card */
    .block { margin-bottom: 12px; }
    .ph { margin-bottom: 14px; }
    .ph h2 { margin: 0 0 2px; font-size: 18px; }
    .ph p { margin: 0; }
    .track { height: 6px; border-radius: 999px; background: var(--skeleton); overflow: hidden; }
    .track > span { display: block; height: 100%; border-radius: inherit; background: var(--accent); transition: width .4s ease; }
    .hot .track > span { background: var(--warn); }

    /* the stat tiles at the top of the overview */
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(235px, 1fr)); gap: 12px; margin-bottom: 12px; }
    .kpi { margin: 0; padding: 22px 22px 18px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .kpi-num { font-family: var(--font-display); font-size: 52px; font-weight: 800; line-height: 1; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
    .kpi-top { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 8px 12px; }
    .kpi-tag { padding: 4px 10px; border: 1px solid var(--line); border-radius: 999px; font-size: 12px; line-height: 1.3; color: var(--mute); white-space: nowrap; }
    .kpi-num.dim { color: var(--mute); }
    .kpi-label { display: flex; align-items: center; gap: 10px; color: var(--mute); font-size: 14px; line-height: 1.3; }
    .kpi-label::before { content: ""; width: 9px; height: 9px; border-radius: 50%; background: var(--line-strong); flex: none; }
    .kpi-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: auto 0 0; padding-top: 14px; border-top: 1px solid var(--line); }
    .kpi-stats dt { font-size: 12px; line-height: 1.3; color: var(--mute); }
    .kpi-stats dd { margin: 3px 0 0; font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .kpi-stats dd.up { color: var(--accent); }
    .kpi-note { margin: auto 0 0; padding-top: 14px; border-top: 1px solid var(--line); font-size: 13px; color: var(--mute); }
    .kpi-hint { margin: -2px 0 12px; font-size: 13px; }
    .api-empty { padding: 18px 20px; border: 1px dashed var(--line-strong); border-radius: 14px; }
    .api-empty p { margin: 4px 0 0; max-width: 70ch; }
    .api-table small { display: block; color: var(--mute); font-size: 12px; margin-top: 2px; }
    .api-table td.n { color: var(--ink); }
    .api-table th { white-space: nowrap; }
    .api-body { display: grid; gap: 24px; }
    .api-body .dt { max-width: none; }
    .dt.api-table th:last-child, .dt.api-table td:last-child { padding-right: 16px; }
    .dt.api-table th:first-child, .dt.api-table td:first-child { padding-left: 18px; }
    .api-chart { min-width: 0; }
    .api-chart-title { margin: 0 0 8px; font-size: 14px; font-weight: 600; }
    .api-chart-title .mute { font-weight: 400; }
    .pick { cursor: pointer; }
    .pick.on td { background: color-mix(in srgb, var(--accent-soft) 70%, transparent); }
    .pick.on td:first-child { box-shadow: inset 3px 0 0 var(--accent); }
    .pick-btn { all: unset; cursor: pointer; font-weight: 600; }
    .pick-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 4px; }
    .api-table small .badge-warn { color: var(--warn); font-weight: 600; padding: 1px 8px; border: 1px solid currentColor; border-radius: 999px; }
    @media (min-width: 1000px) { .api-body { grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: 36px; align-items: start; } }
    /* overview */
    .alerts { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
    .alert { justify-content: flex-start; gap: 12px; width: 100%; min-height: 48px; padding: 10px 16px; text-align: left; background: var(--accent-soft); color: var(--ink); border: 1px solid var(--line-strong); border-radius: 12px; font-weight: 500; }
    .alert.bad { border-color: var(--warn); background: color-mix(in srgb, var(--warn) 12%, var(--card)); }
    .alert svg { flex: none; width: 20px; height: 20px; fill: none; stroke: var(--warn); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .alert:hover { filter: none; border-color: var(--accent); }
    .alert.static { display: flex; align-items: flex-start; flex-wrap: nowrap; padding-block: 12px; cursor: default; }
    .alert.static svg { margin-top: 1px; }
    .alert.static span { flex: 1; min-width: 0; }
    .alert.static:hover { border-color: var(--warn); }
    .alert-go { margin-left: auto; color: var(--accent); font-weight: 600; white-space: nowrap; }
    .cols { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 12px; margin-bottom: 12px; }
    .use { padding: 14px 0; border-top: 1px solid var(--line); display: grid; gap: 8px; }
    .use:first-of-type { border-top: 0; padding-top: 2px; }
    .use-top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
    .use-label { font-weight: 500; }
    .use-num { font-family: var(--font-display); font-size: 30px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
    .use-num small { margin-left: 8px; font-family: var(--font-body); font-size: 13px; font-weight: 400; color: var(--mute); }
    .hot .use-num { color: var(--warn); }
    .use-note { font-size: 12.5px; color: var(--mute); }
    .runline { margin: 4px 0 0; padding-top: 12px; border-top: 1px solid var(--line); font-size: 13.5px; color: var(--mute); }
    .runline b { color: var(--ink); font-variant-numeric: tabular-nums; }
    .runline b.bad { color: var(--warn); }
    .seg-bar { display: flex; gap: 2px; height: 10px; margin: 16px 0 12px; }
    .seg-bar span { min-width: 4px; border-radius: 3px; }
    .legend { list-style: none; display: grid; gap: 6px; margin: 0 0 16px; padding: 0; font-size: 14px; }
    .legend li { display: flex; align-items: center; gap: 10px; }
    .legend b { margin-left: auto; font-variant-numeric: tabular-nums; }
    .sw { width: 10px; height: 10px; border-radius: 3px; flex: none; }
    [data-role="USER"] { --c: var(--accent); }
    [data-role="GUEST"] { --c: color-mix(in srgb, var(--accent) 45%, var(--card)); }
    [data-role="ADMIN"] { --c: var(--warn); }
    .seg-bar span, .sw { background: var(--c, var(--mute)); }

    .chart-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 10px 16px; margin-bottom: 18px; }
    .chart-head .ph { margin: 0; flex: 1 1 340px; min-width: 0; }
    .chart-ctl { display: flex; flex: 0 0 auto; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px 10px; max-width: 100%; }
    .ghost-ctl { visibility: hidden; }
    .chart-note { margin: 12px 0 0; font-size: 13.5px; }
    .seg-btn svg { width: 16px; height: 16px; margin-right: 6px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; vertical-align: -3px; }
    /* the same numbers as the chart, one row per day, for reading exact values */
    .dt-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; max-width: 620px; margin-bottom: 6px; font-size: 13px; color: var(--mute); }
    .dt { width: 100%; max-width: 620px; border-collapse: collapse; font-size: 14.5px; font-variant-numeric: tabular-nums; }
    .dt th, .dt td { padding: 10px 0 10px 16px; border-bottom: 1px solid var(--line); text-align: right; }
    .dt th:first-child, .dt td:first-child { padding-left: 0; text-align: left; }
    .dt th { font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--mute); border-bottom-color: var(--line-strong); }
    .dt td.zero { color: var(--mute); opacity: .55; }
    .dt tr:hover td { background: color-mix(in srgb, var(--accent-soft) 55%, transparent); }
    .dt .is-today td:first-child { font-weight: 700; }
    .dt .is-today td:first-child::before { content: ""; display: inline-block; width: 8px; height: 8px; margin-right: 8px; border-radius: 50%; background: var(--accent); }
    .dt tfoot td { font-weight: 700; border-top: 1px solid var(--line-strong); border-bottom: 0; }

    /* lists (users, searches) */
    .filters { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin-bottom: 14px; }
    .filters input { flex: 1 1 260px; max-width: 420px; min-height: 44px; margin: 0; }
    .total { margin-left: auto; font-size: 13.5px; color: var(--mute); }
    .list { padding: 0; overflow: hidden; }
    .lhead, .lrow { display: grid; gap: 8px 20px; align-items: center; padding: 14px 20px; }
    .lhead { padding-block: 10px; font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--mute); border-bottom: 1px solid var(--line-strong); }
    .lrow { border-bottom: 1px solid var(--line); }
    .lrow:last-child { border-bottom: 0; }
    .lrow:hover { background: color-mix(in srgb, var(--accent-soft) 55%, transparent); }
    .users .lhead, .users .lrow { grid-template-columns: minmax(220px, 1.8fr) 150px 150px minmax(190px, 1.3fr) 44px; }
    .add-btn { min-height: 44px; }
    .add { margin-bottom: 14px; }
    .add-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px 16px; margin-bottom: 14px; }
    .add label { display: block; font-weight: 500; font-size: 14px; }
    .add input { width: 100%; min-height: 44px; margin-top: 5px; }
    .add .note { display: block; font-weight: 400; font-size: 13px; color: var(--mute); margin-top: 4px; }
    .add-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; }
    .err { color: var(--warn); }
    .created { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin-bottom: 14px; }
    .created code { padding: 4px 10px; border-radius: 8px; background: var(--bg); border: 1px solid var(--line-strong); font-family: var(--font-mono); font-size: 14px; user-select: all; word-break: break-all; }
    .created .x { margin-left: auto; min-height: 36px; width: 36px; padding: 0; background: transparent; color: var(--mute); border: 0; font-size: 20px; line-height: 1; }
    .row-act { display: flex; justify-content: flex-end; }
    .icon-btn { min-height: 40px; width: 40px; padding: 0; border-radius: 50%; background: transparent; color: var(--mute); border: 1px solid transparent; }
    .icon-btn:hover { color: var(--danger); border-color: var(--danger); background: color-mix(in srgb, var(--danger) 10%, transparent); filter: none; }
    .icon-btn svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    /* removing an account: a dialog of its own, with Cancel as the safe default */
    .dlg { width: min(440px, calc(100vw - 32px)); padding: 0; border: 1px solid var(--line-strong); border-radius: 20px; background: var(--card); color: var(--ink); box-shadow: 0 30px 80px rgba(0, 0, 0, .6); }
    .dlg::backdrop { background: rgba(4, 8, 7, .66); backdrop-filter: blur(3px); }
    .dlg[open] { animation: pop .18s ease both; }
    @keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.98); } }
    .dlg-body { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
    .dlg-icon { width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--danger) 16%, var(--card)); color: var(--danger); }
    .dlg-icon svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .dlg h2 { margin: 0; font-size: 21px; }
    .dlg-who { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--line-strong); border-radius: 14px; background: var(--bg); min-width: 0; }
    .dlg-who .who-text { flex: 1; }
    .dlg-points { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; font-size: 14.5px; }
    .dlg-points li { display: grid; grid-template-columns: 20px 1fr; gap: 10px; align-items: start; }
    .dlg-points svg { width: 18px; height: 18px; margin-top: 2px; fill: none; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
    .dlg-points .gone svg { stroke: var(--danger); }
    .dlg-points .kept svg { stroke: var(--mute); }
    .dlg-points .kept { color: var(--mute); }
    .dlg-note { margin: 0; font-size: 13.5px; font-weight: 600; }
    .dlg-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; padding-top: 4px; }
    .dlg-actions button { min-height: 46px; min-width: 120px; }
    .danger { background: var(--danger); border-color: var(--danger); color: #fff; }
    .danger:disabled { opacity: .6; cursor: wait; }
    .who { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .avatar { flex: none; width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--accent-soft); color: var(--accent);
      font-family: var(--font-display); font-weight: 700; font-size: 14px; box-shadow: inset 0 0 0 1px var(--line-strong); }
    .who-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.35; }
    .who-text strong { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .who-text span { font-size: 13px; color: var(--mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .role { display: inline-block; font-size: 12px; padding: 2px 10px; border-radius: 999px; background: var(--skeleton); color: var(--ink); white-space: nowrap; }
    .role[data-role="ADMIN"] { background: var(--accent-soft); color: var(--accent); }
    .how { display: block; margin-top: 6px; font-size: 12.5px; line-height: 1.35; color: var(--mute); }
    .seen { display: flex; flex-direction: column; line-height: 1.35; font-size: 14px; }
    .seen small { color: var(--mute); font-size: 12.5px; }
    .live { display: inline-flex; align-items: center; gap: 7px; color: var(--accent); font-weight: 600; }
    .live::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent); }
    .mini { display: grid; gap: 5px; }
    .mini-row { display: grid; grid-template-columns: 96px minmax(40px, 1fr) 52px; gap: 10px; align-items: center; font-size: 12.5px; color: var(--mute); }
    .mini-row .track { height: 5px; }
    .mini-row b { font-family: var(--font-mono); font-weight: 500; font-size: 12px; color: var(--ink); text-align: right; white-space: nowrap; }
    .mini-row.full b { color: var(--warn); }
    .figs { display: flex; gap: 14px; margin-top: 2px; font-size: 12.5px; color: var(--mute); }
    .figs b { color: var(--ink); font-variant-numeric: tabular-nums; }

    .searches .lrow { grid-template-columns: 32px minmax(0, 1fr) auto; align-items: start; }
    .st { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--skeleton); color: var(--mute); }
    .st svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .st.FAILED { background: color-mix(in srgb, var(--warn) 18%, var(--card)); color: var(--warn); }
    .st.DONE { background: var(--accent-soft); color: var(--accent); }
    .s-main { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .s-title { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; }
    .s-title strong { font-size: 15.5px; }
    .s-meta { font-size: 13px; color: var(--mute); display: flex; flex-wrap: wrap; gap: 2px 10px; }
    .s-meta > span { min-width: 0; overflow-wrap: anywhere; }
    .s-meta .deleted { font-style: italic; }
    .s-side { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; text-align: right; white-space: nowrap; font-size: 13px; color: var(--mute); }
    .pill { font-size: 12px; font-weight: 600; padding: 2px 10px; border-radius: 999px; background: var(--skeleton); color: var(--mute); }
    .pill.FAILED { background: color-mix(in srgb, var(--warn) 18%, var(--card)); color: var(--warn); }
    .pill.DONE { background: var(--accent-soft); color: var(--accent); }
    .why { margin-top: 6px; padding: 10px 14px; border-left: 3px solid var(--warn); background: color-mix(in srgb, var(--warn) 8%, var(--card)); border-radius: 0 10px 10px 0; display: flex; flex-direction: column; gap: 3px; font-size: 13.5px; }
    .why strong { font-weight: 600; }
    .why .hint { color: var(--mute); }
    .why code { font-family: var(--font-mono); font-size: 12px; color: var(--mute); word-break: break-word; }

    .empty-row { text-align: center; color: var(--mute); padding: 36px 20px; }
    .pager { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
    .pager button { min-height: 40px; }
    .load-err { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

    @media (max-width: 900px) { .cols { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 860px) {
      .users .lhead { display: none; }
      .users .lrow { grid-template-columns: minmax(0, 1fr); gap: 10px; padding: 16px; }
      .users .lrow > [data-label]::before { content: attr(data-label); display: block; margin-bottom: 3px; font-size: 11.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--mute); }
    }
    @media (max-width: 560px) {
      .use-num { font-size: 26px; }
      .searches .lrow { grid-template-columns: 32px minmax(0, 1fr); }
      .s-side { grid-column: 2; align-items: flex-start; text-align: left; flex-direction: row; flex-wrap: wrap; gap: 4px 10px; }
      .alert { flex-wrap: wrap; } .alert-go { margin-left: 32px; }
      .tabs, .chart-ctl .seg { display: flex; flex-wrap: nowrap; max-width: 100%; overflow-x: auto; scrollbar-width: none; }
      .tabs { width: 100%; }
      .tabs .seg-btn, .chart-ctl .seg-btn { flex: none; }
      .chart-ctl { width: 100%; justify-content: flex-start; }
    }
    @media (prefers-reduced-motion: reduce) { .track > span { transition: none; } }
  `,
  template: `
    <div class="head">
      <h1>{{ t('admin.title') }}</h1>
      <p class="mute">{{ t('admin.sub') }}</p>
    </div>

    <div class="seg tabs" role="group" [attr.aria-label]="t('admin.tabsAria')">
      @for (x of tabs; track x.id) {
        <button type="button" class="seg-btn" [class.on]="tab() === x.id" [attr.aria-pressed]="tab() === x.id" (click)="open(x.id)">
          {{ t(x.label) }}
          @if (x.id === 'failed' && (overview()?.searches?.failed24h ?? 0) > 0) { <span class="count" [attr.aria-label]="t('admin.failedBadge', { n: overview()!.searches.failed24h })">{{ overview()!.searches.failed24h }}</span> }
        </button>
      }
    </div>

    @if (error()) {
      <div class="notice load-err" role="alert">
        <span class="err">{{ t('admin.errLoad') }}</span>
        <button type="button" class="ghost" (click)="reload()">{{ t('admin.retry') }}</button>
      </div>
    }

    @switch (tab()) {
      @case ('overview') {
        @if (overview(); as o) {
          @if (alerts().length) {
            <div class="alerts">
              @for (a of alerts(); track a.id) {
                @if (a.go; as go) {
                  <button type="button" class="alert" [class.bad]="a.bad" (click)="open(go)">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17.5v.5"/></svg>
                    <span>{{ a.text }}</span>
                    <span class="alert-go">{{ t(a.goLabel!) }} &rarr;</span>
                  </button>
                } @else {
                  <div class="alert static" [class.bad]="a.bad" role="alert">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17.5v.5"/></svg>
                    <span>{{ a.text }}</span>
                  </div>
                }
              }
            </div>
          }

          <div class="kpis">
            @for (k of kpis(); track k.id) {
              <article class="card kpi">
                <div class="kpi-top">
                  <div class="kpi-num" [class.dim]="k.dim">{{ k.value }}</div>
                  @if (k.tag) { <span class="kpi-tag">{{ k.tag }}</span> }
                </div>
                <span class="kpi-label">{{ k.label }}</span>
                @if (k.stats.length) {
                  <dl class="kpi-stats">
                    @for (st of k.stats; track st.caption) {
                      <div><dt>{{ st.caption }}</dt><dd [class.up]="st.up">{{ st.value }}</dd></div>
                    }
                  </dl>
                } @else {
                  <p class="kpi-note">{{ k.note }}</p>
                }
              </article>
            }
          </div>
          @if (!o.api.tracked) { <p class="mute kpi-hint">{{ t('admin.notTrackedHint') }}</p> }

          <div class="cols">
            <section class="card panel" aria-labelledby="h-use">
              <header class="ph"><h2 id="h-use">{{ t('admin.last24') }}</h2><p class="mute">{{ t('admin.last24Sub') }}</p></header>
              @for (r of usageRows(); track r.kind) {
                <div class="use" [class.hot]="r.hot">
                  <div class="use-top">
                    <span class="use-label">{{ t(r.label) }}</span>
                    <span class="use-num">{{ r.used }}<small>{{ r.cap > 0 ? t('admin.ofCap', { cap: r.cap }) : t('admin.noCapShort') }}</small></span>
                  </div>
                  <div class="track" aria-hidden="true"><span [style.width.%]="r.pct"></span></div>
                  @if (r.refunded) { <span class="use-note">{{ t('admin.refunded', { n: r.refunded }) }}</span> }
                </div>
              }
              <p class="runline">
                {{ t('admin.runLine') }}
                <b>{{ o.searches.last24h }}</b> {{ t('admin.runStarted') }} ·
                <b [class.bad]="o.searches.failed24h > 0">{{ o.searches.failed24h }}</b> {{ t('admin.runFailed') }} ·
                <b>{{ o.searches.pending }}</b> {{ t('admin.runRunning') }}
              </p>
            </section>

            <section class="card panel" aria-labelledby="h-people">
              <header class="ph"><h2 id="h-people">{{ t('admin.people') }}</h2><p class="mute">{{ t('admin.peopleSub') }}</p></header>
              <div class="seg-bar" role="img" [attr.aria-label]="t('admin.people')">
                @for (r of roleSegments(); track r.role) { <span [attr.data-role]="r.role" [style.flex-grow]="r.n" [attr.title]="t(roleKey(r.role)) + ' ' + r.n"></span> }
              </div>
              <ul class="legend">
                @for (r of roleSegments(); track r.role) {
                  <li [attr.data-role]="r.role"><span class="sw" aria-hidden="true"></span>{{ t(roleKey(r.role)) }}<b>{{ r.n }}</b></li>
                }
              </ul>
            </section>
          </div>

          <section class="card panel block" aria-labelledby="h-daily">
            <div class="chart-head">
              <header class="ph">
                <h2 id="h-daily">{{ t('admin.daily') }}</h2>
                <p class="mute">{{ t('admin.dailySub') }}</p>
              </header>
              <div class="chart-ctl">
                <!-- always drawn, so the Chart | Table switch never moves; in the table it is hidden and out of the tab order -->
                <div class="seg" role="group" [attr.aria-label]="t('admin.kindAria')" [class.ghost-ctl]="view() !== 'chart'" [attr.aria-hidden]="view() !== 'chart'" [attr.inert]="view() !== 'chart' ? '' : null">
                  @for (k of kinds; track k.kind) {
                    <button type="button" class="seg-btn" [class.on]="kind() === k.kind" [attr.aria-pressed]="kind() === k.kind" (click)="kind.set(k.kind)">{{ t(k.label) }}</button>
                  }
                </div>
                <div class="seg" role="group" [attr.aria-label]="t('admin.viewAria')">
                  <button type="button" class="seg-btn" [class.on]="view() === 'chart'" [attr.aria-pressed]="view() === 'chart'" (click)="view.set('chart')">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>{{ t('admin.viewChart') }}</button>
                  <button type="button" class="seg-btn" [class.on]="view() === 'table'" [attr.aria-pressed]="view() === 'table'" (click)="view.set('table')">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/></svg>{{ t('admin.viewTable') }}</button>
                </div>
              </div>
            </div>

            @if (view() === 'chart') {
              <app-day-bars [days]="chart().days" [tip]="dayTip" [ariaLabel]="t('admin.chartAria', { kind: t(kindLabel()), total: chart().total, max: chart().max })"
                [todayLabel]="t('admin.today')" />
              <p class="chart-note mute">{{ t('admin.total30', { n: chart().total, kind: t(kindLabel()).toLowerCase() }) }}@if (chart().max > 0) { {{ t('admin.chartPeak', { day: chart().peakDay, n: chart().max }) }} }</p>
            } @else {
              @let tb = table();
              <div class="dt-bar">
                <button type="button" class="chip" [class.on]="hideEmpty()" [attr.aria-pressed]="hideEmpty()" (click)="hideEmpty.set(!hideEmpty())">{{ t('admin.hideEmpty') }}</button>
                @if (hideEmpty() && tb.hidden > 0) { <span>{{ t('admin.emptyHidden', { n: tb.hidden }) }}</span> }
              </div>
              <table class="dt">
                <thead><tr><th scope="col">{{ t('admin.day') }}</th>@for (k of kinds; track k.kind) { <th scope="col">{{ t(k.label) }}</th> }</tr></thead>
                <tbody>
                  @for (d of tb.rows; track d.day) {
                    <tr [class.is-today]="d.today">
                      <td>{{ d.today ? t('admin.today') : dayLabel(d.day) }}</td>
                      <td [class.zero]="!d.search">{{ d.search }}</td><td [class.zero]="!d.draft">{{ d.draft }}</td><td [class.zero]="!d.enrich">{{ d.enrich }}</td>
                    </tr>
                  } @empty {
                    <tr><td colspan="4" class="mute">{{ t('admin.noUseYet') }}</td></tr>
                  }
                </tbody>
                <tfoot><tr><td>{{ t('admin.totalRow') }}</td><td>{{ tb.totals.search }}</td><td>{{ tb.totals.draft }}</td><td>{{ tb.totals.enrich }}</td></tr></tfoot>
              </table>
            }
          </section>

          <section class="card panel block" aria-labelledby="h-api">
            <div class="chart-head">
              <header class="ph"><h2 id="h-api">{{ t('admin.apiTitle') }}</h2><p class="mute">{{ t('admin.apiSub') }}</p></header>
            </div>
            @if (!o.api.tracked) {
              <div class="api-empty">
                <strong>{{ t('admin.apiEmptyTitle') }}</strong>
                <p class="mute">{{ t('admin.apiEmptyHint') }}</p>
              </div>
            } @else {
              <div class="api-body">
                <table class="dt api-table">
                  <thead><tr><th scope="col"></th><th scope="col">{{ t('admin.apiColNow') }}</th><th scope="col">{{ t('admin.apiColPrev') }}</th><th scope="col">{{ t('admin.apiCol30') }}</th></tr></thead>
                  <tbody>
                    <tr class="pick" [class.on]="apiMetric() === 'tokens'" (click)="apiMetric.set('tokens')">
                      <td><button type="button" class="pick-btn" [attr.aria-pressed]="apiMetric() === 'tokens'" (click)="apiMetric.set('tokens'); $event.stopPropagation()">{{ t('admin.apiRowGeminiTokens') }}</button><small>{{ t('admin.apiInOut', { input: num(o.api.gemini.inputTokens24h), output: num(o.api.gemini.outputTokens24h) }) }}</small></td>
                      <td class="n">{{ num(o.api.gemini.inputTokens24h + o.api.gemini.outputTokens24h) }}</td><td class="n">{{ num(o.api.gemini.tokensPrev24h) }}</td><td class="n">{{ num(o.api.gemini.inputTokens30d + o.api.gemini.outputTokens30d) }}</td></tr>
                    <tr class="pick" [class.on]="apiMetric() === 'gemini'" (click)="apiMetric.set('gemini')">
                      <td><button type="button" class="pick-btn" [attr.aria-pressed]="apiMetric() === 'gemini'" (click)="apiMetric.set('gemini'); $event.stopPropagation()">{{ t('admin.apiRowGemini') }}</button><small>{{ t('admin.apiNoteGemini') }} · <span [class.badge-warn]="o.api.gemini.silent">{{ answered(o.api.gemini) }}</span></small></td>
                      <td class="n">{{ num(o.api.gemini.calls24h) }}</td><td class="n">{{ num(o.api.gemini.callsPrev24h) }}</td><td class="n">{{ num(o.api.gemini.calls30d) }}</td></tr>
                    <tr class="pick" [class.on]="apiMetric() === 'serper'" (click)="apiMetric.set('serper')">
                      <td><button type="button" class="pick-btn" [attr.aria-pressed]="apiMetric() === 'serper'" (click)="apiMetric.set('serper'); $event.stopPropagation()">{{ t('admin.apiRowSerper') }}</button><small>{{ t('admin.apiNoteSerper') }} · <span [class.badge-warn]="o.api.serper.silent">{{ answered(o.api.serper) }}</span></small></td>
                      <td class="n">{{ num(o.api.serper.calls24h) }}</td><td class="n">{{ num(o.api.serper.callsPrev24h) }}</td><td class="n">{{ num(o.api.serper.calls30d) }}</td></tr>
                    <tr class="pick" [class.on]="apiMetric() === 'geoapify'" (click)="apiMetric.set('geoapify')">
                      <td><button type="button" class="pick-btn" [attr.aria-pressed]="apiMetric() === 'geoapify'" (click)="apiMetric.set('geoapify'); $event.stopPropagation()">{{ t('admin.apiRowGeoapify') }}</button><small>{{ t('admin.apiNoteGeoapify') }} · <span [class.badge-warn]="o.api.geoapify.silent">{{ answered(o.api.geoapify) }}</span></small></td>
                      <td class="n">{{ num(o.api.geoapify.calls24h) }}</td><td class="n">{{ num(o.api.geoapify.callsPrev24h) }}</td><td class="n">{{ num(o.api.geoapify.calls30d) }}</td></tr>
                  </tbody>
                </table>
                <div class="api-chart">
                  <h3 class="api-chart-title">{{ t(apiMetricLabel()) }} <span class="mute">· {{ t('admin.apiCol30') }}</span></h3>
                  <app-day-bars [days]="apiChart().days" [tip]="apiTip" [format]="compact" [todayLabel]="t('admin.today')"
                    [ariaLabel]="t('admin.chartAria', { kind: t(apiMetricLabel()), total: num(apiChart().total), max: num(apiChart().max) })" />
                </div>
              </div>
            }
          </section>
        } @else if (!error()) {
          <div class="card skeleton-card" aria-busy="true" [attr.aria-label]="t('admin.loadingAria')"><span></span><span></span><span></span></div>
        }
      }

      @case ('users') {
        <div class="filters">
          <input type="search" [attr.aria-label]="t('admin.searchLabel')" [placeholder]="t('admin.searchPh')" maxlength="100"
            [ngModel]="q()" (ngModelChange)="onSearch($event)">
          <div class="seg" role="group" [attr.aria-label]="t('admin.roleAria')">
            <button type="button" class="seg-btn" [class.on]="role() === ''" [attr.aria-pressed]="role() === ''" (click)="setRole('')">{{ t('admin.roleAll') }}</button>
            @for (r of roles; track r) {
              <button type="button" class="seg-btn" [class.on]="role() === r" [attr.aria-pressed]="role() === r" (click)="setRole(r)">{{ t(roleKey(r)) }}</button>
            }
          </div>
          @if (users(); as p) { <span class="total">{{ t('admin.usersCount', { n: p.total }) }}</span> }
          <button type="button" class="add-btn" [attr.aria-expanded]="addOpen()" (click)="toggleAdd()">+ {{ t('admin.addUser') }}</button>
        </div>

        @if (created(); as c) {
          <div class="notice created" role="status">
            <strong>{{ t('admin.addDone', { email: c.email }) }}</strong>
            @if (c.password) {
              <span>{{ t('admin.addGenerated') }}</span> <code>{{ c.password }}</code>
              <button type="button" class="ghost" (click)="copyPassword(c.password)">{{ t(copied() ? 'admin.copied' : 'admin.copy') }}</button>
            }
            <button type="button" class="x" [attr.aria-label]="t('admin.dismiss')" (click)="created.set(null)">&times;</button>
          </div>
        }

        @if (addOpen()) {
          <form class="card panel add" (ngSubmit)="createUser()" autocomplete="off" aria-labelledby="h-add">
            <header class="ph"><h2 id="h-add">{{ t('admin.addTitle') }}</h2><p class="mute">{{ t('admin.addHelp') }}</p></header>
            <div class="add-grid">
              <label for="add-email">{{ t('admin.addEmail') }}
                <input id="add-email" name="email" type="email" autocomplete="off" maxlength="255" required [(ngModel)]="newEmail">
              </label>
              <label for="add-name">{{ t('admin.addName') }}
                <input id="add-name" name="name" type="text" autocomplete="off" maxlength="100" [(ngModel)]="newName">
              </label>
              <label for="add-pw">{{ t('admin.addPassword') }}
                <input id="add-pw" name="password" type="password" autocomplete="new-password" maxlength="100" [(ngModel)]="newPassword">
                <span class="note">{{ t('admin.addPasswordHelp') }}</span>
              </label>
            </div>
            <div class="add-actions">
              <button type="submit" [disabled]="!newEmail.trim() || addBusy()">{{ t('admin.addSubmit') }}</button>
              <button type="button" class="ghost" (click)="toggleAdd()">{{ t('admin.removeNo') }}</button>
              @if (addError(); as m) { <span class="err" role="alert">{{ t(m) }}</span> }
            </div>
          </form>
        }

        <div class="card panel list users" [attr.aria-busy]="usersLoading()">
          <div class="lhead" aria-hidden="true">
            <span>{{ t('admin.colAccount') }}</span><span>{{ t('admin.colRole') }}</span><span>{{ t('admin.colSeen') }}</span><span>{{ t('admin.colUse') }}</span><span></span>
          </div>
          @for (u of users()?.items ?? []; track u.id) {
            <div class="lrow">
              <div class="who">
                <span class="avatar" aria-hidden="true">{{ initials(u) }}</span>
                <span class="who-text">
                  <strong>{{ u.displayName || u.email }}</strong>
                  @if (u.displayName) { <span [attr.title]="u.email">{{ u.email }}</span> }
                  <span class="figs"><span><b>{{ u.searches }}</b> {{ t('admin.searchesWord') }}</span></span>
                </span>
              </div>
              <div [attr.data-label]="t('admin.colRole')"><span class="role" [attr.data-role]="u.role">{{ t(roleKey(u.role)) }}</span><span class="how">{{ t(signInKey(u)) }}</span></div>
              <div class="seen" [attr.data-label]="t('admin.colSeen')">
                @if (activeNow(u)) { <span class="live">{{ t('admin.activeNow') }}</span> }
                @else { <span [attr.title]="i18n.date(u.lastSeenAt, 'long')">{{ u.lastSeenAt ? i18n.ago(u.lastSeenAt) : t('admin.never') }}</span> }
                <small [attr.title]="i18n.date(u.createdAt, 'long')">{{ t('admin.joinedAgo', { when: i18n.ago(u.createdAt) }) }}</small>
              </div>
              <div class="mini" [attr.data-label]="t('admin.colUse')">
                @for (k of kinds; track k.kind) {
                  @let x = u.usage24h[k.kind];
                  <div class="mini-row" [class.full]="x.limit > 0 && x.used >= x.limit">
                    <span>{{ t(k.label) }}</span>
                    <span class="track" aria-hidden="true"><span [style.width.%]="pctOf(x)"></span></span>
                    <b>{{ x.used }}/{{ x.limit }}</b>
                  </div>
                }
              </div>
              <div class="row-act">
                @if (canRemove(u)) {
                  <button type="button" class="icon-btn" [attr.aria-label]="t('admin.removeAria', { email: u.email })" [attr.title]="t('admin.remove')" (click)="removeTarget.set(u)">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/></svg>
                  </button>
                }
              </div>
            </div>
          } @empty {
            @if (!usersLoading()) { <p class="empty-row">{{ t('admin.noUsers') }}</p> }
          }
        </div>
        @if (users(); as p) {
          @if (p.total > p.size) {
            <div class="pager">
              <span class="mute">{{ range(p) }}</span>
              <button type="button" class="ghost" [disabled]="p.page === 0" (click)="loadUsers(p.page - 1)">{{ t('admin.prev') }}</button>
              <button type="button" class="ghost" [disabled]="(p.page + 1) * p.size >= p.total" (click)="loadUsers(p.page + 1)">{{ t('admin.next') }}</button>
            </div>
          }
        }

        <dialog #dlg class="dlg" aria-labelledby="dlg-title" (close)="removeTarget.set(null)" (click)="onBackdrop($event)">
          @if (removeTarget(); as u) {
            <div class="dlg-body">
              <span class="dlg-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/></svg></span>
              <h2 id="dlg-title">{{ t('admin.removeTitle') }}</h2>
              <div class="dlg-who">
                <span class="avatar" aria-hidden="true">{{ initials(u) }}</span>
                <span class="who-text">
                  <strong>{{ u.displayName || u.email }}</strong>
                  @if (u.displayName) { <span [attr.title]="u.email">{{ u.email }}</span> }
                </span>
                <span class="role" [attr.data-role]="u.role">{{ t(roleKey(u.role)) }}</span>
              </div>
              <ul class="dlg-points">
                <li class="gone"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg><span>{{ t('admin.removeDeleted') }}</span></li>
                <li class="kept"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span>{{ t('admin.removeKept') }}</span></li>
              </ul>
              <p class="dlg-note">{{ t('admin.removeNoUndo') }}</p>
              <div class="dlg-actions">
                <button type="button" class="ghost" autofocus [disabled]="removeBusy()" (click)="removeTarget.set(null)">{{ t('admin.removeNo') }}</button>
                <button type="button" class="danger" [disabled]="removeBusy()" (click)="confirmRemove(u)">{{ t(removeBusy() ? 'admin.removeBusy' : 'admin.removeYes') }}</button>
              </div>
            </div>
          }
        </dialog>
      }

      @case ('failed') {
        <div class="filters">
          <div class="seg" role="group" [attr.aria-label]="t('admin.fStatusAria')">
            @for (s of statuses; track s.id) {
              <button type="button" class="seg-btn" [class.on]="fstatus() === s.id" [attr.aria-pressed]="fstatus() === s.id" (click)="setStatus(s.id)">{{ t(s.label) }}</button>
            }
          </div>
          @if (failed(); as p) { <span class="total">{{ t('admin.searchesCount', { n: p.total }) }}</span> }
        </div>

        <div class="card panel list searches" [attr.aria-busy]="failedLoading()">
          @for (s of failed()?.items ?? []; track s.id) {
            <div class="lrow">
              <span class="st" [class]="'st ' + s.status" aria-hidden="true">
                @switch (s.status) {
                  @case ('FAILED') { <svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg> }
                  @case ('PENDING') { <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg> }
                  @default { <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg> }
                }
              </span>
              <div class="s-main">
                <div class="s-title"><strong>{{ t('admin.searchNo', { n: s.id }) }}</strong></div>
                <div class="s-meta">
                  @if (s.userEmail) { <span>{{ s.userEmail }}</span> } @else { <span class="deleted">{{ t('admin.deletedGuest') }}</span> }
                  @if (s.status === 'DONE' && s.foundCount !== null) { <span>{{ t('admin.found', { n: s.foundCount }) }}</span> }
                </div>
                @if (s.status === 'FAILED') {
                  @let w = why(s);
                  <div class="why">
                    <strong>{{ w.title }}</strong>
                    @if (w.hint) { <span class="hint">{{ t(w.hint) }}</span> }
                    @if (w.raw) { <code>{{ w.raw }}</code> }
                  </div>
                }
              </div>
              <div class="s-side">
                <span class="pill" [class]="'pill ' + s.status">{{ t(statusKey(s.status)) }}</span>
                <span [attr.title]="i18n.date(s.createdAt, 'long')">{{ i18n.ago(s.createdAt) }}</span>
              </div>
            </div>
          } @empty {
            @if (!failedLoading()) { <p class="empty-row">{{ t(fstatus() === 'FAILED' ? 'admin.noFailed' : 'admin.noneHere') }}</p> }
          }
        </div>
        @if (failed(); as p) {
          @if (p.total > p.size) {
            <div class="pager">
              <span class="mute">{{ range(p) }}</span>
              <button type="button" class="ghost" [disabled]="p.page === 0" (click)="loadFailed(p.page - 1)">{{ t('admin.prev') }}</button>
              <button type="button" class="ghost" [disabled]="(p.page + 1) * p.size >= p.total" (click)="loadFailed(p.page + 1)">{{ t('admin.next') }}</button>
            </div>
          }
        }
      }

      @case ('settings') { <app-admin-settings /> }
    }
  `,
})
export class AdminDashboard {
  private readonly api = inject(ApiService);
  private readonly toasts = inject(Toasts);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly Math = Math;

  protected readonly tabs: { id: Tab; label: I18nKey }[] = [
    { id: 'overview', label: 'admin.tabOverview' },
    { id: 'users', label: 'admin.tabUsers' },
    { id: 'failed', label: 'admin.tabFailed' },
    { id: 'settings', label: 'admin.tabSettings' },
  ];
  protected readonly kinds = KINDS;
  protected readonly roles = ROLES;
  protected readonly statuses = STATUSES;

  protected readonly tab = signal<Tab>('overview');
  protected readonly error = signal(false);

  protected readonly overview = signal<AdminOverview | null>(null);
  protected readonly kind = signal<UsageKind>('search');

  protected readonly users = signal<AdminPage<AdminUser> | null>(null);
  protected readonly usersLoading = signal(false);
  protected readonly q = signal('');
  protected readonly role = signal('');
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private usersRequest = 0;

  protected readonly failed = signal<AdminPage<AdminSearch> | null>(null);
  protected readonly failedLoading = signal(false);
  protected readonly fstatus = signal<SearchStatus>('FAILED');
  private failedRequest = 0;

  protected readonly addOpen = signal(false);
  protected newEmail = '';
  protected newName = '';
  protected newPassword = '';
  protected readonly addBusy = signal(false);
  protected readonly addError = signal<I18nKey | null>(null);
  /** The account that was just added; the generated password is only shown here, once. */
  protected readonly created = signal<{ email: string; password: string | null } | null>(null);
  protected readonly copied = signal(false);
  /** The account waiting for the admin to confirm its removal; the dialog is open while this is set. */
  protected readonly removeTarget = signal<AdminUser | null>(null);
  private readonly dlg = viewChild<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly removeBusy = signal(false);

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

  constructor() {
    this.loadOverview();
    // the native dialog gives the focus trap, the Escape key and the backdrop
    effect(() => {
      const dialog = this.dlg()?.nativeElement;
      const wanted = this.removeTarget() !== null;
      if (!dialog) return;
      if (wanted && !dialog.open) {
        dialog.showModal();
        // the content is drawn just after the dialog opens, so Cancel is focused once it exists
        setTimeout(() => dialog.querySelector<HTMLElement>('[autofocus]')?.focus());
      }
      if (!wanted && dialog.open) dialog.close();
    });
  }

  /** A click on the dialog itself, not on its content, is a click on the backdrop. */
  protected onBackdrop(e: MouseEvent) {
    if (e.target === this.dlg()?.nativeElement && !this.removeBusy()) this.removeTarget.set(null);
  }

  protected open(tab: Tab) {
    this.tab.set(tab);
    this.error.set(false);
    if (tab === 'overview') this.loadOverview();
    if (tab === 'users') this.loadUsers(0);
    if (tab === 'failed') this.loadFailed(0);
  }

  protected reload() {
    this.open(this.tab());
  }

  private loadOverview() {
    this.api.adminOverview().subscribe({
      next: o => { this.overview.set(o); this.error.set(false); },
      error: () => this.error.set(true),
    });
  }

  protected loadUsers(page: number) {
    const id = ++this.usersRequest; // an older answer that arrives late must not replace a newer one
    this.usersLoading.set(true);
    this.api.adminUsers(this.q(), this.role(), page, PAGE).subscribe({
      next: p => { if (id === this.usersRequest) { this.users.set(p); this.usersLoading.set(false); this.error.set(false); } },
      error: () => { if (id === this.usersRequest) { this.usersLoading.set(false); this.error.set(true); } },
    });
  }

  protected onSearch(value: string) {
    this.q.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.loadUsers(0), 300);
  }

  protected setRole(role: string) {
    this.role.set(role);
    this.loadUsers(0);
  }

  protected setStatus(status: SearchStatus) {
    this.fstatus.set(status);
    this.loadFailed(0);
  }

  protected loadFailed(page: number) {
    const id = ++this.failedRequest;
    this.failedLoading.set(true);
    this.api.adminSearches(this.fstatus(), page, PAGE).subscribe({
      next: p => { if (id === this.failedRequest) { this.failed.set(p); this.failedLoading.set(false); this.error.set(false); } },
      error: () => { if (id === this.failedRequest) { this.failedLoading.set(false); this.error.set(true); } },
    });
  }

  protected toggleAdd() {
    this.addOpen.update(v => !v);
    this.addError.set(null);
  }

  protected createUser() {
    const name = this.newName.trim();
    this.addBusy.set(true);
    this.addError.set(null);
    this.api.adminCreateUser({ email: this.newEmail.trim(), ...(name ? { displayName: name } : {}), ...(this.newPassword ? { password: this.newPassword } : {}) }).subscribe({
      next: r => {
        this.addBusy.set(false);
        this.addOpen.set(false);
        this.newEmail = this.newName = this.newPassword = '';
        this.created.set({ email: r.email, password: r.generatedPassword });
        this.copied.set(false);
        this.loadUsers(0);
      },
      error: (err: HttpErrorResponse) => {
        this.addBusy.set(false);
        this.addError.set(err.status === 409 ? 'admin.addErrTaken' : err.status === 400 ? 'admin.addErrInvalid' : 'admin.addErr');
      },
    });
  }

  protected async copyPassword(password: string) {
    try {
      await navigator.clipboard.writeText(password);
      this.copied.set(true);
    } catch { /* the password stays on screen to copy by hand */ }
  }

  /** Admin accounts are not removed from here. */
  protected canRemove(u: AdminUser): boolean { return u.role !== 'ADMIN'; }

  protected confirmRemove(u: AdminUser) {
    this.removeBusy.set(true);
    this.api.adminDeleteUser(u.id).subscribe({
      next: () => {
        const p = this.users();
        this.removeBusy.set(false);
        this.removeTarget.set(null);
        this.toasts.show(this.t('admin.removed'), undefined, 4000);
        this.loadUsers(p && p.items.length === 1 && p.page > 0 ? p.page - 1 : (p?.page ?? 0));
      },
      error: () => { this.removeBusy.set(false); this.toasts.show(this.t('admin.removeErr'), undefined, 6000); },
    });
  }

  protected roleKey(role: string): I18nKey {
    return (ROLES as readonly string[]).includes(role) ? (`role.${role}` as I18nKey) : 'role.USER';
  }

  protected statusKey(status: JobStatus): I18nKey {
    return `admin.st.${status}` as I18nKey;
  }

  /** How this account gets in, in words, so it is not mistaken for a role. */
  protected signInKey(u: AdminUser): I18nKey {
    if (u.role === 'GUEST') return 'admin.signGuest';
    return u.google ? 'admin.signGoogle' : 'admin.signPassword';
  }

  protected initials(u: AdminUser): string {
    if (u.role === 'GUEST') return 'G'; // its email is generated, so its letters mean nothing
    const source = (u.displayName && u.displayName !== 'Guest' ? u.displayName : u.email).trim();
    const parts = source.split(/[\s@._-]+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[1][0] : '')).toUpperCase();
  }

  /** Seen in the last few minutes (the time is saved at most every 5 minutes). */
  protected activeNow(u: AdminUser): boolean {
    return !!u.lastSeenAt && Date.now() - new Date(u.lastSeenAt).getTime() < ACTIVE_MS;
  }

  protected pctOf(x: Usage): number {
    return x.limit > 0 ? Math.min(100, (x.used / x.limit) * 100) : x.used > 0 ? 100 : 0;
  }

  /** When a service last answered, or a warning when it has not although it was needed. */
  protected answered(p: ApiProvider): string {
    if (p.silent) return this.t('admin.apiSilent');
    return p.lastAnswered ? this.t('admin.apiLastOk', { when: this.i18n.ago(p.lastAnswered) }) : this.t('admin.apiNever');
  }

  /** The reason a search failed in plain words, with what to check; the raw text stays visible under it. */
  protected why(s: AdminSearch): { title: string; hint: I18nKey | null; raw: string | null } {
    const raw = s.failureReason;
    if (!raw) return { title: this.t('admin.noReason'), hint: null, raw: null };
    if (raw.startsWith('No result from the search workflow')) return { title: this.t('admin.why.timeout'), hint: 'admin.why.timeoutHint', raw };
    if (raw.startsWith('Could not reach the search service')) return { title: this.t('admin.why.unreachable'), hint: 'admin.why.unreachableHint', raw };
    return { title: raw, hint: null, raw: null };
  }

  /** "Oct 16" or "16 oct.": the day is a UTC date, shown as is. */
  protected dayLabel(day: string): string {
    const [y, m, d] = day.split('-').map(Number);
    return new Intl.DateTimeFormat(this.i18n.lang() === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(y, m - 1, d)));
  }

  protected range(p: AdminPage<unknown>): string {
    return this.t('admin.range', { from: p.page * p.size + 1, to: Math.min(p.total, (p.page + 1) * p.size), total: p.total });
  }
}
