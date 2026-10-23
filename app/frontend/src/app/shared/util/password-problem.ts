import { I18nKey } from '../../i18n/i18n';

/** The message for a refused new password: the server answers 422 with {problem}. */
export function passwordProblemKey(e: { status?: number; error?: { problem?: string } }): I18nKey {
  switch (e.error?.problem) {
    case 'TOO_SHORT': return 'pw.tooShort';
    case 'TOO_LONG': return 'pw.tooLong';
    case 'SAME_AS_EMAIL': return 'pw.sameAsEmail';
    case 'LEAKED': return 'pw.leaked';
    default: return 'login.errServer';
  }
}
