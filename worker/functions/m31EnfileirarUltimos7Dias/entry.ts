// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31EnfileirarUltimos7Dias — ENFILEIRADOR MANUAL (Etapa C da conversão)
 *
 * Enfileira na fila global (M31FilaMensagem) SOMENTE os últimos 7 dias:
 *   - RECUPERACAO_CHECKOUT: fila_recuperacao aguardando_aprovacao, criadas há <= 7d,
 *     que NÃO pagaram (status local + verificação no Asaas por CPF).
 *   - BOAS_VINDAS: aprovadas/gratuitas sem data_envio_boas_vindas,
 *     confirmadas/criadas há <= 7d.
 *
 * NÃO ENVIA NADA. NÃO DRENA. Só cria itens 'pendente' e retorna contagem.
 * Idempotência: pula quem já tem M31AutomacaoLog enviado para a mesma chave,
 * item ativo na fila com a mesma dedup_key, ou telefone em falha_terminal.
 *
 * Admin-only, execução manual.
 */

const DIAS = 7;
const STATUS_ATIVOS_FILA = ['pendente', 'processando', 'enviado', 'incerto', 'falha_terminal'];
const ASAAS_PAGO = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'];

function normalizePhone(phone) {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

function telefoneValido(w) {
  return (w || '').replace(/\D/g, '').length >= 10;
}

function ehTeste(i) {
  const nome = (i.nome || '').toLowerCase();
  return nome.includes('teste') || nome.startsWith('[teste') || (i.codigo_inscricao || '').toLowerCase().includes('teste');
}

async function pagouNoAsaas(cpf) {
  const cpfLimpo = (cpf || '').replace(/\D/g, '');
  if (cpfLimpo.length !== 11) return false;
  const KEY = config('ASAAS_API_KEY');
  if (!KEY) return false;
  try {
    const custRes = await fetch(`__ASAAS_API__/customers?cpfCnpj=${cpfLimpo}`, {
      headers: { 'access_token': KEY },
    });
    const custData = await custRes.json();
    if (!custData?.data?.length) return false;
    for (const cust of custData.data.slice(0, 3)) {
      const payRes = await fetch(`__ASAAS_API__/payments?customer=${cust.id}&limit=20`, {
        headers: { 'access_token': KEY },
      });
      const payData = await payRes.json();
      if ((payData?.data || []).some((p) => ASAAS_PAGO.includes(p.status))) return true;
    }
    return false;
  } catch (e) {
    logger.error('[Enfileirar7d] Erro Asaas:', e.message);
    return false; // em dúvida, mantém na fila — a revalidação do drenador ainda protege
  }
}

function msgRecuperacao(inscricao, tentativas) {
  const nome = (inscricao.nome || 'Visitante').split(' ')[0];
  const link = inscricao.asaas_charge_url || '__APP_ORIGIN__/m31-inscricao';
  if (tentativas === 0) {
    return `Oii *${nome}* 😊\n\nAqui é Ester, do M31 Filhas.\n\nVi que você chegou a preencher o formulário mas sua inscrição ainda não foi finalizada 💛\n\nPrecisando de ajuda, pode falar comigo por aqui.\n\n👉 *Pagar inscrição:* ${link}`;
  }
  return `*${nome}*, ainda dá tempo! 🌸\n\nSua inscrição está esperando. Pague agora:\n👉 ${link}\n\nPode me chamar se tiver dúvida 💛`;
}

function msgBoasVindas(inscricao, linkGrupo) {
  const nome = inscricao.nome?.split(' ')[0] || 'Querida';
  const codigo = inscricao.codigo_inscricao || '';
  const blocoConferencia = `\n\n📋 *Confira seus dados:*\nNome: ${inscricao.nome}${inscricao.cidade ? `\nCidade: ${inscricao.cidade}` : ''}\nSe algum dado estiver incorreto, responda esta mensagem informando a correção.`;
  return `Olá, ${nome}!\nSua inscrição para o M31 Filhas foi confirmada. 🌸\n\n🎟 Código da inscrição:\n\`${codigo}\`\n\n📲 Seu QR Code está nesta imagem.\nApresente-o no credenciamento do evento.\n\n👥 Grupo oficial:\n${linkGrupo}${blocoConferencia}\n\nNos vemos no M31!`;
}

function msgSaudacao(inscricao) {
  const nome = inscricao.nome?.split(' ')[0] || 'Querida';
  return `Olá, ${nome}! 😊\nAqui é do M31 Filhas. Sua inscrição foi confirmada 💛\n\nPosso te enviar o seu QR Code de acesso por aqui?`;
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });
    }

    const S = base44.asServiceRole.entities;
    const corte = new Date(Date.now() - DIAS * 24 * 3600000).toISOString();

    // Dedup helper: pode enfileirar esta chave/telefone?
    async function podeEnfileirar(dedupKey, telNorm) {
      const jaEnviado = await S.M31AutomacaoLog.filter(
        { idempotency_key: dedupKey, status: 'enviado' }, '-enviado_em', 1);
      if (jaEnviado.length > 0) return { ok: false, motivo: 'ja_enviado_governanca' };
      const naFila = await S.M31FilaMensagem.filter({ dedup_key: dedupKey }, '-created_date', 5);
      if (naFila.some((f) => STATUS_ATIVOS_FILA.includes(f.status))) {
        return { ok: false, motivo: 'ja_na_fila' };
      }
      const terminais = await S.M31FilaMensagem.filter(
        { telefone: telNorm, status: 'falha_terminal' }, '-created_date', 1);
      if (terminais.length > 0) return { ok: false, motivo: 'telefone_falha_terminal' };
      return { ok: true };
    }

    const contagem = {
      BOAS_VINDAS: { candidatas_7d: 0, enfileiradas: 0, puladas: {} },
      RECUPERACAO_CHECKOUT: { candidatas_7d: 0, enfileiradas: 0, puladas: {} },
    };
    const pular = (bloco, motivo) => {
      bloco.puladas[motivo] = (bloco.puladas[motivo] || 0) + 1;
    };

    // ═══ BOAS_VINDAS — aprovadas sem envio, últimos 7 dias ═══
    const grupos = await S.M31GrupoConfig.filter({ finalidade: 'INSCRITAS_OFICIAL', ativo: true });
    const linkGrupo = grupos[0]?.invite_link || null;

    const [aprov, grat] = await Promise.all([
      S.EventoM31Inscricao.filter({ status_pagamento: 'aprovado' }, '-created_date', 500),
      S.EventoM31Inscricao.filter({ status_pagamento: 'gratuito' }, '-created_date', 500),
    ]);
    const bvCandidatas = [...aprov, ...grat].filter((i) => {
      if (i.data_envio_boas_vindas) return false;
      if (!telefoneValido(i.whatsapp)) return false;
      if (i.cadastro_pendente === true) return false;
      if (i.opt_out === true) return false;
      if (i.webhook_processando === true) return false;
      if (ehTeste(i)) return false;
      const ref = i.pagamento_confirmado_em || i.created_date;
      return ref && ref >= corte;
    });
    contagem.BOAS_VINDAS.candidatas_7d = bvCandidatas.length;

    for (const i of bvCandidatas) {
      if (!linkGrupo) { pular(contagem.BOAS_VINDAS, 'grupo_nao_configurado'); continue; }
      const cpfNorm = (i.cpf || '').replace(/\D/g, '');
      const telNorm = normalizePhone(i.whatsapp);
      // ESTÁGIO 1: saudação APENAS TEXTO (PESSOA:CONFIRMACAO_TEXTO:V1).
      // QR + grupo (CONFIRMACAO_COM_QR) só após a participante responder (janela aberta).
      const pessoa = cpfNorm || telNorm;
      const dedupKey = `${pessoa}:CONFIRMACAO_TEXTO:V1`;
      const gate = await podeEnfileirar(dedupKey, telNorm);
      if (!gate.ok) { pular(contagem.BOAS_VINDAS, gate.motivo); continue; }
      // Legado: quem já recebeu/está na fila pelos fluxos anteriores não entra de novo
      const gateLegado = await podeEnfileirar(`${pessoa}:BOAS_VINDAS:V1`, telNorm);
      if (!gateLegado.ok) { pular(contagem.BOAS_VINDAS, `legado_${gateLegado.motivo}`); continue; }
      const gateQr = await podeEnfileirar(`${pessoa}:CONFIRMACAO_COM_QR:V1`, telNorm);
      if (!gateQr.ok) { pular(contagem.BOAS_VINDAS, `qr_${gateQr.motivo}`); continue; }

      // 1ª MENSAGEM: APENAS TEXTO — sem QR, sem imagem, sem link (contato novo não recebe mídia)
      await S.M31FilaMensagem.create({
        dedup_key: dedupKey, participante_id: pessoa,
        cpf: cpfNorm || null, telefone: telNorm, email: (i.email || '').toLowerCase() || null,
        automacao: 'CONFIRMACAO_TEXTO', template: 'confirmacao_texto_v1', versao: 'V1',
        origem: 'm31EnfileirarUltimos7Dias',
        inscricao_id: i.id, inscricao_nome: i.nome,
        mensagens: [{ message: msgSaudacao(i) }],
        status: 'pendente', prioridade: 4, execution_id: crypto.randomUUID(),
      });
      contagem.BOAS_VINDAS.enfileiradas++;
    }

    // ═══ RECUPERACAO_CHECKOUT — aguardando_aprovacao, últimos 7 dias, não pagas ═══
    const recupTodas = await S.EventoM31Inscricao.filter(
      { fila_recuperacao: true, status_fila_recuperacao: 'aguardando_aprovacao' }, '-created_date', 500);
    const recupCandidatas = recupTodas.filter((i) => {
      if (!i.created_date || i.created_date < corte) return false;
      if (['aprovado', 'gratuito', 'cancelado'].includes(i.status_pagamento)) return false;
      if (!telefoneValido(i.whatsapp)) return false;
      if (i.opt_out === true) return false;
      if (ehTeste(i)) return false;
      return true;
    });
    contagem.RECUPERACAO_CHECKOUT.candidatas_7d = recupCandidatas.length;

    for (const i of recupCandidatas) {
      const cpfNorm = (i.cpf || '').replace(/\D/g, '');
      const telNorm = normalizePhone(i.whatsapp);
      const tentativas = i.recovery_attempts || 0;
      const versao = `V1_T${tentativas + 1}`;
      const dedupKey = `${cpfNorm || telNorm}:RECUPERACAO_CHECKOUT:${versao}`;

      const gate = await podeEnfileirar(dedupKey, telNorm);
      if (!gate.ok) { pular(contagem.RECUPERACAO_CHECKOUT, gate.motivo); continue; }

      // Excluir quem já fechou no Asaas (nunca cobrar quem pagou)
      if (await pagouNoAsaas(i.cpf)) {
        pular(contagem.RECUPERACAO_CHECKOUT, 'ja_pagou_asaas');
        continue;
      }

      await S.M31FilaMensagem.create({
        dedup_key: dedupKey, participante_id: cpfNorm || telNorm,
        cpf: cpfNorm || null, telefone: telNorm, email: (i.email || '').toLowerCase() || null,
        automacao: 'RECUPERACAO_CHECKOUT', template: 'recuperacao_ester', versao,
        origem: 'm31EnfileirarUltimos7Dias',
        inscricao_id: i.id, inscricao_nome: i.nome,
        mensagens: [{ message: msgRecuperacao(i, tentativas) }],
        status: 'pendente', prioridade: 2, execution_id: crypto.randomUUID(),
      });
      contagem.RECUPERACAO_CHECKOUT.enfileiradas++;
    }

    return Response.json({
      success: true,
      corte_7_dias: corte,
      contagem,
      total_enfileiradas: contagem.BOAS_VINDAS.enfileiradas + contagem.RECUPERACAO_CHECKOUT.enfileiradas,
      nota: 'NADA foi enviado. Itens criados como pendente na M31FilaMensagem. O drenador está DESLIGADO — nada sai até aprovação.',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
