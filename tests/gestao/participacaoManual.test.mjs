// Regressão: cadastro mínimo, identidade por inscrição, QR e elegibilidade de check-in.
// Tudo em memória: nenhuma cobrança, mensagem ou escrita real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operarParticipante } from '../../worker/functions/m31OperarParticipante/core.js';
import { clearGestaoSearchCache } from '../../worker/functions/m31OperarParticipante/gestaoSearch.js';

const future = new Date(Date.now() + 3600000).toISOString();
const copy = v => JSON.parse(JSON.stringify(v));
function cond(value, c) {
  if (c && typeof c === 'object' && !Array.isArray(c)) {
    if ('$in' in c) return c.$in.some(v => v === null ? value == null : v === value); // Mongo inclui campo ausente ao consultar null.
    if ('$ne' in c) return value !== c.$ne;
    if ('$regex' in c) return new RegExp(c.$regex, c.$options || '').test(String(value ?? ''));
  }
  return c === null ? value == null : value === c;
}
const matches = (row, f = {}) => Object.entries(f).every(([k, c]) => k === '$or' ? c.some(x => matches(row, x)) : cond(row[k], c));
function entity(seed = []) {
  const rows = seed.map(copy); let n = 0;
  return { rows,
    async filter(f = {}) { return rows.filter(r => matches(r, f)).map(copy); },
    async list() { return rows.map(copy); },
    async get(id) { const r = rows.find(x => x.id === id); if (!r) throw new Error('not_found'); return copy(r); },
    async create(d) { const r = { id: `new_${++n}_${rows.length}`, updated_date: new Date().toISOString(), ...copy(d) }; rows.push(r); return copy(r); },
    async update(id, p) { const r = rows.find(x => x.id === id); Object.assign(r, copy(p)); return copy(r); },
    async delete(id) { rows.splice(rows.findIndex(x => x.id === id), 1); },
    async updateMany(f, { $set }) { const hit = rows.filter(r => matches(r, f)); hit.forEach(r => Object.assign(r, copy($set), { updated_date: new Date(Date.now() + 1).toISOString() })); return { updated: hit.length }; },
  };
}
function client(seed = []) {
  clearGestaoSearchCache(); // Cada fixture representa um banco isolado.
  const E = {
    EventoM31Inscricao: entity(seed), M31PendenciaConciliacao: entity(), EventoM31ActionLog: entity(), M31GestaoRequisicao: entity(),
    EventoM31Caravana: entity([{ id: 'car_1', nome: 'Recife', ativa: true }]),
    EventoM31Membro: entity([{ id: 'm1', user_email: 'op@example.com', perfil: 'gestao_operacional', ativo: true, operacoes_permitidas: ['inscritas', 'caravanas'] }]),
    M31OperacaoSessao: entity([{ id: 's1', session_id: 'sess', auth_email: 'op@example.com', operacoes_permitidas: ['inscritas', 'caravanas'], ativa: true, expires_at: future }]),
  };
  const invoked = [];
  return { E, invoked, sdk: { auth: { me: async () => ({ id: 'u1', email: 'op@example.com' }) }, asServiceRole: { entities: E, functions: { invoke: async (name) => { invoked.push(name); return { data: { success: true } }; } } } } };
}
const PAGA = { id: 'ins_paga', nome: 'Maria Souza', whatsapp: '5581999990000', cpf: '52998224725', email: 'maria@example.com', tipo: 'publico_geral', status_pagamento: 'aprovado', estado_canonico: 'confirmada', asaas_payment_id: 'pay_1', valor_pago: 150, codigo_inscricao: 'M31-PAGA0001', updated_date: '2026-10-01T00:00:00.000Z' };

test('manual release is confirmed while payment remains pending and legacy filters stay available',async()=>{
 const base={...PAGA,id:'manual',status_pagamento:'pendente',estado_canonico:'nao_confirmada',valor_pago:0};
 const c=client([base,{...base,id:'pending',nome:'Pendente',origem_inscricao:'MANUAL'},PAGA]);
 await operarParticipante(c.sdk,{action:'conferir',id:'manual',session_id:'sess',expected_version:base.updated_date});
 const confirmed=await operarParticipante(c.sdk,{action:'listar',filtro:'confirmadas',session_id:'sess'});
 assert.deepEqual(confirmed.items.map(r=>r.id).sort(),['ins_paga','manual']);
 const row=confirmed.items.find(r=>r.id==='manual');
 assert.equal(row.participacao.label,'Participação confirmada');assert.equal(row.participacao.manual,true);
 assert.equal(row.status_pagamento,'pendente');assert.equal(row.estado_canonico,'confirmada');assert.equal(row.valor_pago,0);
 const awaiting=await operarParticipante(c.sdk,{action:'listar',filtro:'aguardando_confirmacao',session_id:'sess'});
 assert.deepEqual(awaiting.items.map(r=>r.id),['pending']);
 assert.equal(c.invoked.length,0);
 const legacy=await operarParticipante(c.sdk,{action:'listar',filtro:'regularizadas',session_id:'sess'});
 assert.equal(legacy.total,0);
});

test('invalidated manual conference does not release a pending registration',async()=>{
 const c=client([{...PAGA,id:'invalid',origem_inscricao:'MANUAL',status_pagamento:'pendente',estado_canonico:'nao_confirmada',conferida_manualmente:true,conferencia_dados_hash:'outdated'}]);
 const r=await operarParticipante(c.sdk,{action:'listar',session_id:'sess',filtro:'aguardando_confirmacao'});
 assert.equal(r.total,1);assert.equal(r.items[0].participacao.confirmed,false);
});

test('nome e telefone bastam para validação autorizada, sem CPF, e-mail, cidade ou Asaas',async()=>{
 const base={...PAGA,id:'minimal',nome:'Nome Validado',whatsapp:'5581999990000',cpf:null,email:null,cidade:'',estado:'',
  status_pagamento:'pendente',estado_canonico:'pendente',asaas_payment_id:null,origem_pagamento:'stone'};
 const c=client([base]);
 const result=await operarParticipante(c.sdk,{action:'conferir',id:base.id,session_id:'sess',expected_version:base.updated_date});
 assert.equal(result.inscricao.status_inscricao,'confirmada');assert.equal(result.inscricao.participacao.confirmed,true);
 const saved=c.E.EventoM31Inscricao.rows[0];
 assert.equal(saved.status_pagamento,'pendente');assert.equal(saved.estado_canonico,'confirmada');assert.equal(saved.origem_pagamento,'stone');
 assert.equal(saved.evidencia_canonica,'validacao_manual:gestao:u1');
 const log=c.E.EventoM31ActionLog.rows[0];
 assert.equal(log.resultado,'sucesso');assert.equal(log.user_id,'u1');
 assert.equal(JSON.parse(log.dados_anteriores).estado_canonico,'pendente');assert.equal(JSON.parse(log.dados_novos).estado_canonico,'confirmada');
 assert.equal(saved.asaas_payment_id,null);assert.equal(saved.nome,base.nome);assert.equal(saved.whatsapp,base.whatsapp);assert.equal(c.invoked.length,0);
});

test('validação manual persiste a confirmação sem reabrir inscrições canceladas ou duplicadas',async()=>{
 for(const patch of [{status_pagamento:'cancelado'},{estado_canonico:'fora_do_universo'},{duplicada_de_id:'original'},{tipo:'doacao'}]) {
  const base={...PAGA,id:'excluded',...patch},c=client([base]);
  await assert.rejects(operarParticipante(c.sdk,{action:'conferir',id:base.id,session_id:'sess',expected_version:base.updated_date}),e=>e.code==='PARTICIPATION_UNAVAILABLE');
  assert.deepEqual(c.E.EventoM31Inscricao.rows[0],base);
 }
});

test('validação manual não exige corrigir CPF legado quando nome e telefone estão presentes',async()=>{
 const base={...PAGA,id:'legacy_cpf',cpf:'legado-invalido',status_pagamento:'pendente',estado_canonico:'pendente',origem_pagamento:'mercado_pago'};
 const c=client([base]);
 const result=await operarParticipante(c.sdk,{action:'conferir',id:base.id,session_id:'sess',expected_version:base.updated_date});
 assert.equal(result.inscricao.status_inscricao,'confirmada');assert.equal(c.E.EventoM31Inscricao.rows[0].cpf,'legado-invalido');
 assert.equal(c.E.EventoM31Inscricao.rows[0].origem_pagamento,'mercado_pago');assert.equal(c.invoked.length,0);
});

test('sem nome ou telefone a validação informa os dois dados mínimos, sem inventá-los',async()=>{
 for(const patch of [{nome:''},{whatsapp:''}]) {
  const base={...PAGA,id:'incomplete',...patch},c=client([base]);
  await assert.rejects(operarParticipante(c.sdk,{action:'conferir',id:base.id,session_id:'sess',expected_version:base.updated_date}),e=>e.code==='NAME_PHONE_REQUIRED');
  assert.equal(c.E.EventoM31Inscricao.rows[0].conferida_manualmente,undefined);
 }
});
