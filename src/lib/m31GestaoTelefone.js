// Mesma regra da função phone em m31OperarParticipante/core.js.
// Corrige formato, DDI e celulares antigos; nunca deduz DDD ou completa fixos.
export function normalizarGestaoTelefone(value) {
  let p = String(value ?? '').replace(/\D/g, '');
  if (/^0055\d{10,11}$/.test(p)) p = p.slice(2);
  if (p.startsWith('55') && [12, 13].includes(p.length)) p = p.slice(2);
  if (/^0\d{10,11}$/.test(p)) p = p.slice(1);
  const dddValido = /^(?:1[1-9]|2[12478]|3[1-578]|4[1-9]|5[1345]|6[1-9]|7[134579]|8[1-9]|9[1-9])$/.test(p.slice(0, 2));
  if (!dddValido) return '';
  if (/^\d{2}[6-9]\d{7}$/.test(p)) p = `${p.slice(0, 2)}9${p.slice(2)}`;
  return /^\d{2}9\d{8}$/.test(p) && !/^(\d)\1+$/.test(p) ? `55${p}` : '';
}

export function formatarGestaoTelefone(value) {
  const normalized = normalizarGestaoTelefone(value);
  if (!normalized) return String(value ?? '');
  const local = normalized.slice(2);
  return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
}
