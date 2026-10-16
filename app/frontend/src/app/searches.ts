import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, Job } from './api.service';

@Component({
  selector: 'app-searches',
  imports: [FormsModule, RouterLink, DatePipe],
  template: `
    <form class="card" (ngSubmit)="submit()">
      <h1>New search</h1>
      <div class="grid">
        <label>Business type <input name="niche" required placeholder="dental clinics" [(ngModel)]="form.niche"></label>
        <label>City <input name="city" required placeholder="Lyon" [(ngModel)]="form.city"></label>
        <label class="full">What you offer
          <textarea name="service" rows="2" required placeholder="Custom booking systems and internal tools for small businesses"
            [(ngModel)]="form.service"></textarea></label>
        <label>Your name <input name="sender" required [(ngModel)]="form.sender"></label>
        <div class="end"><button type="submit" [disabled]="busy()">Find leads</button></div>
      </div>
      @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
    </form>

    <h2>Your searches</h2>
    @for (j of jobs(); track j.id) {
      <a class="card row" [routerLink]="['/searches', j.id]">
        <span><strong>{{ j.niche }}</strong> in {{ j.city }}</span>
        <span class="mute">{{ j.createdAt | date: 'short' }} · <span [class]="'badge ' + j.status">{{ j.status }}</span></span>
      </a>
    } @empty {
      <p class="mute">No searches yet.</p>
    }
  `,
})
export class Searches {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly jobs = signal<Job[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  form = { niche: '', city: '', service: '', sender: '' };

  constructor() {
    this.api.list().subscribe(j => this.jobs.set(j));
  }

  submit() {
    this.busy.set(true);
    this.error.set('');
    this.api.create(this.form).subscribe({
      next: job => this.router.navigate(['/searches', job.id]),
      error: () => { this.busy.set(false); this.error.set('Could not start the search.'); },
    });
  }
}
