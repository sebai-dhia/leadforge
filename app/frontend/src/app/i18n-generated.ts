/**
 * French for the short fixed phrases the backend and n8n write in English: the reason line under a lead,
 * the note after a contact lookup, business types and the profile chips. Anything not listed stays as written.
 */

/** Longest first, so "no website (prime outreach candidate)" wins over "no website". */
const REASON_PHRASES: [string, string][] = [
  ['Appointment-based business', 'Activité sur rendez-vous'],
  ['Reservation and ordering business', 'Activité de réservation et de commande'],
  ['Local business', 'Commerce local'],
  ['website already mentions online booking', 'le site mentionne déjà la réservation en ligne'],
  ['website found, no online booking seen', 'site web trouvé, pas de réservation en ligne repérée'],
  ['no website (prime outreach candidate)', 'pas de site web (candidat idéal)'],
  ['unreachable: no phone or email found yet', 'injoignable : aucun téléphone ni e-mail trouvé pour le moment'],
  ['phone, email, social page available', 'téléphone, e-mail, page sociale disponibles'],
  ['phone, email available', 'téléphone, e-mail disponibles'],
  ['phone, social page available', 'téléphone, page sociale disponibles'],
  ['email, social page available', 'e-mail, page sociale disponibles'],
  ['social profile available', 'profil social disponible'],
  ['social page available', 'page sociale disponible'],
  ['looks like a large organisation', 'ressemble à une grande organisation'],
  ['website could not be checked', 'site web non vérifiable'],
  ['no contact details found yet', 'aucune coordonnée trouvée pour le moment'],
  ['phone available', 'téléphone disponible'],
  ['email available', 'e-mail disponible'],
  ['website listed', 'site web indiqué'],
  ['no website listed', 'pas de site web connu'],
  ['no website', 'pas de site web'],
].sort((a, b) => b[0].length - a[0].length) as [string, string][];

export function translateReason(text: string | null, fr: boolean): string {
  if (!text || !fr) return text ?? '';
  let out = text;
  for (const [en, f] of REASON_PHRASES) out = out.split(en).join(f);
  return out.replace(/([^\s:]): /g, '$1 : '); // French puts a space before a colon
}

const NOTES_FR: Record<string, string> = {
  'The search service rejected its API key. Check the key in n8n.': "Le service de recherche a refusé sa clé d'API. Vérifiez la clé dans n8n.",
  'The search service has no credits or requests left.': "Le service de recherche n'a plus de crédits ni de requêtes.",
  'The search service is unavailable right now. Try again later.': 'Le service de recherche est indisponible pour le moment. Réessayez plus tard.',
  'A possible website was found, but its page does not clearly belong to this business (name, phone or type of business do not match), so it was ignored.':
    "Un site web possible a été trouvé, mais sa page ne semble pas appartenir à cette entreprise (nom, téléphone ou type d'activité ne correspondent pas). Il a été ignoré.",
  'The website did not respond.': "Le site web n'a pas répondu.",
  'Found the website by web search and confirmed it mentions this business. Checked its contact page too.':
    "Site web trouvé par recherche et confirmé comme mentionnant cette entreprise. Sa page de contact a aussi été vérifiée.",
  'Checked the website and its contact page.': 'Site web et page de contact vérifiés.',
  'No website found. Social pages were found by search; check they belong to this business.':
    "Aucun site web trouvé. Des pages de réseaux sociaux ont été trouvées par recherche ; vérifiez qu'elles appartiennent à cette entreprise.",
  'The search found no website or social page that clearly matches this business.':
    "La recherche n'a trouvé aucun site web ni page sociale correspondant clairement à cette entreprise.",
  'The search returned nothing for this business.': "La recherche n'a rien renvoyé pour cette entreprise.",
};

export function translateNote(text: string | null, fr: boolean): string {
  if (!text || !fr) return text ?? '';
  return NOTES_FR[text] ?? text;
}

/** What the lookup found: the backend reports these as English words. */
const FOUND_FR: Record<string, string> = {
  website: 'site web', phone: 'téléphone', email: 'e-mail', emails: 'e-mails', social: 'réseaux sociaux',
  'social page': 'page sociale', 'social pages': 'pages sociales', Website: 'Site web', Phone: 'Téléphone', Email: 'E-mail',
};

export function translateFound(word: string, fr: boolean): string {
  return fr ? (FOUND_FR[word] ?? word) : word;
}

const NICHES_FR: Record<string, string> = {
  'dental clinics': 'cabinets dentaires', 'doctors and clinics': 'médecins et cliniques', pharmacies: 'pharmacies',
  restaurants: 'restaurants', cafes: 'cafés', hotels: 'hôtels', gyms: 'salles de sport', 'hair salons': 'salons de coiffure',
  'beauty salons': 'instituts de beauté', lawyers: 'avocats', 'car repair': 'garages automobiles', supermarkets: 'supermarchés',
  bakeries: 'boulangeries', schools: 'écoles',
};

export function translateNiche(niche: string | null, fr: boolean): string {
  if (!niche || !fr) return niche ?? '';
  return NICHES_FR[niche.trim().toLowerCase()] ?? niche;
}

const CHIPS_FR: Record<string, string> = {
  'Web development': 'Développement web', 'UI/UX design': 'Design UI/UX', 'Mobile apps': 'Applications mobiles',
  'Branding and logos': 'Identité visuelle et logos', SEO: 'SEO (référencement)', Automation: 'Automatisation',
  Copywriting: 'Rédaction', 'Video and motion': 'Vidéo et animation', Photography: 'Photographie',
  'Social media': 'Réseaux sociaux', 'E-commerce': 'E-commerce',
  'Dentists and clinics': 'Dentistes et cabinets', 'Doctors and clinics': 'Médecins et cliniques', Pharmacies: 'Pharmacies',
  'Restaurants and cafés': 'Restaurants et cafés', 'Hotels and guesthouses': "Hôtels et maisons d'hôtes",
  'Gyms and fitness': 'Salles de sport et fitness', 'Beauty salons': 'Instituts de beauté', 'Hair salons': 'Salons de coiffure',
  'Law firms': "Cabinets d'avocats", 'Car repair': 'Garages automobiles', Bakeries: 'Boulangeries', 'Schools and training': 'Écoles et formations',
};

export function translateChip(label: string, fr: boolean): string {
  return fr ? (CHIPS_FR[label] ?? label) : label;
}
