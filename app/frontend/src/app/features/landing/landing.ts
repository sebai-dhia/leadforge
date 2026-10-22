import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Dossier } from '../leads/dossier/dossier';
import { FitLinesDirective } from '../../shared/directives/fit-lines';
import { I18n, I18nKey } from '../../i18n/i18n';
import { LangSwitch } from '../../shared/lang-switch/lang-switch';
import { Logo } from '../../shared/logo/logo';
import { Radar } from '../../shared/radar/radar';
import { ProgressDirective, RevealDirective, StepWatchDirective } from '../../shared/directives/scroll-fx';
import { SpecializationDialog } from '../../shared/specialization-dialog/specialization-dialog';
import { SpecializationKey } from '../../shared/specialization-picker/specialization-picker';

/**
 * Landing page. Look: a dark night-map background, magazine-style type, one green accent colour.
 * Motion follows the scroll: the hero map zooms and its layers drift at different speeds (parallax), a sticky
 * stage changes with the step being read, a line is drawn down the steps (scroll-linked), and blocks fade up
 * once as they arrive (scroll-triggered). Without motion everything shows in its finished state.
 */
@Component({
  selector: 'app-landing',
  imports: [RouterLink, Logo, LangSwitch, SpecializationDialog, Radar, Dossier, FitLinesDirective, ProgressDirective, RevealDirective, StepWatchDirective],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class Landing implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  readonly busy = signal(false);
  protected readonly choosing = signal(false);
  readonly error = signal<I18nKey | null>(null);
  readonly full = signal(false);
  protected readonly seatsLabel = () => this.t(this.full() ? 'landing.seatsFull' : 'landing.seatsDefault');

  /** The headline rises word by word once, when the page opens. A language change afterwards does not replay it. */
  protected readonly booting = signal(true);
  protected readonly titleWords = () => this.t('landing.title').split(' ');
  protected readonly active = signal(0);

  protected readonly niches = ['dental clinics', 'hotels', 'restaurants', 'gyms', 'hair salons', 'beauty salons', 'lawyers', 'pharmacies', 'bakeries', 'car repair', 'schools', 'cafes'];
  protected readonly steps: { n: number; title: I18nKey; text: I18nKey; stage: I18nKey }[] = [
    { n: 1, title: 'landing.step1', text: 'landing.step1Text', stage: 'landing.stage1' },
    { n: 2, title: 'landing.step2', text: 'landing.step2Text', stage: 'landing.stage2' },
    { n: 3, title: 'landing.step3', text: 'landing.step3Text', stage: 'landing.stage3' },
  ];
  protected readonly specs: { key: string; title: I18nKey; text: I18nKey }[] = [
    { key: 'FULLSTACK', title: 'spec.fullstack', text: 'spec.fullstackText' },
    { key: 'UXUI', title: 'spec.uxui', text: 'spec.uxuiText' },
    { key: 'STRATEGY', title: 'spec.strategy', text: 'spec.strategyText' },
  ];
  protected readonly stageDots: [number, number, boolean][] = [
    [110, 90, true], [160, 130, false], [214, 84, true], [262, 142, false], [120, 178, true], [200, 190, false], [276, 196, true], [300, 98, false],
  ];
  protected readonly principles: { n: number; title: I18nKey; text: I18nKey }[] = [
    { n: 1, title: 'landing.why1', text: 'landing.why1Text' },
    { n: 2, title: 'landing.why2', text: 'landing.why2Text' },
    { n: 3, title: 'landing.why3', text: 'landing.why3Text' },
  ];

  ngOnInit() {
    setTimeout(() => this.booting.set(false), 2200);
    this.api.demoStatus().subscribe({
      next: s => {
        this.full.set(s.demoFull);
      },
      error: () => { /* the page still works without it */ },
    });
  }

  /** The guest button first asks what the person does; picking one creates the guest. */
  protected choose() {
    this.choosing.set(true);
  }

  tryDemo(spec: SpecializationKey) {
    this.busy.set(true);
    this.error.set(null);
    this.auth.guest(spec).subscribe({
      next: () => this.router.navigateByUrl(this.auth.home()),
      error: e => {
        this.busy.set(false);
        this.choosing.set(false);
        this.error.set(e.status === 429 ? 'landing.errFull' : 'landing.errServer');
        if (e.status === 429) this.full.set(true);
      },
    });
  }
}
