# TRINPost — versão preparada para Vercel (Instagram + Blob)

Esta é uma adaptação do TRIN Studio v5 para Vercel. **Não use `server.mjs`, `iniciar.bat`, `uploads/`, cloudflared nem `PUBLIC_BASE_URL` nesta versão.** O editor original permanece, com geração nativa de JPEG e vídeo e botão de publicação.

## Implantar sem manter o computador ligado

1. Entre em https://vercel.com e acesse **Add New > Project**. Suba a pasta `TRINPost_Vercel` para um repositório privado no GitHub e importe-o pela Vercel. Alternativamente, use https://vercel.com/drop e envie a pasta do projeto (verifique no painel se reconheceu Vite e o diretório `api/`).
2. Framework **Vite**, Build Command `npm run build`, Output Directory `dist`, Install Command `npm install`. Se a Vercel detectar automaticamente, mantenha os padrões.
3. Em **Settings > Environment Variables**, configure `IG_ACCESS_TOKEN` (token novo), `IG_USER_ID` (`17841446047571878`), `POST_PASSWORD` (senha forte) e `GRAPH_VERSION` (`v25.0`). Escolha ambiente Production (e Preview se for testar no preview). Não use `VITE_` nessas variáveis; esse prefixo expõe valores no cliente.
4. Na Vercel, abra **Storage > Create Database > Blob**. Crie um **Public Blob store** e associe ao mesmo projeto e ambiente. Isto adiciona `BLOB_READ_WRITE_TOKEN` automaticamente. **A mídia precisa ser temporariamente pública para a Meta buscá-la.**
5. Em **Deployments**, faça **Redeploy** depois de criar as variáveis e o Blob. Abra a URL `https://...vercel.app`. Clique **Verificar** com sua senha, gere uma imagem e publique primeiro uma foto de teste.

## Segurança e limitações

- O token da Meta é guardado nas funções, nunca no HTML. Como o token anterior foi compartilhado em uma conversa, revogue-o e emita outro. Nunca comite `.env`.
- A página é pública, mas operações de upload/publicação exigem a senha definida em `POST_PASSWORD`. Para uso real, adicione autenticação mais forte e rate limiting.
- Imagens: convertidas no navegador para JPEG. Vídeos: **apenas MP4/H.264 nativo**; se o navegador produzir WebM, ainda é possível baixar, mas o envio não converte (a Vercel não inclui FFmpeg). O Instagram pode rejeitar MP4 sem codec suportado.
- Os arquivos são enviados diretamente ao Vercel Blob por tokens temporários. A função não recebe o vídeo (evita o limite de 4,5 MB da Vercel). JPEG até 8 MB; vídeo até 50 MB.
- O Blob é excluído após publicação confirmada. Em caso de erro ou cancelamento, poderá haver arquivos no Blob a excluir manualmente em Storage.
- As Functions no Hobby com Fluid Compute normalmente têm até 300 segundos; vídeos podem falhar por processamento, token, codec ou limites Meta.
- A conta @trinbrasil deve estar autorizada com permissões de publicação no app TRINPost. A API usa `media_type: REELS` para vídeo individual com `share_to_feed=true`.
- O plano Hobby da Vercel é para projetos pessoais/não comerciais; confirme elegibilidade e cotas de Blob, pois limites ou políticas podem exigir plano pago.
- A integração de publicação é fornecida e validada por leitura/revisão estática; não foi testada no Instagram real, pois depende das credenciais do usuário e de um deploy funcional.

## Testes locais

```bash
npm install
npm run build
```

O `vite` só oferece a interface. Para testar `api/` e Blob em desenvolvimento use o CLI da Vercel (`vercel dev`) com variáveis locais protegidas.

Documentação
- https://vercel.com/docs/vercel-blob/client-upload
- https://vercel.com/docs/functions/limitations
- https://vercel.com/docs/vercel-blob
