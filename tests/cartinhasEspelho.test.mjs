// Testes sintéticos locais: espelho privado no Google Sheets e recuperação
// offline de rascunhos. Nenhuma chamada real ao banco, à IA ou ao Google.
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  NOME_PLANILHA, CABECALHO, identificadorEvento, eventosParaEspelhar,
  linhaEvento, processarEspelho,
} from '../worker/functions/m31CartinhasEspelho/espelhoService.js';
import { sincronizarRascunhos } from '../src/components/m31/cartinhas/cartinhaSincronizacao.js';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const AGORA = () => '2026-09-23T12:00:00.000Z';
const eventoSalvamento = (id = crypto.randomUUID()) => ({
  id_transacao: id, request_hash: 'h'.repeat(12), inscricao_id: 'insc-1',
  titular_ref: 'a'.repeat(64), motivo: 'salvamento', texto: '=SOMA(A1) Querida amiga…', status: 'em_elaboracao',
  versao: 1, responsavel: 'Autora teste', atualizada_em: AGORA(), arquivada_em: AGORA(),
});

function ambiente({ rows = [], recusarCas = false } = {}) {
  const banco = new Map(rows.map(r => [r.id, structuredClone(r)]));
  const anexos = [];
  let falharProximoAnexo = false;
  const S = {
    EventoM31Inscricao: {
      filter: async () => [...banco.values()].filter(r => r.cartinha_espelho_pendente === true).map(r => structuredClone(r)),
      get: async id => banco.has(id) ? structuredClone(banco.get(id)) : null,
      updateMany: async (q, u) => {
        const row = banco.get(q.id);
        if (!row || recusarCas) return { updated: 0 };
        const casado = q.cartinha_versao === undefined
          || q.cartinha_versao === row.cartinha_versao
          || (q.$or && (row.cartinha_versao === 0 || row.cartinha_versao == null));
        if (!casado) return { updated: 0 };
        Object.assign(row, structuredClone(u.$set));
        return { updated: 1 };
      },
    },
    M31AutomacaoLock: { filter: async () => [], create: async () => ({}), updateMany: async () => ({ updated: 1 }) },
  };
  const sheets = {
    ids: new Set(),
    batches: 0,
    async garantirEstrutura() {},
    async lerIds() { return [...this.ids]; },
    async anexar(_id, linhas) {
      this.batches++;
      for (const l of linhas) this.ids.add(l[0]);
      anexos.push(...linhas);
      if (falharProximoAnexo) { falharProximoAnexo = false; throw new Error('timeout'); }
    },
    falharProximoAnexo() { falharProximoAnexo = true; },
  };
  const drive = {
    async buscarPlanilha() { return { id: 'planilha-1', nome: NOME_PLANILHA, link: 'https://planilha', criada: false }; },
    async criarPlanilha() { throw new Error('já existe'); },
    async concederLeitura() { return true; },
  };
  return { S, sheets, drive, banco, anexos: () => anexos };
}

const rowComEvento = (evento = eventoSalvamento()) => ({
  id: 'insc-1', nome: 'Participante', cpf: '12345678901', cartinha_versao: 1,
  cartinha_texto: evento.texto, cartinha_status: 'em_elaboracao',
  cartinha_historico: [evento], cartinha_espelho_pendente: true,
});

test('linha do espelho tem as colunas do cabeçalho e não exporta CPF/contato', () => {
  const evento = eventoSalvamento();
  const linha = linhaEvento(evento, 'insc-1');
  assert.equal(linha.length, CABECALHO.length);
  assert.equal(linha[0], evento.id_transacao);
  assert.equal(linha[2], evento.titular_ref);
  assert.ok(!linha.join('|').includes('12345678901'));
  assert.ok(linha[8].startsWith('=SOMA')); // texto íntegro; RAW impede interpretação como fórmula
});

test('espelha cada evento uma única vez, marca o evento e limpa a pendência', async () => {
  const a = ambiente({ rows: [rowComEvento()] });
  const r = await processarEspelho({ S: a.S, drive: a.drive, sheets: a.sheets, agora: AGORA });
  assert.equal(r.ok, true); assert.equal(r.situacao, 'processado'); assert.equal(r.espelhados, 1); assert.equal(r.limpas, 1);
  const row = a.banco.get('insc-1');
  assert.equal(row.cartinha_historico[0].espelhado_em, AGORA());
  assert.equal(row.cartinha_espelho_pendente, false);
  assert.equal(a.anexos().length, 1);
});

test('reprocessar não duplica linhas nem eventos', async () => {
  const a = ambiente({ rows: [rowComEvento()] });
  await processarEspelho({ S: a.S, drive: a.drive, sheets: a.sheets, agora: AGORA });
  const segunda = await processarEspelho({ S: a.S, drive: a.drive, sheets: a.sheets, agora: AGORA });
  assert.equal(segunda.ok, true); assert.equal(a.anexos().length, 1); assert.equal(a.sheets.batches, 1);
});

test('timeout após gravação não marca nada; a reconciliação seguinte confirma sem reenviar às cegas', async () => {
  const a = ambiente({ rows: [rowComEvento()] });
  a.sheets.falharProximoAnexo(); // anexo CAIU na planilha, mas a resposta se perdeu
  const primeira = await processarEspelho({ S: a.S, drive: a.drive, sheets: a.sheets, agora: AGORA });
  assert.equal(primeira.ok, false); assert.equal(primeira.situacao, 'espelho_indisponivel');
  let row = a.banco.get('insc-1');
  assert.equal(row.cartinha_historico[0].espelhado_em, undefined); // nada marcado no incerto
  assert.equal(row.cartinha_espelho_pendente, true);
  const segunda = await processarEspelho({ S: a.S, drive: a.drive, sheets: a.sheets, agora: AGORA });
  assert.equal(segunda.ok, true); assert.equal(segunda.espelhados, 1);
  assert.equal(a.sheets.batches, 1); // não reanexou: a releitura confirmou o que já estava lá
  row = a.banco.get('insc-1');
  assert.equal(row.cartinha_espelho_pendente, false);
});

test('timeout sem gravação reenvia uma única vez (determinístico, verificado antes)', async () => {
  const a = ambiente({ rows: [rowComEvento()] });
  const anexar = a.sheets.anexar.bind(a.sheets);
  a.sheets.anexar = async (id, linhas) => { a.sheets.falharProximoAnexo = false; anexos_reais++; throw new Error('falha antes de gravar'); };
  let anexos_reais = 0;
  const primeira = await processarEspelho({ S: a.S, drive: a.drive, sheets: a.sheets, agora: AGORA });
  assert.equal(primeira.ok, false);
  a.sheets.anexar = anexar; // próxima execução funciona
  const segunda = await processarEspelho({ S: a.S, drive: a.drive, sheets: a.sheets, agora: AGORA });
  assert.equal(segunda.ok, true); assert.equal(segunda.espelhados, 1); assert.equal(anexos_reais, 1);
  assert.equal(a.anexos().length, 1); // gravado exatamente uma vez
});

test('salvamento concorrente adia a confirmação sem perder nem duplicar o evento', async () => {
  const a = ambiente({ rows: [rowComEvento()], recusarCas: true });
  const primeira = await processarEspelho({ S: a.S, drive: a.drive, sheets: a.sheets, agora: AGORA });
  assert.equal(primeira.adiadas, 1);
  assert.equal(a.banco.get('insc-1').cartinha_espelho_pendente, true); // permanece pendente
  // A autora salvou de novo: nova versão e novo evento; o CAS volta a casar.
  const row = a.banco.get('insc-1');
  row.cartinha_versao = 2;
  row.cartinha_historico.push(eventoSalvamento());
  a.S.EventoM31Inscricao.updateMany = async (q, u) => { // remove a recusa
    const r = a.banco.get(q.id); Object.assign(r, structuredClone(u.$set)); return { updated: 1 };
  };
  const segunda = await processarEspelho({ S: a.S, drive: a.drive, sheets: a.sheets, agora: AGORA });
  assert.equal(segunda.ok, true); assert.equal(segunda.espelhados, 2);
  assert.equal(a.anexos().length, 2); // dois eventos distintos, cada linha uma vez
});

test('evento de transferência usa identificador próprio e não exporta dados da titular anterior', async () => {
  const evento = {
    transferencia_id: 'transf-1', arquivada_em: AGORA(), versao: 1, status: 'pronta',
    texto: 'Carta da titular anterior', responsavel: null,
    titular_anterior: { nome: 'Anterior', cpf: '98765432100', whatsapp: '5581999999999', email: 'x@y.z' },
  };
  assert.equal(identificadorEvento(evento), 'transferencia:transf-1');
  const linha = linhaEvento(evento, 'insc-1');
  assert.equal(linha[0], 'transferencia:transf-1');
  assert.equal(linha[6], 'transferencia');
  const proibido = ['98765432100', '5581999999999', 'x@y.z', 'Anterior'];
  for (const valor of proibido) assert.ok(!linha.join('|').includes(valor), `não deve exportar ${valor}`);
  const a = ambiente({ rows: [{ id: 'insc-1', nome: 'Nova titular', cpf: '111', cartinha_versao: 2, cartinha_historico: [evento], cartinha_espelho_pendente: true }] });
  const r = await processarEspelho({ S: a.S, drive: a.drive, sheets: a.sheets, agora: AGORA });
  assert.equal(r.espelhados, 1);
});

// ── Recuperação offline: descoberta e sincronização de rascunhos ──────────────

const copia = (extras = {}) => ({
  key: 'autora:insc-1:aba-velha', ownerId: 'autora', inscricaoId: 'insc-1', tabId: 'aba-velha',
  text: 'Rascunho de aba fechada', status: 'em_elaboracao', version: 1, titularRef: 'a'.repeat(64),
  savedText: '', savedStatus: 'pendente', pending: null, dirty: true, updatedAt: '2026-09-23T11:00:00Z',
  ...extras,
});
const servidor = { id: 'insc-1', cartinha_versao: 1, titular_ref: 'a'.repeat(64) };
const noop = async () => {};
const presencasFrescas = mapa => () => mapa;

test('rascunho de aba morta com versão/titular coerentes é sincronizado e a cópia limpa', async () => {
  const enviados = []; let removidas = 0;
  const r = await sincronizarRascronhosSafe({
    copias: [copia()], inscricoes: [servidor], salvar: async c => { enviados.push(c); return { id: 'insc-1', cartinha_texto: c.texto, cartinha_status: c.status, cartinha_suporte: c.suporte || 'digital' }; },
    remover: async () => { removidas++; }, lerPresencas: presencasFrescas({}),
  });
  assert.equal(r.sincronizados, 1); assert.equal(removidas, 1);
  assert.equal(enviados[0].texto, 'Rascunho de aba fechada');
  assert.equal(enviados[0].titular_ref, servidor.titular_ref);
});
test('rascunho com pending reenvia o MESMO id_transacao (dedup no servidor)', async () => {
  const enviados = [];
  const id = '33333333-3333-4333-8333-333333333333';
  const r = await sincronizarRascronhosSafe({
    copias: [copia({ pending: { inscricao_id: 'insc-1', texto: 'x', status: 'em_elaboracao', versao: 1, titular_ref: 'a'.repeat(64), id_transacao: id } })],
    inscricoes: [servidor], salvar: async c => { enviados.push(c); return { id: 'insc-1', cartinha_texto: c.texto, cartinha_status: c.status }; },
    remover: noop, lerPresencas: presencasFrescas({}),
  });
  assert.equal(r.sincronizados, 0); assert.equal(r.preservados, 1); assert.equal(enviados[0].id_transacao, id); // o texto local mais novo não pode ser apagado
});
test('texto de outra titular nunca é aplicado automaticamente', async () => {
  let enviados = 0;
  const r = await sincronizarRascronhosSafe({
    copias: [copia({ titularRef: 'b'.repeat(64) })], inscricoes: [servidor],
    salvar: async () => { enviados++; return {}; }, remover: noop, lerPresencas: presencasFrescas({}),
  });
  assert.equal(r.preservados, 1); assert.equal(enviados, 0);
});
test('versão divergente sem pending fica para revisão humana ao abrir a carta', async () => {
  let enviados = 0;
  const r = await sincronizarRascronhosSafe({
    copias: [copia({ version: 0 })], inscricoes: [{ ...servidor, cartinha_versao: 3 }],
    salvar: async () => { enviados++; return {}; }, remover: noop, lerPresencas: presencasFrescas({}),
  });
  assert.equal(r.preservados, 1); assert.equal(enviados, 0);
});
test('editor aberto em outra aba faz a sincronização pular (sem concorrência)', async () => {
  let enviados = 0;
  const r = await sincronizarRascronhosSafe({
    copias: [copia()], inscricoes: [servidor],
    salvar: async () => { enviados++; return {}; }, remover: noop,
    lerPresencas: presencasFrescas({ 'insc-1': { tabId: 'outra-aba', ts: Date.now() } }),
  });
  assert.equal(r.preservados, 1); assert.equal(enviados, 0);
});
test('inscrição fora da lista mantém o rascunho para revisão', async () => {
  let enviados = 0;
  const r = await sincronizarRascronhosSafe({
    copias: [copia()], inscricoes: [], salvar: async () => { enviados++; return {}; },
    remover: noop, lerPresencas: presencasFrescas({}),
  });
  assert.equal(r.preservados, 1); assert.equal(enviados, 0);
});
test('cópia já sincronizada (não suja) só higieniza o dispositivo', async () => {
  let removidas = 0;
  const r = await sincronizarRascronhosSafe({
    copias: [copia({ dirty: false, pending: null })], inscricoes: [servidor],
    salvar: async () => { throw new Error('não deve salvar'); },
    remover: async () => { removidas++; }, lerPresencas: presencasFrescas({}),
  });
  assert.equal(r.limpos, 1); assert.equal(removidas, 1); assert.equal(r.sincronizados, 0);
});
test('servidor recusa (409) e o rascunho é preservado', async () => {
  const r = await sincronizarRascronhosSafe({
    copias: [copia()], inscricoes: [servidor],
    salvar: async () => { throw Object.assign(new Error('conflito'), { status: 409 }); },
    remover: noop, lerPresencas: presencasFrescas({}),
  });
  assert.equal(r.preservados, 1); assert.equal(r.erros, 0);
});

async function sincronizarRascronhosSafe({ copias, ...resto }) {
  return sincronizarRascunhos({
    autoraId: 'autora',
    abertosNestaAba: new Set(),
    agora: () => 0,
    descobrir: async () => copias,
    ...resto,
  });
}