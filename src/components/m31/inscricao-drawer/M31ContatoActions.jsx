/**
 * M31ContatoActions — Ações manuais de contato no Centro da Participante:
 * 1. Salvar participante na agenda (.vcf gerado localmente — sem CPF/dados financeiros)
 * 2. Pedir para salvar nosso número — mensagem editável, aprovação humana,
 *    envio EXCLUSIVO pela fila governada (M31FilaMensagem), com dedup anti-repetição.
 */
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Contact, Send, Check, X } from 'lucide-react';
// REGRA ÚNICA: a porta do admin usa o MESMO núcleo de normalização das
// portas pública, caravana, voluntária, presenteada e importação.
import { normalizarTelefone, normalizarCPF } from '@/lib/m31Normalizar';

const C = {
  text: '#2d2d2d', textSec: '#6b7280', textTer: '#9ca3af',
  border: 'rgba(0,0,0,0.08)', bg1: '#f8f8f9',
  brand: '#8B1A2B', success: '#10b981', warning: '#f59e0b', danger: '#ef4444',
};

const MENSAGEM_PADRAO = 'Para facilitar o recebimento das informações da sua inscrição, salve este número no seu celular.\nSuporte M31 Filhas. 💛';

function gerarVcf(inscricao) {
  const tel = normalizarTelefone(inscricao.whatsapp).valor;
  const nome = `M31 | ${inscricao.nome || ''}`.trim();
  const notaPartes = [
    inscricao.codigo_inscricao ? `Inscrição ${inscricao.codigo_inscricao}` : null,
    inscricao.cidade || null,
    inscricao.nome_igreja || null,
  ].filter(Boolean);
  const vcf = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${nome}`,
    `N:;${nome};;;`,
    'ORG:M31 Filhas',
    `TEL;TYPE=CELL:+${tel}`,
    notaPartes.length ? `NOTE:${notaPartes.join(' · ')}` : null,
    'END:VCARD',
  ].filter(Boolean).join('\r\n');

  const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `M31_${(inscricao.nome || 'contato').replace(/[^\p{L}\d]+/gu, '_')}.vcf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function M31ContatoActions({ inscricao }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(MENSAGEM_PADRAO);
  const [enviando, setEnviando] = useState(false);
  const [feedback, setFeedback] = useState(null); // { tipo: 'ok'|'erro'|'bloqueado', msg }

  const telefone = normalizarTelefone(inscricao.whatsapp).valor;
  const cpfNorm = normalizarCPF(inscricao.cpf).valor;
  const pessoa = cpfNorm || telefone;
  const dedupKey = `${pessoa}:SALVAR_CONTATO:V1`;

  async function handleEnfileirar() {
    if (!texto.trim()) return;
    setEnviando(true);
    setFeedback(null);
    try {
      // Anti-repetição: nunca enfileirar se já existe item ativo/enviado com a mesma chave
      const existentes = await base44.asServiceRole.entities.M31FilaMensagem.filter({ dedup_key: dedupKey });
      const bloqueante = existentes.find(i =>
        ['pendente', 'processando', 'enviado', 'incerto', 'falha_terminal'].includes(i.status));
      if (bloqueante) {
        setFeedback({ tipo: 'bloqueado', msg: `Esta mensagem já foi ${bloqueante.status === 'enviado' ? 'enviada' : 'enfileirada'} para esta participante (status: ${bloqueante.status}).` });
        return;
      }

      const user = await base44.auth.me();
      const agora = new Date().toISOString();
      await base44.asServiceRole.entities.M31FilaMensagem.create({
        dedup_key: dedupKey,
        participante_id: pessoa,
        cpf: cpfNorm || null,
        telefone,
        email: inscricao.email || null,
        automacao: 'OPERACIONAL',
        template: 'salvar_contato_v1',
        versao: 'V1',
        origem: 'drawer_salvar_contato',
        inscricao_id: inscricao.id,
        inscricao_nome: inscricao.nome,
        mensagens: [{ message: texto.trim() }],
        status: 'pendente',
        aprovado_para_envio: true,
        aprovado_por: user?.email || 'desconhecido',
        aprovado_em: agora,
        prioridade: 6,
      });
      setFeedback({ tipo: 'ok', msg: 'Mensagem aprovada e enfileirada na fila governada. O envio e o messageid serão registrados pelo drenador.' });
      setAberto(false);
      setTexto(MENSAGEM_PADRAO);
    } catch (e) {
      setFeedback({ tipo: 'erro', msg: 'Não foi possível enfileirar a mensagem.' });
    } finally {
      setEnviando(false);
    }
  }

  const btnBase = {
    display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center',
    padding: '8px 12px', border: 'none', borderRadius: '6px',
    fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'Inter,sans-serif',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ height: '1px', background: C.border, margin: '4px 0' }} />

      {/* 1. Salvar na agenda (.vcf local) */}
      <button style={{ ...btnBase, background: '#f2f1f0', color: C.textSec }}
        title="Gera um arquivo de contato (.vcf) — o salvamento é confirmado no aparelho"
        onClick={() => gerarVcf(inscricao)} disabled={!telefone}>
        <Contact size={14} /> Salvar participante na agenda
      </button>

      {/* 2. Pedir para salvar nosso número (fila governada) */}
      {!aberto ? (
        <button style={{ ...btnBase, background: C.brand, color: '#fff' }}
          onClick={() => { setAberto(true); setFeedback(null); }} disabled={!telefone}>
          <Send size={14} /> Pedir para salvar nosso número
        </button>
      ) : (
        <div style={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: C.textSec, marginBottom: '6px', textTransform: 'uppercase' }}>
            Mensagem para a participante — revise antes de aprovar
          </div>
          <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={4}
            style={{
              width: '100%', boxSizing: 'border-box', fontSize: '13px', padding: '8px 10px',
              border: `1px solid ${C.border}`, borderRadius: '6px', color: C.text,
              background: '#fff', resize: 'vertical', fontFamily: 'Inter,sans-serif',
            }} />
          <div style={{ fontSize: '11px', color: C.textTer, margin: '6px 0 10px' }}>
            O envio passa pela fila governada e respeita janela comercial, limites diários e cooldowns. Não será repetido automaticamente.
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={{ ...btnBase, background: C.success, color: '#fff', flex: 1, opacity: enviando ? 0.6 : 1 }}
              onClick={handleEnfileirar} disabled={enviando || !texto.trim()}>
              <Check size={14} /> {enviando ? 'Enfileirando...' : 'Aprovar e enfileirar'}
            </button>
            <button style={{ ...btnBase, background: '#f2f1f0', color: C.textSec }}
              onClick={() => { setAberto(false); setTexto(MENSAGEM_PADRAO); }} disabled={enviando}>
              <X size={14} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <div style={{
          padding: '10px 12px', borderRadius: '8px', fontSize: '12px',
          background: feedback.tipo === 'ok' ? 'rgba(16,185,129,0.08)' : feedback.tipo === 'bloqueado' ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${feedback.tipo === 'ok' ? 'rgba(16,185,129,0.3)' : feedback.tipo === 'bloqueado' ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}`,
          color: feedback.tipo === 'ok' ? C.success : feedback.tipo === 'bloqueado' ? C.warning : C.danger,
        }}>
          {feedback.msg}
        </div>
      )}
    </div>
  );
}