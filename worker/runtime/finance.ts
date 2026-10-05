import { ApiError, type SessionContext, type JsonRecord } from "./types";
import { UnitOfWork } from "./entities";
import { publicView } from "./permissions";
import { requireUser, superAdmin } from "./auth";
import catalog from "../catalog/entities.json";
export const financialEntities = new Set([
  "ContaPagar",
  "ContaReceber",
  "FinancialSupplier",
  "FinancialTransaction",
  "SupplierContract",
  "SupplierPayment",
  "M31TransacaoFinanceira",
  "M31PendenciaConciliacao",
]);
export async function financialMutation(
  name: string,
  body: JsonRecord,
  session: SessionContext,
  work: UnitOfWork,
) {
  requireUser(session.user);
  const member = session.user.membro;
  if (
    !superAdmin(session.user) &&
    (!member?.ativo || member.perfil !== "coordenador")
  )
    throw new ApiError(
      403,
      "Alteração financeira restrita à gestão financeira.",
    );
  if (body.action === "delete" && !superAdmin(session.user))
    throw new ApiError(403, "Exclusão financeira restrita.");
  if (
    !["create", "update", "delete", "bulkCreate", "bulkUpdate"].includes(
      body.action,
    )
  )
    throw new ApiError(
      400,
      "Use uma operação financeira explícita por registro.",
    );
  const items = body.action.startsWith("bulk")
    ? body.data
    : [{ id: body.id, data: body.data || {} }];
  if (!Array.isArray(items) || items.length > 100)
    throw new ApiError(400, "Lote financeiro inválido.");
  const schema = (catalog as JsonRecord)[name];
  const results = [];
  for (const item of items) {
    const patch = item.data || item;
    for (const [field, value] of Object.entries(patch)) {
      if (
        /token|cartinha_|password|secret|asaas|payment_id|checkout_id|auth_id/i.test(
          field,
        )
      )
        throw new ApiError(
          403,
          "Referência de provider exige reconciliação específica.",
        );
      if (field !== "id" && !schema.properties[field])
        throw new ApiError(422, "Campo financeiro desconhecido.");
      if (
        /valor|saldo|quantidade|parcela/.test(field) &&
        typeof value === "number" &&
        !Number.isFinite(value)
      )
        throw new ApiError(422, "Valor financeiro inválido.");
      const rule = schema.properties[field];
      if (rule?.enum && value != null && !rule.enum.includes(value))
        throw new ApiError(422, "Classificação financeira inválida.");
    }
    const entity = work.entity(name),
      id = item.id || body.id;
    const old = id ? await entity.get(id) : null;
    const result =
      body.action === "delete"
        ? await entity.delete(id)
        : body.action.endsWith("Create") || body.action === "create"
          ? await entity.create(patch)
          : await entity.update(id, patch);
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
