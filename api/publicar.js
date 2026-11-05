import { head, del } from '@vercel/blob';
import { configured, auth, meta, IG_ID, noStore, responseError } from '../lib/common.js';

async function waitContainer(id, seconds=210) {
  for (let s=0; s<seconds; s+=5) {
    const status=await meta(`/${encodeURIComponent(id)}?fields=status_code,status`);
    if (status.status_code === 'FINISHED') return;
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED')
      throw new Error(`Processamento Meta: ${status.status || status.status_code}`);
    await new Promise(resolve=>setTimeout(resolve,5000));
  }
  throw new Error('A Meta ainda está processando a mídia. Publicação não confirmada.');
}
export async function POST(request) {
  if (request.method !== 'POST') return noStore({error:'Método não permitido'},405);
  if (!auth(request.headers.get('x-trin-password'))) return noStore({error:'Senha incorreta.'},401);
  if (!configured()) return noStore({error:'Variáveis de ambiente incompletas.'},503);
  try {
    const {type, caption, mediaUrl} = await request.json();
    if (!['photo','video'].includes(type)) throw new Error('Tipo de mídia inválido.');
    if (typeof caption !== 'string' || caption.length>2200) throw new Error('Legenda inválida ou acima de 2200 caracteres.');
    if (typeof mediaUrl !== 'string') throw new Error('URL de mídia ausente.');
    const url = new URL(mediaUrl);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.public.blob.vercel-storage.com') ||
        !/^\/trinpost\/[a-f0-9-]{36}(?:-[A-Za-z0-9]+)?\.(?:jpg|mp4)$/.test(url.pathname) || url.search || url.hash) {
      throw new Error('A mídia precisa estar no armazenamento público autorizado do TRINPost.');
    }
    const info = await head(mediaUrl); // Verifica que pertence ao store configurado.
    const mime = type === 'photo' ? 'image/jpeg' : 'video/mp4';
    if (info.contentType !== mime) throw new Error(`A mídia não é ${mime}.`);
    if (info.size > (type === 'photo' ? 8 : 50)*1024*1024) throw new Error('Arquivo acima do tamanho permitido.');
    const fields={caption};
    if (type === 'photo') fields.image_url=mediaUrl;
    else Object.assign(fields,{media_type:'REELS',video_url:mediaUrl,share_to_feed:'true'});
    const created=await meta(`/${IG_ID}/media`,'POST',fields);
    if (!created.id) throw new Error('A Meta não retornou ID de criação.');
    await waitContainer(created.id,type==='video'?220:90);
    const published=await meta(`/${IG_ID}/media_publish`,'POST',{creation_id:created.id});
    if (!published.id) throw new Error('A API não confirmou a publicação.');
    let permalink='https://www.instagram.com/trinbrasil/';
    try { const p=await meta(`/${published.id}?fields=permalink`);if(p.permalink) permalink=p.permalink; }
    catch {/* publicação confirmada mesmo sem link */}
    // Apenas após a confirmação da Meta é seguro apagar o original do Blob.
    await del(mediaUrl).catch(()=>{});
    return noStore({ok:true,id:published.id,permalink,type});
  } catch(err) {return noStore({error:responseError(err)},502);}
}
