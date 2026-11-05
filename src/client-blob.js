import { upload } from '@vercel/blob/client';

// Senha é usada somente para autorizar um upload junto ao servidor.
// Token da Meta e token do Blob ficam exclusivamente nas funções.
window.trinDirectBlobUpload = async (blob, kind, password, onProgress = () => {}) => {
  const type = kind === 'photo' ? 'image/jpeg' : 'video/mp4';
  if (blob.type !== type) throw new Error(`O arquivo precisa ser ${type}.`);
  const max = kind === 'photo' ? 8 * 1024 * 1024 : 50 * 1024 * 1024;
  if (blob.size > max) throw new Error(`Arquivo muito grande: máximo ${kind === 'photo' ? '8 MB' : '50 MB'}.`);
  const name = `trinpost/${crypto.randomUUID()}.${kind === 'photo' ? 'jpg' : 'mp4'}`;
  return await upload(name, blob, {
    access: 'public',
    contentType: type,
    handleUploadUrl: '/api/upload',
    clientPayload: JSON.stringify({ password }),
    onUploadProgress: info => onProgress(Math.round(info.percentage)),
  });
};
