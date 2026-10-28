import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleAlert, ExternalLink, RotateCcw } from 'lucide-react';
import { gestaoError, gestaoReembolso } from '@/lib/m31GestaoApi';
import GestaoReembolsoConfirmar from './GestaoReembolsoConfirmar';
import GestaoReembolsoCard from './GestaoReembolsoCard';

const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const when = (v) => v && !Number.isNaN(Date.parse(v)) ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Recife' }) : null;

export default function GestaoReembolso({ sessionId, inscricao, onChanged }) {
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [pending, setPending] = useState(false);
  const query = useQuery({
    queryKey: ['m31-gestao-reembolso', inscricao.id],
    retry: false,
    staleTime: 0,
    queryFn: () => gestaoReembolso(sessionId, 'consultar', { inscricao_id: inscricao.id })
  });
  const d = query.data;

  async function atualizar(msg) {
    setConfirmando(false);
    setAviso(msg);
    await Promise.allSettled([query.refetch(), onChanged?.()]);
  }

  async function encaminhar() {
    setPending(true);
    try {
      const r = await gestaoReembolso(sessionId, 'encaminhar_revisao', { inscricao_id: inscricao.id });
      await atualizar(r.ja_existia ? 'Já existe revisão aberta para este caso.' : 'Encaminhado para revisão financeira. Nenhum estorno foi feito.');
    } catch (e) {
      setAviso(gestaoError(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="m31-gestao-logistics">
      <h3>Reembolso</h3>
      {query.isLoading ? (
        <p className="m31-gestao-muted">Consultando situação…</p>
      ) : query.error ? (
        <p className="m31-gestao-error" role="alert">{gestaoError(query.error)}</p>
      ) : d && (
        <>
          <GestaoReembolsoCard reembolso={d.reembolso} nome={inscricao?.nome} refreshing={query.isFetching} onRefresh={() => query.refetch()} />
          {!d.reembolso && (
            <p>
              <span className="m31-gestao-refund-status">{d.situacao?.rotulo}</span>
              {when(d.situacao?.data) && <small className="m31-gestao-muted"> · {when(d.situacao.data)}</small>}
            </p>
          )}
          {d.situacao?.comprovante && !d.reembolso?.aguardando_autorizacao && (
            <a className="m31-gestao-btn m31-gestao-btn-quiet" href={d.situacao.comprovante} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />Comprovante do Asaas
            </a>
          )}
          {aviso && <p className="m31-gestao-success" role="status">{aviso}</p>}
          {!d.pode_executar ? (
            <p className="m31-gestao-muted">Somente consulta. Movimentações financeiras são feitas pelo responsável autorizado.</p>
          ) : (
            <>
              {d.bloqueio && <p className="m31-gestao-notice">{d.bloqueio}</p>}
              {d.pagamento && (
                <dl className="m31-gestao-data-grid">
                  {[
                    ['Forma', d.pagamento.forma === 'PIX' ? 'Pix' : d.pagamento.forma === 'CREDIT_CARD' ? 'Cartão' : d.pagamento.forma],
                    ['Valor pago', brl(d.pagamento.valor)],
                    ['Situação no Asaas', d.pagamento.status],
                    ['Pago em', d.pagamento.pago_em || 'Não informado'],
                    ['Pagadora', d.pagamento.pagador_nome || 'Não identificada'],
                    ['CPF da pagadora', d.pagamento.pagador_cpf || 'Não informado']
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {d.checks?.length > 0 && (
                <ul className="m31-gestao-refund-checks">
                  {d.checks.map((c) => (
                    <li key={c.item}>
                      {c.ok ? <CheckCircle2 size={17} color="#15803d" /> : <CircleAlert size={17} color="#b91c1c" />}
                      <span>{c.item}<small>{c.detalhe}</small></span>
                    </li>
                  ))}
                </ul>
              )}
              {d.revisao?.length > 0 && (
                <div className="m31-gestao-notice">
                  <strong>Exige revisão financeira (sem estorno automático):</strong>
                  <ul>
                    {d.revisao.map((r) => <li key={r.codigo}>{r.rotulo}</li>)}
                  </ul>
                  <button type="button" className="m31-gestao-btn" onClick={encaminhar} disabled={pending}>
                    {pending ? 'Encaminhando…' : 'Encaminhar para revisão financeira'}
                  </button>
                </div>
              )}
              {confirmando ? (
                <GestaoReembolsoConfirmar sessionId={sessionId} inscricao={inscricao} avaliacao={d} onDone={atualizar} onCancel={() => setConfirmando(false)} />
              ) : d.elegivel && (
                <button type="button" className="m31-gestao-btn m31-gestao-btn-primary" onClick={() => { setAviso(''); setConfirmando(true); }}>
                  <RotateCcw size={18} />Solicitar reembolso total
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
