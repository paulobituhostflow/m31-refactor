// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31SuporteObservador — Assistente inteligente de suporte de inscrições M31
 * MODO: OBSERVADOR COM VALIDAÇÃO HUMANA OBRIGATÓRIA
 *
 * Disparado por automação de entidade (create em M31Atendimento).
 *
 * tipo=cliente:
 *   1. Identifica a inscrição (telefone exato — nunca por nome parecido).
 *   2. Consulta regras aprovadas (M31RegraSuporte ativas e não vencidas).
 *   3. Gera UM rascunho via IA (nunca inventa; financeiro/QR só com evidência).
 *   4. ENFILEIRA o rascunho para Paulo (+55 81 99200-8889) via M31FilaMensagem.
 *   NUNCA responde diretamente à participante.
 *
 * tipo=feedback_admin (mensagens de Paulo):
 *   Comandos: APROVAR <cod> | EDITAR <cod>: <texto> | REJEITAR <cod> |
 *   PEDIR MAIS DADOS <cod> | SALVAR COMO REGRA [<cod>]: <regra> |
 *   SALVAR COMO EXEMPLO <cod> | ENCERRAR <cod>
 *   Só APROVAR/EDITAR enfileiram resposta à participante — sempre via fila governada.
 *   Mensagens sem comando reconhecido são ignoradas silenciosamente.
 */

const ADMIN_PAULO = '5581992008889';

function normalizePhone(phone) {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

function maskCpf(cpf) {
  const d = (cpf || '').replace(/\D/g, '');
  return d.length === 11 ? `***.${d.slice(3, 6)}.***-${d.slice(9)}` : null;
}

async function enfileirar(S, telefone, texto, dedupKey, extras = {}) {
  await S.M31FilaMensagem.create({
    dedup_key: dedupKey,
    participante_id: telefone,
    telefone,
    automacao: 'SUPORTE',
    template: 'suporte_observador',
    versao: 'V1',
    origem: 'm31SuporteObservador',
    inscricao_id: extras.inscricao_id || null,
    inscricao_nome: extras.inscricao_nome || null,
    mensagens: [{ message: texto }],
    status: 'pendente',
    prioridade: 1,
    execution_id: crypto.randomUUID(),
  });
}

// ═══════════════ FLUXO CLIENTE: gerar rascunho e enviar a Paulo ═══════════════
async function processarCliente(base44, S, at) {
  const tel = normalizePhone(at.telefone);

  // Identificação segura: telefone exato (variações de armazenamento com/sem DDI)
  const variantes = [...new Set([tel, tel.replace(/^55/, ''), at.telefone])];
  let inscricao = null;
  for (const v of variantes) {
    if (!v) continue;
    const r = await S.EventoM31Inscricao.filter({ whatsapp: v }, '-updated_date', 3);
    if (r.length > 0) { inscricao = r[0]; break; }
  }

  // Regras aprovadas (base de conhecimento supervisionada)
  const agoraIso = new Date().toISOString();
  const todasRegras = await S.M31RegraSuporte.filter({ ativo: true }, '-created_date', 30);
  const regras = todasRegras.filter((r) => !r.validade || r.validade >= agoraIso);

  const contexto = inscricao ? {
    nome: inscricao.nome,
    cpf_mascarado: maskCpf(inscricao.cpf),
    tipo_inscricao: inscricao.tipo,
    status_pagamento: inscricao.status_pagamento,
    tem_codigo_inscricao: !!inscricao.codigo_inscricao,
    boas_vindas_enviadas: !!inscricao.data_envio_boas_vindas,
    qr_envio_status: inscricao.qr_envio_status || 'sem_registro',
    entrou_no_grupo: !!inscricao.entrou_no_grupo,
    caravana: inscricao.caravana_nome || null,
    cadastro_pendente: !!inscricao.cadastro_pendente,
    cidade: inscricao.cidade || null,
  } : null;

  const prompt = `Você é o assistente interno do suporte de inscrições do evento M31 Filhas (modo observador — seu texto será revisado por um humano antes de qualquer envio).

MENSAGEM RECEBIDA DA PARTICIPANTE (WhatsApp ${tel}):
"${at.mensagem_original}"

DADOS CONFIRMADOS NO SISTEMA (única fonte de verdade — se null, a inscrição NÃO foi localizada):
${JSON.stringify(contexto)}

REGRAS OFICIAIS APROVADAS PELO ADMINISTRADOR:
${regras.length > 0 ? regras.map((r) => `- [${r.categoria}] ${r.conteudo}`).join('\n') : '(nenhuma regra cadastrada ainda)'}

INSTRUÇÕES OBRIGATÓRIAS:
- Redija UMA resposta breve, cordial, humana e profissional em português. Sem linguagem robótica, sem excesso de emojis.
- Use APENAS os dados confirmados acima. NUNCA invente informação, prazo, valor ou link.
- NUNCA mencione termos técnicos internos (sistema, funções, logs, Base44, UAZAPI, automações, filas, IDs).
- FINANCEIRO: nunca afirme que um pagamento está confirmado sem status_pagamento aprovado/gratuito no sistema. Comprovante enviado pelo cliente NÃO é confirmação. Sem confirmação, use variação de: "Recebemos sua mensagem. Seu pagamento ainda precisa ser verificado pela equipe responsável. Assim que a análise for concluída, retornaremos por este canal."
- QR CODE: nunca afirme que o QR foi enviado sem qr_envio_status enviado_com_sucesso. Se pagamento confirmado mas QR sem registro de envio, use variação de: "Localizamos sua inscrição e vamos verificar o envio do seu QR Code. Assim que a equipe concluir a análise, retornaremos por este canal."
- Se a inscrição não foi localizada, peça com cordialidade o CPF ou e-mail usado no cadastro.
- nivel_confianca: "alto" só se a inscrição foi localizada por dado exato E a resposta usa apenas dados confirmados; "medio" se há correspondência possível sem confirmação total; "baixo" se não identificada ou depende de regra inexistente.
- Com confiança "medio" ou "baixo", o campo alerta NUNCA pode ser "Nenhum".`;

  const ia = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: {
      type: 'object',
      properties: {
        rascunho: { type: 'string', description: 'Resposta exata proposta para o cliente' },
        motivacao: { type: 'string', description: 'Razão da resposta e informações utilizadas' },
        alerta: { type: 'string', description: 'Risco/divergência/informação ausente, ou "Nenhum"' },
        intencao: { type: 'string', description: 'Intenção principal identificada' },
        nivel_confianca: { type: 'string', enum: ['alto', 'medio', 'baixo'] },
        dados_confirmados: { type: 'array', items: { type: 'string' } },
        dados_ausentes: { type: 'array', items: { type: 'string' } },
        acao_sugerida: { type: 'string', description: 'Ação humana necessária, se houver' },
      },
      required: ['rascunho', 'motivacao', 'alerta', 'nivel_confianca'],
    },
  });

  // Trava de coerência: confiança média/baixa nunca sai com alerta "Nenhum"
  let alerta = ia.alerta || 'Nenhum';
  if (ia.nivel_confianca !== 'alto' && /^nenhum\.?$/i.test(alerta.trim())) {
    alerta = inscricao ? 'Correspondência sem confirmação total — revisar antes de aprovar.' : 'Inscrição não identificada no sistema.';
  }

  const codigo = 'A' + at.id.slice(-4).toUpperCase();
  await S.M31Atendimento.update(at.id, {
    codigo,
    intencao: ia.intencao || null,
    inscricao_id: inscricao?.id || null,
    inscricao_nome: inscricao?.nome || null,
    cliente_identificado: !!inscricao,
    nivel_confianca: ia.nivel_confianca,
    dados_confirmados: ia.dados_confirmados || [],
    dados_ausentes: ia.dados_ausentes || [],
    acao_sugerida: ia.acao_sugerida || '',
    rascunho_ia: ia.rascunho,
    motivacao: ia.motivacao,
    alerta,
    status_aprovacao: 'aguardando_aprovacao',
  });

  const identLinha = inscricao
    ? `Identificada: ${inscricao.nome}${contexto.cpf_mascarado ? ` (CPF ${contexto.cpf_mascarado})` : ''} — pagamento: ${inscricao.status_pagamento}`
    : 'NÃO identificada no sistema';

  const msgPaulo = [
    `🤖 *Suporte M31 — Rascunho ${codigo}*`,
    '',
    `*De:* ${at.remetente_nome || 'Sem nome'} (${tel})`,
    `*${identLinha}*`,
    '',
    `*Mensagem recebida:*`,
    `"${at.mensagem_original}"`,
    '',
    `*Resposta proposta:*`,
    ia.rascunho,
    '',
    `*Motivação:* ${ia.motivacao}`,
    `*Alerta:* ${alerta}`,
    `*Confiança:* ${ia.nivel_confianca}`,
    '',
    `Responda com:`,
    `APROVAR ${codigo}`,
    `EDITAR ${codigo}: <novo texto>`,
    `REJEITAR ${codigo}`,
    `PEDIR MAIS DADOS ${codigo}`,
    `SALVAR COMO REGRA ${codigo}: <regra>`,
    `ENCERRAR ${codigo}`,
  ].join('\n');

  await enfileirar(S, ADMIN_PAULO, msgPaulo, `SUPORTE:RASCUNHO:${at.id}`, {
    inscricao_id: inscricao?.id, inscricao_nome: inscricao?.nome,
  });

  return { rascunho_gerado: true, codigo, cliente_identificado: !!inscricao, nivel_confianca: ia.nivel_confianca };
}

// ═══════════════ FLUXO FEEDBACK: comandos de Paulo ═══════════════
async function processarFeedback(S, at) {
  const texto = (at.mensagem_original || '').trim();
  const upper = texto.toUpperCase();
  const agoraIso = new Date().toISOString();

  const comando =
    upper.startsWith('APROVAR') ? 'APROVAR' :
    upper.startsWith('EDITAR') ? 'EDITAR' :
    upper.startsWith('REJEITAR') ? 'REJEITAR' :
    upper.startsWith('PEDIR') ? 'PEDIR_DADOS' :
    upper.startsWith('SALVAR COMO REGRA') || upper.startsWith('REGRA') ? 'REGRA' :
    upper.startsWith('SALVAR COMO EXEMPLO') || upper.startsWith('EXEMPLO') ? 'EXEMPLO' :
    upper.startsWith('ENCERRAR') ? 'ENCERRAR' : null;

  // Sem comando reconhecido: ignorar silenciosamente (Paulo pode conversar normalmente)
  if (!comando) return { ignored: 'sem_comando' };

  // Localizar atendimento alvo: por código explícito, senão o mais recente aguardando
  const m = upper.match(/\bA([A-Z0-9]{4})\b/);
  let alvo = null;
  if (m) {
    const found = await S.M31Atendimento.filter({ codigo: 'A' + m[1] }, '-created_date', 1);
    alvo = found[0] || null;
  }
  if (!alvo) {
    const pend = await S.M31Atendimento.filter(
      { tipo: 'cliente', status_aprovacao: 'aguardando_aprovacao' }, '-created_date', 1);
    alvo = pend[0] || null;
  }
  if (!alvo) {
    await enfileirar(S, ADMIN_PAULO,
      `⚠️ Suporte M31: nenhum atendimento pendente encontrado para o comando "${texto.substring(0, 60)}".`,
      `SUPORTE:AVISO:${at.id}`);
    return { erro: 'atendimento_alvo_nao_encontrado' };
  }

  await S.M31Atendimento.update(at.id, { feedback_atendimento_id: alvo.id });
  const conf = (msg) => enfileirar(S, ADMIN_PAULO, msg, `SUPORTE:CONF:${at.id}`);
  const depoisDoisPontos = () => {
    const idx = texto.indexOf(':');
    return idx > -1 ? texto.slice(idx + 1).trim() : '';
  };

  if (comando === 'APROVAR') {
    if (!alvo.rascunho_ia) { await conf(`⚠️ ${alvo.codigo}: sem rascunho para aprovar.`); return { erro: 'sem_rascunho' }; }
    await S.M31Atendimento.update(alvo.id, {
      status_aprovacao: 'aprovado', texto_final: alvo.rascunho_ia,
      aprovado_por: 'Paulo', aprovado_em: agoraIso, enviado_ao_cliente_em: agoraIso,
    });
    await enfileirar(S, alvo.telefone, alvo.rascunho_ia, `SUPORTE:RESPOSTA:${alvo.id}`, {
      inscricao_id: alvo.inscricao_id, inscricao_nome: alvo.inscricao_nome,
    });
    await conf(`✅ ${alvo.codigo}: resposta aprovada e enfileirada para a participante.`);
    return { acao: 'aprovado', atendimento: alvo.codigo };
  }

  if (comando === 'EDITAR') {
    const novo = depoisDoisPontos();
    if (!novo) { await conf(`⚠️ ${alvo.codigo}: use EDITAR ${alvo.codigo}: <novo texto>.`); return { erro: 'edicao_vazia' }; }
    const historico = [...(alvo.historico_rascunhos || []),
      { texto: alvo.rascunho_ia || '', em: agoraIso, motivo: 'substituido_por_edicao_do_admin' }];
    await S.M31Atendimento.update(alvo.id, {
      status_aprovacao: 'editado_aprovado', texto_final: novo, historico_rascunhos: historico,
      aprovado_por: 'Paulo', aprovado_em: agoraIso, enviado_ao_cliente_em: agoraIso,
    });
    await enfileirar(S, alvo.telefone, novo, `SUPORTE:RESPOSTA:${alvo.id}`, {
      inscricao_id: alvo.inscricao_id, inscricao_nome: alvo.inscricao_nome,
    });
    await conf(`✅ ${alvo.codigo}: texto editado aprovado e enfileirado. A edição NÃO virou regra geral.`);
    return { acao: 'editado_aprovado', atendimento: alvo.codigo };
  }

  if (comando === 'REJEITAR') {
    await S.M31Atendimento.update(alvo.id, { status_aprovacao: 'rejeitado', aprovado_por: 'Paulo', aprovado_em: agoraIso });
    await conf(`🚫 ${alvo.codigo}: rascunho rejeitado. Nada foi enviado.`);
    return { acao: 'rejeitado', atendimento: alvo.codigo };
  }

  if (comando === 'PEDIR_DADOS') {
    await S.M31Atendimento.update(alvo.id, { status_aprovacao: 'aguardando_dados', aprovado_por: 'Paulo', aprovado_em: agoraIso });
    await conf(`📋 ${alvo.codigo}: marcado como aguardando mais dados. Nada foi enviado.`);
    return { acao: 'aguardando_dados', atendimento: alvo.codigo };
  }

  if (comando === 'REGRA' || comando === 'EXEMPLO') {
    const conteudo = depoisDoisPontos() || alvo.texto_final || alvo.rascunho_ia || '';
    if (!conteudo) { await conf(`⚠️ ${alvo.codigo}: sem conteúdo para salvar como regra.`); return { erro: 'regra_vazia' }; }
    await S.M31RegraSuporte.create({
      conteudo,
      categoria: comando === 'EXEMPLO' ? 'exemplo_linguagem' : 'regra_geral',
      aprovado_por: 'Paulo', aprovado_em: agoraIso,
      atendimento_origem: alvo.id, versao: 1, ativo: true,
    });
    await conf(`📚 ${alvo.codigo}: salvo como ${comando === 'EXEMPLO' ? 'exemplo de linguagem' : 'regra geral'}.`);
    return { acao: 'regra_salva', atendimento: alvo.codigo };
  }

  if (comando === 'ENCERRAR') {
    await S.M31Atendimento.update(alvo.id, { status_aprovacao: 'encerrado_sem_resposta', aprovado_por: 'Paulo', aprovado_em: agoraIso });
    await conf(`🔕 ${alvo.codigo}: encerrado sem resposta.`);
    return { acao: 'encerrado', atendimento: alvo.codigo };
  }

  return { ignored: 'comando_nao_tratado' };
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch { /* automação de entidade — prosseguir */ }

    const S = base44.asServiceRole.entities;
    const payload = await req.json().catch(() => ({}));

    const entityId = payload?.event?.entity_id || payload?.atendimento_id;
    let at = payload?.data?.id ? payload.data : null;
    if (!at && entityId) {
      const found = await S.M31Atendimento.filter({ id: entityId });
      at = found[0] || null;
    }
    if (!at) return Response.json({ error: 'atendimento_nao_encontrado' }, { status: 400 });
    if (at.status_processamento && at.status_processamento !== 'novo') {
      return Response.json({ skipped: 'ja_processado' });
    }

    try {
      const resultado = at.tipo === 'feedback_admin'
        ? await processarFeedback(S, at)
        : await processarCliente(base44, S, at);
      await S.M31Atendimento.update(at.id, { status_processamento: 'processado' });
      return Response.json({ success: true, ...resultado });
    } catch (e) {
      await S.M31Atendimento.update(at.id, { status_processamento: 'erro', erro: e.message }).catch(() => {});
      throw e;
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
