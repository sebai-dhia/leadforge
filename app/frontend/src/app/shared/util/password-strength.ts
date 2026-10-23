export type Strength = 'weak' | 'medium' | 'strong';

const COMMON = ['password', 'motdepasse', 'azerty', 'qwerty', 'admin', 'letmein', 'welcome', 'leadforge', 'iloveyou', '123456', '000000'];

function hasRun(p: string): boolean {
  // the same character 4 times in a row, or 4 characters going up or down by one (abcd, 1234, dcba)
  if (/(.)\1{3,}/.test(p)) return true;
  for (let i = 0; i + 3 < p.length; i++) {
    const d = p.charCodeAt(i + 1) - p.charCodeAt(i);
    if (Math.abs(d) === 1 && p.charCodeAt(i + 2) - p.charCodeAt(i + 1) === d && p.charCodeAt(i + 3) - p.charCodeAt(i + 2) === d) return true;
  }
  return false;
}

/**
 * A quick guide while typing, not the rule: the server decides (8 characters or more, not the email, not a known
 * leaked password). Length counts most, then variety; obvious patterns pull the score down.
 * Under 8 characters is weak; 8 to 11 is at best medium; strong needs length and variety.
 */
export function strengthOf(password: string, email = ''): Strength {
  const p = password;
  if ([...p].length < 8) return 'weak';
  const lower = p.toLowerCase();
  const local = email.split('@')[0].toLowerCase();
  if (COMMON.some(w => lower.includes(w)) || (local.length >= 4 && lower.includes(local)) || /^\d+$/.test(p)) return 'weak';
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(p)).length;
  let score = 1 + (p.length >= 12 ? 1 : 0) + (p.length >= 16 ? 1 : 0) + (p.length >= 20 ? 1 : 0) + (classes >= 3 ? 1 : 0);
  if (hasRun(p)) score -= 2;
  if (new Set(p).size < p.length / 2.5) score -= 1;
  return score >= 4 ? 'strong' : score >= 2 ? 'medium' : 'weak';
}
