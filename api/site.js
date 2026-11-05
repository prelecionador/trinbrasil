// Endpoints públicos de leitura e protegidos de edição do site TRIN.
// Não interage com /api/publicar: mídia persistida no site é independente da publicação na Meta.
import { randomUUID } from 'node:crypto';
import { auth, noStore, responseError } from '../lib/common.js';
import { loadPosts, loadMenus, savePost, removePost, saveMenus, checkSiteMedia, storageReady } from '../lib/site-store.js';
const validId = id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const slug = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,'').slice(0,48);
const requireAuth = req => auth(req.headers.get('x-trin-password'));
const errorResponse = (e, status=400) => noStore({ok:false,error:responseError(e)},status);
function sanitizeMenu(item) {
  const id = slug(item.id || item.name);
  if (!id || id==='inicio' || !/^[a-z][a-z0-9-]*$/.test(id)) throw new Error('Nome de menu inválido.');
  const name = clean(item.name,42), title = clean(item.title,160);
  if (!name || !title) throw new Error('Preencha o nome e o título do menu.');
  return { id, name, title, subtitle:clean(item.subtitle,380), text:clean(item.text,12000) };
}
function parsePost(payload, previous) {
  const title = clean(payload.title,200);
  if (!title) throw new Error('O título é obrigatório.');
  return {
    ...previous,
    title, subtitle: clean(payload.subtitle,1200), content: clean(payload.content,15000),
    category: clean(payload.category,60) || 'Notícias',
    author: clean(payload.author,100) || 'Equipe TRIN',
    tags: clean(payload.tags,350),
    featured: Boolean(payload.featured),
    updatedAt: new Date().toISOString(),
  };
}
export async function GET(request) {
  if (!storageReady()) return noStore({ok:false,error:'Configure o armazenamento Blob do projeto Vercel.'},503);
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('resource') === 'menus') return noStore({ok:true,menus:await loadMenus()});
    return noStore({ok:true,posts:await loadPosts()});
  } catch(e) { return errorResponse(e,502); }
}
export async function POST(request) {
  if (!requireAuth(request)) return noStore({ok:false,error:'Senha de publicação incorreta.'},401);
  if (!storageReady()) return noStore({ok:false,error:'Vercel Blob não configurado.'},503);
  try {
    const payload=await request.json();
    if (payload.action === 'createPost') {
      const posts=await loadPosts();
      const now=new Date().toISOString();
      const post=parsePost(payload,{ id:randomUUID(), createdAt:now });
      if (post.featured && posts.filter(p=>p.featured).length>=2) return errorResponse('O site permite no máximo dois destaques. Desmarque uma estrela no Estúdio de postagens.',409);
      post.type=await checkSiteMedia(payload.mediaUrl);
      post.image=payload.mediaUrl;
      await savePost(post);
      return noStore({ok:true,post},201);
    }
    if (payload.action === 'saveMenus') {
      if (!Array.isArray(payload.menus) || payload.menus.length>30) throw new Error('Lista de menus inválida (limite: 30).');
      const menus=payload.menus.map(sanitizeMenu);
      if (new Set(menus.map(x=>x.id)).size!==menus.length) throw new Error('Existem menus repetidos.');
      await saveMenus(menus);
      return noStore({ok:true,menus});
    }
    return errorResponse('Ação desconhecida.');
  } catch(e) { return errorResponse(e); }
}
export async function PUT(request) {
  if (!requireAuth(request)) return noStore({ok:false,error:'Senha incorreta.'},401);
  if (!storageReady()) return noStore({ok:false,error:'Vercel Blob não configurado.'},503);
  try {
    const payload=await request.json();
    if (!validId(payload.id)) throw new Error('Postagem inválida.');
    const posts=await loadPosts();
    const previous=posts.find(p=>p.id===payload.id);
    if (!previous) return errorResponse('Postagem não encontrada.',404);
    const updated=parsePost(payload,previous);
    if (updated.featured && !previous.featured && posts.filter(p=>p.featured).length>=2) return errorResponse('Só é possível destacar duas postagens.',409);
    await savePost(updated);
    return noStore({ok:true,post:updated});
  } catch(e) { return errorResponse(e); }
}
export async function DELETE(request) {
  if (!requireAuth(request)) return noStore({ok:false,error:'Senha incorreta.'},401);
  if (!storageReady()) return noStore({ok:false,error:'Vercel Blob não configurado.'},503);
  try {
    const payload=await request.json();
    if (!validId(payload.id)) throw new Error('Postagem inválida.');
    const posts=await loadPosts();
    if (!posts.some(p=>p.id===payload.id)) return errorResponse('Postagem não encontrada.',404);
    await removePost(payload.id);
    // A mídia não é apagada automaticamente para evitar afetar posts republicados.
    return noStore({ok:true});
  } catch(e) { return errorResponse(e); }
}
