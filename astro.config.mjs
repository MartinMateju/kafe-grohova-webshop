// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';

const env = loadEnv(process.env.NODE_ENV || 'production', process.cwd(), 'PUBLIC_');
const site = process.env.PUBLIC_SITE_URL || env.PUBLIC_SITE_URL || 'https://kafegrohova.cz';
if (!/^https?:\/\//.test(site)) throw new Error('PUBLIC_SITE_URL must be an absolute http(s) URL.');

export default defineConfig({
  site,
  output: 'static',
  i18n: {
    defaultLocale: 'cs',
    locales: ['cs', 'en'],
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: true,
    },
  },
  redirects: {
    '/': '/cs/',
  },
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  image: {
    // Local /public assets are served as-is; Shopify CDN images are resized
    // through Shopify's own transform params in src/lib/shopify/image.ts
    domains: ['cdn.shopify.com'],
  },
});
