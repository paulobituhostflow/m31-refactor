// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

/**
 * m31ReconciliarCodigos
 * Cunha codigo_inscricao (PADRÃO OFICIAL) em registros de caravana aprovados sem código,
 * usando WHATSAPP como chave única.
 *
 * IMPORTANTE: o código NÃO vem do payload. Ele nasce aqui, no apply, no padrão canônico da casa:
 *   M31-CAR-{Date.now().toString(36).toUpperCase()}  (mesma fórmula do m31CaravanaPayment)
 * Isso mantém um único gerador e um único formato — sem convenções paralelas no painel/auditoria.
 *
 * Payload: { whatsapps: string[], apply?: boolean }
 *   - apply=false (default): DRY-RUN — não escreve nada. Mostra por linha o que cunharia/pularia.
 *     No dry-run o código NÃO é gerado (nasce só no apply); a coluna codigo_a_aplicar fica "(gerado no apply)".
 *   - apply=true: cunha código oficial único, escreve e re-consulta cada registro (verify independente).
 *
 * Travas: match único por whatsapp · status aprovado · código vazio · dry-run default ·
 *         unicidade do código cunhado · verify pós-escrita.
 * Endurecimentos: try/catch por item (um erro não derruba o lote) · log com whatsapp+nome+id+ação+motivo.
 */

const PREFIXO_CARAVANA = 'M31-CAR-';

// Sufixo base36 do formato oficial (timestamp) + entropia, para nunca colidir num loop apertado.
// Ex.: M31-CAR-MQL3X0L3K7  (timestamp base36 + 2 chars aleatórios)
function gerarSufixo() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 36 * 36).toString(36).toUpperCase().padStart(2, '0');
  return ts + rand;
}

// Gera código no padrão oficial. Garante unicidade em DOIS níveis:
//   1. contra o banco (filter) — nenhum código já persistido colide;
//   2. contra o próprio lote (reservados: Set em memória) — duas iterações no mesmo ms nunca geram igual.
// Em colisão, REGERA com novo timestamp+entropia e retenta (não falha, não pula).
async function cunharCodigoOficial(base44, reservados) {
  for (let tentativa = 0; tentativa < 10; tentativa++) {
    const candidato = PREFIXO_CARAVANA + gerarSufixo();
    if (reservados.has(candidato)) continue; // colisão dentro do lote → regera
    const existentes = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ codigo_inscricao: candidato });
    if (!existentes || existentes.length === 0) {
      reservados.add(candidato); // reserva antes de persistir
      return candidato;
    }
    // colisão com o banco → regera com novo timestamp/entropia
  }
  throw new Error('nao_foi_possivel_gerar_codigo_unico');
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Permissão: admin apenas (ferramenta manual)
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden — admin apenas' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const whatsapps = Array.isArray(body.whatsapps) ? body.whatsapps : [];
    const apply = body.apply === true;

    if (whatsapps.length === 0) {
      return Response.json({ error: 'payload vazio. Esperado: { whatsapps: string[], apply }' }, { status: 400 });
    }

    const logs = [];
    const reservados = new Set(); // códigos cunhados neste lote — impede colisão intra-lote
    const resumo = { total: whatsapps.length, aplicados: 0, dry_run_simulados: 0, pulados: {} };
    const pular = (motivo) => { resumo.pulados[motivo] = (resumo.pulados[motivo] || 0) + 1; };

    for (const raw of whatsapps) {
      const whatsapp = String(raw ?? '').trim();
      const linha = {
        whatsapp,
        nome_encontrado: null,
        inscricao_id: null,
        acao: null,
        motivo: null,
        codigo_a_aplicar: '(gerado no apply)',
        codigo_existente: null,
      };

      try {
        if (!whatsapp) {
          linha.acao = 'pular'; linha.motivo = 'entrada_invalida'; pular('entrada_invalida');
          logs.push(linha); continue;
        }

        // 1. Match estrito por whatsapp exato
        const matches = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ whatsapp });

        if (matches.length === 0) {
          linha.acao = 'pular'; linha.motivo = 'nao_encontrado'; pular('nao_encontrado');
          logs.push(linha); continue;
        }
        if (matches.length > 1) {
          linha.acao = 'pular'; linha.motivo = 'multiplos_matches'; linha.codigo_existente = `${matches.length} registros`;
          pular('multiplos_matches'); logs.push(linha); continue;
        }

        const insc = matches[0];
        linha.nome_encontrado = insc.nome;
        linha.inscricao_id = insc.id;

        // 2. Trava: status aprovado
        if (insc.status_pagamento !== 'aprovado') {
          linha.acao = 'pular'; linha.motivo = 'nao_aprovado'; linha.codigo_existente = insc.status_pagamento;
          pular('nao_aprovado'); logs.push(linha); continue;
        }

        // 3. Trava: código vazio (idempotência — re-run seguro)
        if (insc.codigo_inscricao && String(insc.codigo_inscricao).trim() !== '') {
          linha.acao = 'pular'; linha.motivo = 'ja_tem_codigo'; linha.codigo_existente = insc.codigo_inscricao;
          pular('ja_tem_codigo'); logs.push(linha); continue;
        }

        // 4. Dry-run: NÃO gera código (nasce só no apply), só confirma que cunharia
        if (!apply) {
          linha.acao = 'cunharia'; linha.motivo = 'dry_run_simulado'; resumo.dry_run_simulados++;
          logs.push(linha); continue;
        }

        // 5. Apply: cunha código OFICIAL único, escreve + verify independente
        const codigo = await cunharCodigoOficial(base44, reservados);
        linha.codigo_a_aplicar = codigo;

        await base44.asServiceRole.entities.EventoM31Inscricao.update(insc.id, { codigo_inscricao: codigo });
        const check = await base44.asServiceRole.entities.EventoM31Inscricao.get(insc.id);

        if (check && check.codigo_inscricao === codigo) {
          linha.acao = 'aplicado'; linha.motivo = 'persistido_ok'; resumo.aplicados++;
        } else {
          linha.acao = 'falha'; linha.motivo = 'falha_persistencia'; linha.codigo_existente = check?.codigo_inscricao || null;
          pular('falha_persistencia');
        }
        logs.push(linha);
      } catch (e) {
        // try/catch por item: um erro não derruba o lote
        linha.acao = 'erro'; linha.motivo = 'erro_excecao'; linha.codigo_existente = e?.message || String(e);
        pular('erro_excecao');
        logs.push(linha);
        continue;
      }
    }

    return Response.json({ apply, resumo, logs });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
