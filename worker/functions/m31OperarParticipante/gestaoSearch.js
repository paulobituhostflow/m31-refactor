// Somente leitura: variantes servem à pesquisa, nunca à identidade ou à escrita.
const digits = value => String(value ?? '').replace(/\D/g, '');
export const searchText = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 120);
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const accents = { a: '[aáàâãä]', e: '[eéèêë]', i: '[iíìîï]', o: '[oóòôõö]', u: '[uúùûü]', c: '[cç]', n: '[nñ]' };
const textPattern = value => [...searchText(value)].map(c => accents[c] || escape(c)).join('');
export const GESTAO_LIST_FIELDS = ['id','nome','whatsapp','email','cpf','cidade','estado','tipo','caravana_id','caravana_nome','duplicada_de_id','is_sample','classificacao_registro',
  'estado_canonico','status_pagamento','valor_pago','financeiro_status_provedor','financeiro_verificado_em','financeiro_evidencia','conferencia_dados_hash','conferida_manualmente','conferida_em','conferida_por_nome','conferida_por_email',
  'updated_date','codigo_inscricao','qrcode_token','qrcode_url','qr_envio_status','checkin_realizado','checkin_at','gestao_manual_pendente',
  'origem_inscricao','origem_pagamento','data_entrada_grupo','entrou_no_grupo_em','origem_confirmacao_grupo','data_envio_boas_vindas','fila_boas_vindas','estado_jornada','cartinha_status','camisa_status','email_envio_status','status_envio_grupo','entrou_no_grupo','presenteado_por_id','pagador_nome','cadastro_pendente'];

const namePattern = word => /[sz]$/.test(word)
  ? `(?:${textPattern(word)}|${textPattern(word.slice(0,-1))}[sz]\\b)` : textPattern(word);
const digitPattern = value => [...value].join('[^0-9]*');
const national = value => { const d = digits(value); return /^55\d{10,11}$/.test(d) ? d.slice(2) : d; };

export function phoneSearchVariants(value) {
  const p = national(value);
  const variants = new Set(p ? [p] : []);
  if (/^[1-9]\d[6-9]\d{7}$/.test(p)) variants.add(p.slice(0, 2) + '9' + p.slice(2));
  if (/^[1-9]\d9[6-9]\d{7}$/.test(p)) variants.add(p.slice(0, 2) + p.slice(3));
  return [...variants];
}

export function gestaoSearchQuery(ctx, input) {
  const text = searchText(input), numeric = /^[\d\s+()./-]+$/.test(text), d = digits(text);
  const query = { tipo: { $in: ['publico_geral', 'caravana', 'doacao', ...(text && ctx.areas.includes('voluntarias') ? ['voluntario'] : [])] }, classificacao_registro: { $ne: 'teste' } };
  if (ctx.caravana_restrita) query.caravana_id = { $in: ctx.session.caravana_ids_permitidas };
  if (!text) {
    query.duplicada_de_id = { $in: [null, ''] };
    query.$or = [{ estado_canonico: { $in: ['confirmada', 'isenta'] } }, { status_pagamento: { $in: ['aprovado','gratuito'] } }, { origem_inscricao: 'MANUAL', status_pagamento: 'pendente' }, { conferida_manualmente: true }, { entrou_no_grupo: true }, { data_entrada_grupo: { $exists: true, $nin: [null,''] } }, { entrou_no_grupo_em: { $exists: true, $nin: [null,''] } }];
  } else if (numeric && d.length >= 3) {
    query.$or = [
      { whatsapp: { $regex: phoneSearchVariants(text).map(digitPattern).join('|') } },
      { cpf: { $regex: digitPattern(d) } },
      { codigo_inscricao: { $regex: escape(text), $options: 'i' } },
    ];
  } else {
    const words = text.split(' ').filter(Boolean);
    query.$or = [
      { nome: { $regex: words.map(word => `(?=[\\s\\S]*${namePattern(word)})`).join('') + '[\\s\\S]*', $options: 'i' } },
      { email: { $regex: textPattern(text), $options: 'i' } },
      { codigo_inscricao: { $regex: textPattern(text), $options: 'i' } },
    ];
  }
  return query;
}

export function searchCorrespondence(row, input) {
  const text = searchText(input), d = digits(text);
  if (!text || !/^[\d\s+()./-]+$/.test(text) || d.length < 3) return null;
  if (digits(row.cpf).includes(d) || searchText(row.codigo_inscricao).includes(text)) return null;
  const stored = national(row.whatsapp), wanted = national(text);
  const matches = phoneSearchVariants(text).some(v => stored.includes(v));
  if (!matches) return null;
  if (stored === wanted) return { tipo: 'telefone', possivel: false };
  return { tipo: stored.includes(wanted) ? 'telefone_parcial' : 'telefone_aproximado', possivel: true,
    aviso: 'Possível correspondência por telefone incompleto. Confira os dados da inscrição; o número não comprova identidade.' };
}

const cache = new Map();
const TTL = 10000;
export function clearGestaoSearchCache() { cache.clear(); }
export async function cachedGestaoSearch(key, load, now = Date.now()) {
  const old = cache.get(key);
  if (old && old.until > now) return structuredClone(await old.promise);
  for (const [k, value] of cache) if (value.until <= now) cache.delete(k);
  if (cache.size >= 100) cache.delete(cache.keys().next().value);
  const entry = { until: now + TTL, promise: Promise.resolve().then(load) };
  cache.set(key, entry);
  try { return structuredClone(await entry.promise); }
  catch (error) { if (cache.get(key) === entry) cache.delete(key); throw error; }
}
