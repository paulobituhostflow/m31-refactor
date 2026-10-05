import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { PageHeader } from '@/components/m31/ui';
import MapaOperacao from '@/components/m31/logistica/MapaOperacao';
import MapaLacunas from '@/components/m31/logistica/MapaLacunas';
import LogisticaKPIs from '@/components/m31/logistica/LogisticaKPIs';
import LogisticaFilters from '@/components/m31/logistica/LogisticaFilters';
import LogisticaOperacional from '@/components/m31/logistica/LogisticaOperacional';
import { agregarPorAreaEFrente, resolverAreaSlug, isCritica, calcProximaAcao } from '@/lib/m31OperacaoCalculos';

const FILTROS_INIT = { area: '', responsavel: '', status: '', prioridade: '', fornecedor: '', prazo: '' };

/**
 * Centro de Operações — painel de leitura e acompanhamento em tempo real.
 *
 * Fonte única: EventoM31Tarefa (mesmo queryKey do M31GestaoTarefas).
 * Hierarquia unificada: M31Area → M31Frente → EventoM31Tarefa.
 * Não duplica status, checklist, responsável ou prazo.
 * Atualiza sem recarregar a página (refetchInterval + shared cache).
 */
export default function M31Logistica() {
  const [filtros, setFiltros] = useState(FILTROS_INIT);

  // Mesmo queryKey do M31GestaoTarefas — cache compartilhado, atualização em tempo real
  const { data: tarefas = [], isFetching, refetch } = useQuery({
    queryKey: ['m31tarefas'],
    queryFn: () => base44.entities.EventoM31Tarefa.list('-updated_date', 500),
    refetchInterval: 15000,
  });

  const { data: areas = [] } = useQuery({
    queryKey: ['m31areas'],
    queryFn: () => base44.entities.M31Area.list('ordem', 50),
    refetchInterval: 30000,
  });

  const { data: frentes = [] } = useQuery({
    queryKey: ['m31frentes'],
    queryFn: () => base44.entities.M31Frente.list('ordem', 100),
    refetchInterval: 30000,
  });

  const { data: cronograma = [] } = useQuery({
    queryKey: ['m31logistica_cronograma'],
    queryFn: () => base44.entities.EventoM31Cronograma.list('ordem', 30),
  });

  const { data: fornecedores = [] } = useQuery({
    queryKey: ['m31logistica_fornecedores'],
    queryFn: () => base44.entities.FinancialSupplier.filter({ status: 'ativo' }),
  });

  const { data: checklistLogistica = [] } = useQuery({
    queryKey: ['m31logistica_checklist'],
    queryFn: () => base44.entities.EventoM31ChecklistItem.list('ordem', 200),
  });

  const areaIdToSlug = useMemo(() => {
    const m = new Map();
    areas.forEach(a => m.set(a.id, a.slug));
    return m;
  }, [areas]);

  // Options para os dropdowns de filtro
  const responsaveis = useMemo(() =>
    [...new Set(tarefas.map(t => t.responsavel_nome).filter(Boolean))].sort(),
  [tarefas]);

  const fornecedorNomes = useMemo(() =>
    [...new Set(checklistLogistica.map(c => c.fornecedor_nome).filter(Boolean))].sort(),
  [checklistLogistica]);

  // Aplica filtros nas tarefas (client-side, in-memory)
  const tarefasFiltradas = useMemo(() => {
    let list = tarefas;
    if (filtros.area) {
      list = list.filter(t => resolverAreaSlug(t, areaIdToSlug) === filtros.area);
    }
    if (filtros.responsavel)  list = list.filter(t => t.responsavel_nome === filtros.responsavel);
    if (filtros.status)       list = list.filter(t => t.status === filtros.status);
    if (filtros.prioridade)   list = list.filter(t => t.prioridade === filtros.prioridade);
    if (filtros.prazo)        list = list.filter(t => t.prazo && t.prazo <= filtros.prazo);
    return list;
  }, [tarefas, filtros, areaIdToSlug]);

  // Aplica filtro de fornecedor no checklist logístico
  const checklistFiltrado = useMemo(() => {
    if (!filtros.fornecedor) return checklistLogistica;
    return checklistLogistica.filter(c => c.fornecedor_nome === filtros.fornecedor);
  }, [checklistLogistica, filtros.fornecedor]);

  // Agregação por Área → Frente (biblioteca compartilhada)
  const areasData = useMemo(() =>
    agregarPorAreaEFrente(tarefasFiltradas, areas, frentes, areaIdToSlug),
  [tarefasFiltradas, areas, frentes, areaIdToSlug]);

  // Totais globais
  const totals = useMemo(() => {
    const now = new Date();
    const concluidas = tarefasFiltradas.filter(t => t.status === 'concluido').length;
    const progresso = tarefasFiltradas.length > 0 ? Math.round((concluidas / tarefasFiltradas.length) * 100) : 0;
    const criticas = tarefasFiltradas.filter(t => isCritica(t, now)).length;
    const proximaAcao = calcProximaAcao(tarefasFiltradas, now);
    return {
      tarefas: tarefasFiltradas.length,
      concluidas,
      progresso,
      criticas,
      proximaAcao,
      checklist: checklistFiltrado.length,
      fornecedores: fornecedores.length,
    };
  }, [tarefasFiltradas, checklistFiltrado, fornecedores]);

  // Alerta de dados desatualizados: se há tarefas com updated_date muito recente (processando)
  const processandoPendente = useMemo(() => {
    const now = Date.now();
    return tarefas.some(t => {
      if (!t.updated_date) return false;
      const updated = new Date(t.updated_date).getTime();
      return now - updated < 5000; // atualizado nos últimos 5s = possivelmente sincronizando
    });
  }, [tarefas]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Centro de Operações"
        subtitle="Painel de acompanhamento em tempo real — alimentado pelas tarefas"
      />
      <LogisticaKPIs tarefas={tarefasFiltradas} checklist={checklistFiltrado} />
      <LogisticaFilters
        filtros={filtros}
        setFiltros={setFiltros}
        responsaveis={responsaveis}
        fornecedores={fornecedorNomes}
        areas={areas}
      />
      <MapaOperacao
        areasData={areasData}
        totals={totals}
        processandoPendente={processandoPendente}
        onRefresh={refetch}
        isFetching={isFetching}
      />
      <MapaLacunas
        tarefas={tarefasFiltradas}
        areas={areas}
      />
      <LogisticaOperacional
        tarefas={tarefasFiltradas}
        areas={areas}
        cronograma={cronograma}
        fornecedores={fornecedores}
      />
    </div>
  );
}