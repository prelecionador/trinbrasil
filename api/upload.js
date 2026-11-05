import { handleUpload } from '@vercel/blob/client';
import { auth, configured, noStore, responseError } from '../lib/common.js';

// O navegador solicita um token de upload; nunca disponibilizamos o token mestre do Blob.
export async function POST(request) {
  if (request.method !== 'POST') return noStore({error:'Método não permitido'},405);
  if (!configured()) return noStore({error:'Configuração de publicação incompleta.'},503);
  try {
    const body = await request.json();
    const result = await handleUpload({
      body, request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let supplied;
        try { supplied = JSON.parse(clientPayload || '{}').password; } catch {supplied = '';}
        if (!auth(supplied)) throw new Error('Senha de publicação incorreta.');
        if (!/^trinpost\/[a-f0-9-]{36}\.(jpg|mp4)$/.test(pathname)) throw new Error('Caminho de upload inválido.');
        return {
          allowedContentTypes: ['image/jpeg', 'video/mp4'],
          maximumSizeInBytes: 50 * 1024 * 1024,
          addRandomSuffix: true,
          validUntil: Date.now() + 10 * 60 * 1000,
        };
      },
      onUploadCompleted: async () => {
        // Sem banco: o editor envia o URL retornado pelo Blob para /api/publicar.
      },
    });
    return noStore(result);
  } catch(err) {
    return noStore({error:responseError(err)},400);
  }
}
