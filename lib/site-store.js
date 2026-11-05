// Persistência independente para o portal TRIN. Não modifica a API do Instagram.
import { list, put, del, head } from '@vercel/blob';

const ROOT = 'trin-site/';
const POSTS = ROOT + 'posts/';
const MENU_FILE = ROOT + 'config/menus.json';

export const DEFAULT_MENUS = [
  { id: 'sobre', name: 'Sobre', title: 'Sobre o TRIN.', subtitle: 'Uma proposta de espaço digital para reunir informação, ciência, tecnologia e materiais de aprendizagem.', text: 'O TRIN foi pensado como um portal de leitura direta, com notícias, artigos e recursos organizados de maneira simples. O objetivo é facilitar a descoberta de conteúdos sem sobrecarregar a página.\n\nO visual faz referência a jornais tradicionais: títulos fortes, fotografias quadradas, separadores discretos e um fundo claro inspirado na experiência de leitura do Kindle.' },
  { id: 'cursos', name: 'Cursos', title: 'Nossos cursos.', subtitle: 'Esta página reunirá cursos, aulas e materiais educativos sobre tecnologia, ciência e outros temas de interesse.', text: 'Em breve, você poderá conhecer os cursos disponíveis, consultar seus conteúdos e encontrar as informações para participar.' },
  { id: 'recursos', name: 'Recursos', title: 'Recursos.', subtitle: 'O apoio da comunidade ajuda a fortalecer o TRIN e a manter novos conteúdos, cursos e publicações em desenvolvimento.', text: 'Para contribuir, basta escanear o QR Code Pix ao lado com o aplicativo do seu banco.\n\nSua contribuição pode ajudar na manutenção do portal, na organização dos materiais e na produção de novos conteúdos.' },
  { id: 'artigos', name: 'Artigos', title: 'Artigos.', subtitle: 'Esta página reunirá artigos, análises e textos informativos, organizados por assunto.', text: 'Em breve, você encontrará publicações completas, referências e materiais para aprofundar a leitura dos temas abordados no portal.' }
];

const token = () => process.env.BLOB_READ_WRITE_TOKEN;
export const storageReady = () => Boolean(token());

async function listAll(prefix) {
  const files = [];
  let cursor;
  for (let page = 0; page < 25; page++) {
    const result = await list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}), token: token() });
    files.push(...result.blobs);
    if (!result.hasMore || !result.cursor) break;
    cursor = result.cursor;
  }
  return files;
}
async function readJSON(file) {
  const source=new URL(file.url);source.searchParams.set('v',String(Date.now()));
  const response = await fetch(source, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Erro ao ler os dados persistidos do portal.');
  return response.json();
}
export async function loadMenus() {
  const files = await listAll(MENU_FILE);
  const selected = files.find(item => item.pathname === MENU_FILE);
  if (!selected) return structuredClone(DEFAULT_MENUS);
  const menus = await readJSON(selected);
  return Array.isArray(menus) ? menus : structuredClone(DEFAULT_MENUS);
}
export async function saveMenus(menus) {
  await put(MENU_FILE, JSON.stringify(menus), {
    access: 'public', addRandomSuffix: false, allowOverwrite: true,
    contentType: 'application/json', token: token(), cacheControlMaxAge: 60,
  });
}
export async function loadPosts() {
  const files = (await listAll(POSTS)).filter(f => /^trin-site\/posts\/[a-f0-9-]{36}\.json$/.test(f.pathname));
  const posts = await Promise.all(files.map(async f => { try { return await readJSON(f); } catch { return null; } }));
  return posts.filter(Boolean).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
export async function savePost(post) {
  await put(`${POSTS}${post.id}.json`, JSON.stringify(post), {
    access:'public', addRandomSuffix:false, allowOverwrite:true,
    contentType:'application/json', token:token(), cacheControlMaxAge:60,
  });
}
export async function removePost(id) {
  const files = await listAll(`${POSTS}${id}.json`);
  const file = files.find(f => f.pathname === `${POSTS}${id}.json`);
  if (file) await del(file.url, { token: token() });
}
export async function checkSiteMedia(mediaUrl) {
  if (typeof mediaUrl !== 'string' || mediaUrl.length > 2000) throw new Error('Imagem inválida.');
  const url = new URL(mediaUrl);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.public.blob.vercel-storage.com') ||
      !/^\/trinpost\/[a-f0-9-]{36}(?:-[A-Za-z0-9]+)?\.(?:jpg|mp4)$/.test(url.pathname) || url.search || url.hash) {
    throw new Error('A mídia deve ser enviada pelo armazenamento autorizado do TRINPost.');
  }
  const metadata = await head(mediaUrl, { token: token() });
  if (!['image/jpeg','video/mp4'].includes(metadata.contentType)) throw new Error('Tipo de arquivo não permitido.');
  if (metadata.size > 50*1024*1024) throw new Error('Arquivo maior que 50 MB.');
  return metadata.contentType === 'video/mp4' ? 'video' : 'photo';
}
