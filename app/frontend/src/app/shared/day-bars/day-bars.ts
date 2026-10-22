import { Component, computed, input, signal } from '@angular/core';

/** One bar per day with a grid, a tooltip on hover or focus, and the first and last day under it. */
@Component({
  selector: 'app-day-bars',
  styleUrl: './day-bars.scss',
  templateUrl: './day-bars.html',
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
