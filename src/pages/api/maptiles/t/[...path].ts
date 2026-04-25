import type { APIContext } from 'astro';

const UPSTREAM = 'https://tiles.basemaps.cartocdn.com';

export async function GET({ params, request }: APIContext) {
  const path = params.path || '';
  const upstream = `${UPSTREAM}/${path}`;

  const res = await fetch(upstream, {
    headers: { 'User-Agent': request.headers.get('user-agent') || 'Mozilla/5.0' },
  });

  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');

  // Forward content-type and cache headers from upstream
  const ct = res.headers.get('content-type');
  if (ct) headers.set('Content-Type', ct);
  const cc = res.headers.get('cache-control');
  headers.set('Cache-Control', cc || 'public, max-age=86400');

  return new Response(res.body, { status: res.status, headers });
}

export async function OPTIONS(_ctx: APIContext) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
}
