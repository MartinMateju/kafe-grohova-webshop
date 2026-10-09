import { allLangs, localePath, type Lang } from './utils';

/** Link translations by resource ID, because Shopify handles can be translated. */
export async function localizedPaths<T extends { id: string; handle: string }>(
  load: (lang: Lang) => Promise<T[]>,
  section: string,
) {
  const catalogs = await Promise.all(allLangs.map(async lang => ({ lang, items: await load(lang) })));
  return catalogs.flatMap(({ lang, items }) => items.map(item => {
    const alternatePaths = Object.fromEntries(catalogs.map(catalog => {
      const counterpart = catalog.items.find(candidate => candidate.id === item.id);
      return [catalog.lang, localePath(catalog.lang, counterpart ? `/${section}/${counterpart.handle}` : `/${section}`)];
    }));
    return { params: { lang, handle: item.handle }, props: { item, alternatePaths } };
  }));
}
