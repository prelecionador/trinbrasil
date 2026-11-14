// Vite local utiliza a mesma API do portal que será executada na Vercel.
// Sem banco paralelo em .trin-local: o conteúdo vem do Google Planilhas.
// Não intercepta nenhuma API do Instagram (status, verificar, publicar ou upload).
import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';

const root=process.cwd();
function apiLocalPlugin() {
  return {name:'trin-google-site-api',configureServer(server){
    server.middlewares.use(async(req,res,next)=>{
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/admin'){
        res.writeHead(302,{Location:'/admin/'});res.end();return;
      }
      if(url.pathname!=='/api/site' && url.pathname!=='/api/site-upload')return next();
      if(url.pathname==='/api/site-upload'){
        res.writeHead(410,{'Content-Type':'application/json; charset=utf-8'});
        res.end(JSON.stringify({ok:false,error:'Upload do portal foi migrado para Google Drive. Use /api/site.'}));return;
      }
      try {
        if(!['GET','POST','PUT','DELETE'].includes(req.method)){
          res.writeHead(405);res.end();return;
        }
        const chunks=[];let size=0;
        if(req.method!=='GET') {
          for await(const chunk of req){
            size+=chunk.length;
            if(size>4*1024*1024)throw new Error('Requisição grande demais (máximo 4 MB).');
            chunks.push(chunk);
          }
        }
        const mod=await server.ssrLoadModule('/api/site.js');
        const request=new Request(url,{
          method:req.method,headers:req.headers,
          ...(req.method!=='GET'?{body:Buffer.concat(chunks)}:{}),
        });
        const response=await mod[req.method](request);
        res.writeHead(response.status,Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      }catch(error){
        res.writeHead(500,{'Content-Type':'application/json; charset=utf-8'});
        res.end(JSON.stringify({ok:false,error:error.message||'Erro da API local.'}));
      }
    });
  }};
}
export default defineConfig(({ mode }) => {
  // O Vite não disponibiliza automaticamente variáveis privadas do .env ao
  // processo Node. Carregá-las somente no servidor (nunca no bundle cliente).
  const env = loadEnv(mode, root, '');
  for (const name of ['POST_PASSWORD', 'GOOGLE_SCRIPT_URL', 'TRIN_API_SECRET', 'GOOGLE_SCRIPT_SECRET']) {
    if (!process.env[name] && env[name]) process.env[name] = env[name];
  }
  return {
    plugins:[apiLocalPlugin()],
    build:{rollupOptions:{input:{site:resolve(root,'index.html'),admin:resolve(root,'admin/index.html')}}},
  };
});
