// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31AuditoriaPagamentoIntercessao
 *
 * LISTA DE PAGAMENTO DA INTERCESSÃO — somente leitura.
 *
 * Lê o snapshot do grupo de Intercessão (M31GrupoMembro, status=ativa),
 * REMOVE os administradores do grupo e cruza cada número com
 * EventoM31Inscricao + EventoM31Voluntario para classificar:
 *
 *   PAGA              → inscrição aprovada/gratuita
 *   PENDENTE          → inscrição existe mas não está paga
 *   SEM_INSCRICAO     → só tem perfil de voluntária, nunca gerou inscrição
 *   SEM_CADASTRO      → número no grupo sem nenhum registro no sistema
 *
 * NÃO envia mensagens. NÃO cria cobranças. NÃO altera inscrições.
 * Para atualizar o snapshot do grupo, rode m31AuditoriaIntercessao antes
 * (ou passe { sincronizar: true }).
 */

const FINALIDADE = 'INTERCESSAO';
const PAGOS = ['aprovado', 'gratuito'];

function normBR(raw: any): string | null {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length >= 14 && d.startsWith('5555')) d = d.slice(2);
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  d = d.replace(/^0+/, '');
  if (d.length === 10 && /^[6-9]/.test(d.slice(2))) d = d.slice(0, 2) + '9' + d.slice(2);
  if (d.length !== 11) return null;
  return '55' + d;
}

return (async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);
    const S = base44.asServiceRole.entities;
    const body = await req.json().catch(() => ({}));

    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Apenas administradores' }, { status: 403 });
      }
    } catch { /* execução agendada */ }

    // Atualiza o snapshot do grupo antes de cruzar (opcional)
    if (body?.sincronizar === true) {
      await base44.asServiceRole.functions.invoke('m31AuditoriaIntercessao', {}).catch(() => {});
    }

    const cfgs = await S.M31GrupoConfig.filter({ finalidade: FINALIDADE, ativo: true });
    const jid = cfgs[0]?.chat_id;
    if (!jid) {
      return Response.json({ error: 'Grupo de Intercessão não configurado. Rode a auditoria do grupo primeiro.' }, { status: 404 });
    }

    const membros = await S.M31GrupoMembro.filter({ group_jid: jid, status: 'ativa' }, null, 500);
    const naoAdmin = membros.filter((m: any) => !m.is_admin && !m.is_super_admin);

    const porTelefone = new Map<string, any>();
    const telefoneInvalido: any[] = [];
    for (const m of naoAdmin) {
      const k = normBR(m.phone);
      if (!k) { telefoneInvalido.push({ phone: m.phone, nome: m.nome_whatsapp || null }); continue; }
      porTelefone.set(k, m);
    }
    const phones = [...porTelefone.keys()];

    const inscs: any[] = [];
    const vols: any[] = [];
    for (let i = 0; i < phones.length; i += 50) {
      const lote = phones.slice(i, i + 50);
      const [ins, vs] = await Promise.all([
        S.EventoM31Inscricao.filter({ whatsapp: { $in: lote } }, '-updated_date', 200).catch(() => []),
        S.EventoM31Voluntario.filter({ whatsapp: { $in: lote } }, null, 200).catch(() => []),
      ]);
      inscs.push(...ins);
      vols.push(...vs);
    }

    const inscPor: Record<string, any> = {};
    for (const i of inscs) {
      const k = normBR(i.whatsapp);
      if (!k) continue;
      const atual = inscPor[k];
      if (!atual || PAGOS.includes(i.status_pagamento)) inscPor[k] = i;
    }
    const volPor: Record<string, any> = {};
    for (const v of vols) {
      const k = normBR(v.whatsapp);
      if (k) volPor[k] = v;
    }

    const pagas: any[] = [];
    const pendentes: any[] = [];
    const semInscricao: any[] = [];
    const semCadastro: any[] = [];

    for (const [tel, membro] of porTelefone) {
      const insc = inscPor[tel];
      const vol = volPor[tel];
      const nome = insc?.nome || vol?.nome || membro.nome_whatsapp || null;
      const base = {
        nome,
        telefone: tel,
        nome_whatsapp: membro.nome_whatsapp || null,
        camisa: vol?.tamanho_camiseta || null,
        setor: vol?.setor || insc?.area_voluntario || null,
        inscricao_id: insc?.id || null,
        voluntario_id: vol?.id || null,
      };

      if (insc && PAGOS.includes(insc.status_pagamento)) {
        pagas.push({ ...base, status_pagamento: insc.status_pagamento, valor_pago: insc.valor_pago || null, tipo: insc.tipo, origem_pagamento: insc.origem_pagamento || null });
      } else if (insc) {
        pendentes.push({ ...base, status_pagamento: insc.status_pagamento, tipo: insc.tipo, link_pagamento: insc.asaas_charge_url || null });
      } else if (vol) {
        semInscricao.push({ ...base, status_pagamento: 'sem_inscricao', status_voluntario: vol.status || null });
      } else {
        semCadastro.push({ ...base, status_pagamento: 'sem_cadastro' });
      }
    }

    return Response.json({
      success: true,
      grupo: { nome: cfgs[0]?.nome_grupo || 'Intercessão M31 Filhas', jid },
      resumo: {
        total_membros: membros.length,
        admins_excluidos: membros.length - naoAdmin.length,
        consideradas: naoAdmin.length,
        pagas: pagas.length,
        pendentes: pendentes.length,
        sem_inscricao: semInscricao.length,
        sem_cadastro: semCadastro.length,
        telefone_invalido: telefoneInvalido.length,
        a_regularizar: pendentes.length + semInscricao.length + semCadastro.length,
      },
      pagas,
      pendentes,
      sem_inscricao: semInscricao,
      sem_cadastro: semCadastro,
      telefone_invalido: telefoneInvalido,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
})(req);
}
