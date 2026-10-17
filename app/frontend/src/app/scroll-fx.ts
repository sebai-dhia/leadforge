import { Directive, ElementRef, Injectable, OnDestroy, OnInit, inject, input, output } from '@angular/core';

/**
 * Scroll effects, kept small and cheap: one passive scroll listener for the whole page, only transform and opacity
 * change, and people who ask for reduced motion get the finished state with nothing moving.
 */
@Injectable({ providedIn: 'root' })
export class ScrollFx {
  readonly reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly subs = new Set<() => void>();
  private ticking = false;

  constructor() {
    if (typeof window === 'undefined') return;
    const run = () => {
      if (this.ticking) return;
      this.ticking = true;
      requestAnimationFrame(() => { this.ticking = false; this.subs.forEach(f => f()); });
    };
    addEventListener('scroll', run, { passive: true });
    addEventListener('resize', run, { passive: true });
  }

  subscribe(fn: () => void): () => void {
    this.subs.add(fn);
    fn();
    return () => this.subs.delete(fn);
  }
}

/**
 * Writes a number from 0 to 1 into the CSS variable --p, tied to the scroll position (scroll-linked, so it runs
 * backwards when scrolling up). CSS turns it into movement, zoom or a line being drawn.
 *  - leave:   0 while the element is at the top of the page, 1 once it has scrolled out of view
 *  - through: 0 when it starts to enter at the bottom, 1 when it has left at the top
 *  - pin:     for a tall section with a sticky child: 0 when the section reaches the top, 1 just before it ends
 */
@Directive({ selector: '[appProgress]' })
export class ProgressDirective implements OnInit, OnDestroy {
  readonly appProgress = input<'leave' | 'through' | 'pin'>('through');
  /** The value used when motion is reduced, so a drawn line or a zoom shows in its finished state. */
  readonly settled = input(1);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly fx = inject(ScrollFx);
  private off?: () => void;

  ngOnInit() {
    if (this.fx.reduced) { this.host.nativeElement.style.setProperty('--p', String(this.settled())); return; }
    this.off = this.fx.subscribe(() => this.update());
  }

  ngOnDestroy() { this.off?.(); }

  private update() {
    const r = this.host.nativeElement.getBoundingClientRect();
    const vh = innerHeight;
    const mode = this.appProgress();
    const raw = mode === 'leave' ? -r.top / Math.max(1, r.height)
      : mode === 'pin' ? -r.top / Math.max(1, r.height - vh)
      : (vh - r.top) / Math.max(1, vh + r.height);
    this.host.nativeElement.style.setProperty('--p', Math.min(1, Math.max(0, raw)).toFixed(4));
  }
}

/** Scroll-triggered fade and rise: plays once when the element comes into view. appReveal is an optional delay in ms. */
@Directive({ selector: '[appReveal]', host: { class: 'reveal' } })
export class RevealDirective implements OnInit, OnDestroy {
  readonly appReveal = input<number | string>(0);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly fx = inject(ScrollFx);
  private io?: IntersectionObserver;

  ngOnInit() {
    const el = this.host.nativeElement;
    const delay = Number(this.appReveal()) || 0;
    if (delay) el.style.setProperty('--d', delay + 'ms');
    if (this.fx.reduced || typeof IntersectionObserver === 'undefined') { el.classList.add('in'); return; }
    this.io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { el.classList.add('in'); this.io?.disconnect(); }
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    this.io.observe(el);
  }

  ngOnDestroy() { this.io?.disconnect(); }
}

/** Tells the page which story step is in the middle band of the screen. */
@Directive({ selector: '[appStepWatch]' })
export class StepWatchDirective implements OnInit, OnDestroy {
  readonly appStepWatch = input.required<number>();
  readonly activated = output<number>();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private io?: IntersectionObserver;

  ngOnInit() {
    if (typeof IntersectionObserver === 'undefined') return;
    this.io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) this.activated.emit(this.appStepWatch());
    }, { rootMargin: '-45% 0px -45% 0px' });
    this.io.observe(this.host.nativeElement);
  }

  ngOnDestroy() { this.io?.disconnect(); }
}
