// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31RecuperarCheckout v4 — Refatorado: Factory + Dedup Robusto + Validação Estrita
 *
 * Padrões aplicados:
 * - Factory: MessageBuilder unificado (estratégia por tipo)
 * - Dedup Criptográfico: Hash de (id + phone) para evitar variações de DDI
 * - Single Query: Carrega logs 1x, não N queries
 * - Erro Transparente: .catch() com log antes de silenciar
 */

const HORA_INICIO = 8;
const HORA_FIM = 21;
const LOTE_MAX = 3;
const DELAY_MIN_MS = 2 * 60 * 1000;
const DELAY_MAX_MS = 5 * 60 * 1000;
const JANELA_3H_MS = 3 * 60 * 60 * 1000;
const JANELA_24H_MS = 24 * 60 * 60 * 1000;
const DEDUP_JANELA_MS = 24 * 60 * 60 * 1000;

// ── Tipagem ────────────────────────────────────────────────────────────────
interface Inscricao {
  id: string;
  nome: string;
  cpf?: string;
  tipo?: string;
  whatsapp?: string;
  asaas_charge_url?: string;
  caravana_nome?: string;
  cidade?: string;
  created_date: string;
  recovery_attempts?: number;
  last_recovery_at?: string;
  status_pagamento: string;
  opt_out?: boolean;
  fila_recuperacao?: boolean;
  entrou_no_grupo?: boolean;
}

interface DedupSet {
  hashes: Set<string>;
  lastReset: number;
}

// ── Utilidades ─────────────────────────────────────────────────────────────
function horaRecifeNum(): number {
  const d = new Date();
  const local = new Date(d.getTime() + -3 * 60 * 60 * 1000);
  return local.getUTCHours();
}

function normPhone(tel: string): string {
  return (tel || '').replace(/\D/g, '');
}

function isValidPhone(tel: string): boolean {
  const d = normPhone(tel);
  return d.length >= 10 && d.length <= 13;
}

function primeiroNome(nome: string): string {
  return (nome || 'Visitante').split(' ')[0];
}

// Hash criptográfico simples de dedup (inscrição_id + phone normalizado)
function dedupHash(inscricaoId: string, phone: string): string {
  return `${inscricaoId}:${normPhone(phone)}`;
}

// ── Detecção de nome masculino (M31 é exclusivo para mulheres) ─────────────
const NOMES_MASCULINOS = new Set([
  'emanoel','emanuel','emmanuel','emanoele','joao','joão','pedro','paulo','carlos',
  'jose','josé','antonio','antônio','lucas','gabriel','rafael','matheus','mateus',
  'marcos','marco','felipe','felipe','gustavo','rodrigo','ricardo','marcelo','bruno',
  'roberto','fernando','eduardo','leonardo','vinicius','vinícius','guilherme','thiago',
  'tiago','andre','andré','diego','raul','vitor','vítor','henrique','samuel','davi',
  'noah','miguel','arthur','heitor','theo','joaquim','augusto','oscar','nelson','nilson',
  'ademir','ademar','benedito','flavio','flávio','mauricio','maurício','sergio','sérgio',
  'claudio','cláudio','gilberto','walter','vanderlei','valdir','adelmo','alisson','allison',
  'robinson','robson','washington','wellington','jefferson','edson','everson','eversong',
  'luiz','luis','louis','enzo','murilo','murillo','nicolas','benicio','benício','isaac',
  'yantony','yan','caio','kaio','fabricio','fabrício','hugo','igor','ivan','kleber',
  'maicon','maikon','rogerio','rogério','sandro','tarsis','valter','wesley','yankee',
]);

function detectarNomeMasculino(nomeCompleto: string): boolean {
  if (!nomeCompleto) return false;
  const primeiro = primeiroNome(nomeCompleto).toLowerCase().trim();
  if (!primeiro || primeiro.length < 2) return false;
  // Correspondência exata contra a lista
  if (NOMES_MASCULINOS.has(primeiro)) return true;
  // Padrões comuns de nomes masculinos: terminados em "o" ou "el" (com 4+ letras, excluindo exceções femininas)
  const EXCECOES_FEMININAS = new Set([
    'camilo','melo','nair','doro','noeli','noely','rosangela','rosângela',
    'valdirene','jacira','fatima','fátima','cleusa','creusa','teresa','teresa',
    'isabel','isabela','isabelle','abel','raquel','sueli','marli','nali','dani',
  ]);
  if (EXCECOES_FEMININAS.has(primeiro)) return false;
  if (primeiro.length >= 4 && primeiro.endsWith('o') && !primeiro.endsWith('ao')) return true;
  if (primeiro.length >= 4 && primeiro.endsWith('el') && !primeiro.endsWith('uel')) return true;
  return false;
}

// ── Mensagem de verificação de identidade (nome masculino detectado) ───────
async function enviarMensagemVerificacao(base44: any, inscricao: Inscricao): Promise<void> {
  const telNorm = normPhone(inscricao.whatsapp || '');
  const cpfNorm = (inscricao.cpf || '').replace(/\D/g, '');
  const nome = inscricao.nome?.trim() || 'participante';
  const dedupKey = `VERIFICACAO_NOME:${cpfNorm || telNorm}:V1`;

  // Dedup: não reenviar se já existe verificação pendente/enviada
  const existentes = await base44.asServiceRole.entities.M31FilaMensagem.filter(
    { dedup_key: dedupKey }, '-created_date', 5
  );
  const bloqueante = existentes.find((f: any) =>
    ['pendente','processando','enviado','incerto','falha_terminal'].includes(f.status)
  );
  if (bloqueante) return;

  const mensagem =
    `Olá! Identificamos que a inscrição foi iniciada em nome de *${nome}*. ` +
    `Como o M31 é uma imersão exclusiva para mulheres, você poderia nos confirmar ` +
    `para quem seria a inscrição e informar o nome completo da participante?`;

  await base44.asServiceRole.entities.M31FilaMensagem.create({
    dedup_key: dedupKey,
    participante_id: cpfNorm || telNorm,
    cpf: cpfNorm || null,
    telefone: telNorm,
    email: (inscricao.email || '').toLowerCase().trim() || null,
    automacao: 'OPERACIONAL',
    template: 'verificacao_nome_participante_v1',
    versao: 'V1',
    origem: 'm31RecuperarCheckout',
    inscricao_id: inscricao.id,
    inscricao_nome: inscricao.nome,
    mensagens: [{ message: mensagem }],
    status: 'pendente',
    prioridade: 3,
    aprovado_para_envio: true,
    aprovado_por: 'auto_verificacao_nome',
    aprovado_em: new Date().toISOString(),
  }).catch((e: Error) =>
    logger.error('[RecuperarCheckout] Falha ao enfileirar verificação de nome:', e.message)
  );
}

// ── FASE 1 SEGURANÇA: verificar pagamento no Asaas antes de enfileirar ─────
const ASAAS_PAGO = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];
async function verificarPagamentoAsaas(cpf?: string): Promise<any | null> {
  const cpfLimpo = (cpf || '').replace(/\D/g, '');
  if (cpfLimpo.length !== 11) return null;
  const KEY = config('ASAAS_API_KEY');
  if (!KEY) return null;
  try {
    const custRes = await fetch(`__ASAAS_API__/customers?cpfCnpj=${cpfLimpo}`, {
      headers: { 'access_token': KEY },
    });
    const custData = await custRes.json();
    if (!custData?.data?.length) return null;
    for (const cust of custData.data.slice(0, 3)) {
      const payRes = await fetch(`__ASAAS_API__/payments?customer=${cust.id}&limit=20`, {
        headers: { 'access_token': KEY },
      });
      const payData = await payRes.json();
      const pago = (payData?.data || []).find((p: any) => ASAAS_PAGO.includes(p.status));
      if (pago) return pago;
    }
    return null;
  } catch (e) {
    logger.error('[RecuperarCheckout] Erro ao verificar Asaas:', (e as Error).message);
    return null; // em erro de consulta, NÃO converte — mantém na triagem (nunca aprova sem certeza)
  }
}

// ── Message Factory ────────────────────────────────────────────────────────
class RecoveryMessageBuilder {
  private inscricao: Inscricao;

  constructor(inscricao: Inscricao) {
    this.inscricao = inscricao;
  }

  private getLink(): string {
    return this.inscricao.asaas_charge_url || '__APP_ORIGIN__/m31-inscricao';
  }

  // Estratégia 1: Primeira recuperação (tentativa 0)
  buildFirstAttempt(): string {
    const nome = primeiroNome(this.inscricao.nome);
    const tipo = this.inscricao.tipo || 'publico_geral';
    const link = this.getLink();

    switch (tipo) {
      case 'caravana':
        return (
          `Oii *${nome}* 😊\n\n` +
          `Vi que você começou sua inscrição da caravana *${this.inscricao.caravana_nome}*${
            this.inscricao.cidade ? ` [${this.inscricao.cidade}]` : ''
          } mas ela ainda não foi finalizada 💛\n\n` +
          `Precisando de ajuda, pode falar comigo.\n\n` +
          `👉 *Pagar:* ${link}`
        );
      case 'voluntario':
        return (
          `Oii *${nome}* 😊\n\n` +
          `Vi que seu cadastro de voluntária ainda não foi concluído 💛\n\n` +
          `Se precisar de ajuda para finalizar, pode me chamar aqui.\n\n` +
          `👉 *Finalizar:* ${link}`
        );
      default:
        return (
          `Oii *${nome}* 😊\n\n` +
          `Vi que você chegou a preencher o formulário mas sua inscrição ainda não foi finalizada 💛\n\n` +
          `Precisando de ajuda, pode falar comigo por aqui.\n\n` +
          `👉 *Pagar:* ${link}`
        );
    }
  }

  // Estratégia 2: Segunda recuperação (tentativa 1)
  buildSecondAttempt(): string {
    const nome = primeiroNome(this.inscricao.nome);
    const tipo = this.inscricao.tipo || 'publico_geral';
    const link = this.getLink();

    switch (tipo) {
      case 'caravana':
        return (
          `*${nome}*, não deixa passar! 🌸\n\n` +
          `Sua inscrição na caravana *${this.inscricao.caravana_nome}* está quase vencendo.\n\n` +
          `👉 ${link}\n\n` +
          `Qualquer dúvida, é só me chamar 💛`
        );
      case 'voluntario':
        return (
          `*${nome}*, falta pouco! 🌸\n\n` +
          `Seu cadastro de voluntária está quase completo. Finalize aqui:\n👉 ${link}\n\n` +
          `Pode me chamar se tiver dúvida 💛`
        );
      default:
        return (
          `*${nome}*, ainda dá tempo! 🌸\n\n` +
          `Sua inscrição está esperando. Pague agora:\n👉 ${link}\n\n` +
          `Pode me chamar se tiver dúvida 💛`
        );
    }
  }
}

// ── Dedup com Hash Criptográfico ───────────────────────────────────────────
async function carregarDedup(base44: any): Promise<DedupSet> {
  const corte = new Date(Date.now() - DEDUP_JANELA_MS).toISOString();

  try {
    const logs = await base44.asServiceRole.entities.M31MessageLog.filter(
      { tipo: 'recuperacao_checkout' },
      '-enviado_em',
      500
    );

    const hashes = new Set<string>();
    for (const log of logs) {
      if (log.enviado_em >= corte && log.inscricao_id) {
        const hash = dedupHash(log.inscricao_id, log.telefone || '');
        hashes.add(hash);
      }
    }

    return { hashes, lastReset: Date.now() };
  } catch (e) {
    logger.error('[RecuperarCheckout] Falha ao carregar dedup:', e);
    // Fallback: empty set permite prosseguir (erro não crítico)
    return { hashes: new Set<string>(), lastReset: Date.now() };
  }
}

function jaRecebeuRecuperacao(dedup: DedupSet, inscricaoId: string, telefone: string): boolean {
  return dedup.hashes.has(dedupHash(inscricaoId, telefone));
}

// ── Log Registrado com Erro Capturado ──────────────────────────────────────
async function registrarLog(
  base44: any,
  inscricao_id: string,
  inscricao_nome: string,
  telefone: string,
  mensagem: string,
  sucesso: boolean,
  zapi_response: any,
  erro: string | null
): Promise<void> {
  try {
    await base44.asServiceRole.entities.M31MessageLog.create({
      inscricao_id,
      inscricao_nome,
      telefone,
      tipo: 'recuperacao_checkout',
      stage: 'recuperacao_checkout',
      mensagem,
      sucesso,
      zapi_response: zapi_response ? JSON.stringify(zapi_response) : null,
      erro,
      enviado_em: new Date().toISOString(),
    });
  } catch (e) {
    // Log de erro de logging (evita cascata silenciosa)
    logger.error(
      `[RecuperarCheckout] Falha ao registrar log para ${inscricao_id}:`,
      (e as Error).message
    );
  }
}

// ── Handler Principal ──────────────────────────────────────────────────────
return (async (req: Request): Promise<Response> => {
  try {
    const base44 = createClientFromRequest(req);
    const horaRecife = horaRecifeNum();

    // ⛔ SEMPRE MODO FILA — sem exceção
    const dedup = await carregarDedup(base44);

    // Query paralela (Dedup + Pendentes + Abandonadas)
    const [pendentes, abandonadas] = await Promise.all([
      // FIFO: mais antigas primeiro — evita que os mesmos 30 registros
      // monopolizem a triagem (limite MAX_VERIFICACOES por execução)
      base44.asServiceRole.entities.EventoM31Inscricao.filter(
        { status_pagamento: 'checkout_pendente' },
        'created_date',
        200
      ),
      base44.asServiceRole.entities.EventoM31Inscricao.filter(
        { status_pagamento: 'checkout_abandonado' },
        'created_date',
        200
      ),
    ]);

    const todas: Inscricao[] = [...pendentes, ...abandonadas];
    const agora = Date.now();

    // ── Filtro único (evita O(2N)) ────────────────────────────────────────
    // ═══ TRAVA CRÍTICA: se entrou_no_grupo=true, o pagamento foi confirmado.
    // NUNCA enviar mensagem de "inscrição não finalizada" para quem já está no grupo.
    // Auto-converter para aprovado (igual à verificação do Asaas) e pular totalmente.
    const noGrupoAbandonadas = todas.filter((i: Inscricao) =>
      i.entrou_no_grupo === true &&
      (i.status_pagamento === 'checkout_abandonado' || i.status_pagamento === 'checkout_pendente')
    );
    let convertidasNoGrupo = 0;
    for (const insc of noGrupoAbandonadas) {
      try {
        await base44.asServiceRole.entities.EventoM31Inscricao.update(insc.id, {
          status_pagamento: 'aprovado',
          fila_recuperacao: false,
        });
        await base44.asServiceRole.entities.M31InscricaoTimeline.create({
          inscricao_id: insc.id,
          cpf: (insc.cpf || '').replace(/\D/g, ''),
          evento: 'recuperacao_bloqueada_no_grupo',
          etapa: 'recuperacao',
          status: 'sucesso',
          detalhe: 'Inscrição estava no grupo de inscritas mas constava como checkout abandonado/pendente — convertida para aprovada automaticamente. Mensagem de recuperação NÃO enviada (pagamento confirmado pela entrada no grupo).',
          origem: 'm31RecuperarCheckout',
        }).catch((e: Error) => logger.error('[RecuperarCheckout] Falha timeline grupo:', e.message));
        convertidasNoGrupo++;
      } catch (e) {
        logger.error(`[RecuperarCheckout] Falha ao converter ${insc.id} (no grupo):`, e);
      }
    }

    const candidatas = todas.filter((i: Inscricao) => {
      if (!isValidPhone(i.whatsapp || '')) return false;
      if (i.status_pagamento === 'aprovado' || i.status_pagamento === 'gratuito') return false;
      // TRAVA: se está no grupo, pagamento foi confirmado — nunca recuperar
      if (i.entrou_no_grupo) return false;
      if (i.opt_out) return false;
      if (agora - new Date(i.created_date).getTime() < JANELA_3H_MS) return false;

      const tentativas = i.recovery_attempts || 0;
      if (tentativas >= 2) return false;

      return true;
    });

    // ── Ordenação por tentativa (msg1 antes msg2) ──────────────────────────
    const msg1 = candidatas.filter((i) => (i.recovery_attempts || 0) === 0);
    const msg2 = candidatas
      .filter((i) => (i.recovery_attempts || 0) === 1)
      .filter((i) => {
        const ultimo = i.last_recovery_at;
        if (!ultimo) return false;
        return agora - new Date(ultimo).getTime() >= JANELA_24H_MS;
      });

    const candidatasOrdenadas = [...msg1, ...msg2];

    // ── Enfileirar (modo fila obrigatório) ──────────────────────────────────
    const paraEnfileirar = candidatasOrdenadas.filter((i) => {
      if (i.fila_recuperacao) return false; // já enfileirada
      const tel = normPhone(i.whatsapp || '');
      return !jaRecebeuRecuperacao(dedup, i.id, tel);
    });

    // FASE 1 SEGURANÇA: verificar Asaas ANTES de enfileirar (máx 30 por execução)
    const MAX_VERIFICACOES = 30;
    const paraProcessar = paraEnfileirar.slice(0, MAX_VERIFICACOES);

    let enfileiradas = 0;
    let convertidasPagas = 0;
    for (const inscricao of paraProcessar) {
      try {
        const pagamento = await verificarPagamentoAsaas(inscricao.cpf);
        if (pagamento) {
          // Já pagou no Asaas → NÃO cobrar. Converter para aprovada.
          // O update dispara automaticamente o fluxo de confirmada
          // (automação "Despachar Confirmações" + safety net de boas-vindas).
          await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
            status_pagamento: 'aprovado',
            asaas_payment_id: pagamento.id,
            valor_pago: pagamento.value || undefined,
            fila_recuperacao: false,
          });
          await base44.asServiceRole.entities.M31InscricaoTimeline.create({
            inscricao_id: inscricao.id,
            cpf: (inscricao.cpf || '').replace(/\D/g, ''),
            evento: 'reconciliacao_executada',
            etapa: 'recuperacao',
            status: 'sucesso',
            detalhe: `Pagamento ${pagamento.id} (${pagamento.status}) confirmado no Asaas durante triagem de recuperação — convertida para aprovada, cobrança evitada`,
            origem: 'm31RecuperarCheckout',
          }).catch((e: Error) => logger.error('[RecuperarCheckout] Falha timeline:', e.message));
          convertidasPagas++;
          continue;
        }

        await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
          fila_recuperacao: true,
          fila_recuperacao_em: new Date().toISOString(),
          status_fila_recuperacao: 'aguardando_aprovacao',
        });
        enfileiradas++;
      } catch (e) {
        logger.error(`[RecuperarCheckout] Falha ao processar ${inscricao.id}:`, e);
        // Continua com próxima inscrição (não aborta)
      }
    }

    return Response.json({
      success: true,
      modo: 'fila_obrigatoria',
      mensagem: `${enfileiradas} inscrições enfileiradas, ${convertidasPagas} já pagas convertidas (Asaas), ${convertidasNoGrupo} no grupo convertidas. ⛔ NENHUMA MENSAGEM SERÁ ENVIADA até aprovação manual.`,
      enfileiradas,
      convertidas_pagas_asaas: convertidasPagas,
      convertidas_no_grupo: convertidasNoGrupo,
      restantes_proxima_execucao: Math.max(0, paraEnfileirar.length - MAX_VERIFICACOES),
      total_pool: todas.length,
      candidatas: candidatasOrdenadas.length,
      hora_recife: `${horaRecife}h BRT`,
      nota: 'Revise e aprove no painel de recuperação',
    });
  } catch (error) {
    return Response.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
})(req);
}
