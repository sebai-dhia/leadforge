import { JobStatus, UsageKind } from '../../core/api.service';
import { I18nKey } from '../../i18n/i18n';

export type Tab = 'overview' | 'users' | 'failed' | 'settings';
export type SearchStatus = JobStatus | '';

export const ROLES = ['USER', 'GUEST', 'ADMIN'] as const;
export const KINDS: { kind: UsageKind; label: I18nKey }[] = [
  { kind: 'search', label: 'admin.kindSearch' },
  { kind: 'draft', label: 'admin.kindDraft' },
  { kind: 'enrich', label: 'admin.kindEnrich' },
];
export const PAGE = 25;

export function roleKey(role: string): I18nKey {
  return (ROLES as readonly string[]).includes(role) ? (`role.${role}` as I18nKey) : 'role.USER';
}
