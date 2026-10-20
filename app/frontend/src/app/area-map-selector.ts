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
      @if (tooBig()) { <p class="big" role="status">{{ t(drawn() ? 'map.bigDrawn' : 'map.bigView', { w: sizeKm().w, h: sizeKm().h }) }}</p> }
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
      height: clamp(400px, 58vh, 580px);
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
  /** Width and height in kilometres of the area that counts: the drawn rectangle, or the visible map when nothing is drawn. */
  protected readonly sizeKm = signal({ w: 0, h: 0 });
  private map: L.Map | null = null;
  private rect: L.Rectangle | null = null;
  private static readonly MAX_KM = 100;
  private start: L.LatLng | null = null;
  private bounds: L.LatLngBounds | null = null;
  private handles: L.Marker[] = [];

  /** Which sides each handle moves: corners first, then the middle of each edge (clockwise from the north-west). */
  private static readonly SIDES: { n?: 1; s?: 1; e?: 1; w?: 1 }[] = [
    { n: 1, w: 1 }, { n: 1 }, { n: 1, e: 1 }, { e: 1 }, { s: 1, e: 1 }, { s: 1 }, { s: 1, w: 1 }, { w: 1 },
  ];
  private static readonly CURSORS = ['nwse', 'ns', 'nesw', 'ew', 'nwse', 'ns', 'nesw', 'ew'];

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
    this.clearHandles();
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
      this.clearHandles();
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
      this.showHandles(b);
      this.drawn.set(true);
      this.drawing.set(false);
      this.map!.dragging.enable();
      this.emit(b);
    };
    el.addEventListener('pointerup', finish);
    el.addEventListener('pointercancel', finish);
  }

  /** Eight grips on the drawn area (corners and edges), so a missed street is fixed by dragging, not by drawing again. */
  private showHandles(b: L.LatLngBounds) {
    this.clearHandles();
    this.bounds = b;
    this.handles = AreaMapSelector.SIDES.map((sides, i) => {
      const m = L.marker(this.handlePoint(b, i), {
        draggable: true,
        keyboard: false,
        icon: L.divIcon({ className: 'bbox-handle ' + AreaMapSelector.CURSORS[i], iconSize: [14, 14], iconAnchor: [7, 7] }),
      }).addTo(this.map!);
      m.on('drag', () => {
        const p = m.getLatLng();
        const cur = this.bounds!;
        const north = sides.n ? p.lat : cur.getNorth();
        const south = sides.s ? p.lat : cur.getSouth();
        const east = sides.e ? p.lng : cur.getEast();
        const west = sides.w ? p.lng : cur.getWest();
        const next = L.latLngBounds([south, west], [north, east]);
        this.bounds = next;
        this.rect?.setBounds(next);
        this.handles.forEach((h, j) => h.setLatLng(this.handlePoint(next, j)));
        this.emit(next);
      });
      return m;
    });
  }

  private handlePoint(b: L.LatLngBounds, i: number): L.LatLng {
    const c = b.getCenter();
    const lat = [b.getNorth(), b.getNorth(), b.getNorth(), c.lat, b.getSouth(), b.getSouth(), b.getSouth(), c.lat][i];
    const lng = [b.getWest(), c.lng, b.getEast(), b.getEast(), b.getEast(), c.lng, b.getWest(), b.getWest()][i];
    return L.latLng(lat, lng);
  }

  private clearHandles() {
    this.handles.forEach(h => h.remove());
    this.handles = [];
  }

  private updateBounds() {
    if (!this.map) return;
    this.emit(this.map.getBounds());
  }

  private emit(b: L.LatLngBounds) {
    const midLat = (b.getNorth() + b.getSouth()) / 2;
    const size = {
      w: Math.round((b.getEast() - b.getWest()) * 111.32 * Math.cos(midLat * Math.PI / 180)),
      h: Math.round((b.getNorth() - b.getSouth()) * 110.57),
    };
    this.sizeKm.set(size);
    // one search covers at most about 100 x 100 km; beyond that it finds fewer useful businesses
    this.tooBig.set(size.w > AreaMapSelector.MAX_KM || size.h > AreaMapSelector.MAX_KM);
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
    this.clearHandles();
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }
}
