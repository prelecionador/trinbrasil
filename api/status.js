import { configured, ACCOUNT, noStore } from '../lib/common.js';
export async function GET(request) {
  if (request.method !== 'GET') return noStore({error:'Método não permitido'},405);
  return noStore({ok:true,ready:configured(),account:ACCOUNT,hasToken:!!process.env.IG_ACCESS_TOKEN,
    hasPassword:!!process.env.POST_PASSWORD,hasPublicUrl:!!process.env.BLOB_READ_WRITE_TOKEN,
    mediaHost:'Vercel Blob'});
}
