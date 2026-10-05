// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

// Autoridade existente: só evidências e campos canônicos. Nunca dispara,
// reprocessa webhook, altera pagamento, cancela cobrança ou apaga cadastros.
const TIPOS = new Set(['publico_geral', 'voluntario', 'caravana']);
const PAGOS = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED']);
const digitos = v => String(v || '').replace(/\D/g, '');
const nome = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
async function sha(v) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
async function identidade(r) { return sha(nome(r.nome) + '|' + digitos(r.cpf)); }
async function lerTudo(entity) {
  const result = new Map();
  for (let offset = 0; ; offset += 500) {
    const page = await entity.filter({}, '-created_date', 500, offset);
    for (const row of page) result.set(row.id, row);
    if (page.length < 500) return [...result.values()];
  }
}
function pessoaFallback(r) {
  const n = nome(r.nome);
  if (!n) return 'registro:' + r.id;
  const cpf = digitos(r.cpf);
  if (cpf.length === 11 && !/^(\d)\1+$/.test(cpf)) return 'identidade:' + cpf + ':' + n;
  // Telefone não é prova de identidade sozinho, nem requisito de elegibilidade.
  // Sem CPF, não fundir automaticamente: a matriz documental resolve vínculos.
  return 'registro:' + r.id;
}
function pago(p) {
  return p && !p.deleted && PAGOS.has(p.status) && Number(p.value) > 0 && !Number(p.refundedValue);
}
async function consultarAsaas(necessario) {
  if (!necessario) return [];
  const key = config('ASAAS_API_KEY');
  if (!key) throw new Error('ASAAS_API_KEY indisponível: conciliação não aplicada.');
  const all = new Map();
  for (let offset = 0; ; offset += 100) {
    if (offset > 100000) throw new Error('Consulta Asaas incompleta; nenhuma alteração aplicada.');
    const control = new AbortController();
    const timer = setTimeout(() => control.abort(), 20000);
    let response;
    try { response = await fetch('__ASAAS_API__/payments?limit=100&offset=' + offset,
      { headers: { access_token: key }, signal: control.signal }); }
    finally { clearTimeout(timer); }
    if (!response.ok) throw new Error('Consulta Asaas falhou: HTTP ' + response.status);
    const body = await response.json();
    if (!Array.isArray(body.data)) throw new Error('Resposta Asaas sem pagamentos; nenhuma alteração aplicada.');
    for (const p of body.data) all.set(p.id, p);
    if (!body.hasMore) return [...all.values()];
    if (body.data.length === 0) throw new Error('Paginação Asaas incompleta.');
  }
}
const saida = r => ({
  estado_canonico: r.estado_canonico || '', evidencia_canonica: r.evidencia_canonica || '',
  qualidade_evidencia: r.qualidade_evidencia || '',
  duplicada_de_id: r.duplicada_de_id || '', financia_vagas_ids: r.financia_vagas_ids || [],
});
// Qualidade da evidência (governança): dimensão separada do estado da vaga.
// DIRETA = âncora financeira verificável (Asaas/transação). HISTORICA_CONCILIADA =
// matriz documental/legado validada ou gratuidade formal. DIVERGENTE = conflito.
// AMBIGUA = presente sem alocação comprovada. SEM_EVIDENCIA = sem prova.
function qualidadeDe(estado, evid) {
  const e = String(evid || '');
  if (estado === 'confirmada') return e.startsWith('matriz_auditada:') ? 'historica_conciliada' : 'direta';
  if (estado === 'isenta') return 'historica_conciliada';
  if (e.startsWith('identidade_diverge') || e.startsWith('pagamento_sem_alocacao') || e.startsWith('duplicidade_comprovada')) return 'divergente';
  if (e.startsWith('presente_sem_alocacao')) return 'ambigua';
  return 'sem_evidencia';
}
const aguardarEscrita = ms => new Promise(resolve => setTimeout(resolve, ms));
const statusHttp = error => Number(error?.status ?? error?.statusCode ?? error?.response?.status) || null;
async function atualizarCanonicaComRetry(entity, query, update) {
  const esperas = [5000, 10000, 20000];
  for (let tentativa = 0; ; tentativa++) {
    try { return await entity.updateMany(query, update); }
    catch (error) {
      // Somente 429: preservar o mesmo CAS e payload evita duplicar uma escrita
      // eventualmente concluída antes de uma resposta ambígua do provedor.
      if (statusHttp(error) !== 429 || tentativa >= esperas.length) throw error;
      await aguardarEscrita(esperas[tentativa]);
    }
  }
}

return (async req => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.email) return Response.json({error:'unauthorized'}, {status:401});
    if (user.role !== 'admin') return Response.json({error:'forbidden'}, {status:403});
    const body = await req.json().catch(() => ({}));
    const S = base44.asServiceRole.entities;
    const [inscricoes, transacoes, pendencias] = await Promise.all([
      lerTudo(S.EventoM31Inscricao), lerTudo(S.M31TransacaoFinanceira), lerTudo(S.M31PendenciaConciliacao),
    ]);
    const porId = new Map(inscricoes.map(r => [r.id, r]));
    const duplicidadesManuais = new Map(
      pendencias
        .filter(p => p.tipo_registro === 'inscricao' && p.decisao === 'duplicidade_confirmada' && p.duplicidade_canonica_id && p.registro_id && p.registro_id !== p.duplicidade_canonica_id)
        .map(p => [p.registro_id, p.duplicidade_canonica_id])
    );
    const docs = new Map();
    const docInvalido = new Set();
    for (const p of pendencias) {
      const e = p.evidencia_validada;
      if (!e) continue;
      // A aceitação financeira não depende da pendência operacional de contato.
      const valida = e.versao === 1 && e.aceita === true && e.pessoa_id && /^[a-f0-9]{64}$/i.test(e.fonte_sha256 || '') &&
        Array.isArray(e.inscricoes) && Array.isArray(e.evidencias) && e.evidencias.some(v =>
          v.id && v.tipo && v.tipo !== 'RECEBIMENTO_EM_CONTA_NAO_NOVA_VENDA');
      for (const link of e.inscricoes || []) {
        const r = porId.get(link.id);
        if (!r) continue;
        if (!valida || link.identidade_hash !== await identidade(r)) { docInvalido.add(r.id); continue; }
        const prev = docs.get(r.id);
        if (prev && prev.pessoa_id !== e.pessoa_id) { docInvalido.add(r.id); docs.delete(r.id); continue; }
        docs.set(r.id, {...e, canonical_id:p.registro_id});
      }
    }
    const precisaAsaas = transacoes.some(t => /^pay_/.test(String(t.transaction_id)) && t.inscricao_id) || inscricoes.some(r => /^pay_/.test(r.asaas_payment_id || '') || r.asaas_installment_id) ||
      [...docs.values()].some(e => e.evidencias.some(v => /^pay_/.test(v.payment_id || '')));
    const pagamentos = await consultarAsaas(precisaAsaas);
    const porPagamento = new Map(pagamentos.map(p => [p.id, p]));
    const txPorRegistro = new Map();
    for (const t of transacoes) {
      if (!t.inscricao_id) continue;
      const list = txPorRegistro.get(t.inscricao_id) || [];
      list.push(t); txPorRegistro.set(t.inscricao_id, list);
    }
    const resultados = new Map();
    const claims = new Map();
    const grupoPessoa = new Map();
    const aliasDocumental = new Map();
    for (const r of inscricoes) {
      const d = docs.get(r.id), key = pessoaFallback(r);
      if (!d || docInvalido.has(r.id) || key.startsWith('registro:')) continue;
      const people = aliasDocumental.get(key) || new Set();
      people.add(d.pessoa_id); aliasDocumental.set(key,people);
    }
    function referenciaCompativel(r,p) {
      const ref = String(p.externalReference || '').trim().toUpperCase();
      return !ref || [String(r.id).toUpperCase(),String(r.codigo_inscricao || '').trim().toUpperCase()].filter(Boolean).includes(ref);
    }
    function evidencia(r) {
      const d = docs.get(r.id);
      if (d && !docInvalido.has(r.id)) {
        const evidencias = d.evidencias.filter(v => v.tipo !== 'RECEBIMENTO_EM_CONTA_NAO_NOVA_VENDA');
        const independentes = evidencias.filter(v => !/^pay_/.test(v.payment_id || ''));
        const asaas = evidencias.filter(v => /^pay_/.test(v.payment_id || ''));
        // Fontes históricas aceitas são prova; status aprovado/importação/telefone não são.
        // Para fonte Asaas, a situação atual do recebível prevalece sobre captura antiga.
        const asaasValido = asaas.length > 0 && asaas.every(v => pago(porPagamento.get(v.payment_id)));
        const historicoValido = independentes.some(v => {
          const ledger = transacoes.filter(t => String(t.transaction_id) === String(v.id).split(':').at(-1));
          return !ledger.some(t => t.status === 'cancelado');
        });
        if (historicoValido || asaasValido) {
          return {texto:'matriz_auditada:' + d.fonte_sha256 + ':' + d.pessoa_id,
            keys:historicoValido ? ['documento:' + d.pessoa_id] : asaas.map(v => 'asaas:' + v.payment_id)};
        }
      }
      const tx = (txPorRegistro.get(r.id) || []).filter(t =>
        t.status === 'pago' && Number(t.valor_bruto) > 0 && t.transaction_id &&
        (!t.status_conciliacao || t.status_conciliacao === 'vinculada'));
      const txAceitas = [...new Map(tx.filter(t => !/^pay_/.test(String(t.transaction_id)) ||
        (pago(porPagamento.get(t.transaction_id)) && referenciaCompativel(r,porPagamento.get(t.transaction_id))))
        .map(t => [(String(t.transaction_id).startsWith('pay_') ? 'asaas' : t.gateway) + ':' + t.transaction_id,t])).values()];
      const totalTx = txAceitas.reduce((s,t) => s + Number(/^pay_/.test(String(t.transaction_id)) ?
        porPagamento.get(t.transaction_id).value : t.valor_bruto),0);
      if (txAceitas.length && totalTx + 0.01 >= Number(r.valor_pago || 0)) {
        return {texto:'transacao_confirmada:' + txAceitas.map(t => (/^pay_/.test(String(t.transaction_id)) ? 'asaas' : t.gateway) + ':' + t.transaction_id).join('|'),
          keys:txAceitas.map(t => (/^pay_/.test(String(t.transaction_id)) ? 'asaas:' : t.gateway + ':') + t.transaction_id)};
      }
      const codigo = String(r.codigo_inscricao || '').trim().toUpperCase();
      const candidates = pagamentos.filter(p => pago(p) &&
        (p.id === r.asaas_payment_id || (r.asaas_installment_id && p.installment === r.asaas_installment_id) ||
          (codigo && String(p.externalReference || '').trim().toUpperCase() === codigo)) &&
        referenciaCompativel(r,p));
      if (candidates.length && candidates.reduce((s,p) => s + Number(p.value),0) + 0.01 >= Number(r.valor_pago || 0)) {
        return {texto:'asaas_confirmado:' + candidates.map(p => p.id).sort().join('|'),
          keys:candidates.map(p => 'asaas:' + p.id)};
      }
      return null;
    }
    for (const r of inscricoes) {
      const d = docs.get(r.id);
      const fallback = pessoaFallback(r), aliases = aliasDocumental.get(fallback);
      grupoPessoa.set(r.id, d && !docInvalido.has(r.id) ? 'documental:' + d.pessoa_id :
        aliases?.size === 1 ? 'documental:' + [...aliases][0] : fallback);
      let v;
      if (!TIPOS.has(r.tipo) || r.status_pagamento === 'cancelado' || r.classificacao_registro === 'teste' || /^TESTE[-_]/i.test(r.codigo_inscricao || '') || r.is_sample === true) {
        v = {estado:'fora_do_universo', evidencia:r.status_pagamento === 'cancelado' ? 'cancelada' : 'fora_do_evento'};
      } else if (docInvalido.has(r.id)) {
        v = {estado:'revisar', evidencia:'identidade_diverge_da_evidencia_documental'};
      } else {
        const prova = evidencia(r);
        if (prova) { v = {estado:'confirmada', evidencia:prova.texto}; claims.set(r.id, prova.keys); }
        else if (r.status_pagamento === 'gratuito' &&
          (r.origem_pagamento === 'gratuidade' || ['CORTESIA','VOLUNTARIO'].includes(r.origem_inscricao))) {
          v = {estado:'isenta', evidencia:'gratuidade_explicita'};
        } else if (r.status_pagamento === 'aprovado' || r.status_pagamento === 'gratuito' || d || r.presenteado_por_id) {
          v = {estado:'revisar', evidencia:r.presenteado_por_id ? 'presente_sem_alocacao_financeira_comprovada' : 'sem_evidencia_financeira'};
        } else {
          v = {estado:'pendente', evidencia:r.status_pagamento === 'checkout_abandonado' ? 'checkout_abandonado' : 'aguardando_pagamento'};
        }
      }
      resultados.set(r.id, v);
    }
    // PRESENTEAR vende duas vagas: receita na compradora, beneficiária valor zero.
    const presentes = new Map(), alocacoes = new Map();
    for (const guest of inscricoes) {
      const buyer = porId.get(guest.presenteado_por_id);
      if (!buyer || buyer.presenteado_id !== guest.id || !nome(guest.nome) ||
        grupoPessoa.get(guest.id) === grupoPessoa.get(buyer.id) || docInvalido.has(guest.id) ||
        resultados.get(guest.id).estado === 'fora_do_universo' || resultados.get(buyer.id).estado !== 'confirmada') continue;
      const keys = claims.get(buyer.id) || [];
      const recibos = pagamentos.filter(p => keys.includes('asaas:' + p.id) && pago(p));
      const totalCompra = Number(buyer.asaas_total_value || buyer.valor_pago || 0);
      if (totalCompra <= 0 || recibos.reduce((s,p)=>s + Number(p.value),0) + 0.01 < totalCompra) continue;
      resultados.set(guest.id,{estado:'confirmada',evidencia:'presente_confirmado:' + buyer.id + ':' + recibos.map(p=>p.id).sort().join('|')});
      claims.set(guest.id,keys);
      presentes.set(guest.id,buyer.id); presentes.set(buyer.id,guest.id);
      for (const key of keys) alocacoes.set(key,new Set([buyer.id,guest.id]));
    }
    // Eleição de um cadastro por pessoa comprovada. Não mistura compradora/presenteada.
    const grupos = new Map();
    for (const r of inscricoes) {
      if (resultados.get(r.id).estado === 'fora_do_universo') continue;
      const key = grupoPessoa.get(r.id), list = grupos.get(key) || [];
      list.push(r); grupos.set(key, list);
    }
    const rank = {confirmada:0,isenta:1,revisar:2,pendente:3,fora_do_universo:4};
    const duplicidades = [];
    for (const list of grupos.values()) {
      if (list.length < 2) continue;
      list.sort((a,b) => rank[resultados.get(a.id).estado] - rank[resultados.get(b.id).estado] ||
        Number(docs.get(b.id)?.canonical_id === b.id) - Number(docs.get(a.id)?.canonical_id === a.id) ||
        String(a.created_date || '').localeCompare(String(b.created_date || '')) || a.id.localeCompare(b.id));
      const canonical = list[0];
      for (const duplicate of list.slice(1)) {
        resultados.set(duplicate.id, {estado:'fora_do_universo', evidencia:'duplicidade_comprovada:' + canonical.id, duplicada_de:canonical.id});
      }
      duplicidades.push({inscricao_canonica:canonical.id,total_registros:list.length,descartadas:list.slice(1).map(r=>({id:r.id,resolucao:'nao_conta_vaga'}))});
    }
    // Decisões humanas explícitas de duplicidade têm precedência sobre a eleição automática.
    // A decisão nunca apaga histórico: apenas coloca o registro duplicado fora do universo
    // e aponta para a inscrição escolhida como canônica.
    for (const [duplicadaId, canonicaId] of duplicidadesManuais) {
      const duplicada = porId.get(duplicadaId);
      const canonica = porId.get(canonicaId);
      if (!duplicada || !canonica || duplicadaId === canonicaId) continue;
      if (resultados.get(canonicaId)?.estado === 'fora_do_universo' || canonica.status_pagamento === 'cancelado') continue;
      resultados.set(duplicadaId, {
        estado: 'fora_do_universo',
        evidencia: 'duplicidade_comprovada_manual:' + canonicaId,
        duplicada_de: canonicaId,
      });
      claims.delete(duplicadaId);
    }

    // Um mesmo recebível não financia pessoas distintas só porque foi copiado.
    const financeiros = new Map();
    for (const r of inscricoes) {
      if (resultados.get(r.id).estado !== 'confirmada') continue;
      for (const key of claims.get(r.id) || []) {
        const list = financeiros.get(key) || []; list.push(r); financeiros.set(key,list);
      }
    }
    const conflitos = [];
    for (const [key,list] of financeiros) {
      if (list.length < 2) continue;
      const alocada = alocacoes.get(key);
      const semAlocacao = alocada && [...alocada].every(id => list.some(r=>r.id===id)) ? list.filter(r=>!alocada.has(r.id)) : list;
      for (const r of semAlocacao) resultados.set(r.id, {estado:'revisar',evidencia:'pagamento_sem_alocacao_individual:' + key});
      if (semAlocacao.length) conflitos.push({ancora:key,participantes:semAlocacao.map(r=>({id:r.id,nome:r.nome})),decisao_humana:'Comprovar alocação; ID compartilhado não prova múltiplas vagas.'});
    }
    const contagem = {confirmada:0,isenta:0,pendente:0,revisar:0,fora_do_universo:0};
    const porQualidade = {direta:0,historica_conciliada:0,divergente:0,ambigua:0,sem_evidencia:0};
    const porTipo = {};
    const alteracoes = [];
    for (const r of inscricoes) {
      const v = resultados.get(r.id);
      contagem[v.estado]++;
      porQualidade[qualidadeDe(v.estado, v.evidencia)]++;
      porTipo[r.tipo] ||= {confirmada:0,isenta:0,pendente:0,revisar:0,fora_do_universo:0};
      porTipo[r.tipo][v.estado]++;
      const depois = {estado_canonico:v.estado,evidencia_canonica:v.evidencia,qualidade_evidencia:qualidadeDe(v.estado,v.evidencia),duplicada_de_id:v.duplicada_de || '',financia_vagas_ids:presentes.has(r.id) && v.estado==='confirmada' && resultados.get(presentes.get(r.id)).estado==='confirmada' ? [presentes.get(r.id)] : []};
      if (JSON.stringify(saida(r)) !== JSON.stringify(depois)) alteracoes.push({id:r.id,antes:saida(r),depois,updated_date:r.updated_date});
    }
    const entradaHash = inscricoes.map(r => [r.id,r.nome,r.cpf,r.tipo,r.status_pagamento,r.origem_pagamento,
      r.origem_inscricao,r.valor_pago,r.asaas_payment_id,r.asaas_installment_id,r.codigo_inscricao,r.created_date,
      r.presenteado_id,r.presenteado_por_id,r.asaas_total_value,r.classificacao_registro,r.is_sample]).sort((a,b)=>a[0].localeCompare(b[0]));
    const planHash = await sha(JSON.stringify([entradaHash,transacoes.map(t=>[t.id,t.inscricao_id,t.transaction_id,t.gateway,t.status,t.status_conciliacao,t.valor_bruto]).sort(),
      pendencias.map(p=>[p.id,p.registro_id,p.tipo_registro,p.status_analise,p.evidencia_validada || null]).sort(),
      pagamentos.filter(p => [...claims.values()].some(keys=>keys.includes('asaas:' + p.id)) || inscricoes.some(r=>r.asaas_payment_id === p.id || r.asaas_installment_id && r.asaas_installment_id === p.installment) ||
        [...docs.values()].some(d=>d.evidencias.some(e=>e.payment_id === p.id))).map(p=>[p.id,p.status,p.value,p.deleted,p.refundedValue,p.externalReference,p.installment]).sort()]));
    let gravados = 0;
    const aplicadas = [];
    let interrupcaoAplicacao = null;
    if (body.aplicar === true) {
      if (body.plano_hash !== planHash) return Response.json({error:'simulacao_obrigatoria_ou_dados_alterados',plano_hash:planHash}, {status:409});
      if (!Array.isArray(body.ids) || body.ids.length > 100) return Response.json({error:'informe_ids_do_lote_maximo_100'}, {status:400});
      const ids = new Set(body.ids);
      for (const change of alteracoes.filter(c=>ids.has(c.id))) {
        if (aplicadas.length) await aguardarEscrita(350);
        const data = {...change.depois,canonica_calculada_em:new Date().toISOString()};
        try {
          const result = await atualizarCanonicaComRetry(S.EventoM31Inscricao,
            {id:change.id,updated_date:change.updated_date}, {$set:data});
          const resultado = result?.updated === 1 ? 'aplicado' : 'concorrencia_detectada';
          if (result?.updated === 1) gravados++;
          aplicadas.push({id:change.id,resultado});
          logger.log(JSON.stringify({operacao:'conciliacao_canonica',id:change.id,resultado,
            antes:change.antes,depois:change.depois,plano_hash:planHash,autor:user.email}));
        } catch (error) {
          const httpStatus = statusHttp(error);
          interrupcaoAplicacao = {id:change.id,etapa:'updateMany',http_status:httpStatus,
            codigo:httpStatus === 429 ? 'limite_taxa_esgotado' : 'falha_atualizacao'};
          aplicadas.push({id:change.id,resultado:'falha_atualizacao',http_status:httpStatus});
          logger.log(JSON.stringify({operacao:'conciliacao_canonica',id:change.id,resultado:'falha_atualizacao',
            http_status:httpStatus,antes:change.antes,depois:change.depois,plano_hash:planHash,autor:user.email}));
          break; // Não iniciar os próximos IDs após erro; nenhum replay automático.
        }
      }
    }
    const canonicas = inscricoes.length - contagem.fora_do_universo;
    const semProva = inscricoes.filter(r=>resultados.get(r.id).evidencia === 'sem_evidencia_financeira');
    return Response.json({
      modo:body.aplicar === true ? (interrupcaoAplicacao || aplicadas.some(r=>!r.resultado.startsWith('aplicado')) ? 'aplicacao_parcial' : 'aplicado') : 'simulacao',calculado_em:new Date().toISOString(),registros_lidos:inscricoes.length,
      resposta_oficial:{vagas_oficiais:contagem.confirmada + contagem.isenta,confirmadas_financeiramente:contagem.confirmada,
        isentas_gratuitas:contagem.isenta,pendentes:contagem.pendente,em_revisao:contagem.revisar,
        inscricoes_canonicas:canonicas,fora_do_universo:contagem.fora_do_universo,
        fecha_matematicamente:Object.values(contagem).reduce((a,b)=>a+b,0)===inscricoes.length},
      por_tipo:porTipo,por_qualidade_evidencia:porQualidade,duplicidades:{grupos:duplicidades.length,detalhe:duplicidades},
      compras_multi_vaga:{total:[...presentes.keys()].filter(id=>porId.get(id)?.presenteado_id && resultados.get(id).estado==='confirmada').length,detalhe:[...presentes].filter(([id])=>porId.get(id)?.presenteado_id && resultados.get(id).estado==='confirmada').map(([id,guest])=>({compradora_id:id,presenteada_id:guest,vagas:2}))},alocacoes_financeiras_em_revisao:conflitos,
      pagamentos_sem_inscricao:{total:transacoes.filter(t=>t.status==='pago'&&!t.inscricao_id).length,detalhe:[]},
      inscricoes_sem_evidencia:{total:semProva.length,detalhe:semProva.map(r=>({id:r.id,nome:r.nome,tipo:r.tipo}))},
      presenteadas_vinculo_quebrado:{total:inscricoes.filter(r=>r.presenteado_por_id&&resultados.get(r.id).estado==='revisar').length,detalhe:[]},
      pagamento_possivelmente_duplicado:{total:null,status:'nao_auditado_nesta_execucao',detalhe:[]},
      plano_hash:planHash,alteracoes_pendentes:alteracoes.length,alteracoes:body.detalhar ? alteracoes : undefined,
      registros_atualizados:gravados,resultados_aplicacao:aplicadas,
      aplicacao_interrompida:interrupcaoAplicacao,
    });
  } catch(e) { return Response.json({error:e.message}, {status:500}); }
})(req);
}
