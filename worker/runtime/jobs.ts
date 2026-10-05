import { CronExpressionParser } from "cron-parser";
import workflows from "../catalog/workflows.json";
import { database } from "./auth";
import { UnitOfWork } from "./entities";
import { runFunction } from "./dispatcher";
import { configValue } from "./providers";
import {
  ApiError,
  type RuntimeEnv,
  type JsonRecord,
  type SessionContext,
} from "./types";
import { sha256 } from "./vault";
export function workflowStep(workflow: JsonRecord): JsonRecord {
  const steps = workflow.definition?.do;
  if (!Array.isArray(steps) || steps.length !== 1)
    throw new ApiError(422, "Workflow com passos não suportados.");
  const step = Object.values(steps[0])[0] as JsonRecord;
  if (
    step?.call !== "invoke_backend_function" ||
    !step.with?.function_name ||
    step.then !== "end"
  )
    throw new ApiError(422, "Workflow inválido.");
  return { function_name: step.with.function_name, args: step.with.args || {} };
}
export const workflowCatalog: JsonRecord[] = (workflows as JsonRecord[]).map(
  (workflow) => ({
    ...workflow,
    job: workflowStep(workflow),
  }),
);
export function nextRun(config: JsonRecord, from: Date): Date | null {
  if (config.trigger_type !== "scheduled") return null;
  if (
    config.ends_type === "on_date" &&
    config.ends_on_date &&
    from >= new Date(config.ends_on_date)
  )
    return null;
  if (config.schedule_mode === "one_time")
    return config.one_time_date && new Date(config.one_time_date) > from
      ? new Date(config.one_time_date)
      : null;
  if (config.schedule_mode === "interval") {
    const unit = { minutes: 60000, hours: 3600000, days: 86400000 }[
      config.interval_unit as "minutes" | "hours" | "days"
    ];
    if (!unit || !config.interval_value)
      throw new ApiError(422, "Intervalo inválido.");
    const milliseconds = Number(config.interval_value) * unit;
    const anchor = config.interval_anchor
      ? new Date(
          config.interval_anchor +
            (/Z$|[+-]\d{2}:?\d{2}$/.test(config.interval_anchor) ? "" : "Z"),
        ).getTime()
      : from.getTime();
    return new Date(
      anchor +
        (Math.floor((from.getTime() - anchor) / milliseconds) + 1) *
          milliseconds,
    );
  }
  if (config.cron_expression)
    return CronExpressionParser.parse(config.cron_expression, {
      currentDate: from,
      tz: config.timezone || "UTC",
    })
      .next()
      .toDate();
  return null;
}
export async function initializeWorkflows(env: RuntimeEnv) {
  const db = database(env);
  for (const definition of workflowCatalog) {
    const id = definition.definition.document.name;
    const { data } = await db
      .from("m31_workflows")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!data) {
      const { error } = await db.from("m31_workflows").insert({
        id,
        name: definition.name,
        definition,
        enabled: false,
        next_run_at: nextRun(
          definition.trigger.config,
          new Date(),
        )?.toISOString(),
      });
      if (error) throw new ApiError(503, "Falha ao registrar workflow.");
    }
  }
}
export async function tick(env: RuntimeEnv) {
  const db = database(env);
  if (env.AUTOMATIONS_ENABLED === "true") {
    const { data, error } = await db
      .from("m31_workflows")
      .select("*")
      .eq("enabled", true)
      .lte("next_run_at", new Date().toISOString());
    if (error) throw new ApiError(503, "Agendamentos indisponíveis.");
    for (const workflow of data || []) {
      const config = workflow.definition.trigger.config;
      const now = new Date();
      const maximum =
        config.ends_type === "after_count" ? config.ends_after_count : Infinity;
      if (workflow.run_count >= maximum) {
        await db
          .from("m31_workflows")
          .update({ enabled: false, next_run_at: null })
          .eq("id", workflow.id);
        continue;
      }
      const step = workflow.definition.job;
      const dedup = `schedule:${await sha256(`${step.function_name}:${JSON.stringify(step.args || {})}:${workflow.next_run_at}`)}`;
      const { error: queued } = await db.from("m31_outbox").upsert(
        {
          dedup_key: dedup,
          function_name: step.function_name,
          args: { ...step.args, _workflow_id: workflow.id },
        },
        { onConflict: "dedup_key", ignoreDuplicates: true },
      );
      if (queued) throw new ApiError(503, "Falha ao enfileirar agendamento.");
      const next = nextRun(config, now);
      await db
        .from("m31_workflows")
        .update({
          next_run_at: next?.toISOString() || null,
          run_count: workflow.run_count + 1,
          last_run_at: now.toISOString(),
          enabled: !!next,
        })
        .eq("id", workflow.id)
        .eq("next_run_at", workflow.next_run_at);
    }
  }
  const { data: jobs, error } = await db.rpc("m31_claim_jobs", {
    batch_size: 25,
  });
  if (error) throw new ApiError(503, "Fila indisponível.");
  for (const job of jobs || []) {
    try {
      await env.JOBS.send({ id: job.id });
    } catch {
      await db
        .from("m31_outbox")
        .update({ status: "pending", lease_until: null })
        .eq("id", job.id);
    }
  }
}
export async function consume(
  env: RuntimeEnv,
  message: Message<{ id: string }>,
) {
  const db = database(env);
  const { data: job, error } = await db.rpc("m31_take_job", {
    job_id: message.body.id,
  });
  if (error) throw new ApiError(503, "Falha ao assumir job.");
  if (!job) {
    message.ack();
    return;
  }
  const work = new UnitOfWork(
    db,
    false,
    configValue(env, "TOKEN_ENCRYPTION_KEY"),
  );
  const session: SessionContext = {
    env,
    db,
    user: null,
    internal: true,
    requestId: job.id,
  };
  try {
    const response = await runFunction(
      job.function_name,
      job.args,
      session,
      work,
      job.id,
    );
    if (!response.ok) throw new ApiError(response.status, "Job retornou erro.");
    await db
      .from("m31_outbox")
      .update({ status: "completed", lease_until: null, error_code: null })
      .eq("id", job.id);
    if (job.args?._workflow_id)
      await db
        .from("m31_workflows")
        .update({ last_error: null })
        .eq("id", job.args._workflow_id);
    message.ack();
  } catch (error) {
    const code = error instanceof ApiError ? error.code : "job_failure";
    const terminal =
      job.attempts >= 4 ||
      code === "provider_outcome_uncertain" ||
      code === "operation_pending";
    if (job.args?._workflow_id)
      await db
        .from("m31_workflows")
        .update({ last_error: code })
        .eq("id", job.args._workflow_id);
    await db
      .from("m31_outbox")
      .update({
        status: terminal ? "failed" : "pending",
        lease_until: null,
        available_at: new Date(
          Date.now() + Math.min(300, 30 * job.attempts) * 1000,
        ).toISOString(),
        error_code: code,
      })
      .eq("id", job.id);
    if (terminal) {
      await env.JOBS_DLQ.send({ id: job.id, error_code: code });
      message.ack();
    } else message.retry({ delaySeconds: 30 });
  }
}
