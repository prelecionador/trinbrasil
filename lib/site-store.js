// Persistência do PORTAL TRIN via Apps Script + Planilhas + Google Drive.
// Este módulo NÃO utiliza @vercel/blob nem interfere na API do Instagram.
// O Apps Script usado aqui é o Código.gs disponibilizado na conversa.

const getConfig = () => {
  const url = (process.env.GOOGLE_SCRIPT_URL || '').trim();
  const token = (process.env.TRIN_API_SECRET || process.env.GOOGLE_SCRIPT_SECRET || '').trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec(?:\?.*)?$/.test(url)) {
    throw new Error('Defina GOOGLE_SCRIPT_URL com o endereço /exec da implantação Apps Script.');
  }
  if (!token) throw new Error('Defina TRIN_API_SECRET na Vercel e nas propriedades do Apps Script.');
  return { url, token };
};
export const storageReady = () => Boolean(process.env.GOOGLE_SCRIPT_URL &&
  (process.env.TRIN_API_SECRET || process.env.GOOGLE_SCRIPT_SECRET));

async function readResponse(res) {
  const raw = await res.text();
  let result;
  try { result = JSON.parse(raw); }
  catch { throw new Error(`Apps Script retornou conteúdo não JSON (HTTP ${res.status}). Confirme a URL /exec e as permissões da implantação.`); }
  if (!res.ok || !result.ok) throw new Error(result.erro || result.error || `Apps Script respondeu HTTP ${res.status}.`);
  return result;
}
async function gasGet(tipo) {
  const {url}=getConfig();
  const endpoint=new URL(url);
  endpoint.searchParams.set('tipo',tipo);
  const res=await fetch(endpoint,{method:'GET',redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(40000)});
  return (await readResponse(res)).itens || [];
}
async function gasPost(acao,tipo,payload={}) {
  const {url,token}=getConfig();
  const res=await fetch(url,{
    method:'POST',redirect:'follow',cache:'no-store',
    headers:{'Content-Type':'text/plain; charset=utf-8'},
    body:JSON.stringify({acao,tipo,token,...payload}),
    signal:AbortSignal.timeout(90000),
  });
  return (await readResponse(res)).resultado;
}
const string = value => value == null ? '' : String(value);
const isTrue = v => v === true || v === 1 || /^(true|sim|1|yes)$/i.test(string(v).trim());
const safeDate = v => v instanceof Date ? v.toISOString() : string(v);
function mapPost(row) {
  const photo = string(row.imagem_url || row.imagem);
  // A aba ADMIN tem "Matéria" e "Legenda" distintos. Para notícias novas,
  // mostramos a legenda até o conteúdo completo ser escrito no editor.
  return {
    id: string(row.id), title:string(row.titulo), subtitle:string(row.subtitulo),
    caption:string(row.legenda), article:string(row.materia),
    content:string(row.materia || row.legenda),
    category:string(row.categoria) || 'Notícias', author:string(row.membro || row.autor) || 'Equipe TRIN',
    tags:string(row.tags), featured:isTrue(row.destaque), image:photo,
    type:'photo', createdAt:safeDate(row.publicado_em || row.horario || row.criado_em),
    updatedAt:safeDate(row.atualizado_em || row.editado_em || row.publicado_em || row.horario)
  };
}
function mapMenu(row) {
  return {
    id:string(row.id_menu), name:string(row.nome), title:string(row.titulo),
    subtitle:string(row.subtitulo), text:string(row.conteudo || row.texto),
    image:string(row.imagem_url || row.imagem),
  };
}
export async function loadPosts() {
  const rows=await gasGet('Materia');
  if (!Array.isArray(rows)) throw new Error('Resposta inválida da aba ADMIN.');
  return rows.map(mapPost).filter(p=>p.id && p.title)
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
}
export async function loadMenus() {
  const rows=await gasGet('Menu');
  if (!Array.isArray(rows)) throw new Error('Resposta inválida da aba Menu.');
  return rows.map(mapMenu).filter(p=>p.id && p.id !== 'cor-portal' && p.name && p.title);
}

// Nenhum dado de imagem permanece no Blob. O Apps Script recebe o JPEG,
// salva no Drive e retorna a URL. O segundo update cobre ADMIN com
// cabeçalho "imagem_url" ou "imagem", sem precisar mudar a planilha.
export async function createPost(post,imagem) {
  const dados={
    titulo:post.title, subtitulo:post.subtitle,
    legenda:post.caption, materia:post.article || '', categoria:post.category,
    membro:post.author, tags:post.tags, destaque:post.featured,
    horario:post.createdAt, publicado_em:post.createdAt,
    atualizado_em:post.updatedAt,
  };
  const result=await gasPost('adicionar','Materia',{dados,imagem});
  const row=result?.registro || {};
  if (!row.id) throw new Error('Apps Script não retornou o ID da notícia.');
  const url=string(row.imagem || row.imagem_url);
  if (!url) throw new Error('A imagem foi enviada, mas não retornou endereço público.');
  // O Apps Script inicial escreve "imagem"; na planilha a coluna também
  // pode chamar-se "imagem_url". Gravar ambas garante compatibilidade.
  await gasPost('editar','Materia',{id:row.id,dados:{imagem:url,imagem_url:url}});
  return { ...post,id:row.id,image:url,type:'photo' };
}
export async function savePost(post) {
  await gasPost('editar','Materia',{id:post.id,dados:{
    titulo:post.title, subtitulo:post.subtitle,
    materia:post.article ?? post.content, legenda:post.caption,
    categoria:post.category, membro:post.author,
    tags:post.tags, destaque:post.featured, atualizado_em:post.updatedAt,
  }});
}
export async function removePost(id) { await gasPost('excluir','Materia',{id}); }

// A tela atual de menus envia a lista inteira. Aplicamos somente o diff:
// atualiza linhas modificadas, cria novas e envia exclusões à aba Trash.
export async function saveMenus(menus) {
  const before=await loadMenus();
  const old=new Map(before.map(m=>[m.id,m]));
  const next=new Map(menus.map(m=>[m.id,m]));
  for (const m of menus) {
    const dados={id_menu:m.id,nome:m.name,titulo:m.title,subtitulo:m.subtitle,conteudo:m.text};
    if (!old.has(m.id)) await gasPost('adicionar','Menu',{dados});
    else {
      const previous=old.get(m.id);
      if (['name','title','subtitle','text'].some(k=>String(m[k])!==String(previous[k]))) {
        await gasPost('editar','Menu',{id:m.id,dados});
      }
    }
  }
  for (const m of before) if (!next.has(m.id)) await gasPost('excluir','Menu',{id:m.id});
  return loadMenus();
}
export async function saveMenuImage(id,imagem) {
  const result=await gasPost('editar','Menu',{id,dados:{},imagem});
  return mapMenu(result);
}

// Uma única linha reservada na aba Menu guarda a cor global.
// Não cria nova aba e nunca aparece na navegação pública.
const THEME_ID='cor-portal';
const DEFAULT_ACCENT='#89CFF0';
export async function loadTheme(){
  const rows=await gasGet('Menu');
  if(!Array.isArray(rows))throw new Error('Resposta inválida da aba Menu.');
  const config=rows.find(r=>string(r.id_menu)===THEME_ID);
  const color=string(config?.conteudo||config?.texto).trim();
  return {accent:/^#[0-9a-fA-F]{6}$/.test(color)?color.toUpperCase():DEFAULT_ACCENT};
}
export async function saveTheme(accent){
  const color=string(accent).trim().toUpperCase();
  if(!/^#[0-9A-F]{6}$/.test(color))throw new Error('Código de cor inválido.');
  const rows=await gasGet('Menu');
  const current=rows.find(r=>string(r.id_menu)===THEME_ID);
  if(current){
    await gasPost('editar','Menu',{id:THEME_ID,dados:{conteudo:color}});
  }else{
    await gasPost('adicionar','Menu',{dados:{
      id_menu:THEME_ID,nome:'Configuração visual',titulo:'Cor do portal',
      subtitulo:'',conteudo:color
    }});
  }
  return {accent:color};
}
