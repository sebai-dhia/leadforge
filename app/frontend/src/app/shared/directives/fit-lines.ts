import { AfterViewInit, Directive, ElementRef, OnDestroy, effect, inject, input } from '@angular/core';
import { I18n } from '../../i18n/i18n';

/**
 * Keeps a heading to a maximum number of lines by shrinking its font size until it fits. The text differs by
 * language, so the size that gives three lines in English gives five in French; this measures instead of guessing.
 * It runs again when the language or the available width changes.
 */
@Directive({ selector: '[appFitLines]' })
export class FitLinesDirective implements AfterViewInit, OnDestroy {
  readonly appFitLines = input(3);

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly lang = inject(I18n).lang;
  private ro?: ResizeObserver;
  private raf = 0;
  private ready = false;

  constructor() {
    effect(() => {
      this.lang(); // refit when the language changes
      if (this.ready) this.schedule();
    });
  }

  ngAfterViewInit() {
    this.ready = true;
    this.schedule();
    if (typeof ResizeObserver !== 'undefined' && this.el.parentElement) {
      let width = this.el.parentElement.clientWidth;
      this.ro = new ResizeObserver(() => {
        const w = this.el.parentElement?.clientWidth ?? width;
        if (w !== width) { width = w; this.schedule(); }
      });
      this.ro.observe(this.el.parentElement);
    }
    // the web fonts can arrive after the first measurement
    document.fonts?.ready.then(() => this.schedule());
  }

  ngOnDestroy() {
    this.ro?.disconnect();
    cancelAnimationFrame(this.raf);
  }

  private schedule() {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.fit());
  }

  private fit() {
    const el = this.el;
    el.style.fontSize = ''; // back to the size the stylesheet asks for
    const cs = getComputedStyle(el);
    let size = parseFloat(cs.fontSize);
    const ratio = (parseFloat(cs.lineHeight) || size * 1.1) / size;
    const max = this.appFitLines();
    let guard = 60;
    while (guard-- > 0 && size > 22 && el.getBoundingClientRect().height > max * size * ratio + 2) {
      size -= 1;
      el.style.fontSize = size + 'px';
    }
  }
}
