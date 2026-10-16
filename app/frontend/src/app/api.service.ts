import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { API } from './auth.service';

export type JobStatus = 'PENDING' | 'DONE' | 'FAILED';
export type Lang = 'en' | 'fr' | 'ar';
export type Channel = 'email' | 'whatsapp';
export type LeadStatus = 'NEW' | 'CONTACTED' | 'REPLIED' | 'NOT_INTERESTED';
export type LeadSort = 'score' | 'recent' | 'name';

export interface Job {
  id: number; niche: string; city: string; bbox?: string; status: JobStatus; createdAt: string;
  foundCount: number | null; newCount: number | null;
}

export interface Lead {
  id: number; name: string; address: string; phone: string | null; rating: number | null; reviews: number | null;
  website: string | null; emails: string[]; social: string[]; score: number; reason: string; subject: string | null;
  emailBody: string | null; status: LeadStatus; draftLanguage: Lang | null; draftChannel: Channel | null;
  niche: string | null; city: string | null; firstSeenAt: string | null; lastSeenAt: string | null;
  contactCheckedAt: string | null;
}

export interface EnrichResult { lead: Lead; found: string[]; note: string; sources: string[]; }

export interface Usage { used: number; limit: number; }
export type UsageMap = Record<'search' | 'draft' | 'enrich', Usage>;

export interface Profile { email: string; offer: string; displayName: string; language: Lang; role?: string; isDemo?: boolean; }

export interface NewSearch {
  niche: string;
  city?: string;
  cities?: string[];
  bbox?: string;
}

/** Filters shared by the leads list and the CSV export. */
export interface LeadFilters {
  status: LeadStatus | 'ALL';
  reachable: boolean;
  q: string;
  searchId: number;
  sort: LeadSort;
}

export interface LeadPage {
  items: Lead[]; total: number; page: number; size: number;
  counts: Record<LeadStatus, number>;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  list() { return this.http.get<Job[]>(`${API}/searches`); }
  create(s: NewSearch) { return this.http.post<Job>(`${API}/searches`, s); }
  get(id: string) { return this.http.get<{ job: Job; leads: Lead[] }>(`${API}/searches/${id}`); }

  demoStatus() {
    return this.http.get<{ demoFull: boolean; activeSessions: number; maxSessions: number; idleMinutes: number }>(`${API}/auth/demo-status`);
  }

  suggestedNiches() {
    return this.http.get<string[]>(`${API}/searches/suggested-niches`);
  }

  profile() { return this.http.get<Profile>(`${API}/profile`); }
  saveProfile(p: Pick<Profile, 'offer' | 'displayName' | 'language'>) { return this.http.put<Profile>(`${API}/profile`, p); }

  leads(f: LeadFilters, page: number, size = 40) {
    return this.http.get<LeadPage>(`${API}/leads`, { params: this.params(f).set('page', page).set('size', size) });
  }
  /** The file the user would download: same filters as the list, as a spreadsheet. */
  exportCsv(f: LeadFilters) {
    return this.http.get(`${API}/leads/export.csv`, { params: this.params(f), responseType: 'blob' });
  }

  usage() { return this.http.get<UsageMap>(`${API}/usage`); }

  /** Looks for missing contact details of one lead. Only fills gaps. */
  enrich(leadId: number) {
    return this.http.post<EnrichResult>(`${API}/leads/${leadId}/enrich`, {});
  }

  setStatus(leadId: number, status: LeadStatus) {
    return this.http.patch<Lead>(`${API}/leads/${leadId}/status`, { status });
  }
  draft(leadId: number, language: Lang, channel: Channel) {
    return this.http.post<Lead>(`${API}/leads/${leadId}/draft`, { language, channel });
  }

  private params(f: LeadFilters): HttpParams {
    return new HttpParams()
      .set('status', f.status === 'ALL' ? '' : f.status)
      .set('reachable', f.reachable)
      .set('q', f.q.trim())
      .set('searchId', f.searchId)
      .set('sort', f.sort);
  }
}
