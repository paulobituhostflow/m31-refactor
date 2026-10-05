import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { formatDateTimeBR } from '@/lib/dateUtils';

const C = {
  bg1: '#FFFFFF', bg2: '#FFFFFF', bg3: '#F9FAFB', bg4: '#F9FAFB',
  text: '#1A1A1A', textSec: '#6B7280', textTer: '#9CA3AF',
  border: '#E5E7EB', borderSt: '#D1D5DB',
  brand: '#7A1F2B', success: '#10B981', warning: '#F59E0B', danger: '#EF4444', info: '#3B82F6',
};

const MODULO_COLORS = {
  inscricoes: C.info, caravanas: '#a78bfa', voluntarios: '#34d399',
  financeiro: C.warning, checkin: C.success, equipe: '#C4556A',
  exportacao: '#fb923c', sistema: C.danger, tarefas: '#60a5fa',
  cupons: '#f472b6', lotes: '#fb923c',
};

const PERFIL_COLORS = {
  super_admin: '#C4556A', gestao_operacional: '#60A5FA',
  lider_setor: '#34D399', checkin: '#FBBF24',
  coordenador: '#9CA3AF', voluntario: '#6B7280',
};

function fmtDate(d) {
  if (!d) return '—';
  try { return formatDateTimeBR(d); } catch { return d; }
}

export default function M31LogsAcoes() {
  const [filtroModulo, setFiltroModulo] = useState('');
  const [filtroPerfil, setFiltroPerfil] = useState('');
  const [busca, setBusca] = useState('');
  const [page, setPage] = useState(1);
  const PAGE = 50;

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['m31actionlogs'],
    queryFn: () => base44.entities.EventoM31ActionLog.list('-created_date', 500),
    refetchInterval: 30000,
  });

  const filtrados = useMemo(() => {
    let list = logs;
    if (filtroModulo) list = list.filter(l => l.modulo === filtroModulo);
    if (filtroPerfil) list = list.filter(l => l.user_perfil === filtroPerfil);
    if (busca) {
      const b = busca.toLowerCase();
      list = list.filter(l =>
        l.user_email?.toLowerCase().includes(b) ||
        l.user_nome?.toLowerCase().includes(b) ||
        l.acao?.toLowerCase().includes(b) ||
        l.entidade_nome?.toLowerCase().includes(b)
      );
    }
    return list;
  }, [logs, filtroModulo, filtroPerfil, busca]);

  const paginated = useMemo(() => filtrados.slice((page - 1) * PAGE, page * PAGE), [filtrados, page]);
  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE));

  const sel = {
    background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '6px',
    color: C.textSec, fontFamily: 'Inter, sans-serif', fontSize: '12px',
    padding: '7px 12px', outline: 'none', cursor: 'pointer',
  };
  const thStyle = {
    padding: '9px 14px', fontSize: '10px', fontWeight: '700', letterSpacing: '.07em',
    textTransform: 'uppercase', color: C.textTer, textAlign: 'left', whiteSpace: 'nowrap',
    background: C.bg1, borderBottom: `1px solid ${C.border}`,
  };

  if (isLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
      <div style={{ width: '28px', height: '28px', border: `2px solid ${C.border}`, borderTopColor: C.brand, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const modulos = [...new Set(logs.map(l => l.modulo).filter(Boolean))];
  const perfis  = [...new Set(logs.map(l => l.user_perfil).filter(Boolean))];

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: C.text }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: '600', letterSpacing: '-.015em', color: C.text, marginBottom: '4px' }}>Logs de Ações</h1>
          <div style={{ fontSize: '13px', color: C.textSec }}>{filtrados.length} registro{filtrados.length !== 1 ? 's' : ''} · últimas 500 ações</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '7px 12px', flex: '1', minWidth: '200px', maxWidth: '340px' }}>
          <input
            style={{ background: 'none', border: 'none', color: C.text, fontFamily: 'Inter, sans-serif', fontSize: '12px', outline: 'none', flex: 1 }}
            placeholder="Buscar usuário, ação..."
            value={busca}
            onChange={e => { setBusca(e.target.value); setPage(1); }}
          />
        </div>
        <select value={filtroModulo} onChange={e => { setFiltroModulo(e.target.value); setPage(1); }} style={sel}>
          <option value="">Todos os módulos</option>
          {modulos.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filtroPerfil} onChange={e => { setFiltroPerfil(e.target.value); setPage(1); }} style={sel}>
          <option value="">Todos os perfis</option>
          {perfis.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Tabela */}
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}>
            <thead>
              <tr>
                <th style={thStyle}>Data/Hora</th>
                <th style={thStyle}>Usuário</th>
                <th style={thStyle}>Perfil</th>
                <th style={thStyle}>Módulo</th>
                <th style={thStyle}>Ação</th>
                <th style={thStyle}>Registro</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '48px', textAlign: 'center', color: C.textTer, fontSize: '14px' }}>
                    Nenhum log encontrado.
                  </td>
                </tr>
              ) : paginated.map(log => {
                const modColor = MODULO_COLORS[log.modulo] || C.textSec;
                const perfColor = PERFIL_COLORS[log.user_perfil] || C.textSec;
                return (
                  <tr key={log.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '10px 14px', fontSize: '11px', color: C.textTer, whiteSpace: 'nowrap' }}>
                      {fmtDate(log.created_date)}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: C.text }}>{log.user_nome || '—'}</div>
                      <div style={{ fontSize: '11px', color: C.textTer }}>{log.user_email}</div>
                      {log.impersonado_por && (
                        <div style={{ fontSize: '10px', color: C.warning, marginTop: '2px' }}>⚡ via {log.impersonado_por}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', padding: '2px 7px', borderRadius: '4px', background: perfColor + '20', color: perfColor }}>
                        {log.user_perfil || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', padding: '2px 7px', borderRadius: '4px', background: modColor + '20', color: modColor }}>
                        {log.modulo || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '12px', color: C.textSec, maxWidth: '280px' }}>
                      {log.acao}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '11px', color: C.textTer }}>
                      {log.entidade_nome || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {filtrados.length > PAGE && (
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: C.textSec }}>
            <span>{filtrados.length} registros</span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                style={{ padding: '4px 10px', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: '5px', color: C.textSec, cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.4 : 1 }}>
                ‹
              </button>
              <span>{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
                style={{ padding: '4px 10px', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: '5px', color: C.textSec, cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.4 : 1 }}>
                ›
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}