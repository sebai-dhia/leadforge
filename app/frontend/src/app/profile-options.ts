/** The chips offered in onboarding and on the profile page. Target labels must match the backend's industry map. */
export const SERVICE_OPTIONS = [
  'Web development', 'UI/UX design', 'Mobile apps', 'Branding and logos', 'SEO', 'Automation',
  'Copywriting', 'Video and motion', 'Photography', 'Social media', 'E-commerce', 'Online ads', 'Graphic design', 'Translation',
];

export const TARGET_OPTIONS = [
  'Dentists and clinics', 'Doctors and clinics', 'Pharmacies', 'Restaurants and cafés', 'Hotels and guesthouses',
  'Gyms and fitness', 'Beauty salons', 'Hair salons', 'Law firms', 'Car repair', 'Bakeries', 'Schools and training',
];

export const MAX_SERVICES = 3;
export const MAX_TARGETS = 6;

/** For each service chip, the business types it fits best, best fit first. Used to order the choices in step 2. */
export const SERVICE_TARGETS: Record<string, string[]> = {
  'Web development': ['Dentists and clinics', 'Doctors and clinics', 'Law firms', 'Hair salons', 'Car repair', 'Schools and training', 'Gyms and fitness'],
  'UI/UX design': ['Law firms', 'Hotels and guesthouses', 'Restaurants and cafés', 'Beauty salons', 'Dentists and clinics', 'Gyms and fitness'],
  'Mobile apps': ['Gyms and fitness', 'Restaurants and cafés', 'Beauty salons', 'Hair salons', 'Schools and training'],
  'Branding and logos': ['Restaurants and cafés', 'Bakeries', 'Beauty salons', 'Hair salons', 'Gyms and fitness', 'Hotels and guesthouses'],
  'SEO': ['Dentists and clinics', 'Doctors and clinics', 'Law firms', 'Car repair', 'Hotels and guesthouses', 'Schools and training'],
  'Automation': ['Pharmacies', 'Dentists and clinics', 'Doctors and clinics', 'Schools and training', 'Car repair', 'Gyms and fitness'],
  'Copywriting': ['Hotels and guesthouses', 'Law firms', 'Dentists and clinics', 'Schools and training', 'Beauty salons'],
  'Video and motion': ['Restaurants and cafés', 'Hotels and guesthouses', 'Gyms and fitness', 'Beauty salons', 'Schools and training'],
  'Photography': ['Restaurants and cafés', 'Hotels and guesthouses', 'Beauty salons', 'Hair salons', 'Bakeries', 'Dentists and clinics'],
  'Social media': ['Restaurants and cafés', 'Beauty salons', 'Hair salons', 'Gyms and fitness', 'Bakeries', 'Hotels and guesthouses'],
  'E-commerce': ['Bakeries', 'Beauty salons', 'Pharmacies', 'Restaurants and cafés', 'Car repair'],
  'Online ads': ['Restaurants and cafés', 'Beauty salons', 'Hair salons', 'Gyms and fitness', 'Dentists and clinics', 'Car repair'],
  'Graphic design': ['Restaurants and cafés', 'Bakeries', 'Beauty salons', 'Hair salons', 'Schools and training', 'Gyms and fitness'],
  'Translation': ['Hotels and guesthouses', 'Law firms', 'Schools and training', 'Doctors and clinics', 'Dentists and clinics'],
};
