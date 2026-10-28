// @ts-nocheck
import type { HandlerContext } from '../../runtime/types';
import { authenticateGestao, assertGestaoCaravana, gestaoError, gestaoFailure } from './gestaoAccess.js';
import { asaas, avaliarReembolso, logsReembolso, situacaoPorLogs, SITUACOES, setAsaasKey } from './reembolsoAvaliacao.js';

// Regra do gestor: SOMENTE o Paulo executa reembolso. Conferido no servidor por id, e-mail e papel.
const REEMBOLSO_USER_ID = '6a296becee8023fad118915f';
const REEMBOLSO_EMAIL = 'paulobituadv@gmail.com';
const CONFIRMACAO = 'REEMBOLSAR_TOTAL';
const autorizado = (u: any) =>
  (u?.id === REEMBOLSO_USER_ID || u?.auth_id === REEMBOLSO_USER_ID) &&
  String(u?.email || '').toLowerCase() === REEMBOLSO_EMAIL &&
  u?.role === 'admin';

function historico(logs: any[]) {
  return logs.slice(0, 10).map((l) => ({
    id: l.id,
    acao: l.acao,
    resultado: l.resultado,
    created_date: l.created_date,
    responsavel: l.user_nome || l.user_email
  }));
}

async function registrar(S: any, user: any, insc: any, acao: string, resultado: string, extra: Record<string, string> = {}) {
  return S.EventoM31ActionLog.create({
    user_email: user.email,
    user_nome: user.full_name || user.email,
    user_perfil: user.role,
    user_id: user.id || user.auth_id,
    modulo: 'financeiro',
    entidade_id: insc.id,
    entidade_nome: insc.nome,
    acao,
    resultado,
    ...extra
  });
}

// Trava curta por inscrição (CAS por id). Proteção definitiva contra duplicidade é a auditoria pendente + estornos lidos no Asaas.
async function comTrava(S: any, inscId: string, fn: () => Promise<any>) {
  const chave = 'REEMBOLSO:' + inscId;
  let rows = await S.M31AutomacaoLock.filter({ chave }, 'created_date', 5);
  if (!rows.length) {
    await S.M31AutomacaoLock.create({ chave, ativo: false, criado_em: new Date(0).toISOString() });
    rows = await S.M31AutomacaoLock.filter({ chave }, 'created_date', 5);
  }
  const lock = rows[0];
  const exec = crypto.randomUUID();
  const vencida = new Date(Date.now() - 120_000).toISOString();
  const claim = await S.M31AutomacaoLock.updateMany(
    { id: lock.id, $or: [{ ativo: false }, { criado_em: { $lt: vencida } }] },
    { $set: { ativo: true, execution_id: exec, criado_em: new Date().toISOString() } }
  );
  if (claim?.updated !== 1) throw gestaoError(409, 'REFUND_BUSY', 'Já existe um pedido de reembolso desta inscrição em andamento.');
  try {
    return await fn();
  } finally {
    await S.M31AutomacaoLock.updateMany({ id: lock.id, execution_id: exec }, { $set: { ativo: false } }).catch(() => {});
  }
}

export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    const client = context.client;
    const S = client.asServiceRole.entities;
    const asaasKey = context.config('ASAAS_API_KEY');
    if (asaasKey) setAsaasKey(asaasKey);

    const body = await req.json();
    const user = await client.auth.me().catch(() => null);
    if (!user?.id && !user?.email) throw gestaoError(401, 'UNAUTHENTICATED', 'Entre com sua conta pessoal.');
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(body.inscricao_id || '')) throw gestaoError(400, 'INVALID_ID', 'Inscrição inválida.');
    const insc = await S.EventoM31Inscricao.get(body.inscricao_id).catch(() => null);
    if (!insc) throw gestaoError(404, 'NOT_FOUND', 'Inscrição não encontrada.');
    const pode = autorizado(user);

    if (body.action === 'consultar' && !pode) {
      // Equipe operacional: somente a situação. Sem valores, pagadora ou ações financeiras.
      const ctx = await authenticateGestao(client, body);
      if (!ctx.areas.includes('inscritas')) {
        if (!ctx.areas.includes('caravanas') || !insc.caravana_id) throw gestaoError(403, 'AREA_FORBIDDEN', 'Área não permitida para sua conta.');
        assertGestaoCaravana(ctx, insc.caravana_id);
      }
      const logs = await logsReembolso(S, insc.id);
      return Response.json({ ok: true, pode_executar: false, situacao: situacaoPorLogs(logs) });
    }
    if (!pode) throw gestaoError(403, 'REFUND_FORBIDDEN', 'Somente o responsável financeiro autorizado pode movimentar reembolsos.');

    if (body.action === 'consultar') {
      const av = await avaliarReembolso(S, insc, asaasKey);
      // Mantém o histórico da equipe alinhado ao que o Asaas mostra (ex.: estorno feito direto no painel).
      const porLogs = situacaoPorLogs(av.logs).codigo;
      const rotulosLog: Record<string, string> = {
        concluido: 'concluído',
        parcial: 'parcial',
        em_processamento: 'em processamento',
        aguardando_autorizacao: 'aguardando autorização no Asaas'
      };
      if (rotulosLog[av.situacao.codigo] && porLogs !== av.situacao.codigo) {
        await registrar(S, user, insc, `Reembolso ${rotulosLog[av.situacao.codigo]} (conferido no Asaas): ${av.pagamento.id}`, av.situacao.codigo);
      }
      const { logs, ...rest } = av;
      return Response.json({ ok: true, pode_executar: true, ...rest, historico: historico(logs) });
    }

    if (body.action === 'encaminhar_revisao') {
      const av = await avaliarReembolso(S, insc, asaasKey);
      if (!av.revisao.length) throw gestaoError(409, 'NO_REVIEW_REASON', 'Não há motivo de revisão para esta inscrição.');
      const motivos = av.revisao.map((r: any) => r.rotulo).join('; ');
      const abertas = (await S.M31PendenciaConciliacao.filter({ tipo_registro: 'inscricao', registro_id: insc.id }, '-created_date', 20))
        .filter((p: any) => /^Revisão de reembolso/.test(p.proxima_acao || '') && !['resolvido', 'descartado', 'corrigido'].includes(p.status_analise));
      if (!abertas.length) {
        await S.M31PendenciaConciliacao.create({
          tipo_registro: 'inscricao',
          registro_id: insc.id,
          status_analise: 'aguardando_validacao_financeira',
          prioridade: 'alta',
          responsavel_revisao: user.email,
          proxima_acao: 'Revisão de reembolso: ' + motivos,
          observacao: 'Encaminhado pela ficha. Nenhum estorno automático.',
          historico_alteracoes: [{ usuario: user.email, data: new Date().toISOString(), campo: 'reembolso', valor_anterior: '', valor_novo: 'revisao', justificativa: motivos }]
        });
        await registrar(S, user, insc, 'Reembolso encaminhado para revisão financeira: ' + motivos, 'revisao');
      }
      return Response.json({ ok: true, encaminhado: true, ja_existia: abertas.length > 0 });
    }

    if (body.action !== 'solicitar') throw gestaoError(400, 'INVALID_ACTION', 'Ação inválida.');
    const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : '';
    if (motivo.length < 15 || motivo.length > 1000) throw gestaoError(400, 'REASON_REQUIRED', 'Informe o motivo do reembolso (mínimo de 15 caracteres).');
    if (body.confirmacao !== CONFIRMACAO) throw gestaoError(400, 'CONFIRMATION_REQUIRED', 'Confirmação final obrigatória.');
    if (!/^[0-9a-f-]{36}$/i.test(body.request_id || '') || typeof body.expected_fingerprint !== 'string') throw gestaoError(400, 'INVALID_REQUEST', 'Reabra a ficha e tente novamente.');

    return await comTrava(S, insc.id, async () => {
      const anteriores = await S.EventoM31ActionLog.filter({ entidade_id: insc.id, session_id: body.request_id }, '-created_date', 1);
      if (anteriores.length) return Response.json({ ok: true, repetido: true, resultado: anteriores[0].resultado, rotulo: SITUACOES[anteriores[0].resultado] || null });
      const av = await avaliarReembolso(S, insc, asaasKey);
      if (av.situacao.codigo === 'aguardando_autorizacao') throw gestaoError(409, 'AWAITING_AUTHORIZATION', 'Existe um estorno aguardando autorização de ação crítica no Asaas. Conclua a autorização no Asaas e atualize a consulta. Nenhum novo estorno foi solicitado.');
      if (!av.elegivel) throw gestaoError(409, 'NOT_ELIGIBLE', av.revisao.length ? 'Este caso exige revisão financeira. Nenhum estorno foi feito.' : av.situacao.rotulo + '. Nenhum estorno foi feito.');
      if (av.fingerprint !== body.expected_fingerprint) throw gestaoError(409, 'SNAPSHOT_CHANGED', 'O pagamento mudou desde a conferência. Atualize a ficha. Nenhum estorno foi feito.');
      if (body.teste_sem_movimentacao === true) return Response.json({ ok: true, teste: true, movimentou: false, pagamento_id: av.pagamento.id, valor: av.pagamento.valor });

      // Auditoria gravada ANTES da movimentação; se falhar, nada é enviado ao Asaas.
      const audit = await registrar(S, user, insc, `Reembolso total solicitado: ${av.pagamento.id} · R$ ${Number(av.pagamento.valor).toFixed(2)}. Motivo: ${motivo}`, 'pendente',
        { session_id: body.request_id, dados_anteriores: JSON.stringify({ pagamento: av.pagamento, checks: av.checks, fingerprint: av.fingerprint }) });
      let resposta: any = null;
      let erroRede = false;
      try {
        resposta = await asaas('/payments/' + av.pagamento.id + '/refund', { method: 'POST', body: JSON.stringify({ description: `M31 ${insc.codigo_inscricao || insc.id}: ${motivo}`.slice(0, 500) }) }, asaasKey);
      } catch {
        erroRede = true;
      }
      let resultado = 'incerto';
      let acao = `Reembolso sem confirmação do Asaas: ${av.pagamento.id}. Conferir no Asaas antes de qualquer nova tentativa.`;
      if (resposta?.ok) {
        const depois = await avaliarReembolso(S, insc, asaasKey).catch(() => null);
        resultado = depois?.situacao.codigo === 'concluido' ? 'concluido' : 'solicitado';
        acao = `Reembolso ${resultado === 'concluido' ? 'concluído' : 'solicitado e aceito pelo Asaas'}: ${av.pagamento.id} · R$ ${Number(av.pagamento.valor).toFixed(2)}. Motivo: ${motivo}`;
      } else if (!erroRede && resposta && resposta.status >= 400 && resposta.status < 500) {
        resultado = 'falhou';
        acao = `Reembolso não realizado: ${resposta.json?.errors?.[0]?.description || 'recusado pelo Asaas'} (${av.pagamento.id})`;
      }
      await S.EventoM31ActionLog.update(audit.id, { acao, resultado, dados_novos: JSON.stringify({ http: resposta?.status ?? null, status: resposta?.json?.status ?? null }) }).catch(() => {});
      if (resultado === 'falhou') return Response.json({ ok: false, code: 'REFUND_REJECTED', error: acao + '. Nenhum valor foi movimentado.' }, { status: 422 });
      return Response.json({ ok: true, resultado, rotulo: SITUACOES[({ solicitado: 'em_processamento', incerto: 'em_conferencia' } as any)[resultado] || resultado], inscricao_mantida: true });
    });
  } catch (error: any) {
    console.error('m31ReembolsoInscricao', error?.code, error?.message);
    return gestaoFailure(error);
  }
}
