import { type SessionContext } from "./types";
import { UnitOfWork } from "./entities";
import { configValue } from "./providers";
export async function health(session: SessionContext, work: UnitOfWork) {
  const { data: jobs, error: jobError } = await session.db
    .from("m31_workflows")
    .select("*");
  const { data: outbox, error: queueError } = await session.db
    .from("m31_outbox")
    .select("status,error_code");
  if (jobError || queueError) throw new Error("health_database_unavailable");
  const items = (jobs || []).map((job) => ({
    id: job.id,
    name: job.name,
    type: job.definition.trigger.config.trigger_type,
    active: job.enabled,
    lastRun: job.last_run_at,
    nextRun: job.next_run_at,
    failed: !!job.last_error,
  }));
  const { data: attempts, error: attemptError } = await session.db
    .from("m31_provider_attempts")
    .select("provider,status,response_status,created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (attemptError) throw new Error("health_provider_journal_unavailable");
  const mocked = session.env.PROVIDER_MODE === "mock";
  const providerStatus = (configured: boolean, provider: string) => {
    const last = (attempts || []).find((a) => a.provider === provider);
    return {
      status: mocked
        ? "warning"
        : !configured
          ? "error"
          : !last
            ? "unknown"
            : last.status === "completed" && last.response_status < 400
              ? "success"
              : "error",
      message: mocked
        ? "Provider simulado em desenvolvimento."
        : !configured
          ? "Credencial não configurada."
          : last
            ? `Última operação: ${last.status}.`
            : "Configurado; ainda sem operações registradas.",
      last_operation: last?.created_at || null,
    };
  };
  const registrations = await work
    .entity("EventoM31Inscricao")
    .list("-id", 100000);
  return {
    timestamp: new Date().toISOString(),
    overall: queueError ? "error" : "warning",
    asaas: providerStatus(!!configValue(session.env, "ASAAS_API_KEY"), "asaas"),
    uazapi: providerStatus(
      !!configValue(session.env, "UAZAPI_TOKEN"),
      "uazapi",
    ),
    webhooks: {
      status: configValue(session.env, "ASAAS_WEBHOOK_TOKEN")
        ? "unknown"
        : "error",
      message: "Recebimentos validados no endpoint e registrados no banco.",
    },
    automations: {
      total: items.length,
      active: items.filter((x) => x.active).length,
      inactive: items.filter((x) => !x.active).length,
      failed: items.filter((x) => x.failed).length,
      automations: items,
      checked: true,
    },
    queue: {
      pending: (outbox || []).filter((x) => x.status === "pending").length,
      failed: (outbox || []).filter((x) => x.status === "failed").length,
    },
    data: {
      inscricoes: {
        total: registrations.length,
        confirmadas: registrations.filter((x) =>
          ["aprovado", "gratuito"].includes(x.status_pagamento),
        ).length,
        pendentes: registrations.filter(
          (x) => x.status_pagamento === "pendente",
        ).length,
        abandonadas: registrations.filter(
          (x) => x.status_pagamento === "checkout_abandonado",
        ).length,
      },
      caravanas: {
        total: (await work.entity("EventoM31Caravana").list("-id", 100000))
          .length,
      },
      voluntarias: {
        total: (await work.entity("EventoM31Voluntario").list("-id", 100000))
          .length,
      },
    },
  };
}
