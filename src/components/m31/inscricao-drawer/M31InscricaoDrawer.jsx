/**
 * M31InscricaoDrawer — Centro da Participante (Visão 360°)
 * Drawer padrão do sistema com todas as informações integradas:
 * Visão Geral · Dados · Pagamento · Caravana · Voluntariado · Tarefas ·
 * Linha do Tempo · WhatsApp · Logs · QR Code · Ações
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { formatDateTimeBR } from '@/lib/dateUtils';
import M31Drawer from '@/components/m31/M31Drawer';
import M31ParticipanteTimeline from './M31ParticipanteTimeline';
import M31CentroOverview from './M31CentroOverview';
import M31ParticipanteTarefas from './M31ParticipanteTarefas';
import M31ContatoActions from './M31ContatoActions';
import {
  LayoutGrid, User, CreditCard, Bus, HandHeart, CheckSquare,
  Clock, MessageSquare, FileText, QrCode, Zap, X, Check, Send, ExternalLink,
  ArrowRightLeft, Copy,
} from 'lucide-react';

const C = {
  text: '#2d2d2d', textSec: '#6b7280', textTer: '#9ca3af',
  border: 'rgba(0,0,0,0.08)', borderSt: 'rgba(0,0,0,0.12)',
  bg1: '#f8f8f9', bg2: '#ffffff', bg3: '#f2f1f0',
  brand: '#8B1A2B', success: '#10b981', warning: '#f59e0b',
  danger: '#ef4444', info: '#3b82f6', purple: '#8b5cf6',
};

const STATUS_CFG = {
  aprovado: { label: 'Confirmado', color: C.success },
  gratuito: { label: 'Gratuito', color: C.success },
  pendente: { label: 'Pendente', color: C.warning },
  checkout_pendente: { label: 'Checkout gerado', color: C.info },
  checkout_abandonado: { label: 'Abandonado', color: C.danger },
  cancelado: { label: 'Cancelado', color: C.textTer },
};

const TIPO_LABEL = {
  publico_geral: 'Geral', voluntario: 'Voluntário',
  caravana: 'Caravana', doacao: 'Doação',
};

const fmtBRL = n => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = formatDateTimeBR;

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.cancelado;
  return (
    <span style={{
      fontSize: '11px', fontWeight: '600', padding: '3px 8px',
      borderRadius: '4px', background: `${cfg.color}18`, color: cfg.color,
    }}>{cfg.label}</span>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.border}`, gap: '12px' }}>
      <span style={{ fontSize: '12px', color: C.textSec, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '12px', color: C.text, textAlign: 'right', wordBreak: 'break-word' }}>{value || '—'}</span>
    </div>
  );
}

function ActionBtn({ title, onClick, variant = 'default', disabled, children }) {
  const colors = {
    default: { bg: C.bg3, color: C.textSec },
    brand: { bg: C.brand, color: '#fff' },
    success: { bg: C.success, color: '#fff' },
    danger: { bg: C.danger, color: '#fff' },
  };
  const s = colors[variant];
  return (
    <button title={title} onClick={onClick} disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center',
        padding: '8px 12px', background: s.bg, color: s.color,
        border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        transition: 'opacity 0.12s', fontFamily: 'Inter,sans-serif',
      }}>
      {children}
    </button>
  );
}

// Avatar com iniciais
function Avatar({ name }) {
  const initials = (name || '?')
    .split(' ')
    .filter(w => w.length > 0)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
  return (
    <div style={{
      width: '44px', height: '44px', borderRadius: '50%',
      background: `linear-gradient(135deg, ${C.brand}, #7D2637)`,
      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '16px', fontWeight: '700', fontFamily: 'Inter, sans-serif',
      flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

export default function M31InscricaoDrawer({ inscricao, onClose }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState('overview');
  const [loadingComprovante, setLoadingComprovante] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [transferLink, setTransferLink] = useState(null);
  const [transferCopied, setTransferCopied] = useState(false);
  const [operacao, setOperacao] = useState(null);
  const [operacaoForm, setOperacaoForm] = useState({});
  const [operatorSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem('m31_operador_atual') || 'null'); } catch { return null; }
  });

  // Config do evento (para saber o prazo de transferência)
  const { data: eventoConfig } = useQuery({
    queryKey: ['drawer-evento-config'],
    queryFn: async () => {
      const cfgs = await base44.entities.EventoM31Config.list('-created_date', 1);
      return cfgs?.[0] || null;
    },
  });

  // Busca voluntário vinculado (por inscricao_id ou email)
  const { data: voluntario } = useQuery({
    queryKey: ['drawer-voluntario', inscricao?.id, inscricao?.email],
    queryFn: async () => {
      const byInsc = await base44.entities.EventoM31Voluntario.filter({ inscricao_id: inscricao.id }, '-created_date', 1);
      if (byInsc.length > 0) return byInsc[0];
      if (inscricao.email) {
        const byEmail = await base44.entities.EventoM31Voluntario.filter({ email: inscricao.email }, '-created_date', 1);
        if (byEmail.length > 0) return byEmail[0];
      }
      return null;
    },
    enabled: !!inscricao?.id,
  });

  // Busca caravana detalhada (se caravana_id existir)
  const { data: caravana } = useQuery({
    queryKey: ['drawer-caravana', inscricao?.caravana_id],
    queryFn: () => base44.entities.EventoM31Caravana.get(inscricao.caravana_id),
    enabled: !!inscricao?.caravana_id,
  });

  const { data: caravanas = [] } = useQuery({
    queryKey: ['drawer-caravanas-operacao'],
    queryFn: () => base44.entities.EventoM31Caravana.filter({ ativa: true }, 'nome', 200),
    enabled: tab === 'acoes' && !!inscricao?.id,
  });

  // Busca logs de mensagens
  const { data: msgs = [] } = useQuery({
    queryKey: ['drawer-msgs', inscricao?.id],
    queryFn: () => base44.asServiceRole.entities.M31MessageLog
      .filter({ inscricao_id: inscricao.id }, '-enviado_em', 50),
    enabled: !!inscricao?.id,
  });

  // Busca logs de auditoria
  const { data: auditLogs = [] } = useQuery({
    queryKey: ['drawer-audit', inscricao?.id],
    queryFn: () => base44.asServiceRole.entities.M31AuditLog
      .filter({ pessoa_id: inscricao?.id }, '-created_date', 20),
    enabled: !!inscricao?.id,
  });

  if (!inscricao) return null;

  const isPending = ['pendente', 'checkout_pendente', 'checkout_abandonado'].includes(inscricao.status_pagamento);
  const isConfirmado = ['aprovado', 'gratuito'].includes(inscricao.status_pagamento);
  const waLink = `https://wa.me/55${(inscricao.whatsapp || '').replace(/\D/g, '')}`;

  // Tabs dinâmicas (condicionais)
  const TABS = [
    { key: 'overview', label: 'Visão Geral', icon: LayoutGrid },
    { key: 'dados', label: 'Dados', icon: User },
    { key: 'pagamento', label: 'Pagamento', icon: CreditCard },
    ...(inscricao.tipo === 'caravana' || inscricao.caravana_id ? [{ key: 'caravana', label: 'Caravana', icon: Bus }] : []),
    ...(voluntario ? [{ key: 'voluntariado', label: 'Voluntariado', icon: HandHeart }] : []),
    { key: 'tarefas', label: 'Tarefas', icon: CheckSquare },
    { key: 'historico', label: 'Linha do Tempo', icon: Clock },
    { key: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
    { key: 'logs', label: 'Logs', icon: FileText },
    { key: 'qrcode', label: 'QR Code', icon: QrCode },
    { key: 'acoes', label: 'Ações', icon: Zap },
  ];

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['m31inscricoes-table'] });
    await qc.invalidateQueries({ queryKey: ['drawer-msgs', inscricao.id] });
  }

  async function handleVerAsaas() {
    if (isConfirmado && inscricao.asaas_payment_id) {
      setLoadingComprovante(true);
      try {
        const res = await base44.functions.invoke('m31BuscarComprovanteAsaas', { inscricao_id: inscricao.id });
        const url = res.data?.urls?.transaction_receipt_url || res.data?.urls?.invoice_url || inscricao.asaas_charge_url;
        if (url) window.open(url, '_blank');
        else alert('Comprovante não disponível no Asaas. ID: ' + inscricao.asaas_payment_id);
      } catch {
        if (inscricao.asaas_charge_url) window.open(inscricao.asaas_charge_url, '_blank');
      } finally { setLoadingComprovante(false); }
      return;
    }
    if (inscricao.asaas_charge_url) window.open(inscricao.asaas_charge_url, '_blank');
  }

  async function handleReenviar() {
    setActionLoading('reenviar');
    try { await base44.functions.invoke('m31ReenviarCobranca', { inscricao_id: inscricao.id }); await refresh(); }
    finally { setActionLoading(null); }
  }

  async function handleMarcarPago() {
    setActionLoading('pago');
    try { await base44.entities.EventoM31Inscricao.update(inscricao.id, { status_pagamento: 'aprovado' }); await refresh(); }
    finally { setActionLoading(null); }
  }

  async function handleEntrarGrupo() {
    setActionLoading('grupo');
    try {
      await base44.entities.EventoM31Inscricao.update(inscricao.id, {
        entrou_no_grupo: true, data_entrada_grupo: new Date().toISOString(),
        origem_confirmacao_grupo: 'manual',
      });
      await refresh();
    } finally { setActionLoading(null); }
  }

  async function handleReenviarQR() {
    setActionLoading('qr');
    try { await base44.functions.invoke('m31ReenviarQRCode', { inscricao_id: inscricao.id }); await refresh(); }
    finally { setActionLoading(null); }
  }

  async function handleGerarTransferencia() {
    setActionLoading('transferir');
    try {
      const res = await base44.functions.invoke('m31GerarLinkTransferencia', { inscricao_id: inscricao.id });
      if (res.data?.success) {
        setTransferLink(`${window.location.origin}${res.data.path}`);
        setTransferCopied(false);
      } else {
        alert(res.data?.error || 'Não foi possível gerar o link de transferência.');
      }
    } catch (err) {
      alert(err?.response?.data?.error || 'Não foi possível gerar o link de transferência.');
    } finally { setActionLoading(null); }
  }

  async function copyTransferLink() {
    try {
      await navigator.clipboard.writeText(transferLink);
      setTransferCopied(true);
      setTimeout(() => setTransferCopied(false), 2000);
    } catch { /* clipboard indisponível */ }
  }

  function abrirOperacao(tipo) {
    setOperacao(tipo);
    setOperacaoForm({ nome: inscricao.nome || '', whatsapp: inscricao.whatsapp || '', email: inscricao.email || '', cpf: inscricao.cpf || '', cidade: inscricao.cidade || '', estado: inscricao.estado || '', caravana_destino_id: inscricao.caravana_id || '' });
  }

  async function salvarOperacao() {
    setActionLoading('operacao');
    try {
      const res = await base44.functions.invoke('m31OperarParticipante', { action: operacao, session_id: operatorSession?.session_id, inscricao_id: inscricao.id, ...operacaoForm });
      if (res.data?.error) throw new Error(res.data.message || res.data.error);
      setOperacao(null);
      await refresh();
      alert('Alteração salva.');
    } catch (error) {
      alert(error?.response?.data?.message || error.message || 'Não foi possível salvar a alteração.');
    } finally { setActionLoading(null); }
  }

  const prazoTransferencia = eventoConfig?.data_limite_transferencia;
  const transferenciaPermitida = prazoTransferencia && new Date() < new Date(prazoTransferencia);

  return (
    <M31Drawer
      open={!!inscricao}
      onClose={onClose}
      width="560px"
      title={inscricao.nome}
      subtitle={`${TIPO_LABEL[inscricao.tipo] || inscricao.tipo} · ${inscricao.cidade || '—'}/${inscricao.estado || '—'}`}
      status={<StatusBadge status={inscricao.status_pagamento} />}
      avatar={<Avatar name={inscricao.nome} />}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
    >
      {/* ── ABA: VISÃO GERAL (360°) ── */}
      {tab === 'overview' && (
        <M31CentroOverview inscricao={inscricao} voluntario={voluntario} onNavigate={setTab} />
      )}

      {/* ── ABA: DADOS ── */}
      {tab === 'dados' && (
        <div>
          <Row label="Nome" value={inscricao.nome} />
          <Row label="E-mail" value={inscricao.email} />
          <Row label="WhatsApp" value={inscricao.whatsapp} />
          <Row label="CPF" value={inscricao.cpf} />
          <Row label="Cidade/Estado" value={`${inscricao.cidade || '—'} / ${inscricao.estado || '—'}`} />
          <Row label="Tipo" value={TIPO_LABEL[inscricao.tipo] || inscricao.tipo} />
          <Row label="Lote" value={inscricao.lote?.replace('_', ' ')} />
          <Row label="Igreja" value={inscricao.nome_igreja} />
          <Row label="Como conheceu" value={inscricao.como_conheceu} />
          <Row label="Já participou do M31" value={inscricao.ja_participou_m31 ? 'Sim' : 'Não'} />
          <Row label="Criado em" value={fmtDate(inscricao.created_date)} />
          <Row label="Observações" value={inscricao.observacoes} />
        </div>
      )}

      {/* ── ABA: PAGAMENTO ── */}
      {tab === 'pagamento' && (
        <div>
          <Row label="Status" value={STATUS_CFG[inscricao.status_pagamento]?.label} />
          <Row label="Valor" value={fmtBRL(inscricao.valor_pago)} />
          <Row label="Método" value={inscricao.asaas_billing_type} />
          <Row label="Parcelas" value={inscricao.asaas_installment_count ? `${inscricao.asaas_installment_count}x` : 'À vista'} />
          <Row label="Valor parcela" value={inscricao.asaas_installment_value ? fmtBRL(inscricao.asaas_installment_value) : null} />
          <Row label="Valor total" value={inscricao.asaas_total_value ? fmtBRL(inscricao.asaas_total_value) : null} />
          <Row label="Cupom" value={inscricao.cupom_usado} />
          <Row label="ID Asaas" value={inscricao.asaas_payment_id} />
          <Row label="Origem" value={inscricao.origem_inscricao} />
          <Row label="Pago por" value={inscricao.pagador_nome} />
          <Row label="Nº interno" value={inscricao.ordem_operacional != null ? `#${String(inscricao.ordem_operacional).padStart(3, '0')}` : null} />
          <Row label="Checkout abandonado em" value={inscricao.checkout_abandoned_at ? fmtDate(inscricao.checkout_abandoned_at) : null} />

          <div style={{ marginTop: '16px' }}>
            <ActionBtn title="Ver no Asaas" onClick={handleVerAsaas} disabled={loadingComprovante || (!inscricao.asaas_charge_url && !inscricao.asaas_payment_id)}>
              <ExternalLink size={14} /> {loadingComprovante ? 'Buscando...' : 'Ver comprovante Asaas'}
            </ActionBtn>
          </div>
        </div>
      )}

      {/* ── ABA: CARAVANA ── */}
      {tab === 'caravana' && (
        <div>
          {caravana ? (
            <>
              <Row label="Caravana" value={caravana.nome} />
              <Row label="Líder" value={caravana.lider_nome} />
              <Row label="WhatsApp do líder" value={caravana.lider_whatsapp} />
              <Row label="Cidade de origem" value={caravana.cidade_origem} />
              <Row label="Total de membros" value={caravana.total_membros} />
              <Row label="Ativa" value={caravana.ativa ? 'Sim' : 'Não'} />
              <Row label="Observações" value={caravana.observacoes} />
            </>
          ) : (
            <div>
              <Row label="Caravana" value={inscricao.caravana_nome || '—'} />
              <Row label="ID" value={inscricao.caravana_id || '—'} />
              {!inscricao.caravana_id && (
                <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '8px', fontSize: '12px', color: C.warning }}>
                  ⚠ Sem caravana vinculada. Vincule uma caravana através da lista de inscrições.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ABA: VOLUNTARIADO ── */}
      {tab === 'voluntariado' && voluntario && (
        <div>
          <Row label="Nome" value={voluntario.nome} />
          <Row label="Setor" value={voluntario.setor} />
          <Row label="Função" value={voluntario.funcao} />
          <Row label="Status" value={voluntario.status} />
          <Row label="Check-in no evento" value={voluntario.checkin_evento ? `Sim · ${fmtDate(voluntario.checkin_evento_at)}` : 'Não'} />
          <Row label="WhatsApp" value={voluntario.whatsapp} />
          <Row label="E-mail" value={voluntario.email} />
          <Row label="Observações" value={voluntario.observacoes} />
        </div>
      )}

      {/* ── ABA: TAREFAS ── */}
      {tab === 'tarefas' && (
        <M31ParticipanteTarefas email={inscricao.email} />
      )}

      {/* ── ABA: LINHA DO TEMPO ── */}
      {tab === 'historico' && (
        <M31ParticipanteTimeline inscricao={inscricao} />
      )}

      {/* ── ABA: WHATSAPP ── */}
      {tab === 'whatsapp' && (
        <div>
          <div style={{ marginBottom: '12px' }}>
            <ActionBtn title="Abrir WhatsApp" onClick={() => window.open(waLink, '_blank')} variant="success">
              <MessageSquare size={14} /> Abrir conversa no WhatsApp
            </ActionBtn>
          </div>
          <div style={{ fontSize: '11px', fontWeight: '600', color: C.textSec, textTransform: 'uppercase', marginBottom: '8px' }}>
            Mensagens enviadas ({msgs.length})
          </div>
          {msgs.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: C.textTer, fontSize: '12px' }}>
              Nenhuma mensagem registrada.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {msgs.map(m => (
                <div key={m.id} style={{
                  padding: '8px 10px', background: C.bg1, borderRadius: '6px',
                  borderLeft: `3px solid ${m.sucesso ? C.success : C.danger}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: C.text }}>{m.tipo}</span>
                    <span style={{ fontSize: '10px', color: C.textTer }}>{fmtDate(m.enviado_em)}</span>
                  </div>
                  {m.erro && <div style={{ fontSize: '11px', color: C.danger }}>{m.erro}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ABA: LOGS ── */}
      {tab === 'logs' && (
        <div>
          <div style={{ fontSize: '11px', fontWeight: '600', color: C.textSec, textTransform: 'uppercase', marginBottom: '8px' }}>
            Auditoria ({auditLogs.length})
          </div>
          {auditLogs.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: C.textTer, fontSize: '12px' }}>
              Nenhum log de auditoria.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {auditLogs.map(a => (
                <div key={a.id} style={{
                  padding: '8px 10px', background: C.bg1, borderRadius: '6px',
                  borderLeft: `3px solid ${a.gravidade === 'critico' ? C.danger : a.gravidade === 'alto' ? C.warning : C.info}`,
                }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: C.text }}>{a.tipo_erro}</div>
                  <div style={{ fontSize: '11px', color: C.textSec, marginTop: '2px' }}>{a.descricao}</div>
                  <div style={{ fontSize: '10px', color: C.textTer, marginTop: '2px' }}>{fmtDate(a.created_date)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ABA: QR CODE ── */}
      {tab === 'qrcode' && (
        <div style={{ textAlign: 'center' }}>
          {inscricao.qrcode_url ? (
            <div>
              <img src={inscricao.qrcode_url} alt="QR Code" style={{ width: '200px', height: '200px', borderRadius: '8px', border: `1px solid ${C.border}` }} />
              <div style={{ fontSize: '12px', color: C.textSec, marginTop: '8px' }}>
                Gerado em: {fmtDate(inscricao.qrcode_gerado_em)}
              </div>
              <div style={{ fontSize: '11px', color: C.textTer, marginTop: '2px' }}>
                Status: {inscricao.qr_envio_status} · Tentativas: {inscricao.qr_tentativas_envio || 0}
              </div>
              <div style={{ marginTop: '12px' }}>
                <ActionBtn title="Reenviar QR" onClick={handleReenviarQR} disabled={actionLoading === 'qr'} variant="brand">
                  <Send size={14} /> {actionLoading === 'qr' ? 'Enviando...' : 'Reenviar QR Code'}
                </ActionBtn>
              </div>
            </div>
          ) : (
            <div style={{ padding: '40px 20px' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎫</div>
              <div style={{ fontSize: '13px', color: C.textSec, marginBottom: '12px' }}>QR Code ainda não gerado</div>
              <ActionBtn title="Gerar QR" onClick={handleReenviarQR} disabled={actionLoading === 'qr'} variant="brand">
                <QrCode size={14} /> {actionLoading === 'qr' ? 'Gerando...' : 'Gerar QR Code'}
              </ActionBtn>
            </div>
          )}
        </div>
      )}

      {/* ── ABA: AÇÕES ── */}
      {tab === 'acoes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {!operacao ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <ActionBtn title="Editar dados" onClick={() => abrirOperacao('editar_participante')} variant="brand"><User size={14} /> Editar dados</ActionBtn>
                <ActionBtn title="Substituir participante" onClick={() => abrirOperacao('substituir_titular')}><ArrowRightLeft size={14} /> Substituir participante</ActionBtn>
              </div>
              <ActionBtn title="Organizar caravana" onClick={() => abrirOperacao(inscricao.caravana_id ? 'mover_caravana' : 'incluir_caravana')}><Bus size={14} /> Organizar caravana</ActionBtn>
              {inscricao.caravana_id && <ActionBtn title="Retirar da caravana" onClick={() => abrirOperacao('retirar_caravana')}><X size={14} /> Retirar da caravana</ActionBtn>}
            </>
          ) : (
            <div style={{ padding: '12px', border: `1px solid ${C.border}`, borderRadius: '8px', background: C.bg1 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>
                {operacao === 'editar_participante' ? 'Editar dados' : operacao === 'substituir_titular' ? 'Substituir participante' : 'Organizar caravana'}
              </div>
              {(operacao === 'editar_participante' || operacao === 'substituir_titular') && (
                <div style={{ display: 'grid', gap: '7px' }}>
                  {['nome', 'whatsapp', 'email', 'cpf', 'cidade', 'estado'].map(field => (
                    <input key={field} value={operacaoForm[field] || ''} placeholder={field.toUpperCase()} onChange={e => setOperacaoForm({ ...operacaoForm, [field]: e.target.value })}
                      style={{ padding: '8px', border: `1px solid ${C.borderSt}`, borderRadius: '6px', fontSize: '12px' }} />
                  ))}
                </div>
              )}
              {(operacao === 'mover_caravana' || operacao === 'incluir_caravana') && (
                <select value={operacaoForm.caravana_destino_id || ''} onChange={e => setOperacaoForm({ ...operacaoForm, caravana_destino_id: e.target.value })}
                  style={{ width: '100%', padding: '9px', border: `1px solid ${C.borderSt}`, borderRadius: '6px', fontSize: '12px' }}>
                  <option value="">Selecione a caravana</option>
                  {caravanas.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}
                </select>
              )}
              {operacao === 'retirar_caravana' && <div style={{ fontSize: '12px', color: C.textSec, marginBottom: '8px' }}>A participante continuará inscrita como público geral.</div>}
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <ActionBtn title="Cancelar" onClick={() => setOperacao(null)}>Cancelar</ActionBtn>
                <ActionBtn title="Salvar alteração" onClick={salvarOperacao} disabled={actionLoading === 'operacao'} variant="brand"><Check size={14} /> {actionLoading === 'operacao' ? 'Salvando...' : 'Salvar'}</ActionBtn>
              </div>
            </div>
          )}
          <ActionBtn title="Abrir WhatsApp" onClick={() => window.open(waLink, '_blank')} variant="success">
            <MessageSquare size={14} /> Abrir WhatsApp
          </ActionBtn>
          {isPending && (
            <ActionBtn title="Reenviar cobrança" onClick={handleReenviar} disabled={actionLoading === 'reenviar'} variant="brand">
              <Send size={14} /> {actionLoading === 'reenviar' ? 'Enviando...' : 'Reenviar cobrança'}
            </ActionBtn>
          )}
          {isPending && (
            <ActionBtn title="Marcar como pago" onClick={handleMarcarPago} disabled={actionLoading === 'pago'} variant="success">
              <Check size={14} /> {actionLoading === 'pago' ? 'Salvando...' : 'Marcar como pago'}
            </ActionBtn>
          )}
          {isConfirmado && !inscricao.entrou_no_grupo && (
            <ActionBtn title="Marcar entrada no grupo" onClick={handleEntrarGrupo} disabled={actionLoading === 'grupo'} variant="brand">
              <Check size={14} /> {actionLoading === 'grupo' ? 'Salvando...' : 'Marcar entrada no grupo'}
            </ActionBtn>
          )}
          {isConfirmado && (
            <ActionBtn title="Reenviar QR Code" onClick={handleReenviarQR} disabled={actionLoading === 'qr'} variant="brand">
              <QrCode size={14} /> {actionLoading === 'qr' ? 'Enviando...' : 'Reenviar QR Code'}
            </ActionBtn>
          )}
          <ActionBtn title="Ver no Asaas" onClick={handleVerAsaas} disabled={!inscricao.asaas_charge_url && !inscricao.asaas_payment_id}>
            <ExternalLink size={14} /> Ver no Asaas
          </ActionBtn>

          <M31ContatoActions inscricao={inscricao} />

          {transferenciaPermitida && (
            <>
              <div style={{ height: '1px', background: C.border, margin: '4px 0' }} />
              <ActionBtn title="Transferir inscrição" onClick={handleGerarTransferencia} disabled={actionLoading === 'transferir'} variant="brand">
                <ArrowRightLeft size={14} /> {actionLoading === 'transferir' ? 'Gerando link...' : 'Transferir inscrição'}
              </ActionBtn>
              {transferLink && (
                <div style={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: C.textSec, marginBottom: '6px' }}>
                    Link de transferência (envie por WhatsApp):
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input readOnly value={transferLink} onFocus={e => e.target.select()}
                      style={{ flex: 1, fontSize: '11px', padding: '6px 8px', border: `1px solid ${C.borderSt}`, borderRadius: '6px', color: C.text, background: '#fff' }} />
                    <ActionBtn title="Copiar" onClick={copyTransferLink} variant={transferCopied ? 'success' : 'default'}>
                      {transferCopied ? <Check size={14} /> : <Copy size={14} />}
                    </ActionBtn>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </M31Drawer>
  );
}
