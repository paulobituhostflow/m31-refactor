// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.
import { resolveOperationalScope } from './operatorAccessRules.js';
import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

const SESSION_HOURS = 12;
const ALLOWED_PROFILES = new Set([
  'gestao_operacional',
  'super_admin',
  'coordenacao_participantes',
  'gestora_inscricoes',
  'visualizacao',
  'camisas',
  'admin',
]);

function normalizarTelefone(valor: unknown): string | null {
  const digits = String(valor || '').replace(/\D/g, '');
  const nacional = digits.startsWith('55') && digits.length === 13 ? digits.slice(2) : digits;
  if (!/^\d{2}9\d{8}$/.test(nacional)) return null;
  if (/^(\d)\1+$/.test(nacional)) return null;
  return `55${nacional}`;
}

return (async (req: Request): Promise<Response> => {
  let sessionRecord: any = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.email) return Response.json({ error: 'unauthorized' }, { status: 401 });

    const member = (await base44.asServiceRole.entities.EventoM31Membro.filter(
      { user_email: user.email, ativo: true },
      '-created_date',
      1,
    ))[0] || (user.role === 'admin' ? { perfil: 'admin' } : null);
    if (!member || !ALLOWED_PROFILES.has(member.perfil)) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const operador_nome = String(body.nome || '').trim().replace(/\s+/g, ' ');
    const operador_whatsapp = normalizarTelefone(body.whatsapp);
    if (operador_nome.length < 3) {
      return Response.json({ error: 'invalid_operator_name' }, { status: 400 });
    }
    if (!operador_whatsapp) {
      return Response.json({ error: 'invalid_operator_whatsapp' }, { status: 400 });
    }

    // O escopo oficial pertence à CONTA AUTENTICADA. O nome digitado serve apenas
    // para identificar a operadora em conta compartilhada legada e nunca pode
    // ampliar permissões. Isso impede alguém de digitar "Thalita" para ganhar acesso.
    const scopePersona = resolveOperationalScope(operador_nome);
    const scopeConta = Array.isArray(member.operacoes_permitidas) && member.operacoes_permitidas.length > 0
      ? member.operacoes_permitidas.filter((op: string) => ['inscritas', 'voluntarias', 'caravanas', 'camisas'].includes(op))
      : [];
    const scopePerfil = ['super_admin', 'admin'].includes(member.perfil) ? ['inscritas', 'voluntarias', 'caravanas', 'camisas'] : [];
    const baseScope = scopeConta.length > 0 ? scopeConta : scopePerfil;

    // A conta compartilhada de Gestão Operacional usa o nome selecionado para
    // identificar a pessoa física. Nesse caso o alias da pessoa restringe a
    // sessão ao seu escopo conhecido (ex.: Dulce → camisas). Contas pessoais,
    // porém, seguem exclusivamente o escopo do próprio membro autenticado.
    const isSharedOperationalAccount = user.email === 'paulobituadv+gestaom31@gmail.com';
    // Na conta compartilhada, o alias NUNCA pode ampliar o escopo cadastrado da
    // conta. Ele apenas restringe. Ex.: conta = ['camisas'] + Dulce = ['camisas'];
    // selecionar Paulo/Thalita não concede inscrições/caravanas nessa conta.
    let operacoes_permitidas: string[] = isSharedOperationalAccount && scopePersona.length > 0
      ? scopePersona.filter((op: string) => baseScope.includes(op))
      : baseScope;
    let caravana_ids_permitidas: string[] = [];
    if (operacoes_permitidas.length === 0) {
      const telefonesMembro = [normalizarTelefone(member.whatsapp), operador_whatsapp].filter(Boolean);
      const caravanas = await base44.asServiceRole.entities.EventoM31Caravana.filter({}, '+created_date', 500);
      caravana_ids_permitidas = caravanas
        .filter((caravana: any) =>
          caravana.ativa !== false && telefonesMembro.includes(normalizarTelefone(caravana.lider_whatsapp)),
        )
        .map((caravana: any) => caravana.id);
      if (caravana_ids_permitidas.length > 0) operacoes_permitidas = ['caravanas'];
    }
    if (operacoes_permitidas.length === 0) {
      return Response.json({ error: 'operator_not_registered' }, { status: 403 });
    }

    const session_id = crypto.randomUUID();
    const aberta_em = new Date().toISOString();
    const expires_at = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
    sessionRecord = await base44.asServiceRole.entities.M31OperacaoSessao.create({
      session_id,
      auth_email: user.email,
      operador_nome,
      operador_whatsapp,
      operacoes_permitidas,
      caravana_ids_permitidas,
      aberta_em,
      expires_at,
      ativa: true,
    });

    await base44.asServiceRole.entities.EventoM31ActionLog.create({
      user_email: user.email,
      user_nome: operador_nome,
      user_perfil: member.perfil,
      acao: 'Entrou no Painel de Gestão Operacional',
      modulo: 'sistema',
      entidade_id: sessionRecord.id,
      entidade_nome: operador_whatsapp,
      dados_novos: JSON.stringify({ operador_nome, operador_whatsapp, expires_at }),
      session_id,
      resultado: 'sucesso',
    });

    return Response.json({
      session_id,
      operador_nome,
      operador_whatsapp,
      operacoes_permitidas,
      caravana_ids_permitidas,
      aberta_em,
      expires_at,
    });
  } catch (error) {
    if (sessionRecord?.id) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.M31OperacaoSessao.delete(sessionRecord.id);
      } catch {
        // O TTL mantém uma sessão órfã inofensiva até expirar.
      }
    }
    return Response.json({ error: error.message || 'session_creation_failed' }, { status: 500 });
  }
})(req);

}
