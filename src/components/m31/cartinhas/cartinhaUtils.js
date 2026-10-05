import { resumoMacroCartinhas } from './cartinhaMetas.js';
// Utilitários compartilhados da tela de Cartinhas

// Converte qualquer nome para Title Case, preservando conectores comuns em minúsculo
const CONECTORES = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
export function titleCase(nome) {
  if (!nome) return '';
  return nome
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((p, idx) => {
      if (idx > 0 && CONECTORES.has(p)) return p;
      // trata hífen (ex: maria-clara)
      return p
        .split('-')
        .map(seg => seg.charAt(0).toUpperCase() + seg.slice(1))
        .join('-');
    })
    .join(' ');
}

// Formata telefone BR: 5581999998888 -> (81) 99999-8888
export function formatTelefone(raw) {
  if (!raw) return '';
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

// Deriva as badges relevantes de uma inscrição para ajudar a personalizar a cartinha
export function derivarBadges(i) {
  const badges = [];
  if (i.ja_participou_m31 === false) badges.push({ label: '✨ PRIMEIRO M31', tone: 'brand' });
  if (i.tipo === 'voluntario') badges.push({ label: 'Voluntária', tone: 'info' });
  if (i.area_voluntario === 'intercessao') badges.push({ label: 'Intercessão', tone: 'purple' });
  if (i.presenteado_por_id) badges.push({ label: 'Abençoada', tone: 'pink' });
  if (i.cartinha_status === 'revisar_cartinha') badges.push({ label: 'Revisar cartinha', tone: 'brand' });
  if (i.origem_inscricao === 'IMPORTACAO') badges.push({ label: 'Importada', tone: 'muted' });
  return badges;
}

export const BADGE_TONES = {
  brand:  { bg: 'rgba(168,52,74,0.10)',  fg: '#8B1A2B' },
  info:   { bg: 'rgba(59,130,246,0.10)',  fg: '#2563eb' },
  purple: { bg: 'rgba(139,92,246,0.10)',  fg: '#7c3aed' },
  pink:   { bg: 'rgba(236,72,153,0.10)',  fg: '#db2777' },
  muted:  { bg: '#f1f2f6',                fg: '#6b7280' },
};

// Ordena inscrições alfabeticamente pelo primeiro nome (pt-BR, ignora acentos/caixa).
// NÃO altera a numeração cadastrada (ordem_operacional) — só a posição visual.
export function ordenarAlfabetico(lista) {
  return [...lista].sort((a, b) => {
    const na = titleCase(a.nome || '');
    const nb = titleCase(b.nome || '');
    return na.localeCompare(nb, 'pt-BR', { sensitivity: 'base' });
  });
}

// Compatibilidade com componentes legados: mesma fonte da meta macro atual.
export function calcularMeta({ feitas, dataEvento, dia }) {
  const resumo = resumoMacroCartinhas({ concluidas: feitas, dataEvento, dia });
  return { faltam: resumo.restantes, progresso: resumo.progresso, diasRestantes: resumo.diasRestantes, necessarioDia: resumo.metaDiaria };
}
