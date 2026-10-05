/**
 * NÚCLEO DE NORMALIZAÇÃO M31 — ONDA 2 (versão frontend)
 *
 * REGRA ÚNICA de telefone / CPF / e-mail. Filosofia assistiva:
 *   - corrigir automaticamente SÓ quando há certeza;
 *   - sugerir (alerta não bloqueante) quando há dúvida, preservando o valor informado;
 *   - bloquear apenas quando o dado torna o contato impossível.
 *
 * A MESMA lógica está inlinada nas funções backend de escrita
 * (funções Deno não aceitam import local). Ao alterar aqui, alterar lá.
 */

// ── Telefone ────────────────────────────────────────────────────────────────
// Desfechos: 'certo' | 'duvidoso' | 'irrecuperavel'
export function normalizarTelefone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);

  if (!d) return { valor: '', desfecho: 'irrecuperavel', motivo: 'telefone_vazio' };

  // 55 + DDD + 8/9 dígitos → formato brasileiro completo
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    return { valor: d, desfecho: 'certo', motivo: null };
  }
  // DDD + 8/9 dígitos (sem DDI) → correção certa: prefixar 55
  if (d.length === 10 || d.length === 11) {
    return { valor: `55${d}`, desfecho: 'certo', motivo: null };
  }
  // 8/9 dígitos → número sem DDD: não há como adivinhar o DDD
  if (d.length === 8 || d.length === 9) {
    return { valor: d, desfecho: 'duvidoso', motivo: 'sem_ddd' };
  }
  // Mais longo que o padrão brasileiro (internacional ou dígito sobrando)
  if (d.length > 13) {
    return { valor: d, desfecho: 'duvidoso', motivo: 'digitos_excedentes' };
  }
  return { valor: d, desfecho: 'irrecuperavel', motivo: 'telefone_curto' };
}

// Mensagem assistiva para exibir sob o campo (nunca bloqueia o botão)
export function alertaTelefone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  const { desfecho, motivo } = normalizarTelefone(d);
  if (desfecho === 'certo') return null;
  if (motivo === 'sem_ddd') return 'Confira seu WhatsApp: parece estar faltando o DDD. Ex.: (81) 99999-9999';
  if (motivo === 'digitos_excedentes') return 'Confira seu WhatsApp: parece ter dígitos a mais que o normal.';
  return 'Confira seu WhatsApp: o número parece incompleto.';
}

// ── CPF ─────────────────────────────────────────────────────────────────────
export function normalizarCPF(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return { valor: '', desfecho: 'certo', motivo: null };
  if (d.length === 11) return { valor: d, desfecho: 'certo', motivo: null };
  return { valor: d, desfecho: 'duvidoso', motivo: 'cpf_incompleto' };
}

// ── E-mail ──────────────────────────────────────────────────────────────────
export function normalizarEmail(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return { valor: '', desfecho: 'certo', motivo: null };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { valor: v, desfecho: 'certo', motivo: null };
  return { valor: v, desfecho: 'duvidoso', motivo: 'email_suspeito' };
}

// ── Máscara assistiva (81) 9 9999-9999 ─────────────────────────────────────
export function mascaraTelefone(raw) {
  const d = String(raw || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
}