import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import satori from 'satori';
import sharp from 'sharp';
import siteConfig from '@/config/site.config';

export interface OGImageOptions {
  title: string;
  description?: string;
  type?: 'website' | 'article';
}

// Load Inter font for OG images (Satori requires TTF/OTF, not WOFF2)
// Bundled locally in public/fonts/ to avoid CDN dependency during builds
let fontCache: ArrayBuffer | null = null;

function loadFont(): ArrayBuffer {
  if (!fontCache) {
    const fontPath = resolve(process.cwd(), 'public/fonts/inter-latin-400-normal.ttf');
    fontCache = readFileSync(fontPath).buffer as ArrayBuffer;
  }
  return fontCache;
}

// Satori uses React-like element trees. This helper avoids needing JSX/React.
function h(
  type: string,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): Record<string, unknown> {
  return {
    type,
    props: {
      ...(props ?? {}),
      children: children.length === 1 ? children[0] : children.length > 0 ? children : undefined,
    },
  };
}

export async function generateOGImage(options: OGImageOptions): Promise<Buffer> {
  const { title, description, type = 'website' } = options;

  const fontData = loadFont();

  const truncatedDescription = description
    ? description.length > 120
      ? description.slice(0, 117) + '...'
      : description
    : '';

  const hostname = new URL(siteConfig.url).hostname;

  // Build the OG image markup using satori's native element tree.
  // Every visible node needs an explicit `display` property.
  const markup = h(
    'div',
    {
      style: {
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #18181b 0%, #27272a 50%, #18181b 100%)',
        padding: '60px 80px',
        fontFamily: 'Inter',
        position: 'relative',
      },
    },
    // Orange left accent bar
    h('div', {
      style: {
        display: 'flex',
        position: 'absolute',
        top: 0,
        left: 0,
        width: '8px',
        height: '100%',
        background: 'linear-gradient(180deg, #f97316 0%, #fb923c 50%, #f97316 100%)',
      },
    }),
    // Main content column
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          height: '100%',
          paddingLeft: '20px',
        },
      },
      // Type badge
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center' } },
        h(
          'div',
          {
            style: {
              display: 'flex',
              padding: '8px 16px',
              background: 'rgba(249, 115, 22, 0.1)',
              border: '1px solid rgba(249, 115, 22, 0.3)',
              borderRadius: '9999px',
              color: '#fb923c',
              fontSize: '14px',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            },
          },
          type === 'article' ? 'Article' : 'Page',
        ),
      ),
      // Title + description
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '24px' } },
        h(
          'div',
          {
            style: {
              display: 'flex',
              fontSize: title.length > 50 ? '48px' : '64px',
              fontWeight: 700,
              color: '#fafafa',
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
            },
          },
          title,
        ),
        ...(truncatedDescription
          ? [
              h(
                'div',
                {
                  style: {
                    display: 'flex',
                    fontSize: '24px',
                    color: '#a1a1aa',
                    lineHeight: 1.5,
                    maxWidth: '800px',
                  },
                },
                truncatedDescription,
              ),
            ]
          : []),
      ),
      // Footer: logo + hostname
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          },
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
          h(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '48px',
                height: '48px',
                background: 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)',
                borderRadius: '12px',
              },
            },
            h(
              'span',
              { style: { fontSize: '24px', fontWeight: 700, color: '#18181b' } },
              'R',
            ),
          ),
          h(
            'span',
            { style: { fontSize: '20px', fontWeight: 600, color: '#fafafa' } },
            siteConfig.name,
          ),
        ),
        h('span', { style: { fontSize: '16px', color: '#71717a' } }, hostname),
      ),
    ),
  );

  // Generate SVG with satori
  const svg = await satori(markup as unknown as React.ReactNode, {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: 'Inter',
        data: fontData,
        weight: 400,
        style: 'normal',
      },
      {
        name: 'Inter',
        data: fontData,
        weight: 500,
        style: 'normal',
      },
      {
        name: 'Inter',
        data: fontData,
        weight: 600,
        style: 'normal',
      },
      {
        name: 'Inter',
        data: fontData,
        weight: 700,
        style: 'normal',
      },
    ],
  });

  // Convert SVG to PNG
  return Buffer.from(await sharp(Buffer.from(svg)).resize(1200).png().toBuffer());
}
