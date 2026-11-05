import { configured, auth, meta, IG_ID, noStore, responseError } from '../lib/common.js';
export default async function handler(request) {
  if (request.method !== 'POST') return noStore({error:'Método não permitido'},405);
  if (!auth(request.headers.get('x-trin-password'))) return noStore({error:'Senha incorreta'},401);
  if (!configured()) return noStore({error:'Variáveis de ambiente incompletas.'},503);
  try {
    const account = await meta(`/${IG_ID}?fields=id,username`);
    return noStore({ok:true, username:account.username, id:account.id});
  } catch(err) {return noStore({error:responseError(err)},502);}
}
