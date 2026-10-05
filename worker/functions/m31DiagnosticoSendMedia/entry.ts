// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31DiagnosticoSendMedia — Isola as variáveis do problema 405
 *
 * Testa /send/media de 3 formas diferentes, usando UAZAPI_BASE (não hardcodado):
 *   1. Raw fetch (HTTP/2 padrão do Deno)
 *   2. undici Agent com allowH2:false (força HTTP/1.1)
 *   3. Raw fetch com User-Agent do PowerShell (elimina header difference)
 *
 * Também testa /send/text no mesmo base para confirmar que o host responde.
 */

return (async (req) => {
  const token = config('UAZAPI_TOKEN');
  const baseUrl = config('UAZAPI_BASE') || '__UAZAPI_API__';

  if (!token) {
    return Response.json({ error: 'UAZAPI_TOKEN não configurado' }, { status: 500 });
  }

  const phone = '5581992008889';
  const imageUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=M31-TESTE&format=png';

  const mediaBody = JSON.stringify({
    number: phone,
    phone: phone,
    type: 'image',
    file: imageUrl,
    caption: 'teste diag',
    text: 'teste diag',
  });

  const textBody = JSON.stringify({
    number: phone,
    phone: phone,
    message: 'teste diag text',
    text: 'teste diag text',
  });

  const resultados = [];

  // ── Teste 0: /send/text com raw fetch (baseline — sabemos que funciona) ──
  try {
    const resp = await fetch(`${baseUrl}/send/text`, {
      method: 'POST',
      headers: { 'token': token, 'Content-Type': 'application/json' },
      body: textBody,
    });
    const respText = await resp.text();
    resultados.push({
      teste: '0_text_raw_fetch',
      endpoint: '/send/text',
      http_status: resp.status,
      sucesso: resp.status === 200,
      body_preview: respText.slice(0, 200),
    });
  } catch (e) {
    resultados.push({ teste: '0_text_raw_fetch', erro: (e as Error).message });
  }

  // ── Teste 1: /send/media com raw fetch (HTTP/2 padrão) ──
  try {
    const resp = await fetch(`${baseUrl}/send/media`, {
      method: 'POST',
      headers: { 'token': token, 'Content-Type': 'application/json' },
      body: mediaBody,
    });
    const respText = await resp.text();
    resultados.push({
      teste: '1_media_raw_fetch',
      endpoint: '/send/media',
      http_status: resp.status,
      sucesso: resp.status === 200,
      body_preview: respText.slice(0, 200),
    });
  } catch (e) {
    resultados.push({ teste: '1_media_raw_fetch', erro: (e as Error).message });
  }

  // ── Teste 2: /send/media com undici Agent (allowH2:false = força HTTP/1.1) ──
  try {


    const resp = await fetch(`${baseUrl}/send/media`, {
      method: 'POST',
      headers: { 'token': token, 'Content-Type': 'application/json' },
      body: mediaBody,
    });
    const respText = await resp.text();
    resultados.push({
      teste: '2_media_undici_http1',
      endpoint: '/send/media',
      http_status: resp.status,
      sucesso: resp.status === 200,
      body_preview: respText.slice(0, 200),
    });
  } catch (e) {
    resultados.push({ teste: '2_media_undici_http1', erro: (e as Error).message });
  }

  // ── Teste 3: /send/media com raw fetch + User-Agent do PowerShell ──
  try {
    const resp = await fetch(`${baseUrl}/send/media`, {
      method: 'POST',
      headers: {
        'token': token,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Microsoft Windows PowerShell)',
      },
      body: mediaBody,
    });
    const respText = await resp.text();
    resultados.push({
      teste: '3_media_raw_with_powershell_ua',
      endpoint: '/send/media',
      http_status: resp.status,
      sucesso: resp.status === 200,
      body_preview: respText.slice(0, 200),
    });
  } catch (e) {
    resultados.push({ teste: '3_media_raw_with_powershell_ua', erro: (e as Error).message });
  }

  // ── Teste 4: /send/media com undici + caption como texto (sem campo text) ──
  // Variação do body: alguns endpoints esperam apenas caption, não text
  try {


    const minimalBody = JSON.stringify({
      number: phone,
      type: 'image',
      file: imageUrl,
      caption: 'teste diag',
    });

    const resp = await fetch(`${baseUrl}/send/media`, {
      method: 'POST',
      headers: { 'token': token, 'Content-Type': 'application/json' },
      body: minimalBody,
    });
    const respText = await resp.text();
    resultados.push({
      teste: '4_media_undici_minimal_body',
      endpoint: '/send/media',
      http_status: resp.status,
      sucesso: resp.status === 200,
      body_preview: respText.slice(0, 200),
    });
  } catch (e) {
    resultados.push({ teste: '4_media_undici_minimal_body', erro: (e as Error).message });
  }

  const anySuccess = resultados.filter(r => r.sucesso).map(r => r.teste);

  return Response.json({
    base_url_usado: baseUrl,
    uazapi_base_secret: config('UAZAPI_BASE') ? 'configurado' : 'NÃO configurado (fallback para altermkt)',
    phone_teste: phone,
    image_url_usada: imageUrl,
    body_enviado: JSON.parse(mediaBody),
    resultados,
    sucessos: anySuccess,
    conclusao: anySuccess.length > 0
      ? `Sucesso nos testes: ${anySuccess.join(', ')}`
      : 'Nenhum teste de /send/media teve sucesso do Deno',
    proximo_passo: anySuccess.length > 0
      ? 'Usar a abordagem que funcionou no m31SendWhatsApp'
      : 'Confirmar qual base_url foi usada no teste do Windows PowerShell',
  });
})(req);
}
