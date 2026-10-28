import { useState } from 'react';
import { mergeGestaoSavedList } from '@/lib/m31GestaoCache';
import { participacaoStatus } from '@/lib/m31GestaoApi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRightLeft, Bus, CheckCircle2, Pencil, RefreshCw } from 'lucide-react';
import { useM31GestaoDetail } from '@/hooks/useM31Gestao';
import { gestaoConferencia, gestaoError, gestaoOperation, gestaoStatus, gestaoFinancialLabel } from '@/lib/m31GestaoApi';
import M31SkeletonList from '../M31SkeletonList';
import GestaoDialog from './GestaoDialog';
import GestaoInscricaoForm from './GestaoInscricaoForm';
import GestaoQrExistente from './GestaoQrExistente';
import GestaoReembolso from './GestaoReembolso';
import GestaoComunicacao, { GestaoGrupo, GestaoPresente } from './GestaoComunicacao';
import { gestaoWhatsappLabel } from '@/lib/m31GestaoContato';

function date(value) {
  if (!value || Number.isNaN(Date.parse(value))) return 'Não informada';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza' }).format(new Date(value));
}

export function GestaoInscricaoStates({ inscricao }) {
  const status = inscricao.participacao ?? participacaoStatus(inscricao);
  return (
    <div className="m31-gestao-state-grid m31-gestao-participation">
      <div>
        <span>Participação</span>
        <strong className="m31-gestao-participation-badge" data-tone={status.tone}>{status.label}</strong>
        {status.manual && <small className="m31-gestao-manual-source">Liberação manual da equipe</small>}
        {!status.confirmed && inscricao.cadastro_pendente && <small className="m31-gestao-manual-source">Falta concluir o cadastro da presenteada</small>}
      </div>
      <div className="m31-gestao-payment-secondary">
        <span>Pagamento</span>
        <strong>{gestaoFinancialLabel(inscricao)}</strong>
      </div>
    </div>
  );
}

function Logistics({ data }) {
  const info = data || {};
  const yesNo = (value, yes, no) => value === true ? yes : value === false ? no : 'Não informado';
  return (
    <section className="m31-gestao-logistics">
      <h3>Comunicação e presença</h3>
      <dl className="m31-gestao-data-grid">
        {[
          ['Boas-vindas', gestaoStatus(info.boas_vindas_status), info.boas_vindas_em],
          ['Envio do QR Code', gestaoStatus(info.qr_envio_status)],
          ['Envio de e-mail', gestaoStatus(info.email_envio_status)],
          ['Envio do acesso ao grupo', gestaoStatus(info.grupo_envio_status)],
          ['Presença no evento', yesNo(info.checkin, 'Check-in realizado', 'Check-in não registrado'), info.checkin_em],
        ].map(([label, value, timestamp]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}{timestamp && <small>{date(timestamp)}</small>}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function GestaoInscricaoFicha({ sessionId, id, canOperate, onClose, communicationFocus = false }) {
  const query = useM31GestaoDetail(sessionId, id);
  const queryClient = useQueryClient();
  const [mode, setMode] = useState('view');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [caravanaId, setCaravanaId] = useState('');
  const data = query.data;
  const inscricao = data?.inscricao;
  const allowed = canOperate && data?.can_operate === true;
  const caravanas = useQuery({
    queryKey: ['m31-gestao-caravanas', sessionId],
    queryFn: () => gestaoOperation(sessionId, 'caravanas'),
    enabled: allowed && mode === 'caravana',
    retry: false,
  });

  async function save(action, payload = {}) {
    if (pending || !allowed || error?.code === 'CONFLICT') return;
    setPending(true);
    setError(null);
    setNotice('');
    try {
      const response = await gestaoOperation(sessionId, action, { id, expected_version: data.version, ...payload });
      setMode('view');
      const aviso = response?.coincidencias?.length
        ? ` Atenção: ${[...new Set(response.coincidencias.flatMap(c => c.motivos))].join(' e ')} de outra inscrição. ${response.conferencia?.encaminhada ? 'Enviado à conferência manual.' : 'Confira na conferência manual.'}`
        : '';
      setNotice((action === 'conferir' ? 'Participação confirmada por liberação manual.' : action === 'substituir_titular' ? 'Titular da inscrição atualizada.' : ['incluir_caravana', 'mover_caravana', 'retirar_caravana'].includes(action) ? 'Vínculo de caravana atualizado.' : 'Dados atualizados.') + aviso);

      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['m31-gestao-list', sessionId] }),
        queryClient.cancelQueries({ queryKey: ['m31-gestao-detail', sessionId, id] }),
      ]);
      queryClient.setQueryData(['m31-gestao-detail', sessionId, id], previous => ({
        ...previous,
        inscricao: { ...response.inscricao, ...(previous?.inscricao?.presenteado_por_id === response.inscricao.presenteado_por_id ? { presente: previous.inscricao.presente } : {}) },
        version: response.version,
      }));
      for (const [key, cached] of queryClient.getQueriesData({ queryKey: ['m31-gestao-list', sessionId] })) {
        queryClient.setQueryData(key, mergeGestaoSavedList(cached, response.inscricao, key[2]));
      }
      await Promise.all([
        ['m31-gestao-list', sessionId], ['m31-operational-list', sessionId],
        ['m31-gestao-caravanas-view', sessionId], ['m31-gestao-caravana-detail', sessionId],
      ].map(queryKey => queryClient.invalidateQueries({ queryKey, refetchType: 'none' })));
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  }

  const title = mode === 'edit' && allowed ? 'Editar dados da participante' : mode === 'transfer' && allowed ? 'Trocar titular da inscrição' : mode === 'caravana' && allowed ? 'Alterar caravana' : inscricao?.nome || 'Ficha da inscrição';
  return (
    <GestaoDialog onClose={() => !pending && onClose()} title={title} description={mode === 'view' ? inscricao?.codigo_inscricao || 'Dados, situação e histórico da inscrição.' : 'Confira os dados antes de salvar. Nenhuma mensagem será enviada.'}>
      {query.isLoading ? (
        <M31SkeletonList />
      ) : query.error ? (
        <div className="m31-gestao-error" role="alert">
          <p>{gestaoError(query.error)}</p>
          <button type="button" className="m31-gestao-btn" onClick={() => query.refetch()}>Tentar novamente</button>
        </div>
      ) : inscricao && (
        <>
          {mode === 'caravana' && allowed ? (
            <form className="m31-gestao-form" onSubmit={(event) => { event.preventDefault(); save(inscricao.caravana_id ? 'mover_caravana' : 'incluir_caravana', { caravana_destino_id: caravanaId }); }}>
              <p className="m31-gestao-notice">A participante mantém a mesma inscrição e seus registros financeiros. A conferência do cadastro precisará ser refeita.</p>
              <div className="m31-gestao-field">
                <label htmlFor="gestao-ficha-caravana">Caravana de destino</label>
                <select id="gestao-ficha-caravana" value={caravanaId} onChange={(event) => setCaravanaId(event.target.value)} disabled={pending || caravanas.isLoading} required>
                  <option value="">{caravanas.isLoading ? 'Carregando…' : 'Selecione uma caravana'}</option>
                  {caravanas.data?.items?.map((item) => <option value={item.id} key={item.id}>{item.nome}</option>)}
                </select>
              </div>
              {caravanas.error && <p className="m31-gestao-error" role="alert">{gestaoError(caravanas.error)}</p>}
              {error && <p className="m31-gestao-error" role="alert">{gestaoError(error)}</p>}
              <div className="m31-gestao-form-actions">
                <button type="button" className="m31-gestao-btn" onClick={() => { setMode('view'); setError(null); }} disabled={pending}>Cancelar</button>
                <button type="submit" className="m31-gestao-btn m31-gestao-btn-primary" disabled={pending || !caravanaId || error?.code === 'CONFLICT'}>{pending ? 'Salvando…' : 'Salvar caravana'}</button>
              </div>
              {inscricao.caravana_id && <button type="button" className="m31-gestao-btn" onClick={() => save('retirar_caravana')} disabled={pending || error?.code === 'CONFLICT'}>Retirar da caravana</button>}
            </form>
          ) : mode !== 'view' && allowed ? (
            <>
              <button type="button" className="m31-gestao-btn m31-gestao-btn-quiet" onClick={() => { setMode('view'); setError(null); }} disabled={pending}><ArrowLeft size={17} />Voltar à ficha</button>
              <GestaoInscricaoForm key={mode} sessionId={sessionId} mode={mode === 'transfer' ? 'transfer' : 'edit'} initialFields={mode === 'edit' ? inscricao : undefined} onSubmit={({ fields }) => save(mode === 'transfer' ? 'substituir_titular' : 'editar_participante', { fields })} onCancel={() => { setMode('view'); setError(null); }} onDraftChange={() => setError((previous) => previous?.code === 'CONFLICT' ? previous : null)} pending={pending} error={error} />
            </>
          ) : (
            <div className="m31-gestao-ficha">
              {notice && <p className="m31-gestao-success" role="status">{notice}</p>}
              <GestaoInscricaoStates inscricao={inscricao} />
              <dl className="m31-gestao-data-grid">
                {[
                  ['WhatsApp', gestaoWhatsappLabel(inscricao.whatsapp)], ['E-mail', inscricao.email], ['CPF', inscricao.cpf],
                  ['Cidade', inscricao.cidade], ['UF', inscricao.estado], ['Caravana', inscricao.caravana_nome || inscricao.nome_caravana],
                ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Não informado'}</dd></div>)}
              </dl>
              {inscricao.situacao_texto && <p className="m31-gestao-muted">{inscricao.situacao_texto}</p>}
              <div className="m31-gestao-resolution-grid">
                <GestaoPresente inscricao={inscricao} />
                <GestaoGrupo sessionId={sessionId} inscricao={inscricao} />
              </div>
              <GestaoComunicacao sessionId={sessionId} inscricao={inscricao} allowed={allowed} history={data.comunicacoes || []} focus={communicationFocus} onChanged={() => query.refetch()} />
              <div className="m31-gestao-conference">
                <strong>Liberação manual da participação</strong>
                <p>{gestaoConferencia(inscricao) === 'Conferida' ? 'Participação liberada pela equipe' : 'Ainda não liberada manualmente'}</p>
                {(inscricao.conferencia?.conferida === true || inscricao.conferida_manualmente === true) && (
                  <p className="m31-gestao-muted">{date(inscricao.conferencia?.data || inscricao.conferida_em)} · {inscricao.conferencia?.responsavel || inscricao.conferida_por || 'Responsável não informado'}</p>
                )}
              </div>
              {allowed && (
                <div className="m31-gestao-ficha-actions">
                  <button type="button" className="m31-gestao-btn m31-gestao-btn-primary" disabled={pending || gestaoConferencia(inscricao) === 'Conferida'} onClick={() => save('conferir')}>
                    <CheckCircle2 size={18} aria-hidden="true" />{pending ? 'Salvando…' : gestaoConferencia(inscricao) === 'Conferida' ? 'Participação liberada manualmente' : 'Liberar participação manualmente'}
                  </button>
                  <button type="button" className="m31-gestao-btn" onClick={() => { setMode('edit'); setError(null); setNotice(''); }} disabled={pending}>
                    <Pencil size={18} aria-hidden="true" />Editar dados
                  </button>
                  <button type="button" className="m31-gestao-btn" onClick={() => { setMode('transfer'); setError(null); setNotice(''); }} disabled={pending}>
                    <ArrowRightLeft size={18} aria-hidden="true" />Trocar titular da inscrição
                  </button>
                  <button type="button" className="m31-gestao-btn" onClick={() => { setMode('caravana'); setCaravanaId(inscricao.caravana_id || ''); setError(null); setNotice(''); }} disabled={pending}>
                    <Bus size={18} aria-hidden="true" />Alterar caravana
                  </button>
                </div>
              )}
              <p className="m31-gestao-muted">A liberação manual confirma a participação. O pagamento e a presença mantêm seus próprios registros.</p>
              {data.qr_behavior && <p className="m31-gestao-notice">{typeof data.qr_behavior === 'string' ? data.qr_behavior : data.qr_behavior.message || data.qr_behavior.descricao || 'Consulte o histórico da credencial.'}</p>}
              <GestaoQrExistente inscricao={inscricao} />
              <Logistics data={inscricao.logistica} />
              {inscricao.tipo !== 'voluntario' && <GestaoReembolso sessionId={sessionId} inscricao={inscricao} onChanged={() => query.refetch()} />}
              {error && <div className="m31-gestao-error" role="alert">{gestaoError(error)}</div>}
              <section className="m31-gestao-history">
                <h3>Histórico da inscrição</h3>
                {data.historico?.length ? (
                  <ol>
                    {data.historico.map((item, index) => (
                      <li key={item.id || index}>
                        <strong>{item.acao || item.evento || item.action || 'Atualização'}</strong>
                        <span>{item.detalhe || item.descricao || item.justificativa}</span>
                        <small>{date(item.created_date || item.data || item.data_hora)} · {item.user_nome || item.responsavel || item.user_email || item.operador_nome || 'Responsável não informado'}</small>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="m31-gestao-muted">Nenhuma ação registrada neste histórico.</p>
                )}
              </section>
            </div>
          )}
          {error?.code === 'CONFLICT' && (
            <button type="button" className="m31-gestao-btn" onClick={async () => { await query.refetch(); setMode('view'); setError(null); }}>
              <RefreshCw size={18} aria-hidden="true" />Atualizar ficha
            </button>
          )}
        </>
      )}
    </GestaoDialog>
  );
}
