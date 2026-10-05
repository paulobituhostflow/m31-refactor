/**
 * Utilitários da Central de Mensagens M31.
 * Catálogo de variáveis, categorias e helpers de validação/preview.
 * O catálogo aqui espelha VARIAVEIS_APROVADAS da função m31RenderizarTemplate.
 */

// Catálogo oficial de variáveis aprovadas (rótulo + exemplo para preview)
export const VARIAVEIS_CATALOGO = [
  { tag: 'nome', label: 'Nome da participante', exemplo: 'Maria Clara' },
  { tag: 'evento_nome', label: 'Nome do evento', exemplo: 'M31 Filhas 2026' },
  { tag: 'data_evento', label: 'Data do evento', exemplo: '15 de agosto' },
  { tag: 'horario_evento', label: 'Horário do evento', exemplo: '14h' },
  { tag: 'local_evento', label: 'Local do evento', exemplo: 'Centro de Convenções' },
  { tag: 'codigo_inscricao', label: 'Código da inscrição', exemplo: 'M31-CAR-ABC123' },
  { tag: 'status_pagamento', label: 'Status do pagamento', exemplo: 'aprovado' },
  { tag: 'link_pagamento', label: 'Link de pagamento', exemplo: 'https://pay.exemplo/abc' },
  { tag: 'link_ingresso', label: 'Link do ingresso', exemplo: 'https://ingresso.exemplo/abc' },
  { tag: 'cidade', label: 'Cidade', exemplo: 'Recife' },
  { tag: 'caravana_nome', label: 'Nome da caravana', exemplo: 'Caravana Tia Carla' },
  { tag: 'link_grupo', label: 'Link do grupo WhatsApp', exemplo: 'https://chat.whatsapp.com/exemplo' },
  { tag: 'pagador_nome', label: 'Nome de quem pagou', exemplo: 'João Silva' },
];

export const VARIAVEIS_APROVADAS = VARIAVEIS_CATALOGO.map((v) => v.tag);

// Categorias exibidas (correspondem ao enum da entidade)
export const CATEGORIAS = [
  { id: 'inscricao', label: 'Inscrição' },
  { id: 'pagamento', label: 'Pagamento' },
  { id: 'boas_vindas', label: 'Boas-vindas' },
  { id: 'confirmacao', label: 'Confirmação' },
  { id: 'lembrete', label: 'Lembrete' },
  { id: 'ingresso', label: 'Ingresso' },
  { id: 'checkin', label: 'Check-in' },
  { id: 'cancelamento', label: 'Cancelamento' },
  { id: 'atendimento', label: 'Atendimento' },
  { id: 'recuperacao', label: 'Recuperação' },
  { id: 'grupo', label: 'Grupo' },
];

export function labelCategoria(id) {
  return CATEGORIAS.find((c) => c.id === id)?.label || id || 'Sem categoria';
}

// Extrai tags usadas no texto, nos dois formatos {{tag}} e {tag}
export function extrairTags(texto) {
  if (!texto) return [];
  const tags = new Set();
  const duplas = texto.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g);
  for (const m of duplas) tags.add(m[1]);
  const semDuplas = texto.replace(/\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}/g, '');
  const simples = semDuplas.matchAll(/\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}/g);
  for (const m of simples) tags.add(m[1]);
  return Array.from(tags);
}

// Valida o conteúdo: retorna { valido, invalidas } — invalidas = tags fora do catálogo
export function validarConteudo(texto, variaveisPermitidas = null) {
  const usadas = extrairTags(texto);
  const invalidas = usadas.filter((t) => {
    if (!VARIAVEIS_APROVADAS.includes(t)) return true;
    if (Array.isArray(variaveisPermitidas) && variaveisPermitidas.length > 0 && !variaveisPermitidas.includes(t)) return true;
    return false;
  });
  return { valido: invalidas.length === 0, invalidas, usadas };
}

// Renderiza preview com dados de exemplo (nunca dados reais)
export function renderPreview(texto) {
  if (!texto) return '';
  let out = texto;
  for (const v of VARIAVEIS_CATALOGO) {
    const reDupla = new RegExp(`\\{\\{\\s*${v.tag}\\s*\\}\\}`, 'g');
    const reSimples = new RegExp(`\\{\\s*${v.tag}\\s*\\}`, 'g');
    out = out.replace(reDupla, v.exemplo).replace(reSimples, v.exemplo);
  }
  return out;
}