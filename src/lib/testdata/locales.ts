/** Loads one Faker locale on demand (each is a separate chunk). */

import type { Faker } from "@faker-js/faker";

const LOADERS: Record<string, () => Promise<{ faker: Faker }>> = {
  en_IN: () => import("@faker-js/faker/locale/en_IN"),
  en_US: () => import("@faker-js/faker/locale/en_US"),
  en_GB: () => import("@faker-js/faker/locale/en_GB"),
  de: () => import("@faker-js/faker/locale/de"),
  fr: () => import("@faker-js/faker/locale/fr"),
  es: () => import("@faker-js/faker/locale/es"),
  ja: () => import("@faker-js/faker/locale/ja"),
  ar: () => import("@faker-js/faker/locale/ar"),
};

export async function loadFaker(locale: string): Promise<Faker> {
  const load = LOADERS[locale] ?? LOADERS.en_IN;
  return (await load()).faker;
}
