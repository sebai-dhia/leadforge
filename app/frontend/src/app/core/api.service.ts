import { Injectable, inject, signal } from '@angular/core';
import { tap } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { API } from './auth.service';

export type JobStatus = 'PENDING' | 'DONE' | 'FAILED';
export type Lang = 'en' | 'fr' | 'ar';
export type Channel = 'email' | 'whatsapp';
export type Approach = 'auto' | 'missing' | 'success' | 'fresh' | 'timing' | 'tip' | 'curiosity';
export type LeadStatus = 'NEW' | 'CONTACTED' | 'REPLIED' | 'NOT_INTERESTED';
export type LeadSort = 'score' | 'recent' | 'oldest' | 'name';

export interface Job {
  id: number; niche: string; city: string; bbox?: string; status: JobStatus; createdAt: string;
  foundCount: number | null; newCount: number | null;
}

export interface Lead {
  id: number; name: string; address: string; phone: string | null; rating: number | null; reviews: number | null;
  website: string | null; emails: string[]; social: string[]; score: number; reason: string; subject: string | null;
  emailBody: string | null; status: LeadStatus; draftLanguage: Lang | null; draftChannel: Channel | null;
  niche: string | null; city: string | null; firstSeenAt: string | null; lastSeenAt: string | null;
  contactCheckedAt: string | null; hidden: boolean;
}

export interface EnrichResult { lead: Lead; found: string[]; note: string; sources: string[]; }

export interface Usage { used: number; limit: number; }
export type UsageMap = Record<'search' | 'draft' | 'enrich', Usage>;

export interface ProfileLink { label: string; url: string; }
export interface Profile {
  email: string; offer: string; displayName: string; headline: string; city: string; about: string;
  services: string[]; targets: string[]; links: ProfileLink[]; language: Lang; onboarded: boolean; specialization?: string | null;
  role?: string; isDemo?: boolean;
  /** False for an account that only signs in with Google: it sets a password through a Google confirmation. */
  hasPassword?: boolean;
}
export type ProfileUpdate = Partial<Pick<Profile, 'offer' | 'displayName' | 'headline' | 'city' | 'about' | 'services' | 'targets' | 'links' | 'language' | 'onboarded'>>;
export interface ProfileStats { leads: number; drafted: number; contacted: number; replied: number; }
/** available: the server has a bot and this account may connect (not a guest or shared demo account). */
export interface TelegramStatus { available: boolean; connected: boolean; notifications: boolean; hour: number; }
export interface TelegramLink { url: string; expiresAt: string; }
/** The admin's view: botName is empty when Telegram does not accept the token. polling: OFF, STARTING, OK or FAILING. */
export interface AdminTelegramStatus { tokenSet: boolean; botName: string | null; polling: 'OFF' | 'STARTING' | 'OK' | 'FAILING'; alertChatSet: boolean; adminConnected: boolean; connectedPeople: number; }
export interface AdminTelegramTest { result: 'SENT' | 'NOT_SET' | 'BLOCKED' | 'FAILED'; via: 'CONNECTED' | 'ALERT_CHAT' | 'NONE'; }

export interface NewSearch {
  niche: string;
  city?: string;
  cities?: string[];
  bbox?: string;
}

/** Filters shared by the leads list and the Excel export. */
export interface LeadFilters {
  status: LeadStatus | 'ALL';
  reachable: boolean;
  hidden: boolean;
  q: string;
  searchId: number;
  sort: LeadSort;
}

export interface LeadPage {
  items: Lead[]; total: number; page: number; size: number; hiddenCount: number;
  counts: Record<LeadStatus, number>;
}

export type UsageKind = 'search' | 'draft' | 'enrich';
export interface ApiProvider {
  calls24h: number; callsPrev24h: number; calls30d: number;
  inputTokens24h: number; outputTokens24h: number; inputTokens30d: number; outputTokens30d: number; tokensPrev24h: number;
  /** When the service last answered (null: never). silent: work that needs it was done in the last 24 h but it answered nothing. */
  lastAnswered: string | null; silent: boolean;
}
export interface AdminOverview {
  users: { total: number; byRole: Record<string, number>; new7Days: number; new30Days: number; seats: { active: number; max: number } };
  /** cap 0 means no cap; refunded are attempts that failed and were given back. */
  usage24h: Record<UsageKind, { used: number; refunded: number; cap: number }>;
  searches: { last24h: number; failed24h: number; pending: number };
  /** The last 30 days (UTC), oldest first. */
  daily: ({ day: string } & Record<UsageKind, number>)[];
  /** Registered accounts only (guests are counted apart). */
  active: { now: number; last24h: number; last7d: number; last30d: number; registered: number; guests: number; registeredNew30d: number; registeredPrev30d: number };
  /** What the workflows reported spending. tracked is false until a deployed workflow has reported once. */
  api: {
    tracked: boolean; gemini: ApiProvider; serper: ApiProvider; geoapify: ApiProvider;
    daily: { day: string; gemini: number; geminiTokens: number; serper: number; geoapify: number }[];
  };
}
export interface AdminUser {
  id: number; email: string; displayName: string; role: string; demo: boolean; google: boolean;
  createdAt: string; lastSeenAt: string | null; searches: number;
  usage24h: Record<UsageKind, Usage>;
}
/** How a search ran, not what it was about. userEmail is empty when the account was deleted (idle guests). */
export interface AdminSearch {
  id: number; createdAt: string; status: JobStatus; failureReason: string | null;
  foundCount: number | null; userId: number | null; userEmail: string | null; userRole: string | null;
}
export interface AdminPage<T> { items: T[]; total: number; page: number; size: number; }

/** One editable setting. value is what applies now; defaultValue is what .env says; overridden means the admin saved another value. */
export interface SettingEntry {
  key: string; group: 'limits' | 'caps' | 'guests' | 'demo' | 'throttle'; type: 'INT' | 'BOOL';
  min: number; max: number; value: string; defaultValue: string; overridden: boolean;
}
export interface AdminConfig {
  settings: SettingEntry[];
}
export interface AccountChange { currentPassword: string; email?: string; newPassword?: string; }

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
  /** The profile as last saved: the account menu follows it, so a new name shows at once. */
  readonly savedProfile = signal<Profile | null>(null);
  saveProfile(p: ProfileUpdate) { return this.http.put<Profile>(`${API}/profile`, p).pipe(tap(saved => this.savedProfile.set(saved))); }
  setSpecialization(specialization: string) { return this.http.put<Profile>(`${API}/profile/specialization`, { specialization }); }
  profileStats() { return this.http.get<ProfileStats>(`${API}/profile/stats`); }
  telegram() { return this.http.get<TelegramStatus>(`${API}/profile/telegram`); }
  telegramLink(lang: string, timeZone: string) { return this.http.post<TelegramLink>(`${API}/profile/telegram/link`, { lang, timeZone }); }
  setTelegram(settings: { notifications?: boolean; hour?: number }) { return this.http.put<TelegramStatus>(`${API}/profile/telegram`, settings); }
  disconnectTelegram() { return this.http.delete<TelegramStatus>(`${API}/profile/telegram`); }

  leads(f: LeadFilters, page: number, size = 40) {
    return this.http.get<LeadPage>(`${API}/leads`, { params: this.params(f).set('page', page).set('size', size) });
  }
  /** The file the user would download: same filters as the list, as an Excel file in the user's language. */
  exportLeads(f: LeadFilters, lang: string) {
    return this.http.get(`${API}/leads/export.xlsx`, { params: this.params(f).set('lang', lang), responseType: 'blob', observe: 'response' });
  }

  usage() { return this.http.get<UsageMap>(`${API}/usage`); }

  /** Looks for missing contact details of one lead. Only fills gaps. */
  enrich(leadId: number) {
    return this.http.post<EnrichResult>(`${API}/leads/${leadId}/enrich`, {});
  }

  setStatus(leadId: number, status: LeadStatus) {
    return this.http.patch<Lead>(`${API}/leads/${leadId}/status`, { status });
  }
  /** The same action for several leads. Delete only works for hidden leads. */
  bulk(action: 'hide' | 'restore' | 'delete', ids: number[]) {
    return this.http.post<{ count: number }>(`${API}/leads/bulk`, { action, ids });
  }
  /** Hides a lead from the lists (it stays known, so a new search does not offer it as new), or brings it back. */
  setHidden(leadId: number, hidden: boolean) {
    return this.http.patch<Lead>(`${API}/leads/${leadId}/hidden`, { hidden });
  }
  /** Saves the person's own edits of the written message. */
  saveMessage(leadId: number, subject: string, body: string) {
    return this.http.patch<Lead>(`${API}/leads/${leadId}/message`, { subject, body });
  }
  clearMessage(leadId: number) {
    return this.http.delete<Lead>(`${API}/leads/${leadId}/message`);
  }
  draft(leadId: number, language: Lang, channel: Channel, approach: Approach = 'auto', note = '') {
    return this.http.post<Lead>(`${API}/leads/${leadId}/draft`, { language, channel, approach, note: note.trim() });
  }

  adminOverview() { return this.http.get<AdminOverview>(`${API}/admin/overview`); }
  adminUsers(q: string, role: string, page: number, size = 25) {
    return this.http.get<AdminPage<AdminUser>>(`${API}/admin/users`, { params: { q: q.trim(), role, page, size } });
  }
  adminSearches(status: JobStatus | '', page: number, size = 25) {
    return this.http.get<AdminPage<AdminSearch>>(`${API}/admin/searches`, { params: { status, page, size } });
  }

  /** generatedPassword is only set when no password was given; it is shown once. */
  adminCreateUser(body: { email: string; displayName?: string; password?: string }) {
    return this.http.post<{ id: number; email: string; generatedPassword: string | null }>(`${API}/admin/users`, body);
  }
  adminDeleteUser(id: number) { return this.http.delete<void>(`${API}/admin/users/${id}`); }
  adminConfig() { return this.http.get<AdminConfig>(`${API}/admin/settings`); }
  /** A value sets the setting; null goes back to the .env value. */
  saveAdminConfig(values: Record<string, string | null>) { return this.http.put<AdminConfig>(`${API}/admin/settings`, { values }); }
  adminTelegram() { return this.http.get<AdminTelegramStatus>(`${API}/admin/telegram`); }
  adminTelegramTest() { return this.http.post<AdminTelegramTest>(`${API}/admin/telegram/test`, {}); }
  adminAccount() { return this.http.get<{ email: string }>(`${API}/admin/account`); }
  changeAdminAccount(change: AccountChange) { return this.http.put<{ email: string }>(`${API}/admin/account`, change); }

  private params(f: LeadFilters): HttpParams {
    return new HttpParams()
      .set('status', f.status === 'ALL' ? '' : f.status)
      .set('reachable', f.reachable)
      .set('hidden', f.hidden)
      .set('q', f.q.trim())
      .set('searchId', f.searchId)
      .set('sort', f.sort);
  }
}
