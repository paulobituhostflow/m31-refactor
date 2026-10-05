import { X } from 'lucide-react';

function FilterSelect({ value, onChange, options, placeholder }) {
  return (
    <div className="relative inline-flex items-center flex-shrink-0">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none bg-card border border-border rounded-md text-foreground text-xs font-medium px-3 py-2 pr-8 outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-ring min-h-[36px]"
      >
        <option value="">{placeholder}</option>
        {options.map(o => (
          <option key={o.val} value={o.val}>{o.label}</option>
        ))}
      </select>
      <span className="absolute right-2.5 pointer-events-none text-muted-foreground text-[10px]">▼</span>
    </div>
  );
}

/**
 * Barra de filtros horizontal com scroll suave.
 * Usa M31Area (entidade) para o filtro de área — sem taxonomia paralela.
 */
export default function LogisticaFilters({ filtros, setFiltros, responsaveis = [], fornecedores = [], areas = [] }) {
  const update = (key, val) => setFiltros(prev => ({ ...prev, [key]: val }));
  const hasFiltros = Object.values(filtros).some(v => v);

  return (
    <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-none pb-1">
      <FilterSelect
        value={filtros.area}
        onChange={v => update('area', v)}
        placeholder="Área"
        options={areas.map(a => ({ val: a.slug, label: a.nome }))}
      />
      <FilterSelect
        value={filtros.responsavel}
        onChange={v => update('responsavel', v)}
        placeholder="Responsável"
        options={responsaveis.map(r => ({ val: r, label: r }))}
      />
      <FilterSelect
        value={filtros.status}
        onChange={v => update('status', v)}
        placeholder="Status"
        options={[
          { val: 'a_fazer', label: 'A Fazer' },
          { val: 'em_andamento', label: 'Em Andamento' },
          { val: 'em_execucao', label: 'Em Execução' },
          { val: 'atencao', label: 'Atenção' },
          { val: 'atrasado', label: 'Atrasado' },
          { val: 'critico', label: 'Crítico' },
          { val: 'concluido', label: 'Concluído' },
          { val: 'bloqueado', label: 'Bloqueado' },
        ]}
      />
      <FilterSelect
        value={filtros.prioridade}
        onChange={v => update('prioridade', v)}
        placeholder="Prioridade"
        options={[
          { val: 'urgente', label: 'Urgente' },
          { val: 'alta', label: 'Alta' },
          { val: 'media', label: 'Média' },
          { val: 'baixa', label: 'Baixa' },
        ]}
      />
      <FilterSelect
        value={filtros.fornecedor}
        onChange={v => update('fornecedor', v)}
        placeholder="Fornecedor"
        options={fornecedores.map(f => ({ val: f, label: f }))}
      />
      <div className="inline-flex items-center gap-1.5 flex-shrink-0">
        <span className="text-xs text-muted-foreground whitespace-nowrap">Prazo até</span>
        <input
          type="date"
          value={filtros.prazo}
          onChange={e => update('prazo', e.target.value)}
          className="bg-card border border-border rounded-md text-foreground text-xs font-medium px-2.5 py-2 outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-ring min-h-[36px]"
        />
      </div>
      {hasFiltros && (
        <button
          onClick={() => setFiltros({ area: '', responsavel: '', status: '', prioridade: '', fornecedor: '', prazo: '' })}
          className="inline-flex items-center gap-1 text-xs text-primary hover:opacity-80 whitespace-nowrap flex-shrink-0 px-2"
        >
          <X size={12} /> Limpar
        </button>
      )}
    </div>
  );
}