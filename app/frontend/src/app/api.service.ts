import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API } from './auth.service';

export type JobStatus = 'PENDING' | 'DONE' | 'FAILED';
export type Lang = 'en' | 'fr' | 'ar';
export type Channel = 'email' | 'whatsapp';
export type LeadStatus = 'NEW' | 'CONTACTED' | 'REPLIED' | 'NOT_INTERESTED';

export interface Job { id: number; niche: string; city: string; status: JobStatus; createdAt: string; }

export interface Lead {
  id: number; name: string; address: string; phone: string | null; rating: number | null; reviews: number | null;
  website: string | null; emails: string[]; score: number; reason: string; subject: string | null;
  emailBody: string | null; status: LeadStatus; draftLanguage: Lang | null; draftChannel: Channel | null;
}

export interface Profile { email: string; offer: string; displayName: string; language: Lang; }

export interface NewSearch { niche: string; city: string; }

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  list() { return this.http.get<Job[]>(`${API}/searches`); }
  create(s: NewSearch) { return this.http.post<Job>(`${API}/searches`, s); }
  get(id: string) { return this.http.get<{ job: Job; leads: Lead[] }>(`${API}/searches/${id}`); }

  profile() { return this.http.get<Profile>(`${API}/profile`); }
  saveProfile(p: Pick<Profile, 'offer' | 'displayName' | 'language'>) { return this.http.put<Profile>(`${API}/profile`, p); }

  setStatus(leadId: number, status: LeadStatus) {
    return this.http.patch<Lead>(`${API}/leads/${leadId}/status`, { status });
  }
  draft(leadId: number, language: Lang, channel: Channel) {
    return this.http.post<Lead>(`${API}/leads/${leadId}/draft`, { language, channel });
  }
}
