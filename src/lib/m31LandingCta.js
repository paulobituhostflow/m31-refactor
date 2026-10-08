/**
 * m31LandingCta — destino canônico dos CTAs de inscrição da landing.
 *
 * A inscrição vive DENTRO desta aplicação, no caminho /m31-inscricao.
 * Links antigos do site institucional (WordPress) em m31filhas.com.br/m31-inscricao
 * devolvem 404 e por isso nunca podem chegar ao CTA da página.
 *
 * Fonte única: CAMINHO_INSCRICAO. Nenhum CTA de inscrição escreve o destino à mão.
 */

export const CAMINHO_INSCRICAO = '/m31-inscricao';

// Hosts do site institucional antigo (404 no caminho de inscrição).
const HOSTS_LEGADOS = ['m31filhas.com.br', 'www.m31filhas.com.br'];

function normalizar(valor) {
  return String(valor || '').trim();
}

function hostDe(valor) {
  return normalizar(valor)
    .replace(/^[a-z]+:\/\//i, '')
    .split('/')[0]
    .split(':')[0]
    .toLowerCase();
}

/** true quando o valor é um destino de inscrição (canônico ou legado). */
export function ehDestinoInscricao(valor) {
  const v = normalizar(valor);
  if (!v) return false;
  return /\/m31-inscricao\/?$/i.test(v);
}

/** true quando o valor aponta para o site institucional antigo. */
export function ehDestinoLegado(valor) {
  const v = normalizar(valor);
  if (!v) return false;
  return HOSTS_LEGADOS.includes(hostDe(v));
}

/**
 * Destino final do CTA de inscrição.
 * Qualquer link de inscrição (inclusive o legado do WordPress) passa a apontar
 * para o caminho canônico dentro da aplicação. Links de outros assuntos
 * (WhatsApp, vídeo, caravana) são preservados como estão.
 */
export function resolverDestinoInscricao(valor) {
  const v = normalizar(valor);
  if (!v) return CAMINHO_INSCRICAO;
  if (ehDestinoInscricao(v)) return CAMINHO_INSCRICAO;
  return v;
}

/** Validação para exibição no construtor da landing. */
export function validarDestinoInscricao(valor) {
  const v = normalizar(valor);
  if (!v) return { ok: true, motivo: null };
  // O host legado é checado antes: o link antigo TERMINA em /m31-inscricao,
  // então seria aceito como canônico se a ordem fosse invertida.
  if (ehDestinoLegado(v)) return { ok: false, motivo: 'site_antigo' };
  if (ehDestinoInscricao(v)) return { ok: true, motivo: null };
  return { ok: false, motivo: 'outro_destino' };
}