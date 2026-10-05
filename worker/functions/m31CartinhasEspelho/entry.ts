// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.
import { ABA_EVENTOS, CABECALHO, processarEspelho, resolverPlanilha } from './espelhoService.js';
import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31CartinhasEspelho — Porta do espelho privado de cartinhas no Google Sheets.
 *
 * Ações:
 *   { action: 'processar' }                    → espelha o lote de pendências
 *                                                (workflow agendado, sem usuário,
 *                                                ou gestão admin).
 *   { action: 'status' }                        → (admin) pendências e destino do espelho.
 *   { action: 'compartilhar', email }          → (admin) concede SOMENTE leitura
 *                                                à conta informada, para acompanhar
 *                                                e acessar o histórico.
 *
 * A planilha é privada, no Drive conectado da operação, e serve apenas para
 * auditoria/recuperação — nada volta dela para as cartas. Falha no Google
 * nunca afeta o Base44: este endpoint vive fora do caminho do autosave.
 * Logs sem texto pastoral, CPF, token ou dado financeiro.
 */

const NOME_PLANILHA = config('GOOGLE_CARTINHAS_SHEET_NAME') || `M31 independente ${config('APP_ENV') || 'local'} — Espelho Privado Cartinhas`;
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const headers = { 'Cache-Control': 'no-store, private', 'Vary': 'Authorization, Cookie' };

function criarDrive(token: string) {
  const auth = { Authorization: `Bearer ${token}` };
  return {
    async buscarPlanilha() {
      const q = `name='${NOME_PLANILHA.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
      const resp = await fetch(`${DRIVE_FILES}?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)&pageSize=5`, { headers: auth });
      if (!resp.ok) throw new Error('planilha_busca_indisponivel');
      const data = await resp.json();
      const found = (data.files || [])[0];
      return found ? { id: found.id, nome: found.name, link: found.webViewLink, criada: false } : null;
    },
    async criarPlanilha() {
      const resp = await fetch(`${DRIVE_FILES}?fields=id,name,webViewLink`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: NOME_PLANILHA, mimeType: 'application/vnd.google-apps.spreadsheet' }),
      });
      if (!resp.ok) throw new Error('planilha_criacao_indisponivel');
      const data = await resp.json();
      return { id: data.id, nome: data.name, link: data.webViewLink, criada: true };
    },
    async concederLeitura(planilhaId: string, email: string) {
      const resp = await fetch(`${DRIVE_FILES}/${planilhaId}/permissions?sendNotificationEmail=false&fields=id`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'user', emailAddress: email }),
      });
      if (!resp.ok) throw new Error('permissao_indisponivel');
      return true;
    },
  };
}

function criarSheets(token: string) {
  const auth = { Authorization: `Bearer ${token}` };
  const json = { 'Content-Type': 'application/json' };
  return {
    async garantirEstrutura(id: string) {
      const meta = await fetch(`${SHEETS_BASE}/${id}?fields=sheets(properties(title))`, { headers: auth });
      if (!meta.ok) throw new Error('planilha_metadados_indisponiveis');
      const info = await meta.json();
      const abas = (info.sheets || []).map((s: any) => s.properties?.title);
      if (!abas.includes(ABA_EVENTOS)) {
        const add = await fetch(`${SHEETS_BASE}/${id}:batchUpdate`, {
          method: 'POST', headers: { ...auth, ...json },
          body: JSON.stringify({ requests: [{ addSheet: { properties: { title: ABA_EVENTOS } } }] }),
        });
        if (!add.ok) throw new Error('aba_criacao_indisponivel');
      }
      const head = await fetch(`${SHEETS_BASE}/${id}/values/${encodeURIComponent(`${ABA_EVENTOS}!A1:T1`)}?majorDimension=ROWS`, { headers: auth });
      if (!head.ok) throw new Error('cabecalho_leitura_indisponivel');
      const headData = await head.json();
      const atual = headData.values?.[0] || [];
      if (atual.some((v: string, index: number) => v && v !== CABECALHO[index])) throw new Error('cabecalho_divergente_requer_conferencia');
      if (CABECALHO.some((v, index) => atual[index] !== v)) {
        const put = await fetch(`${SHEETS_BASE}/${id}/values/${encodeURIComponent(`${ABA_EVENTOS}!A1`)}?valueInputOption=RAW`, {
          method: 'PUT', headers: { ...auth, ...json }, body: JSON.stringify({ values: [CABECALHO] }),
        });
        if (!put.ok) throw new Error('cabecalho_indisponivel');
      }
    },
    async lerIds(id: string) {
      const resp = await fetch(`${SHEETS_BASE}/${id}/values/${encodeURIComponent(`${ABA_EVENTOS}!A2:A`)}?majorDimension=COLUMNS`, { headers: auth });
      if (!resp.ok) throw new Error('leitura_ids_indisponivel');
      const data = await resp.json();
      return (data.values || []).flat().filter(Boolean);
    },
    // RAW: o texto pastoral nunca é interpretado como fórmula pela planilha.
    async anexar(id: string, linhas: string[][]) {
      const resp = await fetch(`${SHEETS_BASE}/${id}/values/${encodeURIComponent(`${ABA_EVENTOS}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
        method: 'POST', headers: { ...auth, ...json }, body: JSON.stringify({ values: linhas }),
      });
      if (!resp.ok) throw new Error('anexo_indisponivel');
      return true;
    },
  };
}

return (async req => {
  const requestId = crypto.randomUUID();
  let acao = 'nao_identificada';
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Método não permitido.' }, { status: 405, headers });
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    acao = typeof body?.action === 'string' ? body.action.slice(0, 30) : 'processar';
    // Autenticação: admin autenticado, OU automação (workflow) sem usuário —
    // permitida APENAS para 'processar'. Conta comum continua bloqueada.
    let user: any = null;
    try { user = await base44.auth.me(); } catch { /* workflow agendado: sem usuário */ }
    if (user && user?.role !== 'admin') return Response.json({ error: 'Acesso restrito à gestão.' }, { status: 403, headers });
    if (!user && acao !== 'processar') return Response.json({ error: 'Entre com a conta de gestão.' }, { status: 401, headers });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    if (!accessToken) return Response.json({ ok: false, error: 'Conector Google Drive indisponível. O espelho fica pendente; o Base44 não é afetado.' }, { status: 503, headers });

    const drive = criarDrive(accessToken);
    const sheets = criarSheets(accessToken);
    const S = base44.asServiceRole.entities;

    if (acao === 'status') {
      const pendentes = await S.EventoM31Inscricao.filter({ cartinha_espelho_pendente: true }, '-updated_date', 500);
      const planilha = await drive.buscarPlanilha().catch(() => null);
      return Response.json({
        ok: true,
        pendencias_espelho: pendentes.length, limite_consulta: 500,
        planilha: planilha ? { nome: planilha.nome, id: planilha.id, link: planilha.link } : null,
      }, { headers });
    }

    if (acao === 'compartilhar') {
      const email = String(body?.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: 'Informe um e-mail válido.' }, { status: 422, headers });
      const planilha = await resolverPlanilha(drive);
      await sheets.garantirEstrutura(planilha.id);
      await drive.concederLeitura(planilha.id, email);
      return Response.json({ ok: true, leitor: email, planilha: { nome: planilha.nome, link: planilha.link } }, { headers });
    }

    if (acao !== 'processar') return Response.json({ error: 'Ação inválida.' }, { status: 400, headers });
    const lote = Number.isInteger(body?.lote) && body.lote >= 1 && body.lote <= 200 ? body.lote : 100;
    const resultado = await processarEspelho({ S, drive, sheets, lote });
    logger.info(JSON.stringify({ modulo: 'cartinhas-espelho', evento: resultado.situacao, request_id: requestId, espelhados: resultado.espelhados ?? null, adiadas: resultado.adiadas ?? null, pendentes_no_lote: resultado.pendentes_no_lote ?? null }));
    return Response.json(resultado, { status: resultado.ok ? 200 : 503, headers });
  } catch (error) {
    logger.error(JSON.stringify({ modulo: 'cartinhas-espelho', evento: 'falha', request_id: requestId, action: acao, error_type: error?.name || 'Error', message: String(error?.message || '').slice(0, 120) }));
    return Response.json({ ok: false, error: 'O espelho privado está indisponível agora. Nada foi alterado no Base44.', request_id: requestId }, { status: 500, headers });
  }
})(req);
}
