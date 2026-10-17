import { AfterViewInit, Component, ElementRef, OnDestroy, inject, output, signal, viewChild } from '@angular/core';
import * as L from 'leaflet';
import { I18n } from './i18n';

/**
 * Interactive map selector using Leaflet and OpenStreetMap tiles.
 * Allows drawing/adjusting a bounding box for Geoapify Places discovery.
 */
@Component({
  selector: 'app-area-map-selector',
  template: `
    <div class="map-wrapper">
      <div class="map-toolbar">
        <span class="mute">{{ drawing() ? t('map.drawHint') : drawn() ? t('map.drawnHint') : t('map.hint') }}</span>
        <span class="tools">
          <button type="button" class="btn ghost small" [class.on]="drawing()" [attr.aria-pressed]="drawing()" (click)="toggleDraw()">{{ t('map.draw') }}</button>
          @if (drawn()) { <button type="button" class="btn ghost small" (click)="clearDrawn()">{{ t('map.clearDraw') }}</button> }
          <button type="button" class="btn ghost small" (click)="locateDefault()">{{ t('map.reset') }}</button>
        </span>
      </div>
      <div #mapContainer class="leaflet-container-view" [class.drawing]="drawing()" [attr.aria-label]="t('map.aria')"></div>
      @if (tooBig()) { <p class="big" role="status">{{ t('map.big') }}</p> }
      <div class="bbox-readout">
        <span class="label">{{ t('map.coords') }}</span>
        <code>{{ currentBbox() || t('map.positioning') }}</code>
      </div>
    </div>
  `,
  styles: [`
    .map-wrapper {
      margin-top: 10px;
      border: 1px solid var(--line, #e3e3de);
      border-radius: 8px;
      overflow: hidden;
      background: var(--bg, #f7f7f5);
    }
    .map-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: var(--card, #fff);
      border-bottom: 1px solid var(--line, #e3e3de);
      font-size: 13px;
    }
    .leaflet-container-view {
      height: 260px;
      width: 100%;
      z-index: 1;
    }
    .bbox-readout {
      padding: 6px 12px;
      font-size: 11px;
      color: var(--mute, #6b6b66);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--card, #fff);
      border-top: 1px solid var(--line, #e3e3de);
    }
    code {
      font-family: monospace;
      color: var(--accent, #2f5d50);
    }
    .tools { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
    .btn.on { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
    .leaflet-container-view.drawing { cursor: crosshair; touch-action: none; }
    .big { margin: 0; padding: 8px 12px; font-size: 12.5px; color: var(--warn); background: var(--card); border-top: 1px solid var(--line); }
    .btn.small {
      min-height: 28px;
      padding: 4px 8px;
      font-size: 12px;
    }
  `],
})
export class AreaMapSelector implements AfterViewInit, OnDestroy {
  readonly mapContainer = viewChild<ElementRef<HTMLDivElement>>('mapContainer');
  readonly bboxChange = output<string>();
  protected readonly t = inject(I18n).t;

  protected readonly currentBbox = signal<string>('');
  protected readonly drawing = signal(false);
  protected readonly drawn = signal(false);
  protected readonly tooBig = signal(false);
  private map: L.Map | null = null;
  private rect: L.Rectangle | null = null;
  private start: L.LatLng | null = null;

  ngAfterViewInit() {
    const el = this.mapContainer()?.nativeElement;
    if (!el) return;

    this.map = L.map(el).setView([36.8065, 10.1815], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap',
    }).addTo(this.map);

    this.map.on('moveend', () => { if (!this.drawn()) this.updateBounds(); });
    this.bindDrawing(el);
    // Initial bounds calculation
    setTimeout(() => {
      this.map?.invalidateSize();
      this.updateBounds();
    }, 200);
  }

  locateDefault() {
    if (!this.map) return;
    this.clearDrawn();
    this.map.setView([36.8065, 10.1815], 12);
  }

  protected toggleDraw() {
    this.drawing.update(v => !v);
    this.map?.dragging[this.drawing() ? 'disable' : 'enable']();
  }

  protected clearDrawn() {
    this.rect?.remove();
    this.rect = null;
    this.drawn.set(false);
    this.drawing.set(false);
    this.map?.dragging.enable();
    this.updateBounds();
  }

  /** Pointer events cover mouse, pen and touch alike. While drawing, the map does not pan. */
  private bindDrawing(el: HTMLElement) {
    const at = (e: PointerEvent) => this.map!.mouseEventToLatLng(e);
    el.addEventListener('pointerdown', e => {
      if (!this.drawing() || !this.map) return;
      el.setPointerCapture(e.pointerId);
      this.start = at(e);
      this.rect?.remove();
      this.rect = L.rectangle(L.latLngBounds(this.start, this.start), { color: '#3ddc97', weight: 2, fillOpacity: .15 }).addTo(this.map);
    });
    el.addEventListener('pointermove', e => {
      if (this.start && this.rect) this.rect.setBounds(L.latLngBounds(this.start, at(e)));
    });
    const finish = (e: PointerEvent) => {
      if (!this.start || !this.rect) return;
      const b = L.latLngBounds(this.start, at(e));
      this.start = null;
      const tiny = this.map!.latLngToContainerPoint(b.getNorthEast()).distanceTo(this.map!.latLngToContainerPoint(b.getSouthWest())) < 12;
      if (tiny) { this.rect.remove(); this.rect = null; return; }
      this.rect.setBounds(b);
      this.drawn.set(true);
      this.drawing.set(false);
      this.map!.dragging.enable();
      this.emit(b);
    };
    el.addEventListener('pointerup', finish);
    el.addEventListener('pointercancel', finish);
  }

  private updateBounds() {
    if (!this.map) return;
    this.emit(this.map.getBounds());
  }

  private emit(b: L.LatLngBounds) {
    this.tooBig.set(b.getEast() - b.getWest() > 0.35 || b.getNorth() - b.getSouth() > 0.35);
    // Geoapify rect format: minLon,minLat,maxLon,maxLat
    const minLon = b.getWest().toFixed(4);
    const minLat = b.getSouth().toFixed(4);
    const maxLon = b.getEast().toFixed(4);
    const maxLat = b.getNorth().toFixed(4);
    const bboxStr = `${minLon},${minLat},${maxLon},${maxLat}`;
    this.currentBbox.set(bboxStr);
    this.bboxChange.emit(bboxStr);
  }

  ngOnDestroy() {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }
}
