import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("verified historical duplicates survive while new duplicates and forged exemptions fail", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE m31_entity_catalog(name text PRIMARY KEY);
      INSERT INTO m31_entity_catalog VALUES('EventoM31CamisaPedido'),('M31AsaasWebhookEvento');
      CREATE TABLE m31_evento_m31_camisa_pedido(id text PRIMARY KEY,payload jsonb NOT NULL);
      CREATE TABLE m31_m31_asaas_webhook_evento(id text PRIMARY KEY,payload jsonb NOT NULL);
      CREATE UNIQUE INDEX shirt_order_token_unique ON m31_evento_m31_camisa_pedido((payload->>'pedido_token'));
      CREATE UNIQUE INDEX webhook_event_unique ON m31_m31_asaas_webhook_evento((payload->>'event_id'));
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/20261006000100_legacy_duplicate_keys.sql", import.meta.url), "utf8"));
    for (const [entity, table, field] of [
      ["EventoM31CamisaPedido", "m31_evento_m31_camisa_pedido", "pedido_token"],
      ["M31AsaasWebhookEvento", "m31_m31_asaas_webhook_evento", "event_id"],
    ]) {
      const value = "sha256:VALIDACAO_KEY";
      await db.query("INSERT INTO m31_legacy_duplicate_keys VALUES($1,$2,$3,$4)", [entity, "historical", field, value]);
      const historical = { [field]: value, _migration_source_hash: "VALIDACAO_HASH", status_pagamento: "vencido", valor_total: 120.5, campo_historico: { original: true } };
      await db.query(`INSERT INTO ${table} VALUES('canonical',$1,false)`, [JSON.stringify({ [field]: value })]);
      await db.query(`INSERT INTO ${table} VALUES('historical',$1,false)`, [JSON.stringify(historical)]);
      const read = (await db.query(`SELECT payload,legacy_duplicate_key FROM ${table} WHERE id='historical'`)).rows[0];
      assert.deepEqual(read.payload, historical);
      assert.equal(read.legacy_duplicate_key, true);
      for (const payload of [{ [field]: value }, { [field]: value, _migration_source_hash: "FORGED" }]) {
        await assert.rejects(db.query(`INSERT INTO ${table} VALUES('new',$1,true)`, [JSON.stringify(payload)]), e => e.code === "23505");
      }
      await db.query(`INSERT INTO ${table} VALUES('other',$1,false)`, [JSON.stringify({ [field]: "other" })]);
      await assert.rejects(db.query(`UPDATE ${table} SET payload=jsonb_set(payload,$1::text[],$2::jsonb) WHERE id='historical'`, [[field], JSON.stringify("other")]), e => e.code === "23505");
      await assert.rejects(db.query(`UPDATE ${table} SET payload=payload-'_migration_source_hash' WHERE id='historical'`), e => e.code === "23505");
      await db.query(`UPDATE ${table} SET legacy_duplicate_key=false WHERE id='historical'`);
      assert.equal((await db.query(`SELECT legacy_duplicate_key FROM ${table} WHERE id='historical'`)).rows[0].legacy_duplicate_key, true);
      await db.exec(`DELETE FROM ${table}; DELETE FROM m31_legacy_duplicate_keys;`);
    }
    assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE relname='m31_legacy_duplicate_keys'")).rows[0].relrowsecurity, true);
    await db.exec("SET ROLE authenticated");
    await assert.rejects(db.query("SELECT * FROM m31_legacy_duplicate_keys"), e => e.code === "42501");
  } finally {
    await db.close();
  }
});
