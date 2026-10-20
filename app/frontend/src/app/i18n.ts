import { ApplicationRef, Injectable, inject, signal } from '@angular/core';
import { EN_APP } from './i18n-app-en';
import { FR_APP } from './i18n-app-fr';
import { splitReason, translateChip, translateFound, translateNiche, translateNote, translateReason } from './i18n-generated';

export type AppLang = 'en' | 'fr';

const EN = {
  // app shell
  'nav.leads': 'Leads',
  'nav.find': 'Find leads',
  'banner.guest': 'You are using a temporary guest account. Your leads are deleted after a few minutes without activity.',
  'banner.keep': 'Sign in to keep them',
  'footer.placeData': 'Place data by',
  'footer.and': 'and OpenStreetMap contributors',

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
  'landing.seatsDefault': 'Public demo',
  'landing.seatsOpen': 'Demo open · {n} of {max} seats in use',
  'landing.seatsFull': 'Demo full · {n} of {max} seats in use',
  'landing.title': 'Find local businesses that need you, and a way to reach them.',
  'landing.sub': 'Describe your service, pick a city or draw an area on the map, and review a ranked list of businesses with phone, email and social links. Leadforge drafts the message. You press send.',
  'landing.guest': 'Try as guest',
  'landing.fine': 'No card and no sign-up form. You get a private temporary account, deleted when you leave.',
  'landing.errFull': 'The demo is full right now. Please try again in a few minutes.',
  'landing.errServer': 'Could not reach the server. Please try again.',
  'landing.sampleName': "Bright Smile Dental",
  'landing.sampleMeta': "Dental clinic · Austin, USA",
  'landing.sampleReason': 'Appointment-based business with no website. Phone and a social page found.',
  'landing.phone': 'Phone',
  'landing.email': 'Email',
  'landing.social': 'Social page',
  'landing.draftLabel': 'DRAFT · ENGLISH · WHATSAPP',
  'landing.draftText': "Hello, I build simple booking tools for dental clinics. I noticed your clinic takes appointments by phone only…",
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
  'landing.why3Text': 'The public demo is open to a few people at a time so it stays fast.',
  'landing.finalTitle': 'See your first list of leads in a minute.',
  'landing.finalText': 'Open a guest session and search your own city.',
  'landing.footDemo': 'Leadforge · demo version',
  'landing.mapData': 'Map data ©',
  'landing.osm': 'OpenStreetMap contributors',
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
  'login.seats': '{n} of {max} seats in use',
  'login.full': "All demo seats are taken right now. Please try again in a few minutes.",
  'login.guest': "Try as guest",
  'login.guestFine': "No sign-up needed. Your guest data is deleted after {m} minutes without activity.",
  'login.or': "or",
  'login.orEmail': "or continue with email",
  'login.email': 'Email',
  'login.password': 'Password',
  'login.passwordHint': 'Your password',
  'login.signin': 'Sign in',
  'login.googleUnavailable': "Google sign-in didn't load. You can still sign in with your email.",
  'login.errWrong': "That email and password don't match. Check them and try again.",
  'login.errServer': "We couldn't reach the server. Check your connection and try again.",
  'login.errExists': "This email already has an account with a password. Sign in with that password instead.",
  'login.errGoogle': "Google couldn't confirm your sign-in. Please try again.",
} as const;

const EN_ALL = { ...EN, ...EN_APP };
export type I18nKey = keyof typeof EN_ALL;

const FR_BASE: Record<keyof typeof EN, string> = {
  'nav.leads': 'Prospects',
  'nav.find': 'Trouver des prospects',
  'banner.guest': "Vous utilisez un compte invité temporaire. Vos prospects sont supprimés après quelques minutes d'inactivité.",
  'banner.keep': 'Connectez-vous pour les garder',
  'footer.placeData': 'Données de lieux par',
  'footer.and': "et les contributeurs d'OpenStreetMap",

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
  'landing.seatsDefault': 'Démo publique',
  'landing.seatsOpen': 'Démo ouverte · {n} places sur {max} occupées',
  'landing.seatsFull': 'Démo complète · {n} places sur {max} occupées',
  'landing.title': 'Trouvez les commerces locaux qui ont besoin de vous, et comment les joindre.',
  'landing.sub': "Décrivez votre service, choisissez une ville ou dessinez une zone sur la carte, puis consultez une liste classée d'entreprises avec téléphone, e-mail et réseaux sociaux. Leadforge rédige le message. Vous appuyez sur envoyer.",
  'landing.guest': "Essayer en invité",
  'landing.fine': "Sans carte ni formulaire d'inscription. Vous recevez un compte temporaire privé, supprimé quand vous partez.",
  'landing.errFull': 'La démo est complète pour le moment. Réessayez dans quelques minutes.',
  'landing.errServer': 'Impossible de joindre le serveur. Réessayez.',
  'landing.sampleName': "Cabinet Dentaire Lumière",
  'landing.sampleMeta': "Cabinet dentaire · Lyon, France",
  'landing.sampleReason': "Activité sur rendez-vous sans site web. Téléphone et page de réseau social trouvés.",
  'landing.phone': 'Téléphone',
  'landing.email': 'E-mail',
  'landing.social': 'Page sociale',
  'landing.draftLabel': 'BROUILLON · FRANÇAIS · WHATSAPP',
  'landing.draftText': "Bonjour, je crée des outils de réservation simples pour les cabinets dentaires. J'ai remarqué que votre cabinet ne prend les rendez-vous que par téléphone…",
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
  'landing.why3Text': "La démo publique est ouverte à quelques personnes à la fois pour rester rapide.",
  'landing.finalTitle': 'Voyez votre première liste de prospects en une minute.',
  'landing.finalText': 'Ouvrez une session invité et cherchez dans votre ville.',
  'landing.footDemo': 'Leadforge · version démo',
  'landing.mapData': 'Données cartographiques ©',
  'landing.osm': "contributeurs d'OpenStreetMap",
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
  'login.seats': '{n} places sur {max} occupées',
  'login.full': "Toutes les places de la démo sont prises pour le moment. Réessayez dans quelques minutes.",
  'login.guest': "Essayer en invité",
  'login.guestFine': "Sans inscription. Vos données d'invité sont supprimées après {m} minutes d'inactivité.",
  'login.or': "ou",
  'login.orEmail': "ou continuer avec un e-mail",
  'login.email': 'E-mail',
  'login.password': 'Mot de passe',
  'login.passwordHint': 'Votre mot de passe',
  'login.signin': 'Se connecter',
  'login.googleUnavailable': "La connexion Google ne s'est pas chargée. Vous pouvez toujours vous connecter avec votre e-mail.",
  'login.errWrong': "Cet e-mail et ce mot de passe ne correspondent pas. Vérifiez-les et réessayez.",
  'login.errServer': "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.",
  'login.errExists': "Cet e-mail a déjà un compte avec mot de passe. Connectez-vous avec ce mot de passe.",
  'login.errGoogle': "Google n'a pas pu confirmer votre connexion. Réessayez.",
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
