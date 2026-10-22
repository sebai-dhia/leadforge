import { Component, computed, input, signal } from '@angular/core';

/** One bar per day with a grid, a tooltip on hover or focus, and the first and last day under it. */
@Component({
  selector: 'app-day-bars',
  styles: `
    :host { display: block; }
    .plot { position: relative; display: flex; align-items: flex-end; height: 180px; border-bottom: 1px solid var(--line-strong); }
    .grid-line { position: absolute; left: 0; right: 0; border-top: 1px dashed var(--line); pointer-events: none; }
    .grid-label { position: absolute; left: 0; top: -9px; font-size: 12px; color: var(--mute); background: var(--card); padding-right: 6px; font-variant-numeric: tabular-nums; }
    .col { flex: 1 1 0; height: 100%; display: flex; align-items: flex-end; justify-content: center; padding: 0 1px; cursor: default; outline: none; }
    .bar { display: block; width: 100%; max-width: 22px; background: color-mix(in srgb, var(--accent) 70%, var(--card)); border-radius: 4px 4px 0 0; }
    .col.today .bar { background: var(--accent); }
    .col:hover .bar, .col:focus-visible .bar { background: var(--accent); filter: brightness(1.12); }
    .col:focus-visible { box-shadow: inset 0 0 0 2px var(--accent-soft); border-radius: 4px; }
    .tip { position: absolute; bottom: calc(100% + 6px); white-space: nowrap; pointer-events: none; z-index: 2;
      background: var(--card); border: 1px solid var(--line-strong); border-radius: 8px; padding: 4px 10px; font-size: 13px; box-shadow: 0 8px 24px rgba(0, 0, 0, .25); }
    .axis { display: flex; justify-content: space-between; font-size: 12px; color: var(--mute); margin-top: 6px; }
    @media (max-width: 560px) { .plot { height: 150px; } }
  `,
  template: `
    <div class="plot" role="list" [attr.aria-label]="ariaLabel()">
      @if (max() > 0) {
        <div class="grid-line" style="top: 0" aria-hidden="true"><span class="grid-label">{{ format()(max()) }}</span></div>
        @if (max() > 3) { <div class="grid-line" style="top: 50%" aria-hidden="true"><span class="grid-label">{{ format()(Math.round(max() / 2)) }}</span></div> }
      }
      @for (d of cols(); track $index; let i = $index) {
        <div class="col" [class.today]="i === cols().length - 1" role="listitem" tabindex="0" [attr.aria-label]="tip()(d.label, d.n)"
          (mouseenter)="hover.set(i)" (mouseleave)="hover.set(null)" (focus)="hover.set(i)" (blur)="hover.set(null)">
          @if (d.n > 0) { <span class="bar" [style.height.%]="d.pct"></span> }
        </div>
      }
      @if (hover() !== null) {
        @let h = cols()[hover()!];
        <span class="tip" aria-hidden="true" [style.left.%]="(hover()! + .5) / cols().length * 100" [style.transform]="tipShift(hover()!)"
          [style.bottom]="'calc(' + h.pct + '% + 6px)'">{{ tip()(h.label, h.n) }}</span>
      }
    </div>
    <div class="axis" aria-hidden="true">
      <span>{{ cols()[0]?.label }}</span>
      <span>{{ todayLabel() }}</span>
    </div>
  `,
})
export class DayBars {
  /** Oldest first; the last one is today. */
  readonly days = input.required<{ label: string; n: number }[]>();
  readonly ariaLabel = input('');
  readonly todayLabel = input('');
  /** The text of the tooltip and of the screen reader label for one day. */
  readonly tip = input<(label: string, n: number) => string>((label, n) => label + ': ' + n);
  /** How the numbers on the grid are written (for example 12.4k). */
  readonly format = input<(n: number) => string>(n => String(n));

  protected readonly Math = Math;
  protected readonly hover = signal<number | null>(null);
  protected readonly max = computed(() => Math.max(0, ...this.days().map(d => d.n)));
  protected readonly cols = computed(() => {
    const max = this.max();
    return this.days().map(d => ({ ...d, pct: max ? (d.n / max) * 100 : 0 }));
  });

  /** Near the edges the tooltip grows inward, so it never leaves the card. */
  protected tipShift(i: number): string {
    const n = this.cols().length;
    return i < 4 ? 'translateX(-15%)' : i > n - 5 ? 'translateX(-85%)' : 'translateX(-50%)';
  }
}
