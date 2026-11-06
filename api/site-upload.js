// Rota antiga de upload do PORTAL desativada.
// A publicação de imagens do site agora é enviada a /api/site e salva no Drive.
// O upload para Instagram (/api/upload e /api/publicar) NÃO foi alterado.
export function POST() {
  return new Response(JSON.stringify({ok:false,error:'Envie imagens do portal pelo botão Postar no site: /api/site (Google Drive).'}),
    {status:410,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
}
