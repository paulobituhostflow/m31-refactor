import { financialEntities, financialMutation } from "./finance";
import { ApiError, type SessionContext, type JsonRecord } from "./types";
import { UnitOfWork } from "./entities";
import { entityPermission, scopedFilter, publicView } from "./permissions";
import { requireUser, superAdmin } from "./auth";
const names = new Set([
  "EventoM31Inscricao",
  "EventoM31Voluntario",
  "EventoM31Caravana",
  "EventoM31CamisaPedido",
  "EventoM31CamisaEstoque",
]);
const profileFields = new Set([
  "nome",
  "email",
  "whatsapp",
  "cpf",
  "cidade",
  "estado",
  "nome_igreja",
  "como_conheceu",
  "observacoes",
  "tamanho_camisa",
  "tamanho_camiseta",
  "modelo_camisa",
  "area_voluntario",
  "setor",
  "igreja",
  "serviu_antes",
]);
export async function domainMutation(
  name: string,
  body: JsonRecord,
  session: SessionContext,
  work: UnitOfWork,
) {
  if (name === "EventoM31Config") {
    requireUser(session.user);
    if (!superAdmin(session.user) || body.action !== "update")
      throw new ApiError(403, "Configuração restrita à gestão.");
    const allowed = [
      "cartinha_lote_liberado",
      "cartinha_data_evento",
      "cartinha_meta_diaria",
      "cartinha_autora_user_id",
    ];
    for (const key of Object.keys(body.data || {})) {
      if (
        (/^cartinha_/.test(key) && !allowed.includes(key)) ||
        /token|secret|api_key|password|senha/i.test(key)
      )
        throw new ApiError(403, "Campo de configuração protegido.");
    }
    const result = await work.entity(name).update(body.id, body.data);
    await work.commit();
    return publicView(name, result, session.user);
  }
  if (financialEntities.has(name))
    return financialMutation(name, body, session, work);
  if (!names.has(name))
    throw new ApiError(404, "Operação de domínio inexistente.");
  requireUser(session.user);
  const member = session.user.membro;
  const admin = superAdmin(session.user);
  if (
    !admin &&
    ![
      "gestao_operacional",
      "coordenadora_geral",
      "coordenacao_participantes",
      "gestora_inscricoes",
      "coordenador",
    ].includes(member?.perfil)
  )
    throw new ApiError(403, "Sem permissão para alteração operacional.");
  if (body.action === "delete" && !admin)
    throw new ApiError(403, "Exclusão restrita.");
  const entity = work.entity(name);
  const rows =
    body.action === "bulkCreate" || body.action === "bulkUpdate"
      ? body.data
      : [body.data || {}];
  if (!Array.isArray(rows) || rows.length > 100)
    throw new ApiError(400, "Lote inválido.");
  const results = [];
  for (const raw of rows) {
    const data = raw.data || raw;
    const id = raw.id || body.id;
    if (
      Object.keys(data).some((k) =>
        /cartinha_|token|api_key|secret|password|senha|pin|payment_id|checkout_id|installment_id|asaas_customer_id|estado_canonico|classificacao_registro|status_pagamento|valor_pago/i.test(
          k,
        ),
      )
    )
      throw new ApiError(
        403,
        "Alteração exige a função específica de participante, camisa ou financeiro.",
      );
    if (
      name === "EventoM31Inscricao" &&
      (body.action === "create" ||
        Object.keys(data).some((k) => !profileFields.has(k) && k !== "id"))
    )
      throw new ApiError(403, "Use a função de inscrição para esta alteração.");
    if (name === "EventoM31CamisaPedido")
      throw new ApiError(
        403,
        "Use m31CamisasOperacional para alterar pedidos.",
      );
    if (name === "EventoM31CamisaEstoque" && !admin)
      throw new ApiError(403, "Estoque restrito à gestão.");
    for (const [k, value] of Object.entries(data))
      if (
        /quantidade|disponivel|estoque/.test(k) &&
        typeof value === "number" &&
        value < 0
      )
        throw new ApiError(422, "Estoque não pode ser negativo.");
    let old: JsonRecord | null = null;
    if (id) {
      old = await entity.get(id);
      entityPermission(name, "get", session.user);
      if (
        !(await entity.filter(scopedFilter(name, { id }, session.user))).length
      )
        throw new ApiError(403, "Registro fora do seu escopo.");
    }
    const result =
      body.action === "delete"
        ? await entity.delete(id)
        : body.action === "create" || body.action === "bulkCreate"
          ? await entity.create(data)
          : body.action === "update" || body.action === "bulkUpdate"
            ? await entity.update(id, data)
            : null;
    if (!result) throw new ApiError(400, "Operação inválida.");
    await work
      .entity("EventoM31ActionLog")
      .create({
        user_email: session.user.email,
        user_perfil: member?.perfil,
        acao: body.action,
        modulo: name,
        entidade_id: result.id,
        dados_anteriores: old
          ? JSON.stringify(publicView(name, old, session.user))
          : null,
      });
    results.push(publicView(name, result, session.user));
  }
  await work.commit();
  return body.action.startsWith("bulk") ? results : results[0];
}
