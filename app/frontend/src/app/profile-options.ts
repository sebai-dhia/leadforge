/** The chips offered in onboarding and on the profile page. Target labels must match the backend's industry map. */
export const SERVICE_OPTIONS = [
  'Web development', 'UI/UX design', 'Mobile apps', 'Branding and logos', 'SEO', 'Automation',
  'Copywriting', 'Video and motion', 'Photography', 'Social media', 'Online ads', 'Graphic design', 'Translation', 'Illustration', 'Voice-over',
];

export const TARGET_OPTIONS = [
  'Dentists and clinics', 'Doctors and clinics', 'Pharmacies', 'Restaurants and cafés', 'Hotels and guesthouses',
  'Gyms and fitness', 'Beauty salons', 'Hair salons', 'Law firms', 'Car repair', 'Bakeries', 'Schools and training',
  'Real estate agencies', 'Opticians', 'Veterinary clinics', 'Travel agencies', 'Wedding and event venues', 'Florists', 'Clothing boutiques', 'Furniture and decor stores', 'Architects and interior design', 'Accounting firms', 'Driving schools', 'Spas and wellness',
];

export const MAX_SERVICES = 3;
export const MAX_TARGETS = 6;

/** For each service chip, the business types it fits best, best fit first. Used to order the choices in step 2. */
export const SERVICE_TARGETS: Record<string, string[]> = {
  'Web development': ['Dentists and clinics', 'Doctors and clinics', 'Law firms', 'Real estate agencies', 'Veterinary clinics', 'Pharmacies', 'Accounting firms', 'Hair salons', 'Car repair', 'Schools and training', 'Architects and interior design'],
  'UI/UX design': ['Law firms', 'Real estate agencies', 'Architects and interior design', 'Hotels and guesthouses', 'Restaurants and cafés', 'Beauty salons', 'Dentists and clinics', 'Travel agencies'],
  'Mobile apps': ['Gyms and fitness', 'Restaurants and cafés', 'Beauty salons', 'Hair salons', 'Spas and wellness', 'Driving schools', 'Schools and training'],
  'Branding and logos': ['Restaurants and cafés', 'Bakeries', 'Clothing boutiques', 'Florists', 'Beauty salons', 'Hair salons', 'Spas and wellness', 'Opticians', 'Furniture and decor stores', 'Gyms and fitness'],
  'SEO': ['Dentists and clinics', 'Doctors and clinics', 'Law firms', 'Real estate agencies', 'Veterinary clinics', 'Car repair', 'Accounting firms', 'Opticians', 'Pharmacies', 'Driving schools', 'Hotels and guesthouses'],
  'Automation': ['Pharmacies', 'Dentists and clinics', 'Doctors and clinics', 'Veterinary clinics', 'Accounting firms', 'Real estate agencies', 'Schools and training', 'Car repair'],
  'Copywriting': ['Real estate agencies', 'Hotels and guesthouses', 'Law firms', 'Travel agencies', 'Architects and interior design', 'Wedding and event venues', 'Dentists and clinics', 'Accounting firms', 'Schools and training'],
  'Video and motion': ['Wedding and event venues', 'Restaurants and cafés', 'Hotels and guesthouses', 'Real estate agencies', 'Travel agencies', 'Furniture and decor stores', 'Gyms and fitness', 'Beauty salons'],
  'Photography': ['Restaurants and cafés', 'Hotels and guesthouses', 'Wedding and event venues', 'Real estate agencies', 'Clothing boutiques', 'Florists', 'Furniture and decor stores', 'Architects and interior design', 'Beauty salons', 'Bakeries'],
  'Social media': ['Restaurants and cafés', 'Clothing boutiques', 'Beauty salons', 'Hair salons', 'Florists', 'Bakeries', 'Spas and wellness', 'Gyms and fitness', 'Opticians', 'Pharmacies'],
  'Online ads': ['Real estate agencies', 'Restaurants and cafés', 'Clothing boutiques', 'Beauty salons', 'Gyms and fitness', 'Dentists and clinics', 'Driving schools', 'Travel agencies', 'Car repair', 'Opticians'],
  'Graphic design': ['Restaurants and cafés', 'Bakeries', 'Clothing boutiques', 'Florists', 'Wedding and event venues', 'Spas and wellness', 'Schools and training', 'Opticians'],
  'Translation': ['Travel agencies', 'Hotels and guesthouses', 'Law firms', 'Real estate agencies', 'Schools and training', 'Accounting firms', 'Doctors and clinics', 'Dentists and clinics'],
  'Illustration': ['Restaurants and cafés', 'Bakeries', 'Florists', 'Wedding and event venues', 'Clothing boutiques', 'Furniture and decor stores', 'Schools and training'],
  'Voice-over': ['Travel agencies', 'Hotels and guesthouses', 'Real estate agencies', 'Driving schools', 'Schools and training', 'Restaurants and cafés', 'Gyms and fitness', 'Car repair'],
};

/**
 * A service the person typed themselves has no fit list. These words tell which of the standard services it is closest to,
 * so it still counts when the business types are ranked. A text can match several.
 */
const SERVICE_WORDS: [RegExp, string][] = [
  [/web|site|wordpress|shopify|woocommerce|e-?commerce|laravel|react|angular|php|full.?stack|développeur|developer/i, 'Web development'],
  [/\bu[ix]\b|ui\/ux|figma|interface|prototype/i, 'UI/UX design'],
  [/\bapps?\b|ios|android|flutter|mobile|application/i, 'Mobile apps'],
  [/logo|brand|identit|charte graphique/i, 'Branding and logos'],
  [/\bseo\b|search engine|référencement|referencement/i, 'SEO'],
  [/automat|zapier|n8n|\bbots?\b|script|workflow|integration|intégration/i, 'Automation'],
  [/copy|writ|rédact|redact|blog|article|content|contenu|storytelling/i, 'Copywriting'],
  [/video|vidéo|motion|montage|film|animation|reels?|youtube/i, 'Video and motion'],
  [/photo/i, 'Photography'],
  [/social|community|instagram|facebook|tiktok|linkedin|réseaux|reseaux/i, 'Social media'],
  [/\bads?\b|advert|publicit|marketing|campaign|campagne|sponsor/i, 'Online ads'],
  [/graphi|flyer|poster|affiche|packaging|print|design/i, 'Graphic design'],
  [/translat|traduc|interpret|localiz/i, 'Translation'],
  [/illustrat|dessin|drawing|cartoon|caricature/i, 'Illustration'],
  [/voice|voix|narrat|dubbing|doublage|podcast|audio/i, 'Voice-over'],
];

/** The standard services a typed service is closest to (none when nothing matches). */
export function closestServices(text: string): string[] {
  return SERVICE_WORDS.filter(([re]) => re.test(text)).map(([, service]) => service).slice(0, 3);
}
