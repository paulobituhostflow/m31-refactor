import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Copy, ExternalLink, Gift, MessageCircle, RefreshCw, Send, UsersRound } from 'lucide-react';
import { gestaoError, gestaoOperation, gestaoStatus } from '@/lib/m31GestaoApi';
import { gestaoDate, gestaoWhatsappLabel, gestaoWhatsappUrl } from '@/lib/m31GestaoContato';

export function GestaoWhatsApp({ phone, children = 'Abrir WhatsApp', message = '', className = 'm31-gestao-btn m31-gestao-whatsapp' }) {
  const href = gestaoWhatsappUrl(phone, message);
  return href ? (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      <MessageCircle size={17} aria-hidden="true" />{children}
    </a>
  ) : (
    <span className="m31-gestao-muted">WhatsApp não informado ou inválido</span>
  );
}

export function GestaoPresente({ inscricao, compact = false }) {
  const [notice, setNotice] = useState('');
  const gift = inscricao.presente;
  if (!gift && !inscricao.presenteado_por_id && !inscricao.cadastro_pendente) {
    return compact ? null : <p className="m31-gestao-muted">Não há vínculo de presenteada informado nesta inscrição.</p>;
  }
  const donor = gift?.quem_abencoou;
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(gift.cadastro_link);
      setNotice('Link copiado.');
    } catch {
      setNotice('Não foi possível copiar. Use Abrir cadastro.');
    }
  }
  return (
    <section className={`m31-gestao-gift ${compact ? 'is-compact' : ''}`} aria-label="Informações do presente">
      <div className="m31-gestao-gift-heading">
        <Gift size={18} aria-hidden="true" />
        <strong>Inscrição presenteada</strong>
        {inscricao.cadastro_pendente && <span className="m31-gestao-tag is-pending">Cadastro incompleto</span>}
      </div>
      <div className="m31-gestao-gift-person">
        <span className="m31-gestao-muted">Quem abençoou</span>
        <strong>{donor?.nome || gift?.nome_informado || 'Vínculo a conferir'}</strong>
        {gift?.nome_informado && <small>Nome informado; vínculo ainda não localizado</small>}
        {donor?.whatsapp && (
          <GestaoWhatsApp phone={donor.whatsapp}>
            {compact ? 'WhatsApp de quem abençoou' : `Conversar com quem abençoou · ${gestaoWhatsappLabel(donor.whatsapp)}`}
          </GestaoWhatsApp>
        )}
        {!compact && donor?.codigo_inscricao && <small>Inscrição de quem abençoou: {donor.codigo_inscricao}</small>}
      </div>
      {gift?.aviso && <p className="m31-gestao-notice">{gift.aviso}</p>}
      {!compact && inscricao.cadastro_pendente && (
        <p>Falta concluir o cadastro da presenteada. O pagamento e a liberação da participação são conferidos separadamente.</p>
      )}
      {!compact && gift?.cadastro_link && (
        <div className="m31-gestao-inline-actions">
          <a className="m31-gestao-btn" href={gift.cadastro_link} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={17} aria-hidden="true" />Abrir cadastro da presenteada
          </a>
          <button type="button" className="m31-gestao-btn" onClick={copyLink}>
            <Copy size={17} aria-hidden="true" />Copiar link de cadastro
          </button>
        </div>
      )}
      {notice && <small role="status">{notice}</small>}
    </section>
  );
}

export function GestaoGrupo({ sessionId, inscricao, compact = false }) {
  const [, refreshClock] = useState(0);
  const info = inscricao.logistica || {};
  const query = useQuery({
    queryKey: ['m31-gestao-grupo', sessionId, inscricao.id, inscricao.whatsapp],
    queryFn: () => gestaoOperation(sessionId, 'verificar_grupo', { id: inscricao.id }),
    enabled: false,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });
  const group = query.data?.grupo;
  useEffect(() => {
    if (!group?.verificado_em) return;
    const wait = Math.max(0, 60_001 - (Date.now() - Date.parse(group.verificado_em)));
    const timer = setTimeout(() => refreshClock(value => value + 1), wait);
    return () => clearTimeout(timer);
  }, [group?.verificado_em]);
  const current = group?.verificado_em && Date.now() - Date.parse(group.verificado_em) < 60_000;
  const label = group
    ? !current && group.estado === 'presente'
      ? 'No grupo na última consulta'
      : !current && group.estado === 'ausente'
        ? 'Não localizado na última consulta'
        : group.label
    : info.entrou_no_grupo === true
      ? 'Entrada registrada'
      : 'Entrada ainda não verificada';
  const tone = current && group?.estado === 'presente' ? 'confirmed' : current && group?.estado === 'ausente' ? 'pending' : 'unknown';
  return (
    <section className={`m31-gestao-group-card ${compact ? 'is-compact' : ''}`} aria-label="Situação no grupo oficial">
      <div className="m31-gestao-group-heading"><UsersRound size={18} aria-hidden="true" /><strong>Grupo oficial</strong></div>
      <span className="m31-gestao-group-state" data-tone={tone}>{label}</span>
      {group?.verificado_em ? (
        <small>Consulta em {gestaoDate(group.verificado_em)}{!current ? ' · consulte novamente para atualizar' : ''}</small>
      ) : (
        <small>{info.entrou_no_grupo === true ? 'Registro anterior; a presença atual ainda precisa ser consultada.' : 'Convite enviado não confirma entrada no grupo.'}</small>
      )}
      {!compact && info.grupo_registro_em && (
        <small>
          Registro de entrada: {gestaoDate(info.grupo_registro_em)}
          {info.grupo_registro_origem ? ` · ${info.grupo_registro_origem === 'manual' ? 'Informado pela equipe' : info.grupo_registro_origem === 'automacao' ? 'Identificado pela automação' : 'Fonte: ' + info.grupo_registro_origem}` : ''}
        </small>
      )}
      {query.error && <p className="m31-gestao-error" role="alert">{gestaoError(query.error)}</p>}
      <button type="button" className="m31-gestao-btn m31-gestao-btn-quiet" disabled={query.isFetching} onClick={() => query.refetch()}>
        <RefreshCw size={15} className={query.isFetching ? 'animate-spin' : ''} aria-hidden="true" />
        {query.isFetching ? 'Consultando grupo…' : 'Verificar agora'}
      </button>
    </section>
  );
}

const OPTIONS = [
  { key: 'confirmacao', title: 'Confirmação / QR', description: 'Credencial existente e convite do grupo.' },
  { key: 'grupo', title: 'Lembrete do grupo', description: 'Consulta o grupo antes de preparar o convite.' },
  { key: 'cadastro', title: 'Completar cadastro', description: 'Link para a presenteada concluir os dados.' },
];
const QUEUE_STATUS = {
  pendente: 'Na fila',
  processando: 'Envio em andamento',
  enviado: 'Enviado · aceito pelo provedor',
  incerto: 'Resultado incerto · conferir',
  falha: 'Falha · conferir',
  falha_terminal: 'Não enviado · falha definitiva',
  cancelado: 'Cancelado',
  verificacao_manual: 'Conferência necessária',
  revisao_historica: 'Histórico em revisão'
};
const TEMPLATE_LABEL = {
  grupo_followup_1: 'Lembrete do grupo',
  convidada_completar_cadastro: 'Conclusão do cadastro da presenteada',
  convidada_vaga_confirmada: 'Comunicação da inscrição presenteada',
  confirmacao_com_qr: 'Confirmação com QR',
  lembrete_qr_ja_no_grupo: 'Credencial da participante',
  boas_vindas_confirmacao: 'Boas-vindas',
  boas_vindas_confirmacao_pagador: 'Boas-vindas da presenteada'
};

function messageReason(reason) {
  if (!reason) return null;
  if (/grupo.*nao_verificado|consulta.*grupo/i.test(reason)) return 'Aguardando uma consulta válida ao grupo.';
  if (/entrou_no_grupo|ja.*grupo|contato_esta_no_grupo/i.test(reason)) return 'O contato já foi localizado no grupo.';
  if (/cadastro.*concluido/i.test(reason)) return 'O cadastro foi concluído ou o link mudou.';
  if (/cadastro.*pendente|conclusao_cadastro/i.test(reason)) return 'Aguardando a conclusão do cadastro da presenteada.';
  if (/cooldown|intervalo|limite|delay|teto/i.test(reason)) return 'Aguardando o intervalo ou o limite de envio.';
  if (/telefone|number|whatsapp.*invalid/i.test(reason)) return 'Confira o WhatsApp da participante.';
  return 'Há uma ocorrência para conferência pela equipe.';
}

export default function GestaoComunicacao({ sessionId, inscricao, allowed, history = [], focus = false, onChanged }) {
  const queryClient = useQueryClient();
  const heading = useRef(null);
  const [kind, setKind] = useState(null), [plan, setPlan] = useState(null), [pending, setPending] = useState(false);
  const [error, setError] = useState(null), [notice, setNotice] = useState(''), [reason, setReason] = useState('');

  useEffect(() => {
    if (focus) {
      heading.current?.focus();
      heading.current?.scrollIntoView({ block: 'center' });
    }
  }, [focus]);

  async function preview(next) {
    if (pending) return;
    setKind(next);
    setPlan(null);
    setError(null);
    setNotice('');
    setReason('');
    setPending(true);
    try {
      const result = await gestaoOperation(sessionId, 'comunicacao_previa', { id: inscricao.id, kind: next });
      setPlan(result);
      if (result.grupo) queryClient.setQueryData(['m31-gestao-grupo', sessionId, inscricao.id, inscricao.whatsapp], { grupo: result.grupo });
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  }

  async function send() {
    if (pending || !allowed || !plan?.permitido) return;
    setPending(true);
    setError(null);
    setNotice('');
    try {
      const result = await gestaoOperation(sessionId, 'enviar_comunicacao', {
        id: inscricao.id,
        kind,
        expected_version: plan.version,
        plano_hash: plan.plano_hash,
        confirmar_envio: true,
        motivo: reason
      });
      setPlan(null);
      setNotice(result.mensagem || 'Solicitação registrada. Acompanhe a fila.');
      await onChanged?.();
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="m31-gestao-communication">
      <div className="m31-gestao-communication-heading">
        <div>
          <h3 ref={heading} tabIndex={-1}>Contato e resolução</h3>
          <p>Converse com a participante ou prepare um envio individual.</p>
        </div>
        <GestaoWhatsApp phone={inscricao.whatsapp} />
      </div>
      <div className="m31-gestao-message-options">
        {OPTIONS.filter(option => option.key !== 'cadastro' || inscricao.cadastro_pendente).map(option => (
          <button
            type="button"
            key={option.key}
            className="m31-gestao-message-option"
            aria-pressed={kind === option.key}
            disabled={pending}
            onClick={() => preview(option.key)}
          >
            <Send size={17} aria-hidden="true" />
            <span>
              <strong>{option.title}</strong>
              <small>{option.description}</small>
            </span>
          </button>
        ))}
      </div>
      {pending && !plan && <p className="m31-gestao-muted" role="status">Conferindo dados e preparando a comunicação…</p>}
      {error && <p className="m31-gestao-error" role="alert">{gestaoError(error)}</p>}
      {notice && <p className="m31-gestao-success" role="status"><CheckCircle2 size={17} aria-hidden="true" />{notice}</p>}
      {plan && !plan.permitido && (
        <div className="m31-gestao-notice" role="status">
          <strong>Antes de enviar</strong>
          <p>{plan.motivo}</p>
          {kind === 'confirmacao' && inscricao.cadastro_pendente && (
            <button type="button" className="m31-gestao-btn" onClick={() => preview('cadastro')} disabled={pending}>
              Preparar link para completar cadastro
            </button>
          )}
        </div>
      )}
      {plan?.permitido && (
        <div className="m31-gestao-message-preview">
          <h4>Confira antes de enviar</h4>
          <p><strong>{plan.destinatario.nome}</strong> · {gestaoWhatsappLabel(plan.destinatario.whatsapp)}</p>
          {plan.imagem && <p className="m31-gestao-muted">Será anexada a credencial existente desta inscrição.</p>}
          <pre>{plan.mensagem}</pre>
          {plan.requer_motivo && (
            <div className="m31-gestao-field">
              <label htmlFor="m31-reenvio-motivo">Motivo do reenvio do QR</label>
              <input
                id="m31-reenvio-motivo"
                value={reason}
                onChange={event => setReason(event.target.value)}
                placeholder="Ex.: a participante pediu novamente o ingresso"
                disabled={pending}
              />
            </div>
          )}
          <div className="m31-gestao-inline-actions">
            <GestaoWhatsApp phone={plan.destinatario.whatsapp} message={plan.mensagem}>WhatsApp com mensagem pronta</GestaoWhatsApp>
            {allowed && (
              <button
                type="button"
                className="m31-gestao-btn m31-gestao-btn-primary"
                disabled={pending || (plan.requer_motivo && reason.trim().length < 4)}
                onClick={send}
              >
                <Send size={17} aria-hidden="true" />{pending ? 'Registrando…' : 'Confirmar envio pelo aplicativo'}
              </button>
            )}
            <button type="button" className="m31-gestao-btn" disabled={pending} onClick={() => { setPlan(null); setKind(null); }}>
              Cancelar
            </button>
          </div>
          {!allowed && <p className="m31-gestao-muted">Seu perfil permite consultar a prévia. O envio pelo aplicativo exige permissão de operação.</p>}
          {plan.imagem && <small>Ao abrir pelo WhatsApp, a imagem não é anexada automaticamente. Use o QR disponível nesta ficha.</small>}
          <small>O envio pelo aplicativo passa pela fila e pelos limites atuais. Confira o resultado abaixo.</small>
        </div>
      )}
      <div className="m31-gestao-message-history">
        <h4>Últimas comunicações desta inscrição</h4>
        {history.length ? (
          <ul>
            {history.map(item => (
              <li key={item.id}>
                <strong>{QUEUE_STATUS[item.status] || gestaoStatus(item.status)}</strong>
                <span>{TEMPLATE_LABEL[item.template] || 'Contato com a participante'}</span>
                <small>{gestaoDate(item.enviado_em || item.criado_em)}</small>
                {item.motivo && <small>{messageReason(item.motivo)}</small>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="m31-gestao-muted">Nenhum item de comunicação localizado na fila desta inscrição.</p>
        )}
      </div>
    </section>
  );
}
