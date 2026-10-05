// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.
import * as XLSX from 'xlsx';
import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

function gerarCodigo(usados) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = 'M31-';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (usados.has(code));
  usados.add(code);
  return code;
}

// ═══ NÚCLEO DE NORMALIZAÇÃO M31 — ONDA 2 (regra ÚNICA; espelho de src/lib/m31Normalizar.js) ═══
function m31Telefone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (!d) return { valor: '', desfecho: 'irrecuperavel', motivo: 'telefone_vazio' };
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return { valor: d, desfecho: 'certo', motivo: null };
  if (d.length === 10 || d.length === 11) return { valor: `55${d}`, desfecho: 'certo', motivo: null };
  if (d.length === 8 || d.length === 9) return { valor: d, desfecho: 'duvidoso', motivo: 'sem_ddd' };
  if (d.length > 13) return { valor: d, desfecho: 'duvidoso', motivo: 'digitos_excedentes' };
  return { valor: d, desfecho: 'irrecuperavel', motivo: 'telefone_curto' };
}
function m31Email(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return { valor: '', desfecho: 'certo', motivo: null };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { valor: v, desfecho: 'certo', motivo: null };
  return { valor: v, desfecho: 'duvidoso', motivo: 'email_suspeito' };
}
function m31Revisao(originais, resultados) {
  const motivos = resultados.filter((r) => r && r.desfecho === 'duvidoso').map((r) => r.motivo);
  if (motivos.length === 0) return { revisao_dados: false, revisao_motivos: [] };
  return {
    revisao_dados: true,
    revisao_motivos: motivos,
    revisao_valores_originais: JSON.stringify(originais).slice(0, 500),
    revisao_em: new Date().toISOString(),
  };
}

function normalizarStatus(statusOriginal) {
  if (!statusOriginal) return 'pendente';
  const s = String(statusOriginal).toLowerCase().trim();
  if (s.includes('confirm') || s.includes('pago') || s.includes('aprovado')) return 'aprovado';
  return 'pendente';
}

function extrairLote(etiquetas) {
  if (!etiquetas) return null;
  const e = String(etiquetas).toLowerCase();
  if (e.includes('pré venda') || e.includes('pre venda')) return 'lote_1';
  if (e.includes('1º lote') || e.includes('1o lote') || e.includes('lote 1')) return 'lote_1';
  if (e.includes('2º lote') || e.includes('lote 2')) return 'lote_2';
  if (e.includes('3º lote') || e.includes('lote 3')) return 'lote_3';
  if (e.includes('4º lote') || e.includes('lote 4')) return 'lote_4';
  return null;
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { file_url, dry_run } = await req.json();
    if (!file_url) return Response.json({ error: 'file_url obrigatório' }, { status: 400 });

    // Faz download e parse do Excel
    logger.log('Baixando arquivo...');
    const resp = await fetch(file_url);
    if (!resp.ok) return Response.json({ error: 'Falha ao baixar arquivo' }, { status: 400 });

    const arrayBuffer = await resp.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    logger.log(`Total de linhas na planilha: ${allRows.length}`);

    // Encontra a linha de cabeçalho real (que contém "Nome" ou "Email")
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(10, allRows.length); i++) {
      const row = allRows[i];
      const rowStr = row.map(c => String(c || '')).join('|').toLowerCase();
      if (rowStr.includes('nome') && rowStr.includes('email')) {
        headerRowIdx = i;
        break;
      }
    }

    if (headerRowIdx === -1) return Response.json({ error: 'Cabeçalho não encontrado na planilha' }, { status: 400 });

    const headers = allRows[headerRowIdx].map(h => String(h || '').toLowerCase().trim());
    logger.log('Cabeçalhos encontrados:', headers.join(' | '));

    // Mapeamento de colunas
    const colIdx = {
      nome: headers.findIndex(h => h === 'nome'),
      email: headers.findIndex(h => h === 'email' || h.includes('e-mail')),
      telefone: headers.findIndex(h => h === 'telefone' || h.includes('fone')),
      status: headers.findIndex(h => h === 'status'),
      checkin: headers.findIndex(h => h.includes('check')),
      etiquetas: headers.findIndex(h => h.includes('etiquet')),
      cidade: headers.findIndex(h => h === 'cidade'),
    };
    logger.log('Mapeamento de colunas:', JSON.stringify(colIdx));

    const dataRows = allRows.slice(headerRowIdx + 1).filter(row => row && row[colIdx.nome] && row[colIdx.email]);
    logger.log(`Linhas de dados válidas: ${dataRows.length}`);

    // Busca dados existentes
    const existentes = await base44.asServiceRole.entities.EventoM31Inscricao.list('-created_date', 2000);
    const emailsExistentes = new Set(existentes.map(i => i.email?.toLowerCase()).filter(Boolean));
    const codigosUsados = new Set(existentes.map(i => i.codigo_inscricao).filter(Boolean));

    const confirmados = [];
    const pendentes = [];
    const ignorados = [];
    const corrigidos = [];   // normalização com certeza (telefone/e-mail ajustados)
    const alertas = [];      // formato duvidoso — importado e sinalizado para revisão

    for (const row of dataRows) {
      const nome = String(row[colIdx.nome] || '').trim();
      const emailRaw = String(row[colIdx.email] || '');
      const emailRes = m31Email(emailRaw);
      const email = emailRes.valor;
      if (!nome || !email) { ignorados.push({ nome, email, motivo: 'dados_invalidos' }); continue; }
      if (emailsExistentes.has(email)) { ignorados.push({ nome, email, motivo: 'duplicado' }); continue; }
      emailsExistentes.add(email);

      const statusRaw = colIdx.status >= 0 ? String(row[colIdx.status] || '') : '';
      const etiquetasRaw = colIdx.etiquetas >= 0 ? String(row[colIdx.etiquetas] || '') : '';
      const cidadeRaw = colIdx.cidade >= 0 ? String(row[colIdx.cidade] || '') : '';
      const checkinRaw = colIdx.checkin >= 0 ? String(row[colIdx.checkin] || '') : '';
      const telefoneRaw = colIdx.telefone >= 0 ? row[colIdx.telefone] : '';

      const statusNorm = normalizarStatus(statusRaw);
      const lote = extrairLote(etiquetasRaw);
      // ── Normalização única (Onda 2): corrige com certeza, sinaliza na dúvida ──
      const telRes = m31Telefone(telefoneRaw);
      const whatsapp = telRes.valor;
      const revisao = m31Revisao({ whatsapp: String(telefoneRaw || ''), email: emailRaw }, [telRes, emailRes]);
      if (telRes.desfecho === 'certo' && whatsapp !== String(telefoneRaw || '').replace(/\D/g, '')) {
        corrigidos.push({ nome, campo: 'whatsapp', antes: String(telefoneRaw || ''), depois: whatsapp });
      }
      if (revisao.revisao_dados) {
        alertas.push({ nome, email, motivos: revisao.revisao_motivos, whatsapp_informado: String(telefoneRaw || '') });
      }

      const base = {
        ...revisao,
        nome,
        email,
        whatsapp,
        cidade: cidadeRaw !== 'null' ? cidadeRaw.trim() : '',
        tipo: 'publico_geral',
        lote,
        observacoes: [
          etiquetasRaw && etiquetasRaw !== 'null' ? `Tag: ${etiquetasRaw}` : '',
          'Importado do sistema anterior (M31 Filhas)'
        ].filter(Boolean).join(' | ')
      };

      if (statusNorm === 'aprovado') {
        confirmados.push({
          ...base,
          status_pagamento: 'aprovado',
          valor_pago: 0,
          codigo_inscricao: gerarCodigo(codigosUsados),
          checkin_realizado: checkinRaw.toLowerCase() === 'sim',
        });
      } else {
        pendentes.push({
          ...base,
          status_pagamento: 'checkout_abandonado',
          recovery_attempts: 0,
        });
      }
    }

    if (dry_run) {
      return Response.json({
        dry_run: true,
        total_extraidos: dataRows.length,
        confirmados: confirmados.length,
        pendentes: pendentes.length,
        ignorados: ignorados.length,
        corrigidos_automaticamente: corrigidos.length,
        sinalizados_para_revisao: alertas.length,
        corrigidos_detalhes: corrigidos.slice(0, 10),
        alertas_detalhes: alertas.slice(0, 10),
        preview_confirmados: confirmados.slice(0, 3).map(p => ({ nome: p.nome, email: p.email, codigo_inscricao: p.codigo_inscricao, lote: p.lote })),
        preview_pendentes: pendentes.slice(0, 3).map(p => ({ nome: p.nome, email: p.email, lote: p.lote })),
        ignorados_detalhes: ignorados.slice(0, 5),
      });
    }

    // Importação em lotes de 20
    let importadosConf = 0, importadosPend = 0;
    for (let i = 0; i < confirmados.length; i += 20) {
      await base44.asServiceRole.entities.EventoM31Inscricao.bulkCreate(confirmados.slice(i, i + 20));
      importadosConf += Math.min(20, confirmados.length - i);
    }
    for (let i = 0; i < pendentes.length; i += 20) {
      await base44.asServiceRole.entities.EventoM31Inscricao.bulkCreate(pendentes.slice(i, i + 20));
      importadosPend += Math.min(20, pendentes.length - i);
    }

    // Trilha de auditoria da importação (relatório da normalização única)
    await base44.asServiceRole.entities.EventoM31ActionLog.create({
      user_email: user.email,
      user_nome: user.full_name,
      user_perfil: user.role,
      acao: `Importação de participantes: ${importadosConf + importadosPend} importadas | ${corrigidos.length} normalizadas automaticamente | ${alertas.length} sinalizadas para revisão | ${ignorados.length} não processadas`,
      modulo: 'inscricoes',
    }).catch(() => {});

    return Response.json({
      success: true,
      importados_confirmados: importadosConf,
      importados_pendentes: importadosPend,
      ignorados: ignorados.length,
      total: importadosConf + importadosPend,
      // Relatório da normalização única (Onda 2)
      corrigidos_automaticamente: corrigidos.length,
      sinalizados_para_revisao: alertas.length,
      nao_processados: ignorados.length,
      corrigidos_detalhes: corrigidos.slice(0, 20),
      alertas_detalhes: alertas.slice(0, 20),
      ignorados_detalhes: ignorados.slice(0, 20),
      message: `${importadosConf} confirmadas (com QR) + ${importadosPend} pendentes (fila de cobrança). ${corrigidos.length} corrigidas automaticamente, ${alertas.length} sinalizadas para revisão, ${ignorados.length} não processadas.`
    });

  } catch (error) {
    logger.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
