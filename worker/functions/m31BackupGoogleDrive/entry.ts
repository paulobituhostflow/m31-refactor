// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31BackupGoogleDrive
 *
 * Cria uma pasta raiz no Google Drive do builder e sobe arquivos organizados
 * em subpastas (Entities, Functions, Pages, Components, Config, etc.).
 *
 * Payload:
 * {
 *   root_folder: "M31 Sistema Backup",
 *   files: [
 *     { folder: "Entities", filename: "User.jsonc", content: "...", mime: "application/json" },
 *     ...
 *   ],
 *   clear_existing: false  // se true, deleta arquivos existentes nas subpastas antes de subir
 * }
 *
 * Retorna o ID da pasta raiz e o resultado de cada upload.
 */

const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { root_folder = config('GOOGLE_BACKUP_FOLDER_NAME') || `M31 independente ${config('APP_ENV') || 'local'} — Backup`, files = [], clear_existing = false } = body || {};

    if (!Array.isArray(files) || files.length === 0) {
      return Response.json({ error: 'Nenhum arquivo fornecido.' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const authHeader = { 'Authorization': `Bearer ${accessToken}` };

    // ── Helper: buscar pasta por nome dentro de um parent (ou na raiz se parent=null) ──
    async function findFolder(name, parentId) {
      const q = parentId
        ? `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${parentId}' in parents`
        : `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const url = `${DRIVE_FILES}?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`;
      const resp = await fetch(url, { headers: authHeader });
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.files?.[0]?.id || null;
    }

    // ── Helper: criar pasta ──
    async function createFolder(name, parentId) {
      const metadata: any = {
        name,
        mimeType: 'application/vnd.google-apps.folder',
      };
      if (parentId) metadata.parents = [parentId];
      const resp = await fetch(`${DRIVE_FILES}?fields=id`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata),
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Erro ao criar pasta ${name}: ${err}`);
      }
      const data = await resp.json();
      return data.id;
    }

    async function ensureFolder(name, parentId) {
      const existing = await findFolder(name, parentId);
      if (existing) return existing;
      return await createFolder(name, parentId);
    }

    // ── Helper: listar arquivos de uma pasta (para limpar) ──
    async function listFilesInFolder(folderId) {
      const q = `trashed=false and '${folderId}' in parents`;
      const url = `${DRIVE_FILES}?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=200`;
      const resp = await fetch(url, { headers: authHeader });
      if (!resp.ok) return [];
      const data = await resp.json();
      return data.files || [];
    }

    // ── Helper: deletar arquivo ──
    async function deleteFile(fileId) {
      await fetch(`${DRIVE_FILES}/${fileId}`, { method: 'DELETE', headers: authHeader });
    }

    // ── Helper: upload de arquivo (multipart) ──
    async function uploadFile(folderId, filename, content, mime) {
      const metadata = { name: filename, parents: [folderId] };
      const boundary = 'm31backup_' + Math.random().toString(36).slice(2);
      const parts = [
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`,
        `--${boundary}\r\nContent-Type: ${mime || 'text/plain'}\r\n\r\n${content}\r\n--${boundary}--`,
      ].join('\r\n');
      const resp = await fetch(`${DRIVE_UPLOAD}?uploadType=multipart&fields=id,name`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: parts,
      });
      if (!resp.ok) {
        const err = await resp.text();
        return { ok: false, error: err.substring(0, 200) };
      }
      const data = await resp.json();
      return { ok: true, id: data.id };
    }

    // ── 1. Criar/encontrar pasta raiz ──
    let rootId = await findFolder(root_folder, null);
    if (!rootId) rootId = await createFolder(root_folder, null);

    // ── 2. Agrupar arquivos por subpasta ──
    const byFolder: Record<string, typeof files> = {};
    for (const f of files) {
      const folder = f.folder || 'Outros';
      if (!byFolder[folder]) byFolder[folder] = [];
      byFolder[folder].push(f);
    }

    // ── 3. Para cada subpasta: criar, (opcional) limpar, subir arquivos ──
    const summary: Record<string, any> = {};
    for (const [folderName, folderFiles] of Object.entries(byFolder)) {
      const folderId = await ensureFolder(folderName, rootId);

      if (clear_existing) {
        const existing = await listFilesInFolder(folderId);
        for (const f of existing) await deleteFile(f.id);
      }

      const results = [];
      for (const f of folderFiles) {
        const r = await uploadFile(folderId, f.filename, f.content, f.mime);
        results.push({ filename: f.filename, ...r });
      }
      const ok = results.filter((r) => r.ok).length;
      const fail = results.filter((r) => !r.ok).length;
      summary[folderName] = { total: results.length, ok, fail, errors: results.filter((r) => !r.ok) };
    }

    return Response.json({
      ok: true,
      root_folder_id: rootId,
      root_folder_name: root_folder,
      summary,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
})(req);
}
