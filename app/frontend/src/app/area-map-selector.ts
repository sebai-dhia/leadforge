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
        <span class="mute">{{ t('map.hint') }}</span>
        <button type="button" class="btn ghost small" (click)="locateDefault()">{{ t('map.reset') }}</button>
      </div>
      <div #mapContainer class="leaflet-container-view" [attr.aria-label]="t('map.aria')"></div>
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
  private map: L.Map | null = null;

  ngAfterViewInit() {
    const el = this.mapContainer()?.nativeElement;
    if (!el) return;

    this.map = L.map(el).setView([36.8065, 10.1815], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap',
    }).addTo(this.map);

    this.map.on('moveend', () => this.updateBounds());
    // Initial bounds calculation
    setTimeout(() => {
      this.map?.invalidateSize();
      this.updateBounds();
    }, 200);
  }

  locateDefault() {
    if (!this.map) return;
    this.map.setView([36.8065, 10.1815], 12);
  }

  private updateBounds() {
    if (!this.map) return;
    const b = this.map.getBounds();
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
