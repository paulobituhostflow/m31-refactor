// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31RenderizarTemplate — Função CENTRAL de renderização de mensagens.
 *
 * É a ÚNICA camada autorizada a substituir tags dinâmicas em templates.
 * Nenhuma outra função pode fazer substituição por lista fixa espalhada no código.
 *
 * Aceita DOIS formatos de tag durante a transição:
 *   - {{tag}}  (padrão novo, chaves duplas)
 *   - {tag}    (legado, chaves simples — mensagens já gravadas)
 *
 * Fluxo:
 *   1. Recebe chave_unica (busca o template) OU template_content (texto direto).
 *   2. Recebe `dados`: objeto com os valores das tags disponíveis.
 *   3. Valida: se uma tag usada no template NÃO tiver valor em `dados` e for
 *      obrigatória, retorna erro controlado (não envia mensagem quebrada).
 *   4. Substitui de forma segura e retorna o texto final.
 *
 * Uso (backend):
 *   const r = await base44.asServiceRole.functions.invoke('m31RenderizarTemplate', {
 *     chave_unica: 'boas_vindas_confirmacao',
 *     dados: { nome: 'Maria', codigo_inscricao: 'M31-CAR-ABC', link_ingresso: '...' }
 *   });
 *   if (!r.data.ok) { ... erro controlado ... }
 *   const texto = r.data.rendered;
 *
 * Uso (preview no painel):
 *   template_content direto + modo preview (não valida obrigatórias, usa placeholders).
 */

// Catálogo OFICIAL de variáveis aprovadas no sistema. Uma tag fora daqui é inválida.
const VARIAVEIS_APROVADAS = [
  'nome',
  'evento_nome',
  'data_evento',
  'horario_evento',
  'local_evento',
  'codigo_inscricao',
  'status_pagamento',
  'link_pagamento',
  'link_ingresso',
  // dados extras aprovados usados pelos fluxos atuais
  'cidade',
  'caravana_nome',
  'link_grupo',
  'pagador_nome',
];

// Extrai todas as tags usadas num texto, nos DOIS formatos: {{tag}} e {tag}
function extrairTags(texto) {
  const tags = new Set();
  // {{tag}} — duplas primeiro
  const duplas = texto.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g);
  for (const m of duplas) tags.add(m[1]);
  // {tag} — simples (ignora as que já vieram como duplas pois o regex simples também pega o miolo)
  // Para evitar confundir, primeiro removemos as duplas do texto de análise.
  const semDuplas = texto.replace(/\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}/g, '');
  const simples = semDuplas.matchAll(/\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}/g);
  for (const m of simples) tags.add(m[1]);
  return Array.from(tags);
}

// Substitui uma tag nos dois formatos por seu valor
function substituirTag(texto, tag, valor) {
  const safe = valor == null ? '' : String(valor);
  const reDupla = new RegExp(`\\{\\{\\s*${tag}\\s*\\}\\}`, 'g');
  const reSimples = new RegExp(`\\{\\s*${tag}\\s*\\}`, 'g');
  return texto.replace(reDupla, safe).replace(reSimples, safe);
}

function renderizar(content, dados, opts) {
  const { preview = false, variaveisPermitidas = null } = opts || {};
  const tagsUsadas = extrairTags(content);

  const invalidas = [];
  const faltando = [];

  for (const tag of tagsUsadas) {
    // Fora do catálogo oficial → sempre inválida
    if (!VARIAVEIS_APROVADAS.includes(tag)) {
      invalidas.push(tag);
      continue;
    }
    // Fora da whitelist do template (se definida) → inválida
    if (Array.isArray(variaveisPermitidas) && variaveisPermitidas.length > 0 && !variaveisPermitidas.includes(tag)) {
      invalidas.push(tag);
      continue;
    }
    // Sem valor disponível → falta (só bloqueia fora do preview)
    const temValor = dados && Object.prototype.hasOwnProperty.call(dados, tag) && dados[tag] != null && String(dados[tag]).trim() !== '';
    if (!temValor && !preview) {
      faltando.push(tag);
    }
  }

  if (invalidas.length > 0) {
    return { ok: false, erro: 'tags_invalidas', tags_invalidas: invalidas, tags_usadas: tagsUsadas };
  }

  if (!preview && faltando.length > 0) {
    return { ok: false, erro: 'variaveis_obrigatorias_ausentes', tags_ausentes: faltando, tags_usadas: tagsUsadas };
  }

  let rendered = content;
  for (const tag of tagsUsadas) {
    let valor;
    if (dados && Object.prototype.hasOwnProperty.call(dados, tag) && dados[tag] != null && String(dados[tag]).trim() !== '') {
      valor = dados[tag];
    } else if (preview) {
      valor = `[${tag}]`; // placeholder identificado como exemplo
    } else {
      valor = '';
    }
    rendered = substituirTag(rendered, tag, valor);
  }

  return { ok: true, rendered, tags_usadas: tagsUsadas };
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { chave_unica, template_content, dados = {}, preview = false, variaveis_permitidas = null } = body;

    let content = template_content;
    let variaveisPermitidas = variaveis_permitidas;
    let template = null;

    // Se veio chave_unica, busca o template na entidade (fonte de verdade)
    if (chave_unica) {
      const encontrados = await base44.asServiceRole.entities.M31MessageTemplate.filter({ chave_unica });
      template = encontrados[0];
      if (!template) {
        return Response.json({ ok: false, erro: 'template_nao_encontrado', chave_unica }, { status: 404 });
      }
      if (!preview && template.is_active === false) {
        return Response.json({ ok: false, erro: 'template_inativo', chave_unica }, { status: 200 });
      }
      content = template.content;
      variaveisPermitidas = template.variaveis_permitidas || null;
    }

    if (typeof content !== 'string' || content.length === 0) {
      return Response.json({ ok: false, erro: 'conteudo_vazio' }, { status: 400 });
    }

    const resultado = renderizar(content, dados, { preview, variaveisPermitidas });
    return Response.json({
      ...resultado,
      chave_unica: chave_unica || null,
      template_ativo: template ? template.is_active !== false : null,
      variaveis_aprovadas: VARIAVEIS_APROVADAS,
    });
  } catch (error) {
    return Response.json({ ok: false, erro: error.message }, { status: 500 });
  }
})(req);
}
