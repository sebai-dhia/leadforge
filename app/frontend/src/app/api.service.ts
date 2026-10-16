import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API } from './auth.service';

export type JobStatus = 'PENDING' | 'DONE' | 'FAILED';

export interface Job { id: number; niche: string; city: string; status: JobStatus; createdAt: string; }

export interface Lead {
  id: number; name: string; address: string; phone: string | null; rating: number | null; reviews: number | null;
  website: string; emails: string[]; score: number; reason: string; subject: string; emailBody: string; status: string;
}

export interface NewSearch { niche: string; city: string; service: string; sender: string; }

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  list() { return this.http.get<Job[]>(`${API}/searches`); }
  create(s: NewSearch) { return this.http.post<Job>(`${API}/searches`, s); }
  get(id: string) { return this.http.get<{ job: Job; leads: Lead[] }>(`${API}/searches/${id}`); }
}
