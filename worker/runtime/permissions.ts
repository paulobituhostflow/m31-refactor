import { financialEntities } from "./finance";
import { ApiError, type User, type JsonRecord } from "./types";
import { superAdmin, requireUser } from "./auth";
const includes = (value: string | undefined, values: string[]) =>
  !!value && values.includes(value);
const participantProfiles = [
  "gestao_operacional",
  "gestora_inscricoes",
  "coordenacao_participantes",
  "coordenadora_geral",
  "coordenador",
];
const taskProfiles = [
  "gestao_operacional",
  "coordenadora_geral",
  "coordenador",
  "lider_setor",
];
const readonlyProfiles = ["visualizacao"];
export const PUBLIC_FUNCTIONS = new Set([
  "m31RegistrarIntencao",
  "m31RegistrarFalhaCheckout",
  "m31ConsultarFalhaCheckout",
  "m31CreatePayment",
  "m31VoluntarioPayment",
  "m31CaravanaPayment",
  "m31CamisaVendaPayment",
  "m31CamisasOfertaPublica",
  "m31ConsultarTransferencia",
  "m31ConcluirTransferencia",
  "m31ConsultarCadastroConvidada",
  "m31ConcluirCadastroConvidada",
  "m31RetomarPagamento",
  "m31ListarIgrejasConhecidas",
  "m31-caravana-flow",
  "m31-caravana-v2",
]);
const participantFunctions = new Set([
  "m31AbrirSessaoOperacional",
  "m31ResumoOperacional",
  "m31OperarParticipante",
  "m31GerarLinkTransferencia",
  "m31ConsultarInscrita",
  "m31ListarDuplicadosRevisao",
  "m31ListarParticipantesIntercessao",
  "m31PanoramaOperacional",
  "m31CamisasOperacional",
  "m31ResumoCamisasDulce",
  "m31SnapshotGrupo",
  "m31HealthCheck",
]);
export function functionPermission(
  name: string,
  user: User | null,
  body: JsonRecord,
  internal = false,
) {
  if (internal) return;
  if (PUBLIC_FUNCTIONS.has(name)) return;
  if (name === "m31Checkin" && body.device_token) return;
  if (name === "m31DispositivoCheckin" && body.action === "validar") return;
  requireUser(user);
  if (name === "m31Cartinhas") return; // Domain handler validates the exact configured author identity.
  if (superAdmin(user)) return;
  const member = user.membro;
  if (!member?.ativo)
    throw new ApiError(403, "Conta sem permissão para esta operação.");
  if (
    name === "m31Checkin" &&
    (member.pode_checkin ||
      member.perfil === "checkin" ||
      includes(member.perfil, participantProfiles))
  )
    return;
  if (
    name === "m31DispositivoCheckin" &&
    (member.pode_checkin || includes(member.perfil, participantProfiles))
  )
    return;
  if (
    participantFunctions.has(name) &&
    (includes(member.perfil, participantProfiles) ||
      includes(member.perfil, readonlyProfiles) ||
      member.pode_ver_inscricoes)
  ) {
    if (
      includes(member.perfil, readonlyProfiles) &&
      ![
        "m31AbrirSessaoOperacional",
        "m31ResumoOperacional",
        "m31PanoramaOperacional",
        "m31HealthCheck",
        "m31ResumoCamisasDulce",
      ].includes(name)
    )
      throw new ApiError(403, "Perfil somente de leitura.");
    return;
  }
  if (
    [
      "m31NotificarAtribuicaoTarefa",
      "m31NotificarComentarioTarefa",
      "m31NotificarStatusTarefa",
    ].includes(name) &&
    includes(member.perfil, taskProfiles)
  )
    return;
  throw new ApiError(403, "Sem permissão para executar esta função.");
}
const publicRead = new Set(["EventoM31Lote", "EventPageConfig"]);
const participants = new Set([
  "EventoM31Inscricao",
  "EventoM31Caravana",
  "EventoM31Voluntario",
  "M31InscricaoTimeline",
]);
const financial =
  /Finance|Financial|Transac|Conta|Payment|Contract|Pagamento|Concili|Cupom|Camisa|Asaas/i;
const config =
  /Config|Membro|OperacaoSessao|ActionLog|AuditLog|CheckinDispositivo/i;
export function entityPermission(
  name: string,
  action: string,
  user: User | null,
) {
  const reading = ["list", "filter", "get"].includes(action);
  if (name === "M31CartinhaEntrada")
    throw new ApiError(
      403,
      "Conteúdo pastoral exige o serviço autorizado de cartinhas.",
    );
  if (!user) {
    if (reading && publicRead.has(name)) return;
    throw new ApiError(401, "Entre com sua conta.");
  }
  if (superAdmin(user)) return;
  const member = user.membro;
  if (!member?.ativo) throw new ApiError(403, "Conta sem acesso ao módulo.");
  const profile = member.perfil;
  if (name === "EventoM31Membro" && reading) return;
  if (
    profile === "voluntario" &&
    reading &&
    [
      "EventoM31Voluntario",
      "EventoM31Tarefa",
      "EventoM31Presenca",
      "TarefaComentario",
    ].includes(name)
  )
    return;
  if (
    name === "TarefaComentario" &&
    action === "create" &&
    includes(profile, [...taskProfiles, "voluntario"])
  )
    return;
  if (
    profile === "voluntario" &&
    name === "EventoM31Tarefa" &&
    action === "update"
  )
    return;
  if (name === "EventoM31ActionLog" && action === "create") return;
  if (
    reading &&
    [
      "BrandSettings",
      "M31EdicaoEvento",
      "M31Area",
      "M31BlocoConteudo",
      "M31PlanoMestre",
      "M31Pacote",
      "M31PacoteModelo",
      "M31TarefaModelo",
      "EventoM31Reuniao",
      "EventoM31Presenca",
    ].includes(name) &&
    includes(profile, [...participantProfiles, ...taskProfiles, "visualizacao"])
  )
    return;
  if (
    name === "EventoM31Presenca" &&
    action === "update" &&
    profile === "lider_setor"
  )
    return;
  if (config.test(name)) {
    if (reading && name === "EventoM31Config") return;
    throw new ApiError(403, "Configuração restrita.");
  }
  if (!reading && participants.has(name))
    throw new ApiError(
      403,
      "Use a operação de domínio para alterar participantes.",
    );
  if (
    reading &&
    participants.has(name) &&
    (includes(profile, participantProfiles) ||
      includes(profile, readonlyProfiles) ||
      member.pode_ver_inscricoes ||
      member.pode_checkin ||
      profile === "checkin")
  )
    return;
  if (financialEntities.has(name) && !reading)
    throw new ApiError(403, "Use o serviço financeiro específico.");
  if (financial.test(name)) {
    if (
      reading &&
      (includes(profile, ["coordenador", "visualizacao"]) ||
        member.pode_ver_financeiro)
    )
      return;
    throw new ApiError(403, "Acesso financeiro restrito.");
  }
  if (/Fornecedor/.test(name)) {
    if (reading && includes(profile, [...taskProfiles, "visualizacao"])) return;
    throw new ApiError(403, "Fornecedor restrito.");
  }
  if (profile === "lider_setor" && !reading && action !== "update")
    throw new ApiError(
      403,
      "O líder pode atualizar apenas os registros do seu setor.",
    );
  if (
    /Tarefa|Area|Checklist|Cronograma|Comentario|Solicitacao|Logistica|Frente|Responsavel/.test(
      name,
    )
  ) {
    if (reading || action !== "delete") {
      if (
        includes(profile, taskProfiles) ||
        (reading && includes(profile, readonlyProfiles))
      )
        return;
    }
  }
  if (publicRead.has(name) && reading) return;
  throw new ApiError(403, "Sem permissão para esta entidade.");
}
export function scopedFilter(
  name: string,
  query: JsonRecord,
  user: User | null,
): JsonRecord {
  if (name === "EventoM31ActionLog" && !superAdmin(user))
    return { $and: [query, { user_email: user?.email }] };
  if (name === "EventoM31Membro" && !superAdmin(user)) {
    if (user?.membro?.perfil === "lider_setor")
      return {
        $and: [
          query,
          { setor: user.membro.setor || user.membro.area, ativo: true },
        ],
      };
    if (includes(user?.membro?.perfil, participantProfiles))
      return { $and: [query, { ativo: true }] };
    return { $and: [query, { user_email: user?.email }] };
  }
  if (user?.membro?.perfil === "voluntario" && name === "EventoM31Voluntario")
    return { $and: [query, { email: user.email }] };
  if (user?.membro?.perfil === "voluntario" && name === "EventoM31Tarefa")
    return {
      $and: [
        query,
        {
          $or: [
            { responsavel_email: user.email },
            { membros_emails: { $in: [user.email] } },
          ],
        },
      ],
    };
  if (
    user?.membro?.perfil === "lider_setor" &&
    /^(EventoM31Tarefa|EventoM31Cronograma|EventoM31ChecklistItem|M31Frente)$/.test(
      name,
    )
  ) {
    const sector = user.membro.setor || user.membro.area;
    if (!sector) throw new ApiError(403, "Setor não configurado.");
    return {
      $and: [
        query,
        { $or: [{ setor: sector }, { area: sector }, { area_id: sector }] },
      ],
    };
  }
  return query;
}
export function publicView(
  name: string,
  row: JsonRecord,
  user: User | null,
): JsonRecord {
  const result = { ...row };
  delete result._sealed_tokens;
  for (const key of Object.keys(result)) {
    if (
      key.startsWith("_") ||
      key.startsWith("cartinha_") ||
      /token|api_key|password|senha|pin|secret|access_key/i.test(key)
    )
      delete result[key];
  }
  if (
    name === "EventoM31Inscricao" &&
    !superAdmin(user) &&
    !user?.membro?.pode_ver_financeiro &&
    user?.membro?.perfil !== "coordenador"
  ) {
    for (const key of Object.keys(result))
      if (/payment|checkout|asaas|valor|cartao|installment|finance/i.test(key))
        delete result[key];
  }
  if (name === "EventoM31Config" && superAdmin(user))
    for (const field of [
      "cartinha_lote_liberado",
      "cartinha_data_evento",
      "cartinha_meta_diaria",
      "cartinha_autora_user_id",
    ])
      if (row[field] !== undefined) result[field] = row[field];
  if (
    name === "EventoM31Membro" &&
    !superAdmin(user) &&
    row.user_email !== user?.email
  )
    return Object.fromEntries(
      Object.entries(result).filter(([field]) =>
        [
          "id",
          "user_email",
          "nome",
          "setor",
          "area",
          "ativo",
          "perfil",
        ].includes(field),
      ),
    );
  if (!user && name === "EventPageConfig")
    return Object.fromEntries(
      Object.entries(result).filter(([key]) => !key.includes("draft")),
    );
  return result;
}
export function entityWriteFields(name: string, data: JsonRecord) {
  const dangerous = Object.keys(data || {}).filter((k) =>
    /^cartinha_|token|api_key|password|senha|pin|secret|access_key|auth_id|role/i.test(
      k,
    ),
  );
  if (dangerous.length)
    throw new ApiError(
      403,
      "Campos protegidos exigem uma operação específica.",
    );
  if (financialEntities.has(name))
    throw new ApiError(403, "Use a operação financeira específica.");
  if (
    [
      "EventoM31Inscricao",
      "EventoM31Voluntario",
      "EventoM31CamisaPedido",
      "EventoM31Caravana",
      "EventoM31CamisaEstoque",
    ].includes(name)
  )
    throw new ApiError(
      403,
      "Use a operação de domínio para alterar este registro.",
    );
}

export async function scopedQuery(
  name: string,
  query: JsonRecord,
  user: User | null,
  work: import("./entities").UnitOfWork,
) {
  if (
    user?.membro &&
    ["lider_setor", "voluntario"].includes(user.membro.perfil)
  ) {
    if (name === "TarefaComentario") {
      const tasks = await work
        .entity("EventoM31Tarefa")
        .filter(scopedFilter("EventoM31Tarefa", {}, user), "-id", 100000);
      return {
        $and: [query, { tarefa_id: { $in: tasks.map((row) => row.id) } }],
      };
    }
    if (name === "EventoM31Presenca") {
      const volunteers = await work
        .entity("EventoM31Voluntario")
        .filter(
          user.membro.perfil === "voluntario"
            ? { email: user.email }
            : {
                $or: [
                  { setor: user.membro.setor },
                  { area: user.membro.setor },
                ],
              },
          "-id",
          100000,
        );
      return {
        $and: [
          query,
          { voluntario_id: { $in: volunteers.map((row) => row.id) } },
        ],
      };
    }
  }
  return scopedFilter(name, query, user);
}
