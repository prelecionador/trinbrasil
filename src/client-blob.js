import { upload } from '@vercel/blob/client';

// Senha é usada somente para autorizar um upload junto ao servidor.
// Token da Meta e token do Blob ficam exclusivamente nas funções.
window.trinDirectBlobUpload = async (blob, kind, password, onProgress = () => {}) => {
  const type = kind === 'photo' ? 'image/jpeg' : 'video/mp4';
  if (blob.type !== type) throw new Error(`O arquivo precisa ser ${type}.`);
  const max = kind === 'photo' ? 8 * 1024 * 1024 : 50 * 1024 * 1024;
  if (blob.size > max) throw new Error(`Arquivo muito grande: máximo ${kind === 'photo' ? '8 MB' : '50 MB'}.`);
  const name = `trinpost/${crypto.randomUUID()}.${kind === 'photo' ? 'jpg' : 'mp4'}`;
  try {
    return await upload(name, blob, {
      access: 'public',
      contentType: type,
      handleUploadUrl: '/api/upload',
      clientPayload: JSON.stringify({ password }),
      onUploadProgress: info => onProgress(Math.round(info.percentage)),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/Unexpected token|not valid JSON|JSON at position|server error|Failed to fetch/i.test(msg)) {
      throw new Error('Falha ao conversar com /api/upload. Abra Vercel → Logs e filtre por /api/upload. Verifique também o deployment atual e as variáveis BLOB_READ_WRITE_TOKEN, IG_ACCESS_TOKEN, IG_USER_ID e POST_PASSWORD.');
    }
    throw error;
  }
};
