import { timingSafeEqual } from 'node:crypto';

const TOKEN = process.env.IG_ACCESS_TOKEN || '';
export const IG_ID = process.env.IG_USER_ID || '';
export const GRAPH_VERSION = process.env.GRAPH_VERSION || 'v25.0';
export const ACCOUNT = '@trinbrasil';

export const configured = () => Boolean(
  TOKEN && process.env.POST_PASSWORD && /^\d{8,25}$/.test(IG_ID) && process.env.BLOB_READ_WRITE_TOKEN
);

export function auth(password) {
  const expected = String(process.env.POST_PASSWORD || '');
  const actual = String(password || '');
  if (!expected || !actual || actual.length > 1024) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a,b);
}
export function responseError(error) {
  const msg = error instanceof Error ? error.message : String(error);
  return TOKEN ? msg.replaceAll(TOKEN, '[TOKEN OCULTO]').slice(0, 500) : msg.slice(0, 500);
}
export async function meta(path, method='GET', fields=null) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}${path}`;
  const params = fields ? new URLSearchParams(fields) : null;
  const resp = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      ...(params ? {'Content-Type': 'application/x-www-form-urlencoded'} : {})
    },
    body: params?.toString(),
    signal: AbortSignal.timeout(40000),
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok || payload.error) {
    const e = payload.error || {};
    throw new Error(`Meta API (${e.code || resp.status}): ${e.message || 'Erro desconhecido'}`);
  }
  return payload;
}
export function noStore(data, status=200) {
  return Response.json(data, {status,headers:{'Cache-Control':'no-store'}});
}
