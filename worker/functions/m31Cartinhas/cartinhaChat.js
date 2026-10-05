import { carregarParticipantes, participanteDasCartinhas, destinatariaRequerConferencia } from './participantes.js';
import { titularRef, snapshotTitular } from './cartinhaIdentidade.js';
import { primeiroNomeCartinha, ehInscritaDaMeta } from './cartinhaPadrao.js';
import { diaCartinha, REGRA_CICLO_CARTINHAS } from './cartinhaCiclo.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CINCO_MIN = 5 * 60 * 1000;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const textoValido = texto => {
  if (typeof texto !== 'string' || !texto.trim() || texto.length > 50000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(texto)) fail(422, 'Escreva uma palavra de até 50 mil caracteres.');
  return texto.replace(/\r\n?/g, '\n');
};
export function candidataChat(row, filtros = {}) {
  if (!(ehInscritaDaMeta(row) && participanteDasCartinhas(row) && !destinatariaRequerConferencia(row))) return false;
  if (row.cartinha_conhecida_da_ju || row.cartinha_personalizada || row.duplicada_de_id || row.cadastro_pendente) return false;
  if ((row.cartinha_status || 'pendente') !== 'pendente' || String(row.cartinha_texto || '').trim() || row.cartinha_fisica_confirmada_em || row.cartinha_entrada_id) return false;
  if (filtros.excluir_comunidade === true && row.como_conheceu === 'Comunidade Mulheres de Fé') return false;
  if (filtros.excluir_caravanas === true && (row.tipo === 'caravana' || !!String(row.caravana_nome || '').trim())) return false;
  return true;
}
function filtrosValidos(f = {}) {
  if (!f || typeof f !== 'object' || Array.isArray(f)) fail(422, 'Filtro inválido.');
  return { excluir_comunidade: f.excluir_comunidade === true, excluir_caravanas: f.excluir_caravanas === true };
}
function aleatorio(n) {
  if (!Number.isSafeInteger(n) || n < 1) fail(409, 'Não há destinatárias elegíveis para este filtro.');
  const limite = Math.floor(0x100000000 / n) * n;
  let x; do { x = crypto.getRandomValues(new Uint32Array(1))[0]; } while (x >= limite);
  return x % n;
}
async function escolher(S, filtros, excluir = new Set()) {
  const data = await carregarParticipantes(S);
  const candidatas = data.inscricoes.filter(i => !excluir.has(i.id) && candidataChat(i, filtros));
  if (!candidatas.length) fail(409, 'Não há destinatárias elegíveis para este filtro.');
  return candidatas[aleatorio(candidatas.length)];
}
function itemPublico(entry) {
  const item = entry?.itens?.[0];
  if (!item) return null;
  return {
    entrada_id: entry.id, id_transacao: entry.lote_id, texto: entry.texto_original || entry.texto || '',
    estado: item.estado, destinataria_id: item.destinataria?.id || null,
    destinataria: item.destinataria?.primeiro_nome || '', nome_completo: item.destinataria?.nome || '',
    enviada_em: item.distribuida_em || entry.confirmado_em || entry.atualizada_em || entry.created_date,
    redirecionada: item.redirecionada === true, redirecionada_em: item.redirecionada_em || null,
    destinataria_anterior: item.destinataria_anterior?.primeiro_nome || '',
    pode_redirecionar_ate: item.pode_redirecionar_ate || null, erro: item.erro || '',
  };
}
async function buscarEntrada(S, user, id) {
  const row = await S.M31CartinhaEntrada.get(id);
  if (!row || row.autora_id !== user.id) fail(404, 'Envio não encontrado.');
  return row;
}
async function atualizarEntrada(S, row, patch) {
  const next = { ...patch, versao: (row.versao || 0) + 1 };
  const res = await S.M31CartinhaEntrada.updateMany({ id: row.id, autora_id: row.autora_id, versao: row.versao || 0 }, { $set: next });
  if (res?.updated !== 1) fail(409, 'Este envio mudou em outra sessão. Atualize e tente novamente.');
  return { ...row, ...next };
}
async function criarOuLer(S, user, body, now) {
  if (!UUID.test(body.id_transacao)) fail(422, 'Identificador de envio inválido.');
  const texto = textoValido(body.texto);
  const key = `${user.id}:chat:${body.id_transacao}`;
  const existing = (await S.M31CartinhaEntrada.filter({ dedup_key: key }, null, 1))[0];
  if (existing) {
    if ((existing.texto_original || '') !== texto) fail(409, 'Este envio já existe com outro conteúdo.');
    return { row: existing, created: false };
  }
  const filtros = filtrosValidos(body.filtros);
  try {
    const row = await S.M31CartinhaEntrada.create({
      autora_id:user.id, lote_id:body.id_transacao, dedup_key:key, texto_original:texto, texto,
      origem:'texto', estado:'rascunho', versao:0, itens:[], revisoes:[], filtros, atualizada_em:now(),
    });
    return { row, created: true };
  } catch (e) {
    const duplicate = (await S.M31CartinhaEntrada.filter({ dedup_key:key }, null, 1))[0];
    if (duplicate && duplicate.texto_original === texto) return { row: duplicate, created:false };
    throw e;
  }
}
export async function chatListar({ S, user }) {
  const rows = await S.M31CartinhaEntrada.filter({ autora_id:user.id }, '-created_date', 100);
  return { mensagens:(rows || []).map(itemPublico).filter(Boolean).filter(m => ['distribuida','redirecionada'].includes(m.estado) || m.redirecionada).reverse() };
}
export async function chatEnviar({ S, user, body, salvar, now = () => new Date().toISOString() }) {
  const configs = await S.EventoM31Config.list('created_date', 2);
  if (configs.length !== 1 || configs[0].cartinha_lote_liberado !== true) fail(422, 'Distribuição em conferência. Sua palavra não foi enviada.');
  let { row } = await criarOuLer(S,user,body,now);
  const existing = itemPublico(row);
  if (existing?.estado === 'distribuida') return { mensagem:existing, unchanged:true };
  const filtros = filtrosValidos(row.filtros || body.filtros);
  let pessoa, ref;
  const itemAtual = row.itens?.[0];
  if (itemAtual?.estado === 'reservada' && itemAtual.destinataria?.id) {
    pessoa = await S.EventoM31Inscricao.get(itemAtual.destinataria.id);
    if (!pessoa || !candidataChat(pessoa,filtros)) fail(409,'A destinatária reservada mudou. Tente novamente; sua palavra está preservada.');
    ref = await titularRef(pessoa);
    if (ref !== itemAtual.destinataria.titular_ref) fail(409,'A titular mudou. Sua palavra está preservada.');
  } else {
    pessoa = await escolher(S,filtros);
    ref = await titularRef(pessoa);
    const item = { id:crypto.randomUUID(), estado:'reservada', destinataria:{ id:pessoa.id, nome:pessoa.nome, primeiro_nome:primeiroNomeCartinha(pessoa.nome), titular_ref:ref, cartinha_versao:pessoa.cartinha_versao || 0 }, id_transacao:body.id_transacao };
    row = await atualizarEntrada(S,row,{ estado:'confirmando', itens:[item], confirmado_em:now(), atualizado_em:now() });
  }
  const item = row.itens[0];
  const res = await salvar({ inscricao_id:pessoa.id, texto:row.texto_original, status:'pronta', versao:pessoa.cartinha_versao || 0, titular_ref:ref, id_transacao:body.id_transacao, lote_id:body.id_transacao, suporte:'digital' },
    { entrada_id:row.id, item_id:item.id, origem:'chat', confirmado_em:row.confirmado_em });
  if (res.status !== 200) throw Object.assign(new Error(res.body?.error || 'Não foi possível enviar.'), { status:res.status });
  const timestamp = now();
  const finalItem = { ...item, estado:'distribuida', distribuida_em:timestamp, pode_redirecionar_ate:new Date(Date.parse(timestamp)+CINCO_MIN).toISOString(), erro:'' };
  row = await atualizarEntrada(S,row,{ estado:'concluida', itens:[finalItem], atualizado_em:timestamp });
  console.info(JSON.stringify({modulo:'cartinhas',evento:'chat_distribuido',id_transacao:body.id_transacao,inscricao_id:pessoa.id,em:timestamp}));
  return { mensagem:itemPublico(row), inscricao:res.body.inscricao };
}
export async function chatRedirecionar({ S, user, body, salvar, now = () => new Date().toISOString() }) {
  if (!UUID.test(body.id_transacao)) fail(422,'Identificador de redirecionamento inválido.');
  let row = await buscarEntrada(S,user,body.entrada_id);
  const item = row.itens?.[0];
  if (!item?.destinataria?.id || item.estado !== 'distribuida') {
    if (item?.redirecionada === true) return { mensagem:itemPublico(row), unchanged:true };
    fail(409,'Este envio não pode mais ser redirecionado.');
  }
  const agora = Date.parse(now());
  if (!item.pode_redirecionar_ate || agora > Date.parse(item.pode_redirecionar_ate)) fail(422,'O prazo de 5 minutos para redirecionar terminou.');
  const antiga = await S.EventoM31Inscricao.get(item.destinataria.id);
  if (!antiga) fail(409,'A destinatária original não foi encontrada.');
  const originalEvent = (antiga.cartinha_historico || []).find(h => h.id_transacao === row.lote_id);
  if (!originalEvent || antiga.cartinha_status !== 'pronta' || antiga.cartinha_versao !== originalEvent.versao || await titularRef(antiga) !== item.destinataria.titular_ref) fail(409,'A cartinha original mudou depois do envio. Abra a participante para revisar.');
  const filtros = filtrosValidos(row.filtros || {});
  const nova = await escolher(S,filtros,new Set([antiga.id]));
  const novaRef = await titularRef(nova);
  // Primeiro grava a nova cópia. Se falhar, a carta original permanece íntegra.
  const novoId = body.id_transacao;
  const novoRes = await salvar({ inscricao_id:nova.id, texto:row.texto_original, status:'pronta', versao:nova.cartinha_versao || 0, titular_ref:novaRef, id_transacao:novoId, lote_id:novoId, suporte:'digital' },
    { entrada_id:row.id, item_id:item.id, origem:'chat_redirecionado', confirmado_em:now() });
  if (novoRes.status !== 200) throw Object.assign(new Error(novoRes.body?.error || 'Não foi possível redirecionar.'),{status:novoRes.status});
  const ts=now();
  const compensacao={ id_transacao:body.id_transacao, motivo:'redirecionamento_conhecida', anula_id_transacao:row.lote_id, inscricao_id:antiga.id,
    titular_ref:item.destinataria.titular_ref, titular_anterior:snapshotTitular(antiga), texto:antiga.cartinha_texto, status:'pendente', versao:(antiga.cartinha_versao||0)+1,
    tipo_destinataria:'inscrita', autora_id:user.id, responsavel:user.full_name||user.email, atualizada_em:ts, arquivada_em:ts, regra_ciclo:REGRA_CICLO_CARTINHAS };
  const hist=[...(antiga.cartinha_historico||[]),compensacao];
  const dias=(antiga.cartinha_dias_concluidos||[]).filter(d=>d!==diaCartinha(originalEvent.atualizada_em));
  const reset=await S.EventoM31Inscricao.updateMany({ id:antiga.id, cartinha_versao:antiga.cartinha_versao, cartinha_status:'pronta', cartinha_texto:antiga.cartinha_texto },
    { $set:{ cartinha_texto:'', cartinha_status:'pendente', cartinha_versao:(antiga.cartinha_versao||0)+1, cartinha_dias_concluidos:dias,
      cartinha_conhecida_da_ju:true, cartinha_personalizada:true, cartinha_conhecida_titular_ref:item.destinataria.titular_ref,
      cartinha_entrada_id:null, cartinha_item_id:null, cartinha_modo:'nominal', cartinha_atualizada_em:ts, cartinha_titular:null,
      cartinha_historico:hist, cartinha_espelho_pendente:true } });
  if (reset?.updated !== 1) fail(409,'A nova destinatária recebeu a palavra, mas a anterior mudou durante o redirecionamento. A gestão precisa revisar este vínculo antes de continuar.');
  const finalItem={...item,estado:'redirecionada',redirecionada:true,redirecionada_em:ts,destinataria_anterior:item.destinataria,
    destinataria:{id:nova.id,nome:nova.nome,primeiro_nome:primeiroNomeCartinha(nova.nome),titular_ref:novaRef,cartinha_versao:novoRes.body.inscricao.cartinha_versao},id_transacao:novoId,distribuida_em:ts,pode_redirecionar_ate:null};
  row=await atualizarEntrada(S,row,{estado:'concluida',itens:[finalItem],atualizado_em:ts});
  console.info(JSON.stringify({modulo:'cartinhas',evento:'chat_redirecionado',entrada_id:row.id,inscricao_anterior:antiga.id,inscricao_nova:nova.id,em:ts}));
  return { mensagem:itemPublico(row), inscricao:novoRes.body.inscricao, conhecida_id:antiga.id };
}
