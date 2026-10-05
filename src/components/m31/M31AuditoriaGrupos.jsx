import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Search, Download, Users, UserCheck, UserX, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';

const T = {
  bg: '#F7F5F2', card: '#FFFFFF', border: '#EAE7E2',
  text: '#2D2D2D', sec: '#6B7280', muted: '#B0ADA8',
  brand: '#8B1A2B', success: '#16A34A', danger: '#DC2626', info: '#2563EB',
};

const CHAT_ID_PADRAO = '120363423189586769@g.us';

export default function M31AuditoriaGrupos() {
  const [chatId, setChatId] = useState(CHAT_ID_PADRAO);
  const [tipo, setTipo] = useState('todos');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [erro, setErro] = useState(null);
  const [busca, setBusca] = useState('');

  async function executarAuditoria() {
    setLoading(true);
    setErro(null);
    try {
      const resp = await base44.functions.invoke('m31AuditoriaGrupo', {
        chat_id: chatId, tipo, formato: 'json',
      });
      setData(resp.data);
    } catch (e) {
      setErro(e?.response?.data?.error || e.message || 'Erro ao executar auditoria');
    } finally {
      setLoading(false);
    }
  }

  async function exportarCSV() {
    try {
      const resp = await base44.functions.invoke('m31AuditoriaGrupo', {
        chat_id: chatId, tipo, formato: 'csv',
      });
      // resp.data é o CSV string
      const csv = typeof resp.data === 'string' ? resp.data : '';
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `auditoria_grupos_${tipo}_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErro('Erro ao exportar CSV');
    }
  }

  const registrosFiltrados = useMemo(() => {
    if (!data?.registros) return [];
    if (!busca.trim()) return data.registros;
    const q = busca.toLowerCase();
    return data.registros.filter(r =>
      (r.nome || '').toLowerCase().includes(q) ||
      (r.phone_normalizado || '').includes(q) ||
      (r.email || '').toLowerCase().includes(q)
    );
  }, [data, busca]);

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: T.text }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
          Auditoria de Grupos WhatsApp
        </h1>
        <p style={{ fontSize: '13px', color: T.sec, margin: 0 }}>
          Cruza membros ativos do grupo com inscrições do sistema para identificar leads fantasmas.
        </p>
      </div>

      {/* Filtros */}
      <div style={{
        background: T.card, border: `1px solid ${T.border}`,
        borderRadius: '12px', padding: '16px', marginBottom: '16px',
        display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap',
      }}>
        <div style={{ flex: '1 1 280px' }}>
          <label style={{ fontSize: '11px', fontWeight: '600', color: T.sec, display: 'block', marginBottom: '4px' }}>
            Chat ID do Grupo
          </label>
          <input
            value={chatId}
            onChange={e => setChatId(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px', fontSize: '13px',
              border: `1px solid ${T.border}`, borderRadius: '8px',
              background: '#fff', color: T.text,
            }}
            placeholder="120363423189586769@g.us"
          />
        </div>
        <div>
          <label style={{ fontSize: '11px', fontWeight: '600', color: T.sec, display: 'block', marginBottom: '4px' }}>
            Tipo
          </label>
          <select
            value={tipo}
            onChange={e => setTipo(e.target.value)}
            style={{
              padding: '8px 12px', fontSize: '13px',
              border: `1px solid ${T.border}`, borderRadius: '8px',
              background: '#fff', color: T.text, cursor: 'pointer',
            }}
          >
            <option value="todos">Todos</option>
            <option value="fantasmas">Apenas Fantasmas</option>
            <option value="conciliados">Apenas Conciliados</option>
          </select>
        </div>
        <button
          onClick={executarAuditoria}
          disabled={loading}
          style={{
            background: T.brand, color: '#fff', border: 'none',
            borderRadius: '8px', padding: '9px 18px', fontSize: '13px',
            fontWeight: '600', cursor: loading ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
          {loading ? 'Auditando...' : 'Auditar'}
        </button>
        {data && (
          <button
            onClick={exportarCSV}
            style={{
              background: '#fff', color: T.text, border: `1px solid ${T.border}`,
              borderRadius: '8px', padding: '9px 16px', fontSize: '13px',
              fontWeight: '600', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <Download size={14} /> Exportar CSV
          </button>
        )}
      </div>

      {/* Erro */}
      {erro && (
        <div style={{
          background: '#FEF2F2', border: `1px solid #FCA5A5`,
          borderRadius: '8px', padding: '12px 16px', marginBottom: '16px',
          display: 'flex', alignItems: 'center', gap: '8px',
          fontSize: '13px', color: T.danger,
        }}>
          <AlertTriangle size={16} /> {erro}
        </div>
      )}

      {/* Métricas */}
      {data && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '10px', marginBottom: '16px',
        }}>
          <MetricCard icon={Users} label="Auditados" value={data.total_auditados} color={T.info} />
          <MetricCard icon={CheckCircle2} label="Conciliados" value={data.total_conciliados} color={T.success} />
          <MetricCard icon={UserX} label="Fantasmas" value={data.total_fantasmas} color={T.danger} />
          <MetricCard icon={UserCheck} label="% Conciliação" value={data.total_auditados > 0 ? Math.round((data.total_conciliados / data.total_auditados) * 100) + '%' : '0%'} color={T.brand} />
        </div>
      )}

      {/* Busca */}
      {data && (
        <div style={{ marginBottom: '12px' }}>
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome, telefone ou email..."
            style={{
              width: '100%', padding: '8px 12px', fontSize: '13px',
              border: `1px solid ${T.border}`, borderRadius: '8px',
              background: '#fff', color: T.text,
            }}
          />
        </div>
      )}

      {/* Tabela */}
      {data && (
        <div style={{
          background: T.card, border: `1px solid ${T.border}`,
          borderRadius: '12px', overflow: 'hidden',
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#FAF8F6', borderBottom: `1px solid ${T.border}` }}>
                  <Th>Telefone</Th>
                  <Th>Status</Th>
                  <Th>Nome</Th>
                  <Th>Email</Th>
                  <Th>Origem</Th>
                  <Th>Pagamento</Th>
                  <Th>1ª Detecção</Th>
                </tr>
              </thead>
              <tbody>
                {registrosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: T.muted }}>
                      Nenhum registro encontrado
                    </td>
                  </tr>
                )}
                {registrosFiltrados.map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <Td>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>
                        {r.phone_normalizado || r.phone_grupo}
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge status={r.status_auditoria} />
                    </Td>
                    <Td>{r.nome || <span style={{ color: T.muted }}>—</span>}</Td>
                    <Td style={{ fontSize: '12px', color: T.sec }}>{r.email || '—'}</Td>
                    <Td>{r.origem_inscricao || <span style={{ color: T.muted }}>—</span>}</Td>
                    <Td>{r.status_pagamento || <span style={{ color: T.muted }}>—</span>}</Td>
                    <Td style={{ fontSize: '12px', color: T.sec }}>
                      {r.data_primeira_deteccao
                        ? new Date(r.data_primeira_deteccao).toLocaleDateString('pt-BR')
                        : '—'}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state inicial */}
      {!data && !loading && !erro && (
        <div style={{
          background: T.card, border: `1px solid ${T.border}`,
          borderRadius: '12px', padding: '48px', textAlign: 'center',
        }}>
          <Users size={32} style={{ color: T.muted, marginBottom: '8px' }} />
          <p style={{ color: T.sec, fontSize: '13px', margin: 0 }}>
            Clique em "Auditar" para cruzar os membros do grupo com as inscrições do sistema.
          </p>
        </div>
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, color }) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`,
      borderRadius: '12px', padding: '14px 16px', textAlign: 'center',
    }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div style={{ fontSize: '22px', fontWeight: '700', color, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: '11px', color: T.sec, marginTop: '2px' }}>{label}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const isConciliado = status === 'CONCILIADO';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '3px 8px', borderRadius: '100px', fontSize: '11px', fontWeight: '600',
      background: isConciliado ? '#DCFCE7' : '#FEE2E2',
      color: isConciliado ? T.success : T.danger,
    }}>
      {isConciliado ? <CheckCircle2 size={11} /> : <UserX size={11} />}
      {status}
    </span>
  );
}

function Th({ children }) {
  return (
    <th style={{
      padding: '10px 14px', textAlign: 'left', fontWeight: '600',
      fontSize: '11px', color: T.sec, textTransform: 'uppercase',
      letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>{children}</th>
  );
}

function Td({ children }) {
  return <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{children}</td>;
}