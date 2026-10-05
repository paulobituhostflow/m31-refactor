import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Focus, Printer, MessageCircleHeart, UsersRound, LogOut } from 'lucide-react';
import { cartinhasApi, CARTINHAS_QUERY_KEY, cartinhaImprimivel, cartinhaPorEscrever, cartinhasErrorMessage } from '@/lib/m31CartinhasApi';
import CartinhaHero from '@/components/m31/cartinhas/CartinhaHero';
import useCartinhaCiclo from '@/components/m31/cartinhas/useCartinhaCiclo';
import CartinhaCard from '@/components/m31/cartinhas/CartinhaCard';
import CartinhaEditor from '@/components/m31/cartinhas/CartinhaEditor';
import CartinhaChat from '@/components/m31/cartinhas/CartinhaChat';
import CartinhaVoluntarias from '@/components/m31/cartinhas/CartinhaVoluntarias';
import { ehInscritaDaMeta } from '../../worker/functions/m31Cartinhas/cartinhaPadrao.js';
// Pendências financeiras e auditoria cadastral não pertencem ao espaço da autora.
import CartinhaMetaDia from '@/components/m31/cartinhas/CartinhaMetaDia';
import { metaDiariaCartinhas } from '@/components/m31/cartinhas/cartinhaMetas';
import { copiasDaAutora, limparCopiasDaAutora } from '@/components/m31/cartinhas/cartinhaDispositivo';
import { sincronizarRascunhos } from '@/components/m31/cartinhas/cartinhaSincronizacao';
import { base44 } from '@/api/base44Client';
import { matchOrdem } from '@/lib/m31Ordem';
import { ordenarAlfabetico } from '@/components/m31/cartinhas/cartinhaUtils';
import { lerSnapshotConfirmado, guardarSnapshotConfirmado, snapshotValido } from '@/components/m31/cartinhas/cartinhaSnapshot';

const C = { text: '#1a1a2e', sec: '#6b7280', muted: '#9ca3af', border: '#e8ecf3', brand: '#5B0E2D' };
const FILTROS = [
  { id: 'todas',         label: 'Todas' },
  { id: 'pendente',      label: 'A escrever' },
  { id: 'em_elaboracao', label: 'Rascunhos' },
  { id: 'revisar_cartinha', label: 'Revisar' },
  { id: 'pronta',        label: 'Prontas' },
  { id: 'entregue',      label: 'Entregues' },
];

export default function M31Cartinhas() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState('todas');
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState(null);
  const [chatAberto, setChatAberto] = useState(false);
  const [voluntariasAberto, setVoluntariasAberto] = useState(false);
  const filaFoco = useRef([]);
  // Congela a participante do editor: novas inscrições nunca trocam a carta em edição.
  const [focoInscricao, setFocoInscricao] = useState(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [concluindoId, setConcluindoId] = useState(null);
  const [contextoFiltro, setContextoFiltro] = useState('todas');
  const [erroOperacao, setErroOperacao] = useState('');
  const [sincMsg, setSincMsg] = useState('');
  const ultimaSincronizacao = useRef(0);
  const [kpiSnapshot,setKpiSnapshot]=useState(()=>lerSnapshotConfirmado());

  useEffect(() => {
    document.body.classList.add('dashboard-executive');
    return () => document.body.classList.remove('dashboard-executive');
  }, []);

  // Enquanto a autora está no editor, a lista de fundo não disputa renderização.
  // O autosave tem transporte próprio e NÃO é pausado por este controle.
  const escritaAberta = !!(editando || focoInscricao || chatAberto || voluntariasAberto);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: CARTINHAS_QUERY_KEY,
    queryFn: cartinhasApi.listar,
    retry: (failureCount, err) => failureCount < 1 && ![401, 403].includes(err?.status || err?.response?.status),
    enabled: !escritaAberta,
    notifyOnChangeProps: escritaAberta ? [] : undefined,
    refetchOnWindowFocus: !escritaAberta,
    refetchOnReconnect: !escritaAberta,
    refetchInterval: escritaAberta ? false : 60000,
    refetchIntervalInBackground: false,
    staleTime: 20000,
  });
  const inscricoes = useMemo(() => (data?.inscricoes || []).filter(ehInscritaDaMeta), [data]);
  const config = data?.config;
  // Troca atômica: snapshot incompleto nunca substitui o último confirmado.
  useEffect(()=>{
    if (!snapshotValido(data?.snapshot)) return;
    setKpiSnapshot(data.snapshot);
    guardarSnapshotConfirmado(data.snapshot);
  },[data?.snapshot]);

  const hoje = useCartinhaCiclo();
  const stats = useMemo(() => {
    const st = s => inscricoes.filter(i => (i.cartinha_status || 'pendente') === s).length;
    // O contador oficial NÃO deriva mais do status atual. Só conta uma participante
    // quando existe ciclo de conclusão auditável no histórico da titular atual.
    // Assim migração, importação, status legado ou edição técnica não aumentam a meta.
    // Fonte compatível entre versões: a API nova projeta cartinha_dias_concluidos;
    // se uma função remota anterior não o enviar, uma carta persistida como pronta/
    // entregue COM texto continua sendo evidência de trabalho existente e não pode
    // aparecer como zero. Isso é somente leitura/projeção; não altera o banco.
    const concluidasAuditadas = inscricoes.filter(i =>
      (Array.isArray(i.cartinha_dias_concluidos) && i.cartinha_dias_concluidos.length > 0) ||
      (['pronta','entregue'].includes(i.cartinha_status) && !!i.cartinha_texto?.trim())
    ).length;
    return {
      // Mesmo headcount institucional do Admin. A quantidade de destinatárias
      // liberadas para escrita é uma lista operacional distinta.
      total: kpiSnapshot?.inscritas_reconhecidas ?? null,
      pendentes: st('pendente') + st('revisar_cartinha'),
      revisar: st('revisar_cartinha'),
      emElaboracao: st('em_elaboracao'),
      prontas: st('pronta'),
      entregues: st('entregue'),
      concluidasAuditadas: kpiSnapshot?.cartinhas_concluidas ?? null,
      feitasHoje: kpiSnapshot?.cartinhas_concluidas_hoje ?? null,
    };
  }, [inscricoes, kpiSnapshot]);

  const filtradas = useMemo(() => {
    let list = inscricoes;
    if (filtro === 'pendente') list = list.filter(i => ['pendente', 'revisar_cartinha'].includes(i.cartinha_status || 'pendente'));
    else if (filtro !== 'todas') list = list.filter(i => (i.cartinha_status || 'pendente') === filtro);
    if (contextoFiltro === 'primeiro') list = list.filter(i => i.ja_participou_m31 === false);
    if (contextoFiltro === 'caravana') list = list.filter(i => !!i.caravana_nome?.trim());
    if (contextoFiltro === 'comunidade') list = list.filter(i => i.como_conheceu === 'Comunidade Mulheres de Fé');
    if (contextoFiltro === 'abencoada') list = list.filter(i => !!i.presenteado_por_id);
    if (busca.trim()) {
      const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      const b = norm(busca);
      list = list.filter(i =>
        [i.nome, i.codigo_inscricao, i.cidade, i.nome_igreja, i.caravana_nome, i.como_conheceu, i.abencoada_por_nome]
          .some(value => norm(value).includes(b)) || matchOrdem(busca, i.ordem_operacional)
      );
    }
    return ordenarAlfabetico(list);
  }, [inscricoes, filtro, busca, contextoFiltro]);

  // Próxima cartinha pendente (para o Modo Foco) — ordem cronológica
  const proximaPendente = useMemo(
    () => ordenarAlfabetico(inscricoes).find(cartinhaPorEscrever),
    [inscricoes]
  );

  const countPorFiltro = {
    todas: stats.total,
    pendente: stats.pendentes,
    em_elaboracao: stats.emElaboracao,
    revisar_cartinha: stats.revisar,
    pronta: stats.prontas,
    entregue: stats.entregues,
  };

  // ── Sincronização de fundo de rascunhos locais (abas fechadas/reinício) ──
  // Recupera rascunhos guardados no dispositivo sem abrir cada carta; nunca
  // concorre com o editor aberto (presença fresca de outra aba ou editor nesta).
  const abertosNestaAba = useMemo(() => new Set([editando?.id, focoInscricao?.id].filter(Boolean)), [editando, focoInscricao]);
  useEffect(() => {
    if (!data?.inscricoes || !data.user?.id || abertosNestaAba.size || chatAberto || voluntariasAberto) return;
    if (Date.now() - ultimaSincronizacao.current < 60000) return;
    ultimaSincronizacao.current = Date.now();
    let ativo = true;
    sincronizarRascunhos({ autoraId: data.user.id, inscricoes: data.inscricoes, salvar: cartinhasApi.salvar, abertosNestaAba })
      .then(r => {
        if (!ativo) return;
        if (r.sincronizados > 0) {
          setSincMsg(`${r.sincronizados} rascunho${r.sincronizados === 1 ? '' : 's'} recuperado${r.sincronizados === 1 ? '' : 's'} deste dispositivo.`);
          qc.invalidateQueries({ queryKey: CARTINHAS_QUERY_KEY });
        } else if (r.preservados > 0) {
          setSincMsg('Há rascunhos guardados neste dispositivo aguardando revisão — eles reaparecem ao abrir a carta.');
        } else {
          setSincMsg('');
        }
      })
      .catch(() => {});
    return () => { ativo = false; };
  }, [data, abertosNestaAba, chatAberto, voluntariasAberto, qc]);

  const receberSalva = useCallback(updated => {
    if (!ehInscritaDaMeta(updated)) return; // equipe não altera cache/contadores da lista normal
    qc.setQueryData(CARTINHAS_QUERY_KEY, current => current ? {
      ...current, inscricoes: current.inscricoes.map(item => item.id === updated.id ? { ...item, ...updated } : item),
    } : current);
  }, [qc]);

  function abrirModoFoco() {
    const candidatas = filtradas.filter(cartinhaPorEscrever);
    const base = candidatas.length ? candidatas : ordenarAlfabetico(inscricoes).filter(cartinhaPorEscrever);
    filaFoco.current = base.map(i => i.id);
    if (base[0]) setFocoInscricao(base[0]);
  }
  function avancarFoco(updated) {
    const atuais = qc.getQueryData(CARTINHAS_QUERY_KEY)?.inscricoes || [];
    const byId = new Map(atuais.map(i => [i.id, i]));
    const pos = filaFoco.current.indexOf(updated.id);
    const seguintes = filaFoco.current.slice(pos + 1).concat(filaFoco.current.slice(0, Math.max(0, pos)));
    const proxima = seguintes.map(id => byId.get(id)).find(i => i && i.id !== updated.id && cartinhaPorEscrever(i));
    setFocoInscricao(proxima || null);
  }

  // Concluir só persiste a carta. Não envia mensagens nem alimenta corpus de IA.
  const concluir = useCallback(async (inscricao, texto) => {
    if (inscricao.cartinha_status === 'pronta' || inscricao.cartinha_status === 'entregue') return;
    const textoFinal = texto ?? inscricao.cartinha_texto ?? '';
    if (!textoFinal.trim()) { setEditando(inscricao); return; }
    setConcluindoId(inscricao.id);
    setErroOperacao('');
    try {
      receberSalva(await cartinhasApi.salvar({ inscricao_id: inscricao.id, texto: textoFinal, status: 'pronta', versao: inscricao.cartinha_versao || 0, titular_ref:inscricao.titular_ref }));
    } catch (err) {
      setErroOperacao(cartinhasErrorMessage(err));
    } finally {
      setConcluindoId(null);
    }
  }, [receberSalva]);

  // Desmarcar cartinha (voltar para pendente) — quando marcada por engano
  const desmarcar = useCallback(async (inscricao) => {
    setConcluindoId(inscricao.id);
    setErroOperacao('');
    try {
      receberSalva(await cartinhasApi.salvar({ inscricao_id: inscricao.id, texto: inscricao.cartinha_texto || '', status: 'pendente', versao: inscricao.cartinha_versao || 0, titular_ref:inscricao.titular_ref }));
    } catch (err) {
      setErroOperacao(cartinhasErrorMessage(err));
    } finally {
      setConcluindoId(null);
    }
  }, [receberSalva]);

  async function salvarConfig({ dataEvento, metaDia }) {
    setSavingConfig(true);
    setErroOperacao('');
    try {
      const patch = {
        ...(dataEvento ? {cartinha_data_evento:dataEvento} : {}),
        ...(metaDia ? {cartinha_meta_diaria:Number(metaDia)} : {}),
      };
      const result = await cartinhasApi.configurar(patch);
      qc.setQueryData(CARTINHAS_QUERY_KEY, current => current ? { ...current, config: result.config } : current);
      return true;
    } catch (err) {
      setErroOperacao(cartinhasErrorMessage(err));
      return false;
    } finally {
      setSavingConfig(false);
    }
  }

  async function sair() {
    try {
      const copies = await copiasDaAutora(data.user.id);
      if (copies.some(r => r.dirty || r.pending) && !window.confirm('Existem rascunhos ainda não sincronizados. Sair apagará as cópias privadas deste dispositivo. Cancele para sincronizar ou copiar os textos. Sair mesmo assim?')) return;
      await limparCopiasDaAutora(data.user.id);
      qc.removeQueries({ queryKey: CARTINHAS_QUERY_KEY });
      base44.auth.logout('/cartinhas');
    } catch { setErroOperacao('Não foi possível limpar as cópias privadas. A sessão foi mantida para proteger seus rascunhos.'); }
  }

  // Ausência de resposta NÃO é uma lista vazia, nem significa trabalho concluído.
  // Falha de atualização com dados anteriores preserva a lista e o editor aberto.
  if (!data) return (
    <main style={{ minHeight: '100vh', background: '#f6f7fb', padding: '40px 20px', fontFamily: 'Inter, sans-serif', color: C.text }}>
      <section style={{ maxWidth: 600, margin: '0 auto', padding: 24, borderRadius: 16, background: '#fff' }}>
        <h1 style={{ fontSize: 24 }}>Cartinhas da Ju</h1>
        <p role={error ? 'alert' : 'status'}>{error ? 'Não foi possível carregar a lista. Nenhuma cartinha foi apagada por esta falha de carregamento.' : 'Carregando suas participantes…'}</p>
        {error && <button type="button" onClick={() => refetch()} style={{ minHeight: 48, padding: '12px 20px', border: 0, borderRadius: 12, background: C.brand, color: '#fff' }}>Tentar novamente</button>}
      </section>
    </main>
  );

  return (
    <main className="m31-escrita-painel">
      <div className="m31-escrita-shell">
        <div className="m31-escrita-utilidades">
          <button type="button" onClick={sair} className="m31-escrita-link"><LogOut size={22} aria-hidden="true" />Sair</button>
        </div>
        <CartinhaHero stats={stats} config={config} dia={hoje} onSaveConfig={salvarConfig} saving={savingConfig}>
          <CartinhaMetaDia dia={hoje} escritasHoje={stats.feitasHoje}
            metaDiaria={metaDiariaCartinhas(config, stats.concluidasAuditadas, hoje)} total={stats.total} autoraId={data.user.id} />
        </CartinhaHero>
        {sincMsg && <p role="status" className="m31-escrita-aviso">{sincMsg}</p>}
        {(error || erroOperacao) && <div role="alert" className="m31-escrita-aviso">
          {erroOperacao || 'A atualização falhou. Seu rascunho e a última lista foram preservados.'}
          {error && <button type="button" className="m31-escrita-link" onClick={() => refetch()}>Tentar novamente</button>}
        </div>}
        <div className="m31-escrita-acoes">
          <button type="button" onClick={abrirModoFoco} disabled={!proximaPendente} className="m31-escrita-botao m31-escrita-botao--principal">
            <Focus size={24} aria-hidden="true" />Entrar no Modo Foco
          </button>
          <button type="button" onClick={() => setChatAberto(true)} className="m31-escrita-botao">
            <MessageCircleHeart size={24} aria-hidden="true" />Distribuir Cartinhas
          </button>
        </div>
        <div className="m31-escrita-impressao">
          <a href="/cartinhas-imprimir" target="_blank" rel="noopener noreferrer" className="m31-escrita-link">
            <Printer size={22} aria-hidden="true" />{config?.cartinha_lote_liberado === true ? `Imprimir cartinhas (${inscricoes.filter(cartinhaImprimivel).length})` : 'Impressão em conferência'}
          </a>
        </div>
        <section className="m31-escrita-lista" aria-labelledby="cartinhas-lista-titulo">
          <div className="m31-escrita-lista__titulo">
            <h2 id="cartinhas-lista-titulo">Suas cartinhas</h2>
            <button type="button" className="m31-escrita-link m31-escrita-voluntarias" onClick={() => setVoluntariasAberto(true)}><UsersRound size={22} aria-hidden="true" />Voluntárias</button>
          </div>
          <div className="m31-escrita-busca">
            <Search size={24} aria-hidden="true" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome ou caravana" aria-label="Buscar participante" />
          </div>
          <div className="m31-escrita-filtros">
            <select aria-label="Situação das cartinhas" value={filtro} onChange={e => setFiltro(e.target.value)}>
              {FILTROS.map(f => <option key={f.id} value={f.id}>{f.id === 'todas' ? 'Todas as cartinhas' : `${f.label} (${countPorFiltro[f.id]})`}</option>)}
            </select>
            <select aria-label="Filtrar por contexto" value={contextoFiltro} onChange={e => setContextoFiltro(e.target.value)}>
              <option value="todas">Todos os contextos</option>
              <option value="primeiro">Primeiro M31</option>
              <option value="caravana">Caravanas</option>
              <option value="comunidade">Comunidade Mulheres de Fé</option>
              <option value="abencoada">Abençoadas</option>
            </select>
          </div>
          {isLoading ? <p role="status" className="m31-escrita-vazio">Carregando cartinhas…</p>
            : filtradas.length === 0 ? <p className="m31-escrita-vazio">Nenhuma cartinha neste filtro.</p>
            : <div className="m31-escrita-cartas">{filtradas.map(i => <CartinhaCard key={i.id} inscricao={i} onAbrir={setEditando} onConcluir={concluir} onDesmarcar={desmarcar} concluindo={concluindoId === i.id} />)}</div>}
        </section>
      </div>
      {chatAberto && <CartinhaChat autoraId={data.user.id} loteLiberado={config?.cartinha_lote_liberado === true} onClose={() => setChatAberto(false)} onVoluntarias={() => { setChatAberto(false); setVoluntariasAberto(true); }} />}
      {voluntariasAberto && <CartinhaVoluntarias autoraId={data.user.id} onClose={() => setVoluntariasAberto(false)} />}
      {focoInscricao && <CartinhaEditor key={focoInscricao.id} inscricao={focoInscricao} onAdvance={avancarFoco} onSaved={receberSalva} onClose={() => setFocoInscricao(null)} />}
      {editando && <CartinhaEditor key={editando.id} inscricao={editando} onClose={() => setEditando(null)} onSaved={receberSalva} />}
    </main>
  );
}
