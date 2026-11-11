// Proxy autenticado para Google AI Studio. Não expõe GEMINI_API_KEY no navegador.
import { auth, noStore } from '../lib/common.js';

const MODELOS = new Set(['gemma-4-26b-a4b-it', 'gemini-2.5-flash-lite']);

export async function POST(request) {
  if (!auth(request.headers.get('x-trin-password'))) {
    return noStore({ error: 'Senha de publicação incorreta.' }, 401);
  }
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) return noStore({ error: 'Configure GEMINI_API_KEY no painel da Vercel.' }, 503);

  try {
    const { modelo, prompt, configuracao = {} } = await request.json();
    if (!MODELOS.has(modelo) || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 45000) {
      return noStore({ error: 'Solicitação editorial inválida.' }, 400);
    }
    const { tools, generationConfig = {} } = configuracao ?? {};
    if (tools !== undefined && (
      !Array.isArray(tools) || tools.length !== 1 ||
      !tools[0] || Object.keys(tools[0]).join(',') !== 'googleSearch'
    )) return noStore({ error: 'Ferramenta não permitida.' }, 400);

    const temperatura = Number(generationConfig.temperature ?? .7);
    const maxTokens = Number(generationConfig.maxOutputTokens ?? 3500);
    if (!Number.isFinite(temperatura) || temperatura < 0 || temperatura > 2 ||
        !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 3500) {
      return noStore({ error: 'Configuração de geração inválida.' }, 400);
    }
    const corpo = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: temperatura,
        maxOutputTokens: maxTokens,
        ...(generationConfig.thinkingConfig?.thinkingLevel === 'minimal'
          ? { thinkingConfig: { thinkingLevel: 'minimal' } } : {})
      },
      ...(tools ? { tools: [{ googleSearch: {} }] } : {})
    };
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(90000)
      }
    );
    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const detalhe = String(dados.error?.message || 'Falha ao gerar conteúdo.').slice(0, 350);
      return noStore({ error: detalhe.replaceAll(chave, '[CHAVE OCULTA]') }, resp.status >= 500 ? 502 : resp.status);
    }
    return noStore(dados);
  } catch (err) {
    if (err instanceof SyntaxError) return noStore({ error: 'JSON inválido.' }, 400);
    return noStore({ error: 'Falha na comunicação com a API de geração.' }, 502);
  }
}
