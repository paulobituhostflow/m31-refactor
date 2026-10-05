// Cópia local por autora + inscrição + aba. Nunca guarda senha ou token.
// Somente usada depois da autorização de RequireCartinhas.
const DB = 'm31-cartinhas-dispositivo-v1';
const STORE = 'rascunhos';
let opening;
function openDb() {
  if (!opening) opening = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('Armazenamento local indisponível.')); return; }
    const req = globalThis.indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('Não foi possível abrir a cópia local.'));
    req.onblocked = () => reject(new Error('Feche outras abas antigas para liberar a cópia local.'));
  }).catch(error => { opening = null; throw error; });
  return opening;
}
async function transaction(mode, operation) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let request;
    try { request = operation(tx.objectStore(STORE)); }
    catch (error) { reject(error); return; }
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = tx.onabort = () => reject(new Error('Não foi possível confirmar a cópia no dispositivo.'));
  });
}
export function abaCartinhas() {
  const key = 'm31_cartinhas_aba';
  try {
    let id = sessionStorage.getItem(key);
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(key, id); }
    return id;
  } catch { return crypto.randomUUID(); }
}
export function copiaCartinha(ownerId, inscricaoId, tabId) {
  if (!ownerId || !inscricaoId || !tabId) throw new Error('Cópia local sem identidade.');
  const key = `${ownerId}:${inscricaoId}:${tabId}`;
  return {
    read: () => transaction('readonly', store => store.get(key)),
    // Descoberta: cópias desta autora+inscrição de QUALQUER aba (inclusive mortas).
    readAll: () => transaction('readonly', store => store.getAll()).then(rows => (rows || []).filter(r => r.ownerId === ownerId && r.inscricaoId === inscricaoId)),
    write: value => transaction('readwrite', store => store.put({ ...value, key, ownerId, inscricaoId, tabId })),
    remove: () => transaction('readwrite', store => store.delete(key)),
    removeOthers: () => removerCopiasDaInscricao(ownerId, inscricaoId, key),
  };
}

/** Aposenta cópias desta inscrição (todas as abas), preservando a própria quando informada.
 * Usada após o servidor aceitar o texto: o Base44 é a autoridade. */
export async function removerCopiasDaInscricao(ownerId, inscricaoId, excetoKey) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      for (const row of req.result || []) {
        if (row.ownerId === ownerId && row.inscricaoId === inscricaoId && row.key !== excetoKey) tx.objectStore(STORE).delete(row.key);
      }
    };
    tx.oncomplete = resolve;
    tx.onerror = tx.onabort = () => reject(new Error('Não foi possível atualizar as cópias privadas.'));
  });
}
export async function copiasDaAutora(ownerId) {
  const rows = await transaction('readonly', store => store.getAll());
  return (rows || []).filter(r => r.ownerId === ownerId);
}
export async function limparCopiasDaAutora(ownerId) {
  const rows = await copiasDaAutora(ownerId);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    for (const row of rows) tx.objectStore(STORE).delete(row.key);
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () => reject(new Error('Não foi possível limpar as cópias privadas.'));
  });
}

// ── Presença de editores (evita sincronização concorrente com editor aberto) ──
// Mapa localStorage: inscricaoId -> { tabId, ts }. Sem localStorage, é no-op.
const PRESENCA = 'm31-cartinhas-editores';
const lerMapa = () => {
  try { return JSON.parse(globalThis.localStorage?.getItem(PRESENCA) || '{}') || {}; } catch { return {}; }
};
const gravarMapa = mapa => {
  try { globalThis.localStorage?.setItem(PRESENCA, JSON.stringify(mapa)); } catch { /* presença é otimização; a sincronização apenas pula menos */ }
};
export function marcarEditorAberto(inscricaoId, tabId, agora = Date.now()) {
  if (!inscricaoId || !tabId) return;
  const mapa = lerMapa();
  mapa[inscricaoId] = { tabId, ts: agora };
  gravarMapa(mapa);
}
export function limparEditorAberto(inscricaoId, tabId) {
  const mapa = lerMapa();
  if (mapa[inscricaoId]?.tabId === tabId) { delete mapa[inscricaoId]; gravarMapa(mapa); }
}
/** Editores com atividade recente (padrão 5 min). */
export function editoresAbertos(agora = Date.now(), frescor = 5 * 60 * 1000) {
  const mapa = lerMapa();
  const vivos = {};
  for (const [id, info] of Object.entries(mapa)) if (info?.ts && agora - info.ts <= frescor) vivos[id] = info;
  return vivos;
}

// Lotes usam o mesmo armazenamento privado do módulo, sem outro banco ou serviço.
export function guardarLoteCartinhas(ownerId, lote) {
  if (!ownerId || !lote?.id) throw new Error('Lote sem identificação.');
  return transaction('readwrite', store => store.put({
    ...lote, key: `${ownerId}:importacao:${lote.id}`, ownerId,
    kind: 'importacao_cartinhas', updatedAt: new Date().toISOString(),
  }));
}
export async function lerLotesCartinhas(ownerId) {
  const rows = await copiasDaAutora(ownerId);
  return rows.filter(r => r.kind === 'importacao_cartinhas')
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}
export function removerLoteCartinhas(ownerId, loteId) {
  return transaction('readwrite', store => store.delete(`${ownerId}:importacao:${loteId}`));
}
