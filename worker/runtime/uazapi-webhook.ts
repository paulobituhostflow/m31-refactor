import { ApiError, type JsonRecord } from "./types";
import { secureEqual } from "./vault";

// Native UAZAPI deliveries carry the instance token in the JSON body.
// The separate header remains supported for authenticated relays.
export async function uazapiDelivery(
  body: JsonRecord,
  header: string | undefined,
  instanceToken: string,
  relayToken: string,
  routeEvent?: string,
) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new ApiError(400, "Mensagem inválida.");
  const supplied = header !== undefined ? header : body.token;
  const expected = header !== undefined ? relayToken : instanceToken;
  if (
    !expected ||
    typeof supplied !== "string" ||
    !(await secureEqual(supplied, expected))
  )
    throw new ApiError(401, "Webhook não autorizado.");
  if (routeEvent && body.EventType && routeEvent !== body.EventType)
    throw new ApiError(400, "Evento incompatível com a rota.");
  const message = body.data || body.message || body;
  const id = body.messageid || body.id || message.id || message.messageid;
  const event =
    body.EventType || body.event || routeEvent || body.status || "message";
  if (typeof id !== "string" || !id.trim())
    throw new ApiError(400, "ID da mensagem obrigatório.");
  if (typeof event !== "string" || !event.trim())
    throw new ApiError(400, "Evento inválido.");

  // Authentication must never reach the durable outbox or the legacy handler.
  const args: JsonRecord = { ...body, event };
  delete args.token;
  if (!body.data && body.message && typeof body.message === "object") {
    args.data = {
      ...body.message,
      id,
      phone: String(message.sender || message.chatid || "").split("@")[0],
      isGroupMessage:
        message.isGroup === true ||
        String(message.chatid || "").endsWith("@g.us"),
      timestamp: message.messageTimestamp,
      key: {
        remoteJid: message.chatid,
        participant: message.sender,
        fromMe: message.fromMe,
        id,
      },
    };
  }
  return { id, event, args };
}
