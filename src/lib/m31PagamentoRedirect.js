// Portão ÚNICO de saída do checkout M31.
// Um link de pagamento só é aceito quando é HTTPS e aponta para o Asaas
// (asaas.com ou subdomínio dele). Sem link válido o fluxo NÃO pode ser
// marcado como sucesso nem navegar — o formulário mostra erro claro.

const HOST_PAGAMENTO = 'asaas.com';

export const ERRO_LINK_PAGAMENTO =
  'Não conseguimos abrir a página de pagamento agora. Seus dados foram salvos — tente novamente em instantes ou fale com o suporte pelo WhatsApp.';

export function urlPagamentoValida(url) {
  if (typeof url !== 'string') return false;
  const valor = url.trim();
  if (!valor) return false;

  let alvo;
  try {
    alvo = new URL(valor);
  } catch (_) {
    return false;
  }

  if (alvo.protocol !== 'https:') return false;
  const host = alvo.hostname.toLowerCase();
  return host === HOST_PAGAMENTO || host.endsWith(`.${HOST_PAGAMENTO}`);
}

// Decide a partir da resposta do backend de checkout ({ data: { payment_url } }).
export function resolverDestinoPagamento(resposta) {
  const url = resposta?.data?.payment_url;
  if (urlPagamentoValida(url)) {
    return { url: url.trim(), erro: null };
  }
  return { url: null, erro: ERRO_LINK_PAGAMENTO };
}

// Navegação na MESMA aba — sem nova janela e sem tela intermediária.
export function navegarParaPagamento(url) {
  window.location.assign(url);
}