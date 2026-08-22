import { ui, defaultLang, languages, type Lang, type UIKey } from './ui';

export { languages, defaultLang };
export type { Lang };

/** Pull the locale out of a pathname like /cs/store/handle. */
export function getLangFromUrl(url: URL): Lang {
  const [, lang] = url.pathname.split('/');
  if (lang && lang in ui) return lang as Lang;
  return defaultLang;
}

/** Translator bound to a locale, falling back to Czech for missing keys. */
export function useTranslations(lang: Lang) {
  return function t(key: UIKey): string {
    return ui[lang][key] ?? ui[defaultLang][key];
  };
}

/** Build a locale-prefixed path: localePath('cs', '/store') -> '/cs/store'. */
export function localePath(lang: Lang, path = '/'): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (clean === '/') return `/${lang}/`;
  return `/${lang}${clean}`;
}

/** Swap the locale on the current pathname, keeping the rest of the route. */
export function switchLocalePath(url: URL, target: Lang): string {
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length && segments[0] in ui) {
    segments[0] = target;
  } else {
    segments.unshift(target);
  }
  return `/${segments.join('/')}`;
}

/** All locales, for getStaticPaths. */
export const allLangs = Object.keys(ui) as Lang[];

/**
 * Shopify's @inContext directive takes an ISO language code. Czech content
 * lives under CS in Shopify's Translate & Adapt app.
 */
export function shopifyLanguage(lang: Lang): 'CS' | 'EN' {
  return lang === 'cs' ? 'CS' : 'EN';
}
