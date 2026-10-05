import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleCartinhas } from '../worker/functions/m31Cartinhas/cartinhaService.js';
import { titularRef } from '../worker/functions/m31Cartinhas/cartinhaIdentidade.js';
import { candidataLivre } from '../worker/functions/m31Cartinhas/cartinhaDistribuicao.js';
import { ASSINATURA_CARTINHA, primeiroNomeCartinha, formatarCartinhaConcluida, ehInscritaDaMeta } from '../worker/functions/m31Cartinhas/cartinhaPadrao.js';
import { normalizarCartinhaImpressao } from '../src/components/m31/cartinhas/cartinhaImpressao.js';
import { metaDiariaCartinhas, concluidasHoje } from '../src/components/m31/cartinhas/cartinhaMetas.js';
import { CABECALHO, linhaEvento } from '../worker/functions/m31CartinhasEspelho/espelhoService.js';
import { createCartinhaAutosave } from '../src/components/m31/cartinhas/cartinhaAutosave.js';

const user = { id: 'autora-sintetica', email: 'autora@example.invalid', full_name: 'Autora sintética' };
const base = (id, tipo = 'publico_geral') => ({ id, tipo, nome: `Amanda Souza ${id}`, estado_canonico: 'confirmada', status_pagamento: 'aprovado', cartinha_status: 'pendente', cartinha_versao: 0, cartinha_texto: '' });
function match(row, q) {
  return Object.entries(q).every(([k,v]) => {
    if (k === '$or') return v.some(x => match(row, x));
    if (v && typeof v === 'object') {
      if ('$ne' in v) return row[k] !== v.$ne;
      if ('$exists' in v) return (row[k] !== undefined) === v.$exists;
    }
    return v === null ? row[k] == null : row[k] === v;
  });
}
function fixture(rows = [base('a'), base('b','caravana'), base('v','voluntario')]) {
  const db = new Map(rows.map(r => [r.id, structuredClone(r)]));
  let writes = 0;
  const S = {
    EventoM31Config: { list: async () => [{ id: 'config', cartinha_autora_user_id: user.id }] },
    EventoM31Membro: { filter: async () => [{ user_email: user.email, ativo: true }] },
    EventoM31Inscricao: {
      filter: async (q, sort, limit = 500, skip = 0) => [...db.values()].filter(r => match(r,q)).slice(skip, skip+limit).map(r=>structuredClone(r)),
      get: async id => db.has(id) ? structuredClone(db.get(id)) : null,
      updateMany: async (q, change) => {
        const row = db.get(q.id);
        if (!row || !match(row,q)) return { updated: 0 };
        db.set(row.id, { ...row, ...structuredClone(change.$set) }); writes++; return { updated: 1 };
      },
    },
  };
  return { S, db, writes: () => writes, call: body => handleCartinhas({ S, user, body, now: () => '2026-09-23T12:00:00Z' }) };
}
async function payload(row, extra={}) {
  return { action:'salvar', inscricao_id:row.id, texto:'Que a paz de Deus acompanhe seus passos.', status:'pronta', versao:row.cartinha_versao, titular_ref:await titularRef(row), id_transacao:crypto.randomUUID(), ...extra };
}

test('primeiro nome é somente o primeiro token, incluindo acentos', () => {
  assert.equal(primeiroNomeCartinha('   AMANDA Souza Silva  '), 'Amanda');
  assert.equal(primeiroNomeCartinha('Ágatha Maria de Souza'), 'Ágatha');
  assert.equal(primeiroNomeCartinha('Ana Maria'), 'Ana');
});
test('conclusão aplica saudação e assinatura canônica exatamente uma vez', () => {
  const r = formatarCartinhaConcluida({ nomeCompleto:'Amanda Souza Silva', texto:'Você é amada.\n\nPermaneça firme.' });
  assert.equal(r,'Querida Amanda,\n\nVocê é amada.\n\nPermaneça firme.\n\nPra. Ju Beltrão');
  assert.equal(formatarCartinhaConcluida({nomeCompleto:'Amanda Souza Silva',texto:r}),r);
});
test('normaliza assinatura legada final sem mexer no corpo', () => {
  const r = formatarCartinhaConcluida({nomeCompleto:'Amanda Souza Silva',texto:'Querida Amanda Souza Silva,\n\nUm texto que cita Ju no corpo.\n\nJu'});
  assert.equal(r,'Querida Amanda,\n\nUm texto que cita Ju no corpo.\n\nPra. Ju Beltrão');
});
test('não mascara uma saudação destinada a outra mulher', () => {
  assert.throws(()=>formatarCartinhaConcluida({nomeCompleto:'Amanda Souza Silva',texto:'Querida Maria,\n\nTexto.'}),e=>e.status===422);
});
test('nome ausente e assinatura sem corpo não geram carta pronta', () => {
  assert.throws(()=>formatarCartinhaConcluida({nomeCompleto:'',texto:'Texto'}),e=>e.status===422);
  assert.throws(()=>formatarCartinhaConcluida({nomeCompleto:'Amanda',texto:ASSINATURA_CARTINHA}),e=>e.status===422);
});
test('texto grande não é truncado para caber a assinatura', () => {
  assert.throws(()=>formatarCartinhaConcluida({nomeCompleto:'Amanda',texto:'A'.repeat(50000)}),e=>e.status===422);
});
test('lista padrão exclui voluntárias; consulta secundária retorna apenas equipe', async () => {
  const f=fixture();
  const a=await f.call({action:'listar'}), b=await f.call({action:'listar_voluntarias'});
  assert.equal(a.status,200); assert.deepEqual(a.body.inscricoes.map(i=>i.id),['a','b']);
  assert.equal(a.body.escopo,'inscritas'); assert.deepEqual(b.body.inscricoes.map(i=>i.id),['v']);
  assert.equal(b.body.escopo,'voluntarias'); assert.equal(f.writes(),0);
});
test('voluntária jamais participa do sorteio mesmo estando sem carta', () => {
  assert.equal(candidataLivre(base('a')),true);
  assert.equal(candidataLivre(base('v','voluntario')),false);
});
test('conclusão da equipe salva assinatura mas não adiciona dia à meta', async () => {
  const f=fixture(); const row=f.db.get('v');
  const res=await f.call(await payload(row,{tipo_destinataria:'inscrita'}));
  assert.equal(res.status,200); const v=f.db.get('v');
  assert.equal(v.cartinha_status,'pronta'); assert.ok(v.cartinha_texto.endsWith('\n'+ASSINATURA_CARTINHA));
  assert.deepEqual(v.cartinha_dias_concluidos,[]);
  assert.equal(v.cartinha_historico.at(-1).tipo_destinataria,'voluntaria');
  assert.equal(concluidasHoje([...f.db.values()],'2026-09-23'),0);
});
test('conclusão de inscrita conta uma vez; replay não duplica assinatura nem evento', async () => {
  const f=fixture(); const p=await payload(f.db.get('a'));
  await f.call(p); await f.call(p);
  const row=f.db.get('a'); assert.equal(f.writes(),1);
  assert.equal(row.cartinha_texto.split(ASSINATURA_CARTINHA).length-1,1);
  assert.equal(row.cartinha_historico.length,1); assert.equal(row.cartinha_historico[0].texto_original,p.texto);
  assert.equal(concluidasHoje([...f.db.values()],'2026-09-23'),1);
});
test('dias históricos da equipe não entram no contador de inscritas', () => {
  assert.equal(concluidasHoje([{...base('v','voluntario'),cartinha_dias_concluidos:['2026-09-23']}],'2026-09-23'),0);
});
test('meta macro usa mil planejadas; quantidade real e equipe não alteram a fórmula', () => {
  assert.equal(metaDiariaCartinhas({cartinha_data_evento:'2026-09-25'},0,'2026-09-23',10,0),500);
  assert.equal(metaDiariaCartinhas({cartinha_data_evento:'2026-09-25'},2,'2026-09-23',10,2),499);
  assert.equal(metaDiariaCartinhas({cartinha_data_evento:'2026-09-25'},0,'2026-09-23',0),500);
  assert.equal(ehInscritaDaMeta(base('v','voluntario')),false);
});
test('espelho registra flag voluntaria e o texto já assinado sem repetir assinatura', async () => {
  const f=fixture(); await f.call(await payload(f.db.get('v')));
  const e=f.db.get('v').cartinha_historico.at(-1), line=linhaEvento(e,'v');
  assert.equal(line.length,CABECALHO.length);
  assert.equal(line[CABECALHO.indexOf('tipo_destinataria')],'voluntaria');
  assert.equal(line[CABECALHO.indexOf('assinatura')],ASSINATURA_CARTINHA);
  assert.equal(line[CABECALHO.indexOf('texto')],e.texto);
});
test('impressão mantém primeiro nome no cabeçalho e nome completo no identificador', () => {
  const c=normalizarCartinhaImpressao({id:'a',nome:'Amanda Souza Silva',codigo_inscricao:'M31-123',cartinha_texto:'Querida Amanda,\n\nVocê é amada.\n\nPra. Ju Beltrão'});
  assert.equal(c.saudacao,'Querida Amanda,'); assert.equal(c.nomeCompleto,'Amanda Souza Silva');
  assert.equal(c.codigo,'M31-123'); assert.equal(c.assinatura,ASSINATURA_CARTINHA);
  assert.deepEqual(c.paragrafos,['Você é amada.']);
});
test('retorno com assinatura automática não dispara ciclo de autosave', async () => {
  const f=fixture(); const raw=f.db.get('a');
  const c=createCartinhaAutosave({inscricao:{...raw,titular_ref:await titularRef(raw)},save:async body=>(await f.call({action:'salvar',...body})).body.inscricao,setTimer:()=>1,clearTimer:()=>{}});
  await c.ready; c.edit('Texto colado.'); await c.save('pronta');
  assert.equal(c.getSnapshot().dirty,false); assert.ok(c.getSnapshot().text.endsWith(ASSINATURA_CARTINHA));
  await c.reconnect(); assert.equal(f.writes(),1); c.dispose();
});
test('marca d’água usa ativo local oficial e equipe não importa sorteio nem metas', () => {
  const p=readFileSync(new URL('../src/components/m31/cartinhas/M31CartinhasPrint.jsx',import.meta.url),'utf8');
  const v=readFileSync(new URL('../src/components/m31/cartinhas/CartinhaVoluntarias.jsx',import.meta.url),'utf8');
  assert.ok(p.includes('m31cp-identificacao')); assert.ok(p.includes('align-items:flex-end'));
  assert.ok(p.includes('m31cp-marca')); assert.ok(v.includes('listarVoluntarias'));
  assert.ok(!v.includes('<CartinhaMetaDia')); assert.ok(!v.includes('entrada_previa'));
  const bytes=readFileSync(new URL('../public/m31-cartinhas-marca.png',import.meta.url));
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
});
