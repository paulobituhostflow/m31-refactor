// Identificador operacional interno (#001, #002...) — uso EXCLUSIVO em telas internas.
// NUNCA usar em QR Code, Asaas, webhooks, WhatsApp, e-mails ou mensagens a participantes.

export const fmtOrdem = (n) =>
  n != null ? `#${String(n).padStart(3, '0')}` : null;

// Busca aceita "#148", "148", "#032", "32"
export const matchOrdem = (busca, n) => {
  const d = (busca || '').trim().replace(/^#/, '');
  if (!/^\d+$/.test(d) || n == null) return false;
  return Number(d) === Number(n);
};