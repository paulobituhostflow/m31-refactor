/**
 * CONSOLIDAÇÃO DE VOLUNTÁRIAS — pagamento + camisa
 *
 * Só LÊ e cruza dados que já existem:
 *   - EventoM31Inscricao (tipo: 'voluntario')  → verdade sobre pagamento
 *   - EventoM31Voluntario                      → verdade sobre camisa/setor
 *
 * Regras invioláveis:
 *   - nunca cria cadastro nem presume pagamento;
 *   - a pessoa é UMA (inscrição + cadastro vinculados), nunca contada duas vezes;
 *   - toda divergência é sinalizada, jamais "resolvida" por adivinhação.
 */
import { isConfirmada, isConfirmadaSemEvidencia } from '@/lib/m31VoluntarioUtils';

export const TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];

const tel = (v) => (v || '').replace(/\D/g, '').replace(/^55/, '');

/** Status de pagamento derivado — sem inferência. */
export function statusPagamento(insc) {
  const sp = insc.status_pagamento;
  if (sp === 'gratuito') return 'isento';
  if (sp === 'aprovado') return 'pago';
  if (sp === 'cancelado') return 'cancelado';
  return 'pendente';
}

export const PAGAMENTO_CFG = {
  pago:      { label: 'Pago' },
  isento:    { label: 'Isento' },
  pendente:  { label: 'Pendente' },
  cancelado: { label: 'Cancelado' },
};

/**
 * Cruza inscrições e cadastros em uma lista de PESSOAS.
 * Retorna { pessoas, orfaos, stats, tamanhos }.
 */
export function consolidarVoluntarias(inscricoes = [], cadastros = []) {
  const porId = new Map();
  const porTel = new Map();
  cadastros.forEach((c) => {
    if (c.inscricao_id) porId.set(c.inscricao_id, [...(porId.get(c.inscricao_id) || []), c]);
    const k = tel(c.whatsapp);
    if (k) porTel.set(k, [...(porTel.get(k) || []), c]);
  });

  const usados = new Set();
  const pessoas = inscricoes.map((insc) => {
    // vínculo por id (forte) e por telefone (complementar) — sem duplicar cadastros
    const vinculados = [];
    const push = (arr) => (arr || []).forEach((c) => {
      if (!vinculados.some((x) => x.id === c.id)) vinculados.push(c);
    });
    push(porId.get(insc.id));
    push(porTel.get(tel(insc.whatsapp)));
    vinculados.forEach((c) => usados.add(c.id));

    const comTamanho = vinculados.filter((c) => c.tamanho_camiseta);
    const tamanhosDistintos = Array.from(new Set(comTamanho.map((c) => c.tamanho_camiseta)));
    const pagamento = statusPagamento(insc);
    const cadastro = comTamanho[0] || vinculados[0] || null;

    const divergencias = [];
    if (vinculados.length === 0) divergencias.push('sem_cadastro_voluntaria');
    if (vinculados.length > 1) divergencias.push('cadastro_duplicado');
    if (tamanhosDistintos.length > 1) divergencias.push('camisa_conflitante');
    if (isConfirmadaSemEvidencia(insc)) divergencias.push('pago_sem_evidencia');

    return {
      id: insc.id,
      nome: insc.nome,
      whatsapp: insc.whatsapp,
      codigo: insc.codigo_inscricao || null,
      area: insc.area_voluntario || null,
      setor: cadastro?.setor || null,
      funcao: cadastro?.funcao || null,
      pagamento,
      confirmada: isConfirmada(insc),
      valor_pago: insc.valor_pago || 0,
      tamanho: tamanhosDistintos.length === 1 ? tamanhosDistintos[0] : null,
      tamanhos_conflitantes: tamanhosDistintos.length > 1 ? tamanhosDistintos : [],
      cadastros_vinculados: vinculados.length,
      revisao_dados: !!insc.revisao_dados,
      divergencias,
    };
  });

  // Cadastros que não se ligam a nenhuma inscrição de voluntária:
  // NÃO contam como inscritas — ficam explícitos para revisão humana.
  const orfaos = cadastros
    .filter((c) => !usados.has(c.id))
    .map((c) => ({
      id: c.id, nome: c.nome, whatsapp: c.whatsapp,
      setor: c.setor || null, status: c.status || null,
      tamanho: c.tamanho_camiseta || null,
    }));

  const ativas = pessoas.filter((p) => p.pagamento !== 'cancelado');

  const tamanhos = {};
  TAMANHOS.forEach((t) => { tamanhos[t] = { confirmadas: 0, pendentes: 0 }; });
  ativas.forEach((p) => {
    if (!p.tamanho || !tamanhos[p.tamanho]) return;
    if (p.pagamento === 'pago' || p.pagamento === 'isento') tamanhos[p.tamanho].confirmadas++;
    else tamanhos[p.tamanho].pendentes++;
  });

  const stats = {
    total: ativas.length,
    pagas: ativas.filter((p) => p.pagamento === 'pago').length,
    isentas: ativas.filter((p) => p.pagamento === 'isento').length,
    pendentes: ativas.filter((p) => p.pagamento === 'pendente').length,
    canceladas: pessoas.length - ativas.length,
    camisa_informada: ativas.filter((p) => p.tamanho).length,
    camisa_faltando: ativas.filter((p) => !p.tamanho).length,
    com_divergencia: ativas.filter((p) => p.divergencias.length > 0).length,
    cadastros_orfaos: orfaos.length,
  };

  return { pessoas: ativas, canceladas: pessoas.filter((p) => p.pagamento === 'cancelado'), orfaos, stats, tamanhos };
}

export const DIVERGENCIA_LABEL = {
  sem_cadastro_voluntaria: 'Sem cadastro de voluntária vinculado',
  cadastro_duplicado: 'Mais de um cadastro para a mesma pessoa',
  camisa_conflitante: 'Tamanhos de camisa diferentes entre cadastros',
  pago_sem_evidencia: 'Aprovada sem evidência financeira',
};