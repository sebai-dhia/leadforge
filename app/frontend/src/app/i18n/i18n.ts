import { ApplicationRef, Injectable, inject, signal } from '@angular/core';
import { EN_APP } from './i18n-app-en';
import { FR_APP } from './i18n-app-fr';
import { splitReason, translateChip, translateFound, translateNiche, translateNote, translateReason } from './i18n-phrases';

export type AppLang = 'en' | 'fr';

const EN = {
  // app shell
  'nav.leads': 'Leads',
  'nav.find': 'Find leads',
  'banner.guest': 'You are using a temporary guest account. Your leads are deleted after a few minutes without activity.',
  'banner.keep': 'Sign in to keep them',
  'footer.placeData': 'Place data by',
  'footer.and': 'and',
  'footer.osm': 'OpenStreetMap contributors',
  'footer.builtBy': 'Built by',

  // account menu
  'menu.open': 'Open account menu',
  'menu.guest': 'Guest',
  'menu.allowance': "Today's allowance",
  'menu.frees': 'Frees up gradually over 24 hours.',
  'menu.searches': 'Searches',
  'menu.lookups': 'Contact lookups',
  'menu.messages': 'Messages',
  'menu.left': '{left} of {limit} left',
  'menu.profile': 'View full profile',
  'menu.language': 'Language',
  'menu.keep': 'Sign in to keep your leads',
  'menu.logout': 'Log out',

  // landing
  'landing.how': 'How it works',
  'landing.why': 'Why Leadforge',
  'landing.signin': 'Sign in',
  'landing.seatsDefault': 'Free to try',
  'landing.seatsFull': 'Guest seats full, try again in a few minutes',
  'landing.title': 'Find local businesses that need you, and a way to reach them.',
  'landing.sub': 'Describe your service, pick a city or draw an area on the map, and review a ranked list of businesses with phone, email and social links. Leadforge drafts the message. You press send.',
  'landing.guest': 'Try as guest',
  'landing.fine': 'No card and no sign-up form. You get a private temporary account, deleted when you leave.',
  'landing.errFull': 'All guest seats are taken right now. Try again in a few minutes, or sign in.',
  'landing.errServer': 'Could not reach the server. Please try again.',
  'landing.sampleName': "Bright Smile Dental",
  'landing.sampleMeta': "Dental clinic · Austin, USA",
  'landing.sampleReason': 'Appointment-based business with no website. Phone and a social page found.',
  'landing.phone': 'Phone',
  'landing.email': 'Email',
  'landing.social': 'Social page',
  'landing.draftLabel': 'DRAFT · ENGLISH · WHATSAPP',
  'landing.draftText': "Hello, customers seem very happy with Bright Smile Dental. Can your patients already book online?",
  'landing.fit': 'FIT',
  'landing.howEyebrow': 'HOW IT WORKS',
  'landing.howTitle': 'From a service idea to a message in three steps.',
  'landing.step1': '1. Tell us what you offer',
  'landing.step1Text': 'Pick your services. Leadforge suggests the kinds of businesses most likely to need them.',
  'landing.step2': '2. Pick where to look',
  'landing.step2Text': 'Type up to three cities, or draw an area on the map. Results come with phone, email and social links when they exist.',
  'landing.step3': '3. Review, then reach out',
  'landing.step3Text': 'Reachable leads rank first. Open a draft in English, French or Arabic and send it by email or WhatsApp yourself.',
  'landing.whyTitle': 'Built to help you reach people, not to spam them.',
  'landing.why1': 'Drafts only',
  'landing.why1Text': 'Nothing is ever sent for you. You read, edit and send every message.',
  'landing.why2': 'Honest contact data',
  'landing.why2Text': "Details come from open map data and the business's own pages. When none exist, the lead says so.",
  'landing.why3': 'Free to try',
  'landing.why3Text': 'Guest access is limited to a few people at a time, so it stays fast.',
  'landing.finalTitle': 'See your first list of leads in a minute.',
  'landing.finalText': 'Open a guest session and search your own city.',
  'landing.home': 'Leadforge home',
  'landing.siteNav': 'Site',
  'landing.coords': '30.27°N · 97.74°W',
  'landing.sample': 'Sample data',
  'landing.chipReach': 'Reachable leads first',
  'landing.chipDraft': 'Draft ready',
  'landing.reasonNoSite': 'No website',
  'landing.reasonPhone': 'Phone found',
  'landing.reasonSocial': 'Social page found',
  'landing.stage1': 'Your specialization',
  'landing.stage2': 'Search area',
  'landing.stage3': 'Lead and draft',
  'landing.radarCount': '{n} found · {m} reachable',
  'landing.tickerLabel': 'Business types you can search',

  // sign-in
  'login.back': 'Back to home',
  'login.title': "Sign in",
  'login.lede': "Welcome back. Your leads are right where you left them.",
  'login.justLooking': 'Just looking?',
  'login.newHere': 'New here?',
  'login.signingIn': 'Signing in…',
  'login.showPw': 'Show password',
  'login.hidePw': 'Hide password',
  'login.asideTitle': 'Your next client is already on the map.',
  'login.asideSub': 'Leadforge finds the local businesses that need you, ranks the ones you can reach, and drafts the message. You press send.',
  'login.formLabel': 'Sign in form',
  'login.full': "All guest seats are taken right now. Try again in a few minutes, or sign in.",
  'login.guest': "Try as guest",
  'login.guestFine': "No sign-up needed. Your guest data is deleted after {m} minutes without activity.",
  'login.or': "or",
  'login.orEmail': "or continue with email",
  'login.email': 'Email',
  'login.password': 'Password',
  'login.passwordHint': 'Your password',
  'login.signin': 'Sign in',
  'login.googleUnavailable': "Google sign-in didn't load. You can still sign in with your email.",
  'login.errWrong': "That email and password don't match. Check them and try again. If you signed up with Google, use Continue with Google.",
  'login.errServer': "We couldn't reach the server. Check your connection and try again.",
  'login.linkTitle': "This email already has an account",
  'login.linkText': "Enter its password once to connect Google. Next time, one click signs you in.",
  'login.linkBtn': "Connect Google",
  'login.linkBusy': "Connecting…",
  'login.linkCancel': "Cancel",
  'login.errLinkWrong': "That password does not match this account. Try again.",
  'login.errLinkOther': "This account is already connected to another Google account.",
  'login.errLinkLater': "Too many attempts. Wait a few minutes and try again.",
  'login.errLinkExpired': "The Google sign-in expired. Please continue with Google again.",
  'login.errGoogle': "Google couldn't confirm your sign-in. Please try again.",
  'login.forgot': "Forgot your password?",
  'login.forgotTitle': "Reset your password",
  'login.forgotText': "Continue with Google using the address of your account, then choose a new password.",
  'login.forgotBack': "Back to sign in",
  'login.errReset': "No account uses this Google address.",
  'login.pwTitleCreate': "Choose a password",
  'login.pwTitleReset': "Choose a new password",
  'login.pwTextCreate': "Your Google account is confirmed. Choose a password so you can also sign in with your email.",
  'login.pwTextReset': "Your Google account is confirmed. The new password replaces the old one and signs out your other devices.",
  'login.pwNew': "New password",
  'login.pwConfirm': "Confirm password",
  'pw.strength.weak': "Weak",
  'pw.strength.medium': "Medium",
  'pw.strength.strong': "Strong",
  'pw.more': "{n} more character(s) to reach the minimum of 8.",
  'pw.mismatch': "The two passwords are not the same.",
  'login.pwHint': "8 characters or more",
  'login.pwBtn': "Save and continue",
  'login.pwBusy': "Saving…",
  'login.pwExpired': "This step expired. Please continue with Google again.",
  'pw.tooShort': "Use at least 8 characters.",
  'pw.tooLong': "That password is too long (72 bytes at most).",
  'pw.sameAsEmail': "The password must not contain your email address.",
  'pw.leaked': "This password appears in a known data breach. Choose another one.",
  'pw.wrongCurrent': "The current password is not right.",
  'pwcard.title': "Password",
  'pwcard.text': "Used to sign in with your email.",
  'pwcard.current': "Current password",
  'pwcard.new': "New password",
  'pwcard.open': "Change",
  'pwcard.step1': "Confirm it's you: enter your current password.",
  'pwcard.step2': "Choose the new password and type it twice. Your other devices will be signed out.",
  'pwcard.dialogTitle': "Change password",
  'pwcard.stepOf': "Step {n} of 2",
  'pwcard.openSet': "Set a password",
  'pwcard.textNone': "You sign in with Google. Set a password to also sign in with your email.",
  'pwcard.setTitle': "Set a password",
  'pwcard.stepGoogle': "Confirm it's you with Google first. Then you choose the password.",
  'pwcard.step2Set': "Choose a password and type it twice. You can then sign in with Google or with your email.",
  'pwcard.doneSet': "Password set. You can now sign in with your email too.",
  'pwcard.errGoogleOther': "That Google account is not the one this account uses. Choose the same one.",
  'pwcard.next': "Continue",
  'pwcard.checking': "Checking…",
  'pwcard.save': "Change password",
  'pwcard.busy': "Changing…",
  'pwcard.done': "Password changed. Your other devices were signed out.",
} as const;

const EN_ALL = { ...EN, ...EN_APP };
export type I18nKey = keyof typeof EN_ALL;

const FR_BASE: Record<keyof typeof EN, string> = {
  'nav.leads': 'Prospects',
  'nav.find': 'Trouver des prospects',
  'banner.guest': "Vous utilisez un compte invité temporaire. Vos prospects sont supprimés après quelques minutes d'inactivité.",
  'banner.keep': 'Connectez-vous pour les garder',
  'footer.placeData': 'Données de lieux par',
  'footer.and': 'et',
  'footer.osm': "les contributeurs d'OpenStreetMap",
  'footer.builtBy': 'Créé par',

  'menu.open': 'Ouvrir le menu du compte',
  'menu.guest': 'Invité',
  'menu.allowance': "Quota d'aujourd'hui",
  'menu.frees': "Se libère progressivement sur 24 heures.",
  'menu.searches': 'Recherches',
  'menu.lookups': 'Recherches de contact',
  'menu.messages': 'Messages',
  'menu.left': '{left} sur {limit} restantes',
  'menu.profile': 'Voir le profil complet',
  'menu.language': 'Langue',
  'menu.keep': 'Connectez-vous pour garder vos prospects',
  'menu.logout': 'Se déconnecter',

  'landing.how': 'Comment ça marche',
  'landing.why': 'Pourquoi Leadforge',
  'landing.signin': 'Se connecter',
  'landing.seatsDefault': 'À essayer gratuitement',
  'landing.seatsFull': 'Places invités complètes, réessayez dans quelques minutes',
  'landing.title': 'Trouvez les commerces locaux qui ont besoin de vous, et comment les joindre.',
  'landing.sub': "Décrivez votre service, choisissez une ville ou dessinez une zone sur la carte, puis consultez une liste classée d'entreprises avec téléphone, e-mail et réseaux sociaux. Leadforge rédige le message. Vous appuyez sur envoyer.",
  'landing.guest': "Essayer en invité",
  'landing.fine': "Sans carte ni formulaire d'inscription. Vous recevez un compte temporaire privé, supprimé quand vous partez.",
  'landing.errFull': 'Toutes les places invités sont prises pour le moment. Réessayez dans quelques minutes, ou connectez-vous.',
  'landing.errServer': 'Impossible de joindre le serveur. Réessayez.',
  'landing.sampleName': "Cabinet Dentaire Lumière",
  'landing.sampleMeta': "Cabinet dentaire · Lyon, France",
  'landing.sampleReason': "Activité sur rendez-vous sans site web. Téléphone et page de réseau social trouvés.",
  'landing.phone': 'Téléphone',
  'landing.email': 'E-mail',
  'landing.social': 'Page sociale',
  'landing.draftLabel': 'BROUILLON · FRANÇAIS · WHATSAPP',
  'landing.draftText': "Bonjour, les clients du Cabinet Dentaire Lumière semblent très satisfaits. Vos patients peuvent-ils déjà réserver en ligne ?",
  'landing.fit': 'SCORE',
  'landing.howEyebrow': 'COMMENT ÇA MARCHE',
  'landing.howTitle': "De l'idée de service au message en trois étapes.",
  'landing.step1': '1. Dites ce que vous proposez',
  'landing.step1Text': 'Choisissez vos services. Leadforge suggère les types de commerces les plus susceptibles d\'en avoir besoin.',
  'landing.step2': '2. Choisissez où chercher',
  'landing.step2Text': "Saisissez jusqu'à trois villes, ou dessinez une zone sur la carte. Les résultats incluent téléphone, e-mail et réseaux sociaux quand ils existent.",
  'landing.step3': '3. Examinez, puis contactez',
  'landing.step3Text': "Les prospects joignables arrivent en premier. Ouvrez un brouillon en français, anglais ou arabe et envoyez-le vous-même par e-mail ou WhatsApp.",
  'landing.whyTitle': 'Conçu pour vous aider à joindre des gens, pas pour faire du spam.',
  'landing.why1': 'Brouillons uniquement',
  'landing.why1Text': "Rien n'est jamais envoyé à votre place. Vous lisez, modifiez et envoyez chaque message.",
  'landing.why2': 'Contacts honnêtes',
  'landing.why2Text': "Les informations viennent de données cartographiques ouvertes et des pages de l'entreprise. S'il n'y en a pas, le prospect l'indique.",
  'landing.why3': 'Gratuit à essayer',
  'landing.why3Text': "L'accès invité est limité à quelques personnes à la fois, pour que tout reste rapide.",
  'landing.finalTitle': 'Voyez votre première liste de prospects en une minute.',
  'landing.finalText': 'Ouvrez une session invité et cherchez dans votre ville.',
  'landing.home': "Accueil Leadforge",
  'landing.siteNav': 'Site',
  'landing.coords': '45.76°N · 4.84°E',
  'landing.sample': 'Exemple',
  'landing.chipReach': 'Joignables en premier',
  'landing.chipDraft': 'Brouillon prêt',
  'landing.reasonNoSite': 'Pas de site web',
  'landing.reasonPhone': 'Téléphone trouvé',
  'landing.reasonSocial': 'Page sociale trouvée',
  'landing.stage1': 'Votre spécialisation',
  'landing.stage2': 'Zone de recherche',
  'landing.stage3': 'Prospect et brouillon',
  'landing.radarCount': '{n} trouvés · {m} joignables',
  'landing.tickerLabel': "Types d'entreprises que vous pouvez chercher",

  'login.back': "Retour à l'accueil",
  'login.title': "Connexion",
  'login.lede': "Bon retour. Vos prospects vous attendent là où vous les avez laissés.",
  'login.justLooking': 'Juste pour voir ?',
  'login.newHere': 'Nouveau ici ?',
  'login.signingIn': 'Connexion…',
  'login.showPw': 'Afficher le mot de passe',
  'login.hidePw': 'Masquer le mot de passe',
  'login.asideTitle': 'Votre prochain client est déjà sur la carte.',
  'login.asideSub': "Leadforge trouve les commerces locaux qui ont besoin de vous, classe ceux que vous pouvez joindre et rédige le message. Vous appuyez sur envoyer.",
  'login.formLabel': 'Formulaire de connexion',
  'login.full': "Toutes les places invités sont prises pour le moment. Réessayez dans quelques minutes, ou connectez-vous.",
  'login.guest': "Essayer en invité",
  'login.guestFine': "Sans inscription. Vos données d'invité sont supprimées après {m} minutes d'inactivité.",
  'login.or': "ou",
  'login.orEmail': "ou continuer avec un e-mail",
  'login.email': 'E-mail',
  'login.password': 'Mot de passe',
  'login.passwordHint': 'Votre mot de passe',
  'login.signin': 'Se connecter',
  'login.googleUnavailable': "La connexion Google ne s'est pas chargée. Vous pouvez toujours vous connecter avec votre e-mail.",
  'login.errWrong': "Cet e-mail et ce mot de passe ne correspondent pas. Vérifiez-les et réessayez. Si vous vous êtes inscrit avec Google, utilisez Continuer avec Google.",
  'login.errServer': "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.",
  'login.linkTitle': "Cet e-mail a déjà un compte",
  'login.linkText': "Saisissez son mot de passe une seule fois pour connecter Google. La prochaine fois, un clic suffit.",
  'login.linkBtn': "Connecter Google",
  'login.linkBusy': "Connexion…",
  'login.linkCancel': "Annuler",
  'login.errLinkWrong': "Ce mot de passe ne correspond pas à ce compte. Réessayez.",
  'login.errLinkOther': "Ce compte est déjà connecté à un autre compte Google.",
  'login.errLinkLater': "Trop de tentatives. Patientez quelques minutes et réessayez.",
  'login.errLinkExpired': "La connexion Google a expiré. Continuez à nouveau avec Google.",
  'login.errGoogle': "Google n'a pas pu confirmer votre connexion. Réessayez.",
  'login.forgot': "Mot de passe oublié ?",
  'login.forgotTitle': "Réinitialiser votre mot de passe",
  'login.forgotText': "Continuez avec Google avec l'adresse de votre compte, puis choisissez un nouveau mot de passe.",
  'login.forgotBack': "Retour à la connexion",
  'login.errReset': "Aucun compte n'utilise cette adresse Google.",
  'login.pwTitleCreate': "Choisissez un mot de passe",
  'login.pwTitleReset': "Choisissez un nouveau mot de passe",
  'login.pwTextCreate': "Votre compte Google est confirmé. Choisissez un mot de passe pour pouvoir aussi vous connecter avec votre e-mail.",
  'login.pwTextReset': "Votre compte Google est confirmé. Le nouveau mot de passe remplace l'ancien et déconnecte vos autres appareils.",
  'login.pwNew': "Nouveau mot de passe",
  'login.pwConfirm': "Confirmer le mot de passe",
  'pw.strength.weak': "Faible",
  'pw.strength.medium': "Moyen",
  'pw.strength.strong': "Fort",
  'pw.more': "Encore {n} caractère(s) pour atteindre le minimum de 8.",
  'pw.mismatch': "Les deux mots de passe ne sont pas identiques.",
  'login.pwHint': "8 caractères ou plus",
  'login.pwBtn': "Enregistrer et continuer",
  'login.pwBusy': "Enregistrement…",
  'login.pwExpired': "Cette étape a expiré. Continuez de nouveau avec Google.",
  'pw.tooShort': "Utilisez au moins 8 caractères.",
  'pw.tooLong': "Ce mot de passe est trop long (72 octets au plus).",
  'pw.sameAsEmail': "Le mot de passe ne doit pas contenir votre adresse e-mail.",
  'pw.leaked': "Ce mot de passe figure dans une fuite de données connue. Choisissez-en un autre.",
  'pw.wrongCurrent': "Le mot de passe actuel n'est pas le bon.",
  'pwcard.title': "Mot de passe",
  'pwcard.text': "Sert à vous connecter avec votre e-mail.",
  'pwcard.current': "Mot de passe actuel",
  'pwcard.new': "Nouveau mot de passe",
  'pwcard.open': "Modifier",
  'pwcard.step1': "Confirmez que c'est bien vous : saisissez votre mot de passe actuel.",
  'pwcard.step2': "Choisissez le nouveau mot de passe et saisissez-le deux fois. Vos autres appareils seront déconnectés.",
  'pwcard.dialogTitle': "Modifier le mot de passe",
  'pwcard.stepOf': "Étape {n} sur 2",
  'pwcard.openSet': "Définir un mot de passe",
  'pwcard.textNone': "Vous vous connectez avec Google. Définissez un mot de passe pour aussi vous connecter avec votre e-mail.",
  'pwcard.setTitle': "Définir un mot de passe",
  'pwcard.stepGoogle': "Confirmez d'abord que c'est vous avec Google. Vous choisirez ensuite le mot de passe.",
  'pwcard.step2Set': "Choisissez un mot de passe et saisissez-le deux fois. Vous pourrez ensuite vous connecter avec Google ou avec votre e-mail.",
  'pwcard.doneSet': "Mot de passe défini. Vous pouvez maintenant aussi vous connecter avec votre e-mail.",
  'pwcard.errGoogleOther': "Ce compte Google n'est pas celui de ce compte. Choisissez le même.",
  'pwcard.next': "Continuer",
  'pwcard.checking': "Vérification…",
  'pwcard.save': "Changer le mot de passe",
  'pwcard.busy': "Modification…",
  'pwcard.done': "Mot de passe modifié. Vos autres appareils ont été déconnectés.",
};

const DICTS: Record<AppLang, Record<I18nKey, string>> = { en: EN_ALL, fr: { ...FR_BASE, ...FR_APP } };

function read(): AppLang {
  try {
    const saved = localStorage.getItem('lf_lang');
    if (saved === 'en' || saved === 'fr') return saved;
  } catch { /* storage unavailable */ }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

/** Interface language. Separate from the language of the messages a person writes to businesses. */
@Injectable({ providedIn: 'root' })
export class I18n {
  readonly lang = signal<AppLang>(read());
  private readonly appRef = inject(ApplicationRef);

  constructor() {
    document.documentElement.lang = this.lang();
  }

  set(lang: AppLang) {
    if (lang === this.lang()) return;
    const apply = () => {
      this.lang.set(lang);
      document.documentElement.lang = lang;
      try { localStorage.setItem('lf_lang', lang); } catch { /* storage unavailable */ }
      this.appRef.tick(); // the new text must be in the page before the transition takes its second snapshot
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (doc.startViewTransition && !calm) doc.startViewTransition(apply);
    else apply();
  }

  private fr() { return this.lang() === 'fr'; }

  /** The reason line under a lead, the lookup note, business types and chips: fixed English phrases, shown in French. */
  readonly reason = (text: string | null) => translateReason(text, this.fr());
  readonly reasonParts = (text: string | null) => splitReason(text, this.fr());
  readonly note = (text: string | null) => translateNote(text, this.fr());
  readonly found = (word: string) => translateFound(word, this.fr());
  readonly niche = (text: string | null) => translateNiche(text, this.fr());
  readonly chip = (label: string) => translateChip(label, this.fr());

  /** How long ago, in the interface language and in plain steps: "3 days ago", "il y a 2 semaines". */
  readonly ago = (iso: string | null): string => {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (isNaN(then)) return '';
    const rtf = new Intl.RelativeTimeFormat(this.lang() === 'fr' ? 'fr' : 'en', { numeric: 'auto' });
    const minutes = Math.round((Date.now() - then) / 60000);
    if (minutes < 60) return rtf.format(-Math.max(minutes, 0), 'minute');
    const hours = Math.round(minutes / 60);
    if (hours < 24) return rtf.format(-hours, 'hour');
    const days = Math.round(hours / 24);
    if (days < 7) return rtf.format(-days, 'day');
    if (days < 30) return rtf.format(-Math.round(days / 7), 'week');
    if (days < 365) return rtf.format(-Math.round(days / 30), 'month');
    return rtf.format(-Math.round(days / 365), 'year');
  };

  /** Dates in the interface language, e.g. "Oct 16, 20:46" or "16 oct., 20:46". */
  readonly date = (iso: string | null, style: 'short' | 'long' = 'short'): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const locale = this.lang() === 'fr' ? 'fr-FR' : 'en-US';
    return new Intl.DateTimeFormat(locale, style === 'short'
      ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { dateStyle: 'short', timeStyle: 'short' }).format(d);
  };

  /** Reads the language signal, so a template that calls it updates when the language changes. */
  readonly t = (key: I18nKey, params?: Record<string, string | number>): string => {
    let text = DICTS[this.lang()][key] ?? EN_ALL[key];
    if (params) for (const [k, v] of Object.entries(params)) text = text.split(`{${k}}`).join(String(v));
    return text;
  };
}
