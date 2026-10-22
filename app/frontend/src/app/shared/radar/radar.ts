import { Component, inject } from '@angular/core';
import { Dossier } from '../../features/leads/dossier/dossier';
import { I18n } from '../../i18n/i18n';

/**
 * The hero picture: a night map of a city with businesses lighting up as they are found, and a lead dossier
 * laid over it. The layers sit at different depths, so scrolling moves them at different speeds (parallax) and
 * the map slowly zooms. The page sets --p (0 at the top, 1 when the hero has gone) on a parent.
 */
@Component({
  selector: 'app-radar',
  imports: [Dossier],
  templateUrl: './radar.html',
  styleUrl: './radar.scss',
})
export class Radar {
  protected readonly t = inject(I18n).t;
  protected readonly corners: [number, number][] = [[92, 104], [392, 104], [92, 340], [392, 340]];
  protected readonly dots: { x: number; y: number; reach: boolean; rank?: number }[] = [
    { x: 150, y: 150, reach: true, rank: 9 }, { x: 236, y: 134, reach: false }, { x: 318, y: 176, reach: true, rank: 8 },
    { x: 190, y: 236, reach: true }, { x: 280, y: 262, reach: false }, { x: 352, y: 290, reach: true, rank: 7 },
    { x: 126, y: 300, reach: false }, { x: 240, y: 318, reach: true }, { x: 372, y: 130, reach: false },
    { x: 420, y: 232, reach: false }, { x: 60, y: 210, reach: false }, { x: 210, y: 70, reach: false },
    { x: 302, y: 372, reach: false }, { x: 140, y: 430, reach: false },
  ];
}
