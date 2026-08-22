/**
 * Local fixtures used whenever Shopify credentials are absent.
 *
 * The shapes here are exactly what normalize.ts produces from the Storefront
 * API, so every page and component is exercised against the real data model.
 * Once a store is connected these are never touched.
 */
import type { Article, Product, Variant } from './types';
import type { Lang } from '../../i18n/ui';

const CURRENCY = 'CZK';

function money(amount: number) {
  return { amount: amount.toFixed(2), currencyCode: CURRENCY };
}

function img(url: string, altText: string, width = 1200, height = 1500) {
  return { url, altText, width, height };
}

/** Deterministic upcoming dates so the demo never shows a past course. */
function upcoming(offsetDays: number, hour: number): Date {
  const base = new Date();
  base.setHours(hour, 0, 0, 0);
  base.setDate(base.getDate() + offsetDays);
  return base;
}

function courseVariant(
  id: string,
  offsetDays: number,
  hour: number,
  durationHours: number,
  price: number,
  seats: number,
  lang: Lang,
): Variant {
  const starts = upcoming(offsetDays, hour);
  const ends = new Date(starts.getTime() + durationHours * 3600_000);
  const title = new Intl.DateTimeFormat(lang === 'cs' ? 'cs-CZ' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(starts);

  return {
    id,
    title,
    availableForSale: seats > 0,
    quantityAvailable: seats,
    price: money(price),
    compareAtPrice: null,
    selectedOptions: [{ name: lang === 'cs' ? 'Termín' : 'Date', value: title }],
    image: null,
    startsAt: starts.toISOString(),
    endsAt: ends.toISOString(),
  };
}

function simpleVariant(id: string, price: number, seats: number): Variant {
  return {
    id,
    title: 'Default Title',
    availableForSale: seats > 0,
    quantityAvailable: seats,
    price: money(price),
    compareAtPrice: null,
    selectedOptions: [{ name: 'Title', value: 'Default Title' }],
    image: null,
    startsAt: null,
    endsAt: null,
  };
}

function sizedVariants(
  idBase: string,
  price: number,
  sizes: Array<[string, number]>,
): Variant[] {
  return sizes.map(([size, qty], i) => ({
    id: `${idBase}-${i}`,
    title: size,
    availableForSale: qty > 0,
    quantityAvailable: qty,
    price: money(price),
    compareAtPrice: null,
    selectedOptions: [{ name: 'Size', value: size }],
    image: null,
    startsAt: null,
    endsAt: null,
  }));
}

/* ------------------------------------------------------------- courses -- */

export function mockCourses(lang: Lang): Product[] {
  const cs = lang === 'cs';

  return [
    {
      id: 'gid://shopify/Product/mock-course-espresso',
      handle: 'espresso-zaklady',
      title: cs ? 'ESPRESSO — ZÁKLADY' : 'ESPRESSO — FUNDAMENTALS',
      description: cs
        ? 'Půldenní kurz, kde se naučíte připravit espresso, které chutná stejně dobře jako u nás za barem.'
        : 'A half-day course where you learn to pull an espresso that tastes as good as the one across our bar.',
      descriptionHtml: cs
        ? '<p>Půldenní kurz pro každého, kdo chce rozumět tomu, co se děje mezi mlýnkem a šálkem. Začneme u zrna, projdeme mletí, dávkování a temper, a zbytek času strávíte u páky.</p><p>Kurz vedou baristé z Kafe Grohova, maximálně ve čtyřech lidech, na La Marzocco Linea a mlýnku Mahlkönig E65S.</p>'
        : '<p>A half-day course for anyone who wants to understand what happens between the grinder and the cup. We start with the bean, work through grind, dose and tamp, and you spend the rest of the time on the group head.</p><p>Led by the Kafe Grohova baristas, four people maximum, on a La Marzocco Linea and a Mahlkönig E65S grinder.</p>',
      productType: 'Course',
      tags: ['course', 'espresso', 'beginner'],
      availableForSale: true,
      featuredImage: img('/images/OLD03346.webp', 'Barista pulling espresso'),
      images: [
        img('/images/OLD03346.webp', 'Barista pulling espresso'),
        img('/images/OLD03361.webp', 'Espresso machine group head'),
      ],
      options: [
        {
          id: 'opt-date-1',
          name: cs ? 'Termín' : 'Date',
          values: [],
        },
      ],
      variants: [
        courseVariant('gid://shopify/ProductVariant/mock-e1', 7, 10, 4, 2200, 3, lang),
        courseVariant('gid://shopify/ProductVariant/mock-e2', 14, 10, 4, 2200, 1, lang),
        courseVariant('gid://shopify/ProductVariant/mock-e3', 21, 14, 4, 2200, 4, lang),
        courseVariant('gid://shopify/ProductVariant/mock-e4', 28, 10, 4, 2200, 0, lang),
      ],
      priceRange: { minVariantPrice: money(2200), maxVariantPrice: money(2200) },
      course: {
        durationMinutes: 240,
        capacity: 4,
        level: cs ? 'Začátečník' : 'Beginner',
        syllabus: cs
          ? [
              'Jak poznat čerstvě praženou kávu a co znamenají údaje na sáčku',
              'Mletí — proč je to nejdůležitější proměnná',
              'Dávkování, distribuce a temper',
              'Čtení extrakce: čas, váha, chuť',
              'Základní údržba pákového kávovaru',
            ]
          : [
              'How to spot freshly roasted coffee and read the bag',
              'Grinding — why it is the variable that matters most',
              'Dosing, distribution and tamping',
              'Reading an extraction: time, weight, taste',
              'Basic espresso machine maintenance',
            ],
      },
    },
    {
      id: 'gid://shopify/Product/mock-course-milk',
      handle: 'latte-art',
      title: cs ? 'LATTE ART' : 'LATTE ART',
      description: cs
        ? 'Napěňování mléka a kresba do šálku — od srdíčka po tulipán.'
        : 'Steaming milk and free-pouring — from the heart to the tulip.',
      descriptionHtml: cs
        ? '<p>Tříhodinový kurz zaměřený výhradně na mléko. Naučíte se napěnit mléko do správné textury, řídit teplotu a nalít vzory, které drží tvar.</p><p>Předpokládáme, že už zvládáte základy espressa — pokud ne, začněte kurzem Espresso — základy.</p>'
        : '<p>A three-hour course entirely about milk. You will learn to steam milk to the right texture, control temperature, and pour patterns that hold their shape.</p><p>We assume you already have the espresso basics — if not, start with Espresso — Fundamentals.</p>',
      productType: 'Course',
      tags: ['course', 'milk', 'intermediate'],
      availableForSale: true,
      featuredImage: img('/images/OLD03354.webp', 'Latte art being poured'),
      images: [img('/images/OLD03354.webp', 'Latte art being poured')],
      options: [{ id: 'opt-date-2', name: cs ? 'Termín' : 'Date', values: [] }],
      variants: [
        courseVariant('gid://shopify/ProductVariant/mock-m1', 10, 17, 3, 1800, 5, lang),
        courseVariant('gid://shopify/ProductVariant/mock-m2', 24, 17, 3, 1800, 2, lang),
      ],
      priceRange: { minVariantPrice: money(1800), maxVariantPrice: money(1800) },
      course: {
        durationMinutes: 180,
        capacity: 6,
        level: cs ? 'Mírně pokročilý' : 'Intermediate',
        syllabus: cs
          ? [
              'Výběr mléka a rostlinných alternativ',
              'Textura: kdy přestat napěňovat',
              'Teplota a proč na ní záleží',
              'Nalévání: srdce, rozeta, tulipán',
              'Údržba trysky',
            ]
          : [
              'Choosing dairy and plant alternatives',
              'Texture: when to stop stretching',
              'Temperature and why it matters',
              'Pouring: heart, rosetta, tulip',
              'Steam wand maintenance',
            ],
      },
    },
    {
      id: 'gid://shopify/Product/mock-course-filter',
      handle: 'filtrovana-kava',
      title: cs ? 'FILTROVANÁ KÁVA DOMA' : 'FILTER COFFEE AT HOME',
      description: cs
        ? 'V60, Aeropress a French press — kurz pro domácí přípravu.'
        : 'V60, Aeropress and French press — a course for brewing at home.',
      descriptionHtml: cs
        ? '<p>Nepotřebujete pákový kávovar, abyste doma dělali skvělou kávu. Za tři hodiny projdeme tři metody, poměry, mletí a vodu, a odejdete s receptem, který si doma zopakujete.</p>'
        : '<p>You do not need an espresso machine to make great coffee at home. In three hours we cover three methods, ratios, grind and water, and you leave with a recipe you can repeat in your kitchen.</p>',
      productType: 'Course',
      tags: ['course', 'filter', 'beginner'],
      availableForSale: true,
      featuredImage: img('/images/OLD03329.webp', 'Pour over brewing'),
      images: [img('/images/OLD03329.webp', 'Pour over brewing')],
      options: [{ id: 'opt-date-3', name: cs ? 'Termín' : 'Date', values: [] }],
      variants: [
        courseVariant('gid://shopify/ProductVariant/mock-f1', 5, 15, 3, 1500, 6, lang),
        courseVariant('gid://shopify/ProductVariant/mock-f2', 19, 15, 3, 1500, 6, lang),
        courseVariant('gid://shopify/ProductVariant/mock-f3', 33, 15, 3, 1500, 6, lang),
      ],
      priceRange: { minVariantPrice: money(1500), maxVariantPrice: money(1500) },
      course: {
        durationMinutes: 180,
        capacity: 8,
        level: cs ? 'Začátečník' : 'Beginner',
        syllabus: cs
          ? [
              'Voda — nejpodceňovanější ingredience',
              'Poměr kávy a vody',
              'V60: technika nalévání',
              'Aeropress: rychlé recepty',
              'French press bez kalu',
            ]
          : [
              'Water — the most underrated ingredient',
              'Coffee-to-water ratio',
              'V60: pouring technique',
              'Aeropress: fast recipes',
              'French press without the sludge',
            ],
      },
    },
  ];
}

/* ----------------------------------------------------------------- merch -- */

export function mockMerch(lang: Lang): Product[] {
  const cs = lang === 'cs';

  const make = (
    handle: string,
    title: string,
    price: number,
    image: string,
    alt: string,
    descriptionHtml: string,
    variants: Variant[],
    type: string,
    tags: string[],
    extraImages: string[] = [],
  ): Product => ({
    id: `gid://shopify/Product/mock-${handle}`,
    handle,
    title,
    description: descriptionHtml.replace(/<[^>]+>/g, ' ').trim(),
    descriptionHtml,
    productType: type,
    tags,
    availableForSale: variants.some((v) => v.availableForSale),
    featuredImage: img(image, alt),
    images: [img(image, alt), ...extraImages.map((u) => img(u, alt))],
    options: [
      {
        id: `opt-${handle}`,
        name: variants[0]?.selectedOptions[0]?.name ?? 'Title',
        values: variants.map((v) => v.title),
      },
    ],
    variants,
    priceRange: { minVariantPrice: money(price), maxVariantPrice: money(price) },
    course: null,
  });

  return [
    make(
      'filtro',
      'FILTRO',
      420,
      '/filtro2.webp',
      'Bag of filter coffee',
      cs
        ? '<p>Výběrová káva na filtr od Father’s Coffee Roastery. Praženo pro jasnou kyselinku a čistou chuť. 250 g celých zrn.</p>'
        : '<p>Specialty filter coffee from Father’s Coffee Roastery. Roasted for bright acidity and a clean cup. 250 g whole bean.</p>',
      [simpleVariant('gid://shopify/ProductVariant/mock-filtro', 420, 24)],
      'Coffee',
      ['coffee', 'filter'],
    ),
    make(
      'competicion',
      'COMPETICIÓN',
      560,
      '/competicion2.webp',
      'Competition roast coffee bag',
      cs
        ? '<p>Mikrolot, který používáme na baristických soutěžích. Malá dávka, velká chuť. 200 g celých zrn.</p>'
        : '<p>The microlot we take to barista competitions. Small batch, big cup. 200 g whole bean.</p>',
      [simpleVariant('gid://shopify/ProductVariant/mock-comp', 560, 8)],
      'Coffee',
      ['coffee', 'limited'],
    ),
    make(
      'camiseta',
      cs ? 'TRIČKO KAFE GROHOVA' : 'KAFE GROHOVA T-SHIRT',
      790,
      '/camiseta.webp',
      'Kafe Grohova t-shirt',
      cs
        ? '<p>Těžká bavlna 240 g/m², potisk sítotiskem v Brně. Střih unisex.</p>'
        : '<p>Heavyweight 240 gsm cotton, screen printed in Brno. Unisex fit.</p>',
      sizedVariants('gid://shopify/ProductVariant/mock-tee', 790, [
        ['S', 4],
        ['M', 7],
        ['L', 3],
        ['XL', 0],
      ]),
      'Apparel',
      ['merch', 'apparel'],
      ['/camiseta22.webp'],
    ),
    make(
      'taza-ceramica',
      cs ? 'KERAMICKÝ ŠÁLEK' : 'CERAMIC CUP',
      650,
      '/images/taza-ceremical.webp',
      'Handmade ceramic cup',
      cs
        ? '<p>Ručně točený šálek na cappuccino, 180 ml. Každý kus je trochu jiný — dělá je keramička z Brna.</p>'
        : '<p>Hand-thrown cappuccino cup, 180 ml. Every piece is slightly different — made by a ceramicist in Brno.</p>',
      [simpleVariant('gid://shopify/ProductVariant/mock-cup', 650, 12)],
      'Ceramics',
      ['ceramics', 'handmade'],
      ['/ceramic.webp'],
    ),
    make(
      'taza-espresso',
      cs ? 'ŠÁLEK NA ESPRESSO' : 'ESPRESSO CUP',
      520,
      '/images/taze.webp',
      'Handmade espresso cup',
      cs
        ? '<p>Ručně točený šálek na espresso, 80 ml. Glazura v odstínu, který se nikdy nepovede dvakrát stejně.</p>'
        : '<p>Hand-thrown espresso cup, 80 ml. Glazed in a shade that never comes out the same twice.</p>',
      [simpleVariant('gid://shopify/ProductVariant/mock-espresso-cup', 520, 9)],
      'Ceramics',
      ['ceramics', 'handmade'],
    ),
    make(
      'camiseta-totxres',
      cs ? 'TRIČKO TOTXRES' : 'TOTXRES T-SHIRT',
      890,
      '/images/camiseta2.webp',
      'Totxres t-shirt',
      cs
        ? '<p>Limitovaná spolupráce. Barvené v malé sérii, 100 % organická bavlna.</p>'
        : '<p>A limited collaboration. Dyed in a small run, 100% organic cotton.</p>',
      sizedVariants('gid://shopify/ProductVariant/mock-tee2', 890, [
        ['S', 2],
        ['M', 5],
        ['L', 5],
        ['XL', 2],
      ]),
      'Apparel',
      ['merch', 'apparel', 'limited'],
      ['/images/camiseta-text.webp'],
    ),
    make(
      'tote',
      cs ? 'PLÁTĚNÁ TAŠKA' : 'TOTE BAG',
      390,
      '/nomad.webp',
      'Canvas tote bag',
      cs
        ? '<p>Silné plátno, dlouhá ucha, unese i pět kilo kávy. Potisk v Brně.</p>'
        : '<p>Heavy canvas, long handles, holds five kilos of coffee without complaint. Printed in Brno.</p>',
      [simpleVariant('gid://shopify/ProductVariant/mock-tote', 390, 20)],
      'Accessories',
      ['merch'],
    ),
    make(
      'darkovy-poukaz',
      cs ? 'DÁRKOVÝ POUKAZ' : 'GIFT CARD',
      1000,
      '/images/OLD03340.webp',
      'Gift card',
      cs
        ? '<p>Poukaz na kurz nebo cokoliv z obchodu. Platí rok od zakoupení.</p>'
        : '<p>A voucher for a course or anything in the store. Valid for a year.</p>',
      sizedVariants('gid://shopify/ProductVariant/mock-gift', 1000, [
        ['1000 Kč', 99],
        ['2000 Kč', 99],
        ['3000 Kč', 99],
      ]),
      'Gift Card',
      ['gift'],
    ),
  ];
}

/* ------------------------------------------------------------------ blog -- */

export function mockArticles(lang: Lang): Article[] {
  const cs = lang === 'cs';
  const day = 86_400_000;
  const now = Date.now();

  const entries: Array<[string, string, string, string, string]> = cs
    ? [
        [
          'zlata-kava',
          'Zlatá káva, další trend v kavárnách?',
          'Když se řekne káva z Turecka a Perského zálivu, většina lidí si představí tmavý, hustý nápoj. Skutečnost je jiná.',
          '<p>Když se řekne káva z Turecka a Perského zálivu, většina lidí si představí hluboce tmavý nápoj způsobený intenzivním pražením. Skutečnost je ale od této představy daleko: v Saúdské Arábii se preferuje světlejší pražení a v některých oblastech se dokonce pije káva, která má zlatavý odstín.</p><p>Jak vysvětluje Jonathan Morris v knize <em>Coffee. A Global History</em>, arabská káva (qahwa) byla — a je — podávána jako světle hnědá, poloprůsvitná tekutina, což ji odlišuje od turecké kávy, která je neprůhledná a poměrně hustá.</p><p>Zrna se lehce praží, poté chladí, drtí a míchají s kořením jako zázvor, skořice a především kardamom. Směs se vloží do měděné konvičky, patnáct minut se vaří s vodou a pak přelije do menší předehřáté konvice zvané dallah, která má obvykle velmi dlouhý zobáček.</p>',
          '/images/OLD03375.webp',
        ],
        [
          'jak-prazime',
          'Rychlý průvodce pražením kávy',
          'Co se děje se zrnem mezi zeleným a hnědým stavem a proč na tom záleží víc, než si myslíte.',
          '<p>Pražení je moment, kdy se z tvrdého zeleného semínka stane něco, co voní jako káva. Trvá to dvanáct až osmnáct minut a rozhodne o tom, jestli bude šálek chutnat po ovoci, čokoládě, nebo po spálené gumě.</p><p>Zrno prochází několika fázemi. Nejdřív se suší, ztrácí vlhkost a mění barvu ze zelené na žlutou. Pak přichází Maillardova reakce, která tvoří většinu aromatických látek. Následuje first crack — slyšitelné prasknutí, když se uvnitř zrna uvolní tlak.</p><p>To, kde pražič zastaví, určuje styl. My u Father’s zastavujeme krátce po first cracku, což zachová kyselinku a ovocné tóny.</p>',
          '/images/OLD03389.webp',
        ],
        [
          'voda-v-kave',
          'Voda tvoří 98 % vaší kávy',
          'Nejlevnější způsob, jak zlepšit kávu doma, nemá s kávou nic společného.',
          '<p>Šálek kávy je z 98 % voda. Přesto většina lidí řeší zrno, mlýnek a techniku, a vodu bere jako danou.</p><p>Brněnská voda je poměrně tvrdá. Vysoký obsah vápníku a hořčíku znamená, že extrakce probíhá jinak než s měkkou vodou — a taky že se vám do kávovaru usazuje vodní kámen.</p><p>Nejjednodušší řešení je filtrační konvice. Rozdíl uslyšíte hned v prvním šálku.</p>',
          '/images/OLD03561.webp',
        ],
        [
          'nasi-baristi',
          'Kdo stojí za barem',
          'Krátké představení lidí, které potkáte na Grohové.',
          '<p>Kafe Grohova je malé místo a tým je malý taky. Za barem se střídají čtyři lidi, každý s trochu jinou představou o tom, co je dobrá káva — a právě proto se u nás pořád něco ladí.</p><p>Většina z nás začínala jako hosté. Přišli jsme na kafe, zůstali jsme na směnu.</p>',
          '/images/OLD03400.webp',
        ],
      ]
    : [
        [
          'golden-coffee',
          'Golden coffee, the next trend in coffee shops?',
          'To think of the coffee drunk in Turkey and the Persian Gulf is to imagine a deeply dark brew. The reality is far from it.',
          '<p>To think of the coffee drunk in Turkey and the Persian Gulf is to imagine a deeply dark brew due to an intense roasting of the coffee. However, the reality is far from this prejudice: in Saudi Arabia a lighter roast is preferred and in some areas they even drink a coffee that takes on a golden hue.</p><p>As Jonathan Morris explains in <em>Coffee. A Global History</em>, Arabic coffee (qahwa) was — and is — served as a light brown, semi-translucent liquid, something that sets it apart from Turkish coffee, opaque and even somewhat dense.</p><p>The beans are lightly roasted before being cooled, broken up and mixed with spices such as ginger root, cinnamon and especially cardamom. The mixture is placed in a copper saucepan, boiled with water for about 15 minutes and then decanted into a smaller, pre-warmed pitcher called a dallah, which usually has a very long spout.</p>',
          '/images/OLD03375.webp',
        ],
        [
          'how-we-roast',
          'A quick guide to coffee roasting',
          'What happens to the bean between green and brown, and why it matters more than you think.',
          '<p>Roasting is the moment a hard green seed turns into something that smells like coffee. It takes twelve to eighteen minutes and decides whether the cup tastes of fruit, chocolate, or burnt rubber.</p><p>The bean passes through several phases. First it dries, losing moisture and turning from green to yellow. Then comes the Maillard reaction, which creates most of the aromatic compounds. Then first crack — an audible pop as pressure releases inside the bean.</p><p>Where the roaster stops defines the style. At Father’s we stop shortly after first crack, which keeps the acidity and the fruit.</p>',
          '/images/OLD03389.webp',
        ],
        [
          'water-in-coffee',
          'Water is 98% of your coffee',
          'The cheapest way to improve your coffee at home has nothing to do with coffee.',
          '<p>A cup of coffee is 98% water. Yet most people obsess over the bean, the grinder and the technique, and treat water as a given.</p><p>Brno tap water is fairly hard. High calcium and magnesium means extraction behaves differently than with soft water — and it means limescale in your machine.</p><p>The simplest fix is a filter jug. You will hear the difference in the first cup.</p>',
          '/images/OLD03561.webp',
        ],
        [
          'our-baristas',
          'Who stands behind the bar',
          'A short introduction to the people you will meet on Grohova.',
          '<p>Kafe Grohova is a small place and the team is small too. Four people rotate behind the bar, each with a slightly different idea of what good coffee is — which is exactly why something is always being tweaked.</p><p>Most of us started as guests. We came in for a coffee and stayed for a shift.</p>',
          '/images/OLD03400.webp',
        ],
      ];

  return entries.map(([handle, title, excerpt, contentHtml, image], i) => ({
    id: `gid://shopify/Article/mock-${handle}`,
    handle,
    title,
    excerpt,
    excerptHtml: `<p>${excerpt}</p>`,
    contentHtml,
    publishedAt: new Date(now - (i + 1) * 9 * day).toISOString(),
    image: img(image, title),
    authorName: 'Kafe Grohova',
    tags: [],
  }));
}
