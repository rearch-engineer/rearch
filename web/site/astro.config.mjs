import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: process.env.SITE_URL || 'https://example.com',

  // i18n configuration
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es'],
    routing: {
      prefixDefaultLocale: false,
    },
  },

  env: {
    schema: {
      SITE_URL: {
        type: 'string',
        context: 'server',
        access: 'secret',
        optional: true,
        default: 'https://rearch.engineer',
      },
      GOOGLE_SITE_VERIFICATION: {
        type: 'string',
        context: 'server',
        access: 'secret',
        optional: true,
      },
      BING_SITE_VERIFICATION: {
        type: 'string',
        context: 'server',
        access: 'secret',
        optional: true,
      },
      PUBLIC_CONSENT_ENABLED: {
        type: 'boolean',
        context: 'client',
        access: 'public',
        optional: true,
        default: false,
      },
      PUBLIC_PRIVACY_POLICY_URL: {
        type: 'string',
        context: 'client',
        access: 'public',
        optional: true,
      },
      PUBLIC_GA_MEASUREMENT_ID: {
        type: 'string',
        context: 'client',
        access: 'public',
        optional: true,
      },
      PUBLIC_GTM_ID: {
        type: 'string',
        context: 'client',
        access: 'public',
        optional: true,
      },
    },
  },

  integrations: [
    react(),
    mdx(),
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: {
          en: 'en',
          es: 'es',
        },
      },
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },

  security: {
    checkOrigin: true,
  },

  experimental: {
    contentIntellisense: true,
  },

  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    },
  },

  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },
});
