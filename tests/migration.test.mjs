import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportSnapshot } from "../tools/migration/export.mjs";
import { readSnapshot } from "../tools/migration/validate.mjs";
const secret = "VALIDACAO_EXPORT_ENCRYPTION_00000000000000";
const rows = Array.from({ length: 603 }, (_, i) => ({
  id: `VALIDACAO_${String(i).padStart(5, "0")}`,
  nome: "VALIDACAO",
  created_date: "2026-10-01T00:00:00Z",
  payment_id: `VALIDACAO_PAY_${i}`,
  codigo_inscricao: `VALIDACAO_QR_${i}`,
  token: `VALIDACAO_SECRET_${i}`,
}));
const source = {
  list: async (name, _sort, limit, offset) =>
    name === "EventoM31Inscricao" ? rows.slice(offset, offset + limit) : [],
};
test("exportação retoma sem duplicar registros, protege dados e preserva pagamentos/QR", async () => {
  const folder = await mkdtemp(join(tmpdir(), "m31-migration-"));
  try {
    const partial = await exportSnapshot(source, folder, secret, {
      pageSize: 200,
      stopAfter: 1,
    });
    assert.equal(partial.complete, false);
    const complete = await exportSnapshot(source, folder, secret, {
      pageSize: 200,
    });
    assert.equal(complete.complete, true);
    const read = await readSnapshot(folder, secret);
    assert.equal(read.entities.EventoM31Inscricao.length, 603);
    assert.deepEqual(read.entities.EventoM31Inscricao[600], rows[600]);
    const repeated = await exportSnapshot(source, folder, secret);
    assert.deepEqual(repeated, complete);
    const page = complete.entities.EventoM31Inscricao.pages[0];
    assert.equal(
      (await readFile(join(folder, page.path))).includes(
        Buffer.from("VALIDACAO_SECRET"),
      ),
      false,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
test("snapshot incompleto, adulterado ou com chave errada é recusado antes da importação", async () => {
  const folder = await mkdtemp(join(tmpdir(), "m31-migration-"));
  try {
    await exportSnapshot(source, folder, secret, { pageSize: 1000 });
    await assert.rejects(
      readSnapshot(folder, "WRONG_EXPORT_KEY_000000000000000000000"),
    );
    const manifest = JSON.parse(
      await readFile(join(folder, "manifest.json"), "utf8"),
    );
    const page = manifest.entities.EventoM31Inscricao.pages[0];
    await writeFile(join(folder, page.path), "tampered");
    await assert.rejects(readSnapshot(folder, secret), /Checksum/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
test("duplicação causada por paginação instável interrompe exportação", async () => {
  const folder = await mkdtemp(join(tmpdir(), "m31-migration-"));
  try {
    await assert.rejects(
      exportSnapshot(
        {
          list: async (name, _sort, limit, offset) =>
            name === "EventoM31Inscricao"
              ? offset
                ? [rows[0]]
                : rows.slice(0, 2)
              : [],
        },
        folder,
        secret,
        { pageSize: 2 },
      ),
      /Paginação inconsistente/,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
