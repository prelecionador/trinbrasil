// Portal TRIN: Planilhas e Drive. O Instagram permanece na sua API separada.
import { auth, noStore, responseError } from '../lib/common.js';
import { loadPosts,loadMenus,createPost,savePost,removePost,saveMenus,saveMenuImage,loadTheme,saveTheme,storageReady } from '../lib/site-store.js';
const clean=(v,max)=>String(v??'').trim().slice(0,max);
const validId=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/i.test(id);
const slug=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,'').slice(0,48);
const requireAuth=req=>auth(req.headers.get('x-trin-password'));
const fail=(e,status=400)=>noStore({ok:false,error:responseError(e)},status);
const missing=()=>noStore({ok:false,error:'Configure GOOGLE_SCRIPT_URL e TRIN_API_SECRET na Vercel.'},503);
function sanitizeMenu(m) {
  const id=slug(m.id||m.name);
  if(!id||id==='inicio'||id==='cor-portal'||!/^[a-z][a-z0-9-]*$/.test(id))throw new Error('ID de menu inválido.');
  const name=clean(m.name,42),title=clean(m.title,160);
  if(!name||!title)throw new Error('Preencha nome e título do menu.');
  return {id,name,title,subtitle:clean(m.subtitle,380),text:clean(m.text,12000)};
}
function parsePost(payload,previous={}) {
  const title=clean(payload.title,200);
  if(!title)throw new Error('O título é obrigatório.');
  const content=clean(payload.content,15000);
  // Não copie a legenda para Matéria ao apenas marcar/desmarcar destaque.
  const article = previous.article !== undefined && content === previous.content
    ? previous.article : content;
  return {
    ...previous,title,subtitle:clean(payload.subtitle,1200),
    content,article,
    caption:clean(payload.caption??previous.caption??'',2200),
    category:clean(payload.category,60)||'Notícias',
    author:clean(payload.author,100)||'Equipe TRIN',
    tags:clean(payload.tags,350),featured:Boolean(payload.featured),
    updatedAt:new Date().toISOString(),
  };
}
function validateImage(image) {
  if(!image || image.mime!=='image/jpeg'||typeof image.base64!=='string')throw new Error('Envie uma imagem JPEG válida.');
  const data=image.base64.replace(/^data:image\/jpeg;base64,/, '');
  if(data.length>3.8*1024*1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data))throw new Error('Imagem inválida ou muito grande (máximo aproximadamente 2,8 MB).');
  const bytes=Buffer.from(data,'base64');
  if(bytes.length>2.8*1024*1024||bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw new Error('O arquivo não é JPEG ou excede o limite.');
  return {mime:'image/jpeg',base64:data};
}
export async function GET(request) {
  if(!storageReady())return missing();
  try{
    const url=new URL(request.url);
    if(url.searchParams.get('resource')==='theme')return noStore({ok:true,theme:await loadTheme()});
    if(url.searchParams.get('resource')==='menus')return noStore({ok:true,menus:await loadMenus()});
    return noStore({ok:true,posts:await loadPosts()});
  }catch(e){return fail(e,502);}
}
export async function POST(request) {
  if(!requireAuth(request))return noStore({ok:false,error:'Senha incorreta.'},401);
  if(!storageReady())return missing();
  try {
    const payload=await request.json();
    if(payload.action==='createPost'){
      if(payload.type!=='photo')throw new Error('O Google Apps Script configurado recebe apenas imagens no portal. Vídeos do Instagram continuam funcionando normalmente.');
      const posts=await loadPosts();
      const now=new Date().toISOString();
      const post=parsePost(payload,{createdAt:now,caption:clean(payload.content,2200)});
      if(post.featured&&posts.filter(p=>p.featured).length>=2)return fail('São permitidos no máximo dois destaques.',409);
      // Legenda e matéria ocupam colunas diferentes da aba ADMIN.
      // A matéria é opcional, mas quando fornecida já é salva na publicação inicial.
      post.article=clean(payload.article,15000);
      post.content=post.article || post.caption;
      const image=validateImage(payload.image);
      const created=await createPost(post,image);
      return noStore({ok:true,post:created},201);
    }
    if(payload.action==='setTheme'){
      const accent=clean(payload.accent,10);
      if(!/^#[0-9a-fA-F]{6}$/.test(accent))throw new Error('Cor hexadecimal inválida.');
      return noStore({ok:true,theme:await saveTheme(accent)});
    }
    if(payload.action==='saveMenus'){
      if(!Array.isArray(payload.menus)||payload.menus.length>30)throw new Error('Lista de menus inválida (limite: 30).');
      const menus=payload.menus.map(sanitizeMenu);
      if(new Set(menus.map(m=>m.id)).size!==menus.length)throw new Error('Existem menus repetidos.');
      return noStore({ok:true,menus:await saveMenus(menus)});
    }
    if(payload.action==='uploadMenuImage') {
      const id=slug(payload.id);
      if(!id)throw new Error('Menu inválido.');
      const imagem=validateImage(payload.image);
      return noStore({ok:true,menu:await saveMenuImage(id,imagem)});
    }
    return fail('Ação desconhecida.');
  }catch(e){return fail(e);}
}
export async function PUT(request) {
  if(!requireAuth(request))return noStore({ok:false,error:'Senha incorreta.'},401);
  if(!storageReady())return missing();
  try{
    const payload=await request.json();
    if(!validId(payload.id))throw new Error('Postagem inválida.');
    const posts=await loadPosts();
    const previous=posts.find(p=>p.id===payload.id);
    if(!previous)return fail('Postagem não encontrada.',404);
    const updated=parsePost(payload,previous);
    if(updated.featured&&!previous.featured&&posts.filter(p=>p.featured).length>=2)return fail('São permitidos no máximo dois destaques.',409);
    await savePost(updated);
    return noStore({ok:true,post:updated});
  }catch(e){return fail(e);}
}
export async function DELETE(request) {
  if(!requireAuth(request))return noStore({ok:false,error:'Senha incorreta.'},401);
  if(!storageReady())return missing();
  try{
    const payload=await request.json();
    if(!validId(payload.id))throw new Error('Postagem inválida.');
    const posts=await loadPosts();
    if(!posts.some(p=>p.id===payload.id))return fail('Postagem não encontrada.',404);
    await removePost(payload.id); // Apps Script: ADMIN -> Trash, Drive preservado
    return noStore({ok:true});
  }catch(e){return fail(e);}
}
