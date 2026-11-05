// Site público em / e editor existente em /admin.
// O adaptador local permite testar o CMS no Vite sem mexer nas funções da Vercel.
import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const root=process.cwd();
const dir=resolve(root,'.trin-local');
const file=resolve(dir,'site.json');
const defaults=[
  {id:'sobre',name:'Sobre',title:'Sobre o TRIN.',subtitle:'Uma proposta de espaço digital para reunir informação, ciência, tecnologia e materiais de aprendizagem.',text:'O TRIN foi pensado como um portal de leitura direta, com notícias, artigos e recursos organizados de maneira simples.'},
  {id:'cursos',name:'Cursos',title:'Nossos cursos.',subtitle:'Esta página reunirá cursos, aulas e materiais educativos sobre tecnologia e ciência.',text:'Em breve, você poderá conhecer os cursos disponíveis.'},
  {id:'recursos',name:'Recursos',title:'Recursos.',subtitle:'Apoie o projeto TRIN.',text:'Para contribuir, escaneie o QR Code Pix da página com o aplicativo do seu banco.'},
  {id:'artigos',name:'Artigos',title:'Artigos.',subtitle:'Análises e textos informativos.',text:'Esta página reunirá conteúdos de aprofundamento.'},
];
async function load() {
  try { return JSON.parse(await readFile(file,'utf8')); }
  catch {return {posts:[],menus:structuredClone(defaults)};}
}
async function save(value) { await mkdir(dir,{recursive:true});await writeFile(file,JSON.stringify(value,null,2)); }
function send(res,code,obj) {res.statusCode=code;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(obj));}
function readRequest(req) {return new Promise((ok,bad)=>{let size=0;const parts=[];req.on('data',chunk=>{size+=chunk.length;if(size>55*1024*1024){bad(new Error('Arquivo muito grande.'));req.destroy();return;}parts.push(chunk);});req.on('end',()=>ok(Buffer.concat(parts)));req.on('error',bad);});}
const slug=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,'').slice(0,48);
function siteLocalPlugin(password) {
 return {name:'trin-local-cms',configureServer(server){
  server.middlewares.use(async(req,res,next)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/admin') {res.writeHead(302,{Location:'/admin/'});res.end();return;}
    if(url.pathname.startsWith('/trin-local-media/')) {
      if(req.method!=='GET') return send(res,405,{error:'Método inválido'});
      const name=url.pathname.split('/').pop();
      if(!/^[a-f0-9-]{36}\.(jpg|mp4)$/.test(name)) return send(res,404,{error:'Arquivo não encontrado'});
      try {let b=await readFile(resolve(dir,'uploads',name));res.setHeader('Content-Type',name.endsWith('.jpg')?'image/jpeg':'video/mp4');res.setHeader('Cache-Control','no-store');res.end(b);}
      catch{return send(res,404,{error:'Arquivo não encontrado'});}
      return;
    }
    if(url.pathname!=='/api/site' && url.pathname!=='/api/site-upload') return next();
    try {
      if(req.method!=='GET' && req.headers['x-trin-password']!==password) return send(res,401,{ok:false,error:'Senha incorreta. Em ambiente local, use POST_PASSWORD do seu .env ou local se não houver configuração.'});
      if(url.pathname==='/api/site-upload') {
        if(req.method!=='POST') return send(res,405,{ok:false,error:'Método inválido'});
        const type=req.headers['content-type'];if(!['image/jpeg','video/mp4'].includes(type)) return send(res,400,{ok:false,error:'Formato inválido'});
        const buf=await readRequest(req),name=randomUUID()+(type==='image/jpeg'?'.jpg':'.mp4');
        await mkdir(resolve(dir,'uploads'),{recursive:true});await writeFile(resolve(dir,'uploads',name),buf);
        return send(res,200,{ok:true,url:`${url.origin}/trin-local-media/${name}`});
      }
      const db=await load();
      if(req.method==='GET') return send(res,200,{ok:true,...(url.searchParams.get('resource')==='menus'?{menus:db.menus}:{posts:db.posts.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))})});
      const body=JSON.parse((await readRequest(req)).toString()||'{}');
      if(req.method==='POST' && body.action==='saveMenus') {
        if(!Array.isArray(body.menus)||body.menus.length>30)throw new Error('Lista de menus inválida.');
        const menus=body.menus.map(m=>({id:slug(m.id||m.name),name:String(m.name||'').trim().slice(0,42),title:String(m.title||'').trim().slice(0,160),subtitle:String(m.subtitle||'').trim().slice(0,380),text:String(m.text||'').trim().slice(0,12000)}));
        if(menus.some(m=>!m.id||m.id==='inicio'||!m.name||!m.title)||new Set(menus.map(m=>m.id)).size!==menus.length)throw new Error('Menu duplicado ou inválido.');
        db.menus=menus;await save(db);return send(res,200,{ok:true,menus});
      }
      if(req.method==='POST' && body.action==='createPost') {
        if(!body.title?.trim()) throw new Error('Título obrigatório.');
        if(body.featured&&db.posts.filter(p=>p.featured).length>=2)return send(res,409,{ok:false,error:'No máximo duas postagens destacadas.'});
        if(!/^https?:\/\//.test(body.mediaUrl||''))throw new Error('Imagem ausente.');
        const now=new Date().toISOString();
        const post={id:randomUUID(),createdAt:now,updatedAt:now,title:body.title.slice(0,200),subtitle:String(body.subtitle||'').slice(0,1200),content:String(body.content||'').slice(0,15000),category:String(body.category||'Notícias').slice(0,60),author:String(body.author||'Equipe TRIN').slice(0,100),tags:String(body.tags||'').slice(0,350),featured:!!body.featured,image:body.mediaUrl,type:body.type||'photo'};
        db.posts.push(post);await save(db);return send(res,201,{ok:true,post});
      }
      if(req.method==='PUT') {
        const post=db.posts.find(p=>p.id===body.id);
        if(!post)return send(res,404,{ok:false,error:'Postagem não encontrada'});
        if(body.featured&&!post.featured&&db.posts.filter(p=>p.featured).length>=2)return send(res,409,{ok:false,error:'No máximo duas postagens destacadas.'});
        for(const key of ['title','subtitle','content','category','author','tags'])if(body[key]!==undefined)post[key]=String(body[key]).slice(0,key==='content'?15000:1200);
        if(!post.title.trim())throw new Error('Título obrigatório.');
        post.featured=!!body.featured;post.updatedAt=new Date().toISOString();await save(db);return send(res,200,{ok:true,post});
      }
      if(req.method==='DELETE') {const p=db.posts.findIndex(p=>p.id===body.id);if(p<0)return send(res,404,{ok:false,error:'Postagem não encontrada'});db.posts.splice(p,1);await save(db);return send(res,200,{ok:true});}
      return send(res,400,{ok:false,error:'Ação inválida'});
    } catch(error) {return send(res,400,{ok:false,error:error.message||'Falha local'});}
  });
 }};
}
export default defineConfig(({mode})=>{
 const env=loadEnv(mode,root,'');
 return {plugins:[siteLocalPlugin(env.POST_PASSWORD||'local')],build:{rollupOptions:{input:{site:resolve(root,'index.html'),admin:resolve(root,'admin/index.html')}}}};
});
