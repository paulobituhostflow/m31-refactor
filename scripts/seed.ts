import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { tableName } from "../worker/runtime/entities";
import { sealTokens } from "../worker/runtime/vault";
import { initializeWorkflows } from "../worker/runtime/jobs";
import type { RuntimeEnv } from "../worker/runtime/types";
const env = Object.fromEntries(
  (await readFile(".dev.vars", "utf8"))
    .split("\n")
    .filter((x) => x && !x.startsWith("#"))
    .map((x) => {
      const i = x.indexOf("=");
      return [x.slice(0, i), x.slice(i + 1)];
    }),
);
if (!["127.0.0.1", "localhost"].includes(new URL(env.SUPABASE_URL).hostname))
  throw new Error("Seed permitido apenas no Supabase local.");
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const profiles = [
  "super_admin",
  "gestao_operacional",
  "lider_setor",
  "checkin",
  "visualizacao",
  "cartinhas",
];
const credentials = [];
const records = [];
for (const profile of profiles) {
  const email = `VALIDACAO.${profile}@example.invalid`,
    password = Buffer.from(randomBytes(24)).toString("base64url");
  const { data: existing } = await db
    .from("m31_identities")
    .select("auth_id")
    .eq("email", email)
    .maybeSingle();
  let id = existing?.auth_id;
  if (!id) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error("Falha ao criar conta sintética.");
    id = data.user.id;
  } else {
    const { error } = await db.auth.admin.updateUserById(id, { password });
    if (error) throw new Error("Falha ao atualizar conta sintética.");
  }
  const legacy = `VALIDACAO_USER_${profile}`,
    member = `VALIDACAO_MEMBER_${profile}`;
  await db
    .from("m31_identities")
    .upsert({
      auth_id: id,
      legacy_user_id: legacy,
      email,
      full_name: `VALIDACAO ${profile}`,
      member_id: member,
      active: true,
    });
  records.push({
    entity: "EventoM31Membro",
    data: {
      id: member,
      user_email: email,
      nome: `VALIDACAO ${profile}`,
      perfil: profile === "cartinhas" ? "voluntario" : profile,
      ativo: true,
      setor: profile === "lider_setor" ? "VALIDACAO_AREA" : null,
      pode_checkin: profile === "checkin",
    },
  });
  credentials.push({ profile, email, password });
}
const now = new Date().toISOString();
records.push(
  {
    entity: "EventoM31Config",
    data: {
      id: "VALIDACAO_CONFIG",
      nome: "VALIDACAO M31",
      cartinha_autora_user_id: "VALIDACAO_USER_cartinhas",
      cartinha_lote_liberado: true,
      cartinha_data_evento: "2026-12-01",
      data_limite_transferencia: "2099-01-01T00:00:00Z",
      camisas_pre_venda_ativo: true,
      camisas_pre_venda_modelos_ativos: ["milagres", "jesus", "filhas"],
      camisas_pre_venda_preco_1: 65,
      camisas_pre_venda_preco_2: 120,
      camisas_pre_venda_preco_3: 165,
    },
  },
  {
    entity: "EventoM31Lote",
    data: {
      id: "VALIDACAO_LOTE",
      codigo: "VALIDACAO",
      nome: "VALIDACAO Lote",
      valor: 120,
      ativo: true,
      ordem: 1,
      limite_inscricoes: 1000,
    },
  },
  {
    entity: "EventoM31Caravana",
    data: {
      id: "VALIDACAO_CARAVANA",
      nome: "VALIDACAO Caravana",
      ativa: true,
      cidade: "Recife",
    },
  },
  {
    entity: "EventoM31Inscricao",
    data: {
      id: "VALIDACAO_PARTICIPANTE",
      nome: "VALIDACAO Participante",
      cpf: "12345678909",
      email: "participante@example.invalid",
      whatsapp: "5581999990000",
      tipo: "publico_geral",
      status_pagamento: "aprovado",
      estado_canonico: "confirmada",
      payment_id: "VALIDACAO_PAYMENT",
      codigo_inscricao: "VALIDACAO_QR",
      cartinha_status: "pendente",
      cartinha_versao: 0,
    },
  },
  {
    entity: "EventoM31Tarefa",
    data: {
      id: "VALIDACAO_TAREFA",
      titulo: "VALIDACAO tarefa",
      status: "pendente",
      setor: "VALIDACAO_AREA",
    },
  },
);
for (const record of records) {
  const { data: prior, error } = await db
    .from(tableName(record.entity))
    .select("revision")
    .eq("id", record.data.id)
    .maybeSingle();
  if (error) throw new Error("Migrations não aplicadas.");
  const data = await sealTokens(
    { ...record.data, created_date: now, updated_date: now },
    env.TOKEN_ENCRYPTION_KEY,
  );
  const { error: saved } = await db.rpc("m31_commit", {
    changes: [
      {
        entity: record.entity,
        id: record.data.id,
        expected: prior?.revision ?? null,
        data,
      },
    ],
    suppress_events: true,
  });
  if (saved) throw new Error("Falha no seed.");
}
await initializeWorkflows({ ...env, APP_ENV: "local" } as RuntimeEnv);
await mkdir("reports/private", { recursive: true, mode: 0o700 });
await writeFile(
  "reports/private/local-credentials.json",
  JSON.stringify(credentials, null, 2),
  { mode: 0o600 },
);
console.log(
  "Dados sintéticos criados. Credenciais no arquivo privado ignorado pelo Git.",
);
