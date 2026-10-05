import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { X, Search, Eye, EyeOff, MessageCircle, Receipt, Loader, Download } from 'lucide-react';

// ── DESIGN TOKENS ─────────────────────────────────────────────
const T = {
  surface1: '#FFFFFF', surface2: '#FFFFFF', surface3: '#F9FAFB',
  border: '#E5E7EB', borderMd: '#D1D5DB',
  text: '#1A1A1A', textSec: '#6B7280', textMut: '#9CA3AF',
  accent: '#7A1F2B', accentBright: '#9A2838',
  green: '#10B981', amber: '#F59E0B', red: '#EF4444', blue: '#3B82F6', slate: '#64748B',
  fontHead: "'Inter', sans-serif",
  fontBody: "'Inter', sans-serif",
};

const brl = (n) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ── STATUS FINANCEIRO ──────────────────────────────────────────
// Deriva um status financeiro claro a partir dos dados reais da inscrição
function statusFinanceiro(insc) {
  const sp = insc.status_pagamento;
  if (sp === 'gratuito') return 'isento';
  if (sp === 'aprovado') return 'pago';
  if (sp === 'cancelado') return 'cancelado';
  if (sp === 'checkout_abandonado') return 'aguardando';
  if (sp === 'pendente' || sp === 'checkout_pendente') return 'aguardando';
  return 'analise';
}

const STATUS_CFG = {
  pago:       { label: 'Pago',                color: T.green },
  parcial:    { label: 'Pagamento parcial',   color: T.amber },
  aguardando: { label: 'Aguardando pagamento',color: T.slate },
  vencido:    { label: 'Vencido',             color: T.red },
  isento:     { label: 'Isento',              color: T.blue },
  analise:    { label: 'Em análise',          color: T.textMut },
  cancelado:  { label: 'Cancelado',           color: T.textMut },
};

const BILLING_LABEL = {
  PIX: 'PIX', CREDIT_CARD: 'Cartão', BOLETO: 'Boleto',
  DEBIT_CARD: 'Débito', TRANSFER: 'Transferência', gratuito: 'Gratuito',
};

// ── PRIMITIVOS ─────────────────────────────────────────────────
function Chip({ label, color }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
      fontSize: '11px', fontWeight: '600', color,
      backgroundColor: `${color}18`, border: `1px solid ${color}28`,
      borderRadius: '5px', padding: '2px 8px', fontFamily: T.fontBody,
    }}>{label}</span>
  );
}

function KpiCard({ label, value, color, sub }) {
  return (
    <div style={{ backgroundColor: T.surface2, border: `1px solid ${T.border}`, borderRadius: '12px', padding: '16px 18px' }}>
      <div style={{ fontSize: '11px', fontWeight: '600', color: T.textMut, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.fontBody, marginBottom: '10px' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: '800', color: color || T.text, fontFamily: T.fontHead, lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: T.textMut, marginTop: '6px', fontFamily: T.fontBody }}>{sub}</div>}
    </div>
  );
}

// ── PAINEL LATERAL: HISTÓRICO ──────────────────────────────────
function HistoricoDrawer({ insc, onClose }) {
  const status = statusFinanceiro(insc);
  const cfg = STATUS_CFG[status];
  const [buscando, setBuscando] = useState(false);
  const [comprovante, setComprovante] = useState(null);
  const [erro, setErro] = useState(null);

  async function buscarComprovante() {
    setBuscando(true); setErro(null);
    try {
      const res = await base44.functions.invoke('m31BuscarComprovanteAsaas', { inscricao_id: insc.id });
      setComprovante(res.data);
    } catch (e) {
      setErro(e.message || 'Não foi possível buscar o comprovante');
    }
    setBuscando(false);
  }

  const linha = (label, valor) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${T.border}` }}>
      <span style={{ fontSize: '12px', color: T.textSec, fontFamily: T.fontBody }}>{label}</span>
      <span style={{ fontSize: '12px', color: T.text, fontWeight: '600', fontFamily: T.fontBody, textAlign: 'right' }}>{valor || '—'}</span>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: T.surface2, width: '100%', maxWidth: '440px', height: '100%', overflowY: 'auto', padding: '24px', boxShadow: '-8px 0 24px rgba(0,0,0,0.12)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: T.text, fontFamily: T.fontHead }}>{insc.nome}</div>
            <div style={{ fontSize: '12px', color: T.textSec, marginTop: '3px', fontFamily: T.fontBody }}>
              {insc.area_voluntario || 'Sem área'} · {insc.codigo_inscricao || '—'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.textMut, cursor: 'pointer', padding: '4px' }}><X size={18} /></button>
        </div>

        <div style={{ marginBottom: '20px' }}><Chip label={cfg.label} color={cfg.color} /></div>

        {/* Resumo financeiro */}
        <div style={{ fontSize: '11px', fontWeight: '700', color: T.textMut, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Resumo</div>
        <div style={{ marginBottom: '22px' }}>
          {linha('Valor acordado', brl(insc.valor_pago))}
          {linha('Valor recebido', status === 'pago' ? brl(insc.valor_pago) : brl(0))}
          {linha('Saldo restante', status === 'pago' || status === 'isento' ? brl(0) : brl(insc.valor_pago))}
          {linha('Forma de pagamento', BILLING_LABEL[insc.asaas_billing_type] || '—')}
          {linha('Provedor', insc.asaas_payment_id || insc.asaas_charge_url ? 'Asaas' : '—')}
          {linha('WhatsApp', insc.whatsapp)}
          {linha('Última atualização', insc.updated_date ? new Date(insc.updated_date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')}
        </div>

        {/* Movimentações */}
        <div style={{ fontSize: '11px', fontWeight: '700', color: T.textMut, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>Movimentações</div>
        {status === 'pago' ? (
          <div style={{ backgroundColor: T.surface3, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '12px 14px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>Pagamento confirmado</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: T.green }}>{brl(insc.valor_pago)}</span>
            </div>
            <div style={{ fontSize: '11px', color: T.textMut }}>
              {BILLING_LABEL[insc.asaas_billing_type] || 'Asaas'} · {insc.pagamento_confirmado_em ? new Date(insc.pagamento_confirmado_em).toLocaleDateString('pt-BR') : (insc.updated_date ? new Date(insc.updated_date).toLocaleDateString('pt-BR') : '—')}
              {insc.asaas_payment_id ? ` · ${insc.asaas_payment_id}` : ''}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px', border: `1px dashed ${T.border}`, borderRadius: '9px', marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', color: T.textMut }}>Nenhum pagamento confirmado ainda</div>
          </div>
        )}

        {/* Ações */}
        {status === 'pago' && (
          <button onClick={buscarComprovante} disabled={buscando} style={{
            width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
            padding: '11px', borderRadius: '9px', border: `1px solid ${T.border}`, backgroundColor: T.surface1,
            color: T.textSec, fontSize: '13px', fontWeight: '600', cursor: buscando ? 'wait' : 'pointer', fontFamily: T.fontBody, marginBottom: '10px',
          }}>
            {buscando ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Buscando...</> : <><Receipt size={14} /> Buscar comprovante Asaas</>}
          </button>
        )}
        {erro && <div style={{ fontSize: '12px', color: T.red, marginBottom: '10px' }}>{erro}</div>}
        {comprovante?.invoiceUrl && (
          <a href={comprovante.invoiceUrl} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', fontSize: '12px', color: T.blue, marginBottom: '10px' }}>Abrir comprovante →</a>
        )}
        {insc.whatsapp && (
          <a href={`https://wa.me/${insc.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{
            width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
            padding: '11px', borderRadius: '9px', border: 'none', backgroundColor: T.green, color: '#fff',
            fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: T.fontBody, textDecoration: 'none', boxSizing: 'border-box',
          }}><MessageCircle size={14} /> Falar no WhatsApp</a>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

// ── COMPONENTE PRINCIPAL ───────────────────────────────────────
export default function M31FinanceiroVoluntarios() {
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroArea, setFiltroArea] = useState('todos');
  const [filtroForma, setFiltroForma] = useState('todos');
  const [selecionado, setSelecionado] = useState(null);
  const [mostrarValores, setMostrarValores] = useState(false);

  const { data: inscricoes = [], isLoading } = useQuery({
    queryKey: ['m31finVoluntarios'],
    queryFn: () => base44.entities.EventoM31Inscricao.filter({ tipo: 'voluntario' }, '-created_date', 500),
  });

  const { data: voluntarios = [] } = useQuery({
    queryKey: ['m31voluntarios-fin'],
    queryFn: () => base44.entities.EventoM31Voluntario.list('-created_date', 500),
  });

  // Mapa de voluntário por telefone (normalizado) para trazer tamanho_camiseta, setor, funcao, etc.
  const volMap = useMemo(() => {
    const norm = (tel) => (tel || '').replace(/\D/g, '');
    const m = {};
    voluntarios.forEach(v => {
      const key = norm(v.whatsapp);
      if (key) m[key] = v;
    });
    return m;
  }, [voluntarios]);

  // Ignora cancelados na visão principal (mantém apenas voluntárias ativas no fluxo)
  const ativos = useMemo(() => inscricoes.filter(i => statusFinanceiro(i) !== 'cancelado'), [inscricoes]);

  const mask = (v) => mostrarValores ? v : '•••••';

  // ── STATS (regras financeiras) ──
  const stats = useMemo(() => {
    let pagos = 0, aguardando = 0, isentos = 0, recebido = 0, aReceber = 0;
    ativos.forEach(i => {
      const s = statusFinanceiro(i);
      if (s === 'pago') { pagos++; recebido += (i.valor_pago || 0); }
      else if (s === 'isento') { isentos++; }
      else if (s === 'aguardando' || s === 'analise') { aguardando++; aReceber += (i.valor_pago || 0); }
    });
    return { total: ativos.length, pagos, parciais: 0, aguardando, isentos, recebido, aReceber };
  }, [ativos]);

  const areas = useMemo(() => {
    const set = new Set(ativos.map(i => i.area_voluntario).filter(Boolean));
    return Array.from(set);
  }, [ativos]);

  // ── FILTROS ──
  const filtrados = useMemo(() => ativos.filter(i => {
    const s = statusFinanceiro(i);
    if (filtroStatus !== 'todos' && s !== filtroStatus) return false;
    if (filtroArea !== 'todos' && i.area_voluntario !== filtroArea) return false;
    if (filtroForma !== 'todos' && (i.asaas_billing_type || '') !== filtroForma) return false;
    if (busca.trim()) {
      const q = busca.toLowerCase();
      if (!(i.nome || '').toLowerCase().includes(q) && !(i.whatsapp || '').includes(q)) return false;
    }
    return true;
  }), [ativos, filtroStatus, filtroArea, filtroForma, busca]);

  function exportarCSV() {
    const norm = (tel) => (tel || '').replace(/\D/g, '');
    const cols = [
      'nome', 'whatsapp', 'email', 'setor', 'funcao', 'tamanho_camiseta',
      'area_voluntario', 'status_inscricao', 'valor_pago', 'asaas_billing_type',
      'asaas_payment_id', 'asaas_installment_count', 'asaas_installment_value',
      'pagamento_confirmado_em', 'codigo_inscricao', 'cidade', 'estado',
      'status_voluntario', 'checkin_evento', 'grupo_ids', 'observacoes',
    ];
    const header = [
      'Nome', 'WhatsApp', 'Email', 'Setor', 'Função', 'Tamanho Camiseta',
      'Área Voluntário', 'Status Inscrição', 'Valor Pago', 'Forma Pagamento',
      'ID Asaas', 'Parcelas', 'Valor Parcela', 'Pagamento Confirmado Em',
      'Código Inscrição', 'Cidade', 'Estado', 'Status Voluntário',
      'Check-in Evento', 'Grupos', 'Observações',
    ];
    const fmtStatus = (i) => {
      const s = statusFinanceiro(i);
      return STATUS_CFG[s]?.label || s;
    };
    const rows = filtrados.map(i => {
      const v = volMap[norm(i.whatsapp)] || {};
      return [
        i.nome || '', i.whatsapp || '', i.email || v.email || '',
        v.setor || '', v.funcao || '', v.tamanho_camiseta || '',
        i.area_voluntario || '', fmtStatus(i),
        i.valor_pago || 0, BILLING_LABEL[i.asaas_billing_type] || '',
        i.asaas_payment_id || '', i.asaas_installment_count || '',
        i.asaas_installment_value || '',
        i.pagamento_confirmado_em || '', i.codigo_inscricao || '',
        i.cidade || '', i.estado || '',
        v.status || '', v.checkin_evento ? 'Sim' : 'Não',
        (v.grupo_ids || []).join('|'), v.observacoes || '',
      ];
    });
    const csv = [header, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voluntarios-m31-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const selStyle = {
    backgroundColor: T.surface2, border: `1px solid ${T.border}`, borderRadius: '8px',
    color: T.textSec, fontFamily: T.fontBody, fontSize: '12px', padding: '8px 12px', outline: 'none', cursor: 'pointer',
  };
  const th = { fontSize: '10px', fontWeight: '700', color: T.textMut, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', padding: '10px 12px', fontFamily: T.fontBody, whiteSpace: 'nowrap' };
  const td = { fontSize: '13px', color: T.text, padding: '12px', fontFamily: T.fontBody, borderTop: `1px solid ${T.border}`, whiteSpace: 'nowrap' };

  if (isLoading) {
    return <div style={{ textAlign: 'center', padding: '48px', color: T.textMut, fontFamily: T.fontBody }}>Carregando financeiro das voluntárias...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Toggle valores + Exportar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <button onClick={exportarCSV} disabled={filtrados.length === 0} style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px', background: T.surface2,
          border: `1px solid ${T.border}`, borderRadius: '8px', padding: '7px 12px',
          fontSize: '12px', fontWeight: '600', color: T.textSec, cursor: filtrados.length === 0 ? 'not-allowed' : 'pointer', fontFamily: T.fontBody, opacity: filtrados.length === 0 ? 0.5 : 1,
        }}>
          <Download size={13} /> Exportar CSV
        </button>
        <button onClick={() => setMostrarValores(v => !v)} style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none',
          border: `1px solid ${T.border}`, borderRadius: '8px', padding: '7px 12px',
          fontSize: '12px', fontWeight: '600', color: T.textSec, cursor: 'pointer', fontFamily: T.fontBody,
        }}>
          {mostrarValores ? <EyeOff size={13} /> : <Eye size={13} />}
          {mostrarValores ? 'Ocultar valores' : 'Mostrar valores'}
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
        <KpiCard label="Total voluntárias" value={stats.total} />
        <KpiCard label="Pagos" value={stats.pagos} color={T.green} sub={`${stats.total > 0 ? Math.round(stats.pagos / stats.total * 100) : 0}% quitados`} />
        <KpiCard label="Aguardando" value={stats.aguardando} color={T.slate} />
        <KpiCard label="Isentos" value={stats.isentos} color={T.blue} />
        <KpiCard label="Valor recebido" value={mask(brl(stats.recebido))} color={T.green} sub="somente pagamentos confirmados" />
        <KpiCard label="Valor a receber" value={mask(brl(stats.aReceber))} color={T.amber} sub="não contabilizado como receita" />
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px' }}>
          <Search size={14} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: T.textMut }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou WhatsApp"
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px 9px 32px', border: `1px solid ${T.border}`, borderRadius: '8px', fontSize: '13px', fontFamily: T.fontBody, outline: 'none', color: T.text, backgroundColor: T.surface2 }} />
        </div>
        <select style={selStyle} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="todos">Todos os status</option>
          <option value="pago">Pago</option>
          <option value="aguardando">Aguardando pagamento</option>
          <option value="isento">Isento</option>
          <option value="analise">Em análise</option>
        </select>
        <select style={selStyle} value={filtroArea} onChange={e => setFiltroArea(e.target.value)}>
          <option value="todos">Todas as áreas</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select style={selStyle} value={filtroForma} onChange={e => setFiltroForma(e.target.value)}>
          <option value="todos">Todas as formas</option>
          <option value="PIX">PIX</option>
          <option value="CREDIT_CARD">Cartão</option>
        </select>
      </div>

      {/* Tabela principal */}
      <div style={{ backgroundColor: T.surface2, border: `1px solid ${T.border}`, borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
            <thead style={{ backgroundColor: T.surface3 }}>
              <tr>
                <th style={th}>Voluntária</th>
                <th style={th}>Área</th>
                <th style={th}>Valor</th>
                <th style={th}>Pago</th>
                <th style={th}>Falta</th>
                <th style={th}>Forma</th>
                <th style={th}>Atualizado</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(i => {
                const s = statusFinanceiro(i);
                const cfg = STATUS_CFG[s];
                const pago = s === 'pago' ? (i.valor_pago || 0) : 0;
                const falta = (s === 'pago' || s === 'isento') ? 0 : (i.valor_pago || 0);
                return (
                  <tr key={i.id} onClick={() => setSelecionado(i)} style={{ cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = T.surface3}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                    <td style={td}>
                      <div style={{ fontWeight: '600' }}>{i.nome}</div>
                      <div style={{ fontSize: '11px', color: T.textMut }}>{i.whatsapp || '—'}</div>
                    </td>
                    <td style={{ ...td, color: T.textSec }}>{i.area_voluntario || '—'}</td>
                    <td style={td}>{mask(brl(i.valor_pago))}</td>
                    <td style={{ ...td, color: pago > 0 ? T.green : T.textMut }}>{mask(brl(pago))}</td>
                    <td style={{ ...td, color: falta > 0 ? T.amber : T.textMut }}>{mask(brl(falta))}</td>
                    <td style={{ ...td, color: T.textSec }}>{BILLING_LABEL[i.asaas_billing_type] || '—'}</td>
                    <td style={{ ...td, color: T.textSec, fontSize: '12px' }}>{i.updated_date ? new Date(i.updated_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'}</td>
                    <td style={td}><Chip label={cfg.label} color={cfg.color} /></td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && (
                <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: T.textMut, padding: '32px' }}>Nenhuma voluntária encontrada com esses filtros</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selecionado && <HistoricoDrawer insc={selecionado} onClose={() => setSelecionado(null)} />}
    </div>
  );
}