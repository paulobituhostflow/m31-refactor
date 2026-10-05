import { RefreshCw } from 'lucide-react';

const label = { fontSize: '11px', fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', marginBottom: '4px', display: 'block' };
const field = { width: '100%', height: '38px', padding: '0 10px', border: '1px solid #E8ECF3', borderRadius: '8px', fontSize: '13px', color: '#1A1A2E', background: '#FFFFFF' };

export default function FinFiltros({ filtros, setFiltros, onRefresh, provedores, isLoading }) {
  const set = (k, v) => setFiltros(prev => ({ ...prev, [k]: v }));

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap: '12px', alignItems: 'end',
      background: '#FFFFFF', border: '1px solid #E8ECF3', borderRadius: '12px', padding: '16px',
    }}>
      <div>
        <label style={label}>Período — de</label>
        <input type="date" style={field} value={filtros.periodoInicio} onChange={e => set('periodoInicio', e.target.value)} />
      </div>
      <div>
        <label style={label}>Período — até</label>
        <input type="date" style={field} value={filtros.periodoFim} onChange={e => set('periodoFim', e.target.value)} />
      </div>
      <div>
        <label style={label}>Provedor</label>
        <select style={field} value={filtros.provedor} onChange={e => set('provedor', e.target.value)}>
          <option value="todos">Todos</option>
          {provedores.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div>
        <label style={label}>Tipo de inscrição</label>
        <select style={field} value={filtros.tipo} onChange={e => set('tipo', e.target.value)}>
          <option value="todos">Todos</option>
          <option value="publico_geral">Público geral</option>
          <option value="caravana">Caravana</option>
          <option value="doacao">Doação</option>
        </select>
      </div>
      <div>
        <label style={label}>Status</label>
        <select style={field} value={filtros.status} onChange={e => set('status', e.target.value)}>
          <option value="todos">Todos</option>
          <option value="confirmado">Confirmado</option>
          <option value="pendente">Pendente</option>
          <option value="cancelado">Cancelado</option>
          <option value="abandonado">Abandonado</option>
        </select>
      </div>
      <button
        onClick={onRefresh}
        disabled={isLoading}
        style={{
          height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          background: '#8B1A2B', color: '#FFFFFF', border: 'none', borderRadius: '8px',
          fontSize: '13px', fontWeight: '600', cursor: isLoading ? 'default' : 'pointer', opacity: isLoading ? 0.7 : 1,
        }}
      >
        <RefreshCw size={14} style={{ animation: isLoading ? 'spin 0.8s linear infinite' : 'none' }} />
        Atualizar
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </button>
    </div>
  );
}