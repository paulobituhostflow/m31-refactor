import {
  ApiError,
  type SessionContext,
  type JsonRecord,
  type EntityApi,
} from "./types";
import { UnitOfWork } from "./entities";
const scoped = new Set([
  "EventoM31Inscricao",
  "EventoM31Voluntario",
  "EventoM31CamisaPedido",
  "M31CompraCamisa",
  "Inscricoes",
]);
const digits = (value: unknown) => String(value || "").replace(/\D/g, "");
export function guestEntities(
  work: UnitOfWork,
  session: SessionContext,
): Record<string, EntityApi> {
  if (
    !session.guestHash ||
    (session.user && !session.user.id.startsWith("system:"))
  )
    return work.entities;
  const body = session.guestBody || {};
  async function permitted(name: string, row: JsonRecord) {
    if (row._guest_session_hash === session.guestHash) return true;
    const token = body.pedido_token || body.token || body.retomada_token;
    if (
      token &&
      [
        row.token,
        row.pedido_token,
        row.retomada_token,
        row.cadastro_token,
      ].includes(token)
    )
      return true;
    // Existing public self-service contracts require two matching identity fields.
    const cpf = digits(body.cpf),
      phone = digits(body.whatsapp || body.celular);
    if (
      cpf.length === 11 &&
      phone.length >= 12 &&
      cpf === digits(row.cpf) &&
      phone === digits(row.whatsapp)
    )
      return true;
    if (name === "EventoM31Voluntario" && row.inscricao_id) {
      const parent = await work
        .entity("EventoM31Inscricao")
        .get(row.inscricao_id);
      return permitted("EventoM31Inscricao", parent);
    }
    return false;
  }
  return new Proxy(
    {},
    {
      get: (_target, key) => {
        const name = String(key),
          entity = work.entity(name);
        if (!scoped.has(name)) return entity;
        return {
          ...entity,
          create: async (data: JsonRecord) =>
            entity.create({ ...data, _guest_session_hash: session.guestHash }),
          update: async (id: string, data: JsonRecord) => {
            if (!(await permitted(name, await entity.get(id))))
              throw new ApiError(
                403,
                "Use o link de retomada ou confirme CPF e WhatsApp para alterar esta inscrição.",
                "public_scope_required",
              );
            return entity.update(id, data);
          },
          delete: async () => {
            throw new ApiError(403, "Exclusão pública proibida.");
          },
          bulkCreate: async (rows: JsonRecord[]) => {
            const result = [];
            for (const row of rows)
              result.push(
                await entity.create({
                  ...row,
                  _guest_session_hash: session.guestHash,
                }),
              );
            return result;
          },
          bulkUpdate: async (rows: JsonRecord[]) => {
            const result = [];
            for (const row of rows) {
              if (!(await permitted(name, await entity.get(row.id))))
                throw new ApiError(403, "Registro fora do seu escopo.");
              result.push(await entity.update(row.id, row.data || row));
            }
            return result;
          },
          updateMany: async (filter: JsonRecord, data: JsonRecord) => {
            const rows = await entity.filter(filter, "-id", 100000);
            for (const row of rows)
              if (!(await permitted(name, row)))
                throw new ApiError(403, "Registro fora do seu escopo.");
            return entity.updateMany(filter, data);
          },
        };
      },
    },
  );
}
