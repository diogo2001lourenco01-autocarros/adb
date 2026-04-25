import type { APIContext } from 'astro';

const STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export async function GET(_ctx: APIContext) {
  const res = await fetch(STYLE_URL);
  if (!res.ok) return new Response('upstream error', { status: 502 });

  // Rewrite all tile CDN URLs to go through our proxy
  let style = await res.text();
  style = style.replaceAll(
    'https://tiles.basemaps.cartocdn.com/',
    '/api/maptiles/t/'
  );

  return new Response(style, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
