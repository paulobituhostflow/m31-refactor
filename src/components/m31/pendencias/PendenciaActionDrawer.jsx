import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { TOKENS } from '@/lib/m31DesignTokens';
import { feedback } from '@/components/m31/ui';
import { waMeUrl } from '@/hooks/useM31PendenciasConciliacao';
import {
  X, MessageCircle, CreditCard, Users, Copy, CheckCircle2,
  Clock3, Trash2, Pencil, ArrowRight, ExternalLink,
} from 'lucide-react';

const GATEWAYS = [
  ['asaas', 'Asaas'],
  ['mercado_pago', 'Mercado Pago'],
  ['stone', 'Stone'],
  ['pix_manual', 'Pix manual'],
  ['importacao', 'Importação / legado'],
  ['gratuidade', 'Gratuidade'],
];

const DECISOES = [
  ['manter_pendente', 'Manter pendente', Clock3],
  ['pagamento_encontrado', 'Pagamento encontrado', CreditCard],
  ['duplicidade_confirmada', 'É duplicidade', Users],
  ['duplicidade_descartada', 'Não é duplicidade', CheckCircle2],
  ['corrigir_cadastro', 'Corrigir cadastro', Pencil],
  ['aguardar_resposta', 'Aguardar resposta', MessageCircle],
  ['descartar_auditoria', 'Descartar da auditoria', Trash2],
];

const normalizeDigits = (v) => String(v || '').replace(/\D/g, '');
const same = (a, b) => String(a ?? '') === String(b ?? '');
const formatMoney = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function PendenciaActionDrawer({ pendencia, user, onClose, onNext }) {
  const qc = useQueryClient();
  const [decision, setDecision] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [gateway, setGateway] = useState('');
  const [selectedTx, setSelectedTx] = useState('');
  const [note, setNote] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [evidence, setEvidence] = useState([]);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState({});
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState({ loading: false, status: 'nao_enviada', quando: null });
  const [recoverySending, setRecoverySending] = useState(false);
  const [journeyData, setJourneyData] = useState({ loading: false, timeline: [], fila: [], logs: [], manual: [] });
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (!pendencia) return;
    const i = pendencia._inscricao || {};
    setDecision(pendencia.decisao || '');
    setShowPayment(false);
    setShowDuplicates(false);
    setGateway(['asaas', 'mercado_pago', 'stone', 'pix_manual', 'importacao', 'gratuidade'].includes(i.origem_pagamento) ? i.origem_pagamento : '');
    setSelectedTx('');
    setNote(pendencia.observacao || '');
    setNextAction(pendencia.proxima_acao || '');
    setEvidence(pendencia.evidencias_consultadas || []);
    setEditData({
      nome: i.nome || '', email: i.email || '', whatsapp: i.whatsapp || '', cpf: i.cpf || '',
      cidade: i.cidade || '', estado: i.estado || '', codigo_inscricao: i.codigo_inscricao || '', tipo: i.tipo || 'publico_geral',
    });
  }, [pendencia]);

  const relatedTx = pendencia?._transacoes_relacionadas || [];
  const duplicates = pendencia?._duplicatas || [];
  const inscricao = pendencia?._inscricao || {};

  const addEvidence = (label) => setEvidence((curr) => curr.includes(label) ? curr : [...curr, label]);

  useEffect(() => {
    if (!pendencia?.registro_id) return;
    let active = true;
    (async () => {
      setJourneyData(d => ({ ...d, loading: true }));
      try {
        const tel = normalizeDigits(pendencia.whatsapp);
        const tel55 = tel.startsWith('55') ? tel : `55${tel}`;
        const [timeline, fila, logs, manual] = await Promise.all([
          base44.entities.M31InscricaoTimeline.filter({ inscricao_id: pendencia.registro_id }, '-created_date', 100).catch(() => []),
          tel ? base44.entities.M31FilaMensagem.filter({ telefone: tel55 }, '-created_date', 100).catch(() => []) : [],
          tel ? base44.entities.M31AutomacaoLog.filter({ telefone: tel55 }, '-enviado_em', 100).catch(() => []) : [],
          base44.entities.M31AuditoriaConfirmacaoManual.filter({ inscricao_id: pendencia.registro_id }, '-confirmado_em', 20).catch(() => []),
        ]);
        if (active) setJourneyData({ loading: false, timeline, fila, logs, manual });
      } catch { if (active) setJourneyData({ loading: false, timeline: [], fila: [], logs: [], manual: [] }); }
    })();
    return () => { active = false; };
  }, [pendencia?.registro_id, pendencia?.whatsapp]);

  async function toggleManualJourney(etapa) {
    const existente = journeyData.manual.find(m => m.etapa === etapa);
    try {
      if (existente) {
        await base44.entities.M31AuditoriaConfirmacaoManual.update(existente.id, { confirmado: !existente.confirmado, confirmado_por: user?.email || '', confirmado_em: new Date().toISOString() });
      } else {
        await base44.entities.M31AuditoriaConfirmacaoManual.create({ inscricao_id: pendencia.registro_id, etapa, confirmado: true, confirmado_por: user?.email || '', confirmado_em: new Date().toISOString() });
      }
      const manual = await base44.entities.M31AuditoriaConfirmacaoManual.filter({ inscricao_id: pendencia.registro_id }, '-confirmado_em', 20);
      setJourneyData(d => ({ ...d, manual }));
      feedback.success('Confirmação manual registrada.');
    } catch { feedback.error('Não foi possível registrar a confirmação.'); }
  }

  const canonicalCandidates = useMemo(() => [
    { ...inscricao, _current: true },
    ...duplicates,
  ], [inscricao, duplicates]);

  const recoveryMessage = useMemo(() => {
    const primeiroNome = String(pendencia?.nome || '').trim().split(/\s+/)[0] || 'minha irmã';
    return `Oi, ${primeiroNome}! Paz, minha irmã! 💛\nVimos que você tentou se inscrever no M31 Filhas e queremos saber se teve alguma dificuldade. Posso te ajudar?`;
  }, [pendencia?.nome]);

  if (!pendencia) return null;

  async function getFreshAnalysis() {
    if (!pendencia._analise_id) return pendencia._analise || null;
    try {
      const rows = await base44.entities.M31PendenciaConciliacao.filter({ id: pendencia._analise_id });
      return rows?.[0] || pendencia._analise || null;
    } catch {
      return pendencia._analise || null;
    }
  }

  async function saveAnalysis(patch = {}, historyEntries = []) {
    const fresh = await getFreshAnalysis();
    const history = [...(fresh?.historico_alteracoes || []), ...historyEntries];
    const payload = {
      status_analise: patch.status_analise || fresh?.status_analise || pendencia.status_analise || 'em_analise',
      prioridade: fresh?.prioridade || pendencia.prioridade || 'media',
      responsavel_revisao: fresh?.responsavel_revisao || user?.email || '',
      proxima_acao: patch.proxima_acao ?? nextAction,
      observacao: patch.observacao ?? note,
      decisao: patch.decisao ?? decision,
      motivos_originais: fresh?.motivos_originais?.length ? fresh.motivos_originais : (pendencia.motivos || []),
      evidencias_consultadas: patch.evidencias_consultadas || evidence,
      regra_aplicada: patch.regra_aplicada || fresh?.regra_aplicada || '',
      resultado_final: patch.resultado_final || fresh?.resultado_final || '',
      duplicidade_descartada_ids: patch.duplicidade_descartada_ids || fresh?.duplicidade_descartada_ids || [],
      duplicidade_canonica_id: patch.duplicidade_canonica_id ?? fresh?.duplicidade_canonica_id ?? '',
      historico_alteracoes: history,
    };
    if (pendencia._analise_id) {
      await base44.entities.M31PendenciaConciliacao.update(pendencia._analise_id, payload);
    } else {
      await base44.entities.M31PendenciaConciliacao.create({ tipo_registro: 'inscricao', registro_id: pendencia.registro_id, ...payload });
    }
  }

  async function logAction(action, before, after) {
    try {
      await base44.entities.EventoM31ActionLog.create({
        user_email: user?.email || 'auditoria',
        user_nome: user?.full_name || user?.email || 'Auditoria',
        user_perfil: user?.role || 'admin',
        acao: action,
        modulo: 'inscricoes',
        entidade_id: pendencia.registro_id,
        entidade_nome: pendencia.nome || '',
        dados_novos: JSON.stringify({ anterior: before, novo: after, justificativa: note || null, evidencias: evidence }),
        session_id: 'AUDITORIA_ADMIN',
        resultado: 'sucesso',
      });
    } catch (_) {}
  }

  async function reconcile(ids) {
    try {
      const simRes = await base44.functions.invoke('m31ConciliacaoCanonica', { detalhar: true });
      const sim = simRes?.data || simRes;
      const wanted = (sim?.alteracoes || []).filter((a) => ids.includes(a.id)).map((a) => a.id);
      if (!wanted.length) return { ok: true, changed: 0 };
      const applyRes = await base44.functions.invoke('m31ConciliacaoCanonica', { aplicar: true, plano_hash: sim.plano_hash, ids: wanted });
      const applied = applyRes?.data || applyRes;
      return { ok: !applied?.error, changed: applied?.registros_atualizados || 0, detail: applied };
    } catch (err) {
      return { ok: false, error: err?.response?.data?.error || err?.message || 'Falha ao recalcular conciliação' };
    }
  }

  function chooseDecision(value) {
    setDecision(value);
    setShowPayment(value === 'pagamento_encontrado');
    setShowDuplicates(value === 'duplicidade_confirmada' || value === 'duplicidade_descartada');
    if (value === 'pagamento_encontrado') addEvidence('evidencias_financeiras');
    if (value === 'duplicidade_confirmada' || value === 'duplicidade_descartada') addEvidence('comparacao_duplicidades');
    if (value === 'corrigir_cadastro') addEvidence('cadastro_atual');
  }

  async function copyCpf() {
    const cpf = normalizeDigits(pendencia.cpf);
    if (!cpf) return feedback.error('CPF não informado.');
    try {
      await navigator.clipboard.writeText(cpf);
      addEvidence('cpf_copiado');
      feedback.success('CPF copiado.');
    } catch {
      feedback.error('Não foi possível copiar o CPF.');
    }
  }

  function openWhatsapp() {
    addEvidence('whatsapp_consultado');
    window.open(waMeUrl(pendencia.whatsapp), '_blank', 'noopener,noreferrer');
  }

  async function openRecovery() {
    if (!pendencia.whatsapp) return feedback.error('WhatsApp não informado.');
    setRecoveryOpen(true);
    setRecoveryStatus({ loading: true, status: 'nao_enviada', quando: null });
    try {
      const telefone = normalizeDigits(pendencia.whatsapp);
      const tel = telefone.startsWith('55') ? telefone : `55${telefone}`;
      const [fila, logs] = await Promise.all([
        base44.entities.M31FilaMensagem.filter({ telefone: tel, automacao: 'RECUPERACAO_CHECKOUT' }, '-created_date', 20),
        base44.entities.M31AutomacaoLog.filter({ telefone: tel, automacao: 'RECUPERACAO_CHECKOUT' }, '-enviado_em', 20),
      ]);
      const enviada = logs.find(l => l.status === 'enviado');
      const naFila = fila.find(f => ['pendente', 'processando'].includes(f.status));
      const status = enviada ? 'enviada' : naFila ? 'na_fila' : 'nao_enviada';
      setRecoveryStatus({ loading: false, status, quando: enviada?.enviado_em || naFila?.created_date || null });
    } catch {
      setRecoveryStatus({ loading: false, status: 'nao_enviada', quando: null });
    }
  }

  async function sendRecovery() {
    setRecoverySending(true);
    try {
      const res = await base44.functions.invoke('m31AprovarRecuperacao', {
        inscricao_id: pendencia.registro_id,
        action: 'approve',
        mensagem_personalizada: recoveryMessage,
        origem_manual: 'auditoria',
        template_key: 'recuperacao_manual_v1',
      });
      const data = res?.data || res;
      if (data?.ja_pagou) {
        setRecoveryOpen(false);
        feedback.warning('Pagamento já confirmado. Recuperação não enviada.');
        await qc.invalidateQueries({ queryKey: ['m31_aud_inscricoes'] });
        return;
      }
      if (!data?.success) throw new Error(data?.mensagem || data?.error || 'Recuperação bloqueada pela governança.');
      addEvidence('recuperacao_manual_v1_enfileirada');
      setDecision('aguardar_resposta');
      setNextAction('Aguardar retorno da participante no WhatsApp');
      setRecoveryStatus({ loading: false, status: 'na_fila', quando: new Date().toISOString() });
      feedback.success('Recuperação colocada na fila com segurança.');
    } catch (err) {
      feedback.error(err?.response?.data?.mensagem || err?.response?.data?.error || err?.message || 'Não foi possível enfileirar a recuperação.');
    } finally {
      setRecoverySending(false);
    }
  }

  async function handlePaymentFound() {
    const evidenceExists = Boolean(inscricao.asaas_payment_id || selectedTx);
    if (!gateway) return feedback.error('Selecione o gateway do pagamento.');
    if (!evidenceExists && !note.trim()) return feedback.error('Sem evidência vinculada no sistema. Registre na observação onde você conferiu o pagamento.');

    const selected = relatedTx.find((t) => t.id === selectedTx);
    const evidenceList = [...new Set([
      ...evidence,
      inscricao.asaas_payment_id ? `asaas_payment_id:${inscricao.asaas_payment_id}` : null,
      selected ? `transacao:${selected.id || selected.transaction_id}` : null,
      !evidenceExists && note.trim() ? `conferencia_manual:${gateway}` : null,
    ].filter(Boolean))];

    const res = await base44.functions.invoke('m31VincularPagamentoManual', {
      inscricao_id: pendencia.registro_id,
      gateway,
      status_pagamento: 'aprovado',
    });
    const data = res?.data || res;
    if (!data?.ok) throw new Error(data?.error || 'Não foi possível vincular o pagamento.');

    const rec = await reconcile([pendencia.registro_id]);
    await saveAnalysis({
      decisao: 'pagamento_encontrado',
      status_analise: rec.ok ? 'resolvido' : 'aguardando_validacao_financeira',
      evidencias_consultadas: evidenceList,
      regra_aplicada: 'Pagamento só é confirmado após conferência humana de evidência financeira.',
      resultado_final: rec.ok ? 'Pagamento vinculado e conciliação canônica recalculada.' : `Pagamento vinculado; conciliação pendente: ${rec.error}`,
    }, [{
      usuario: user?.email || 'sistema', data: new Date().toISOString(), campo: 'decisao',
      valor_anterior: pendencia.decisao || '', valor_novo: 'pagamento_encontrado',
      justificativa: note || 'Pagamento localizado e conferido manualmente',
    }]);
    return rec;
  }

  async function handleCadastroCorrection() {
    const before = {
      nome: inscricao.nome || '', email: inscricao.email || '', whatsapp: inscricao.whatsapp || '', cpf: inscricao.cpf || '',
      cidade: inscricao.cidade || '', estado: inscricao.estado || '', codigo_inscricao: inscricao.codigo_inscricao || '', tipo: inscricao.tipo || '',
    };
    const after = {
      nome: String(editData.nome || '').trim(),
      email: String(editData.email || '').trim().toLowerCase(),
      whatsapp: normalizeDigits(editData.whatsapp),
      cpf: normalizeDigits(editData.cpf),
      cidade: String(editData.cidade || '').trim(),
      estado: String(editData.estado || '').trim().toUpperCase(),
      codigo_inscricao: String(editData.codigo_inscricao || '').trim(),
      tipo: editData.tipo || inscricao.tipo,
    };
    if (after.cpf && after.cpf.length !== 11) throw new Error('CPF deve ter 11 dígitos.');
    if (after.whatsapp && after.whatsapp.length < 10) throw new Error('WhatsApp incompleto.');
    if (after.email && !/^[^@]+@[^@]+\.[^@]+$/.test(after.email)) throw new Error('E-mail inválido.');

    const changes = Object.fromEntries(Object.entries(after).filter(([k, v]) => !same(v, before[k])));
    if (!Object.keys(changes).length) throw new Error('Nenhuma alteração cadastral foi feita.');

    await base44.entities.EventoM31Inscricao.update(pendencia.registro_id, changes);
    await logAction('Correção cadastral pela auditoria', before, { ...before, ...changes });
    const rec = await reconcile([pendencia.registro_id, ...duplicates.map((d) => d.id)]);

    const history = Object.entries(changes).map(([field, value]) => ({
      usuario: user?.email || 'sistema', data: new Date().toISOString(), campo: `EventoM31Inscricao.${field}`,
      valor_anterior: String(before[field] ?? ''), valor_novo: String(value ?? ''),
      justificativa: note || 'Correção cadastral manual',
    }));
    await saveAnalysis({
      decisao: 'corrigir_cadastro',
      status_analise: rec.ok ? 'corrigido' : 'em_analise',
      evidencias_consultadas: [...new Set([...evidence, 'cadastro_atual'])],
      regra_aplicada: 'Correção manual altera o cadastro real e preserva trilha de auditoria.',
      resultado_final: rec.ok ? 'Cadastro corrigido e conciliação canônica recalculada.' : `Cadastro corrigido; conciliação pendente: ${rec.error}`,
    }, history);
    return rec;
  }

  async function confirmDuplicate(duplicateId, canonicalId) {
    const duplicate = canonicalCandidates.find((c) => c.id === duplicateId);
    const canonical = canonicalCandidates.find((c) => c.id === canonicalId);
    if (!duplicate || !canonical || duplicateId === canonicalId) throw new Error('Seleção de duplicidade inválida.');

    const targetAnalysis = await base44.entities.M31PendenciaConciliacao.filter({ tipo_registro: 'inscricao', registro_id: duplicateId });
    const existing = targetAnalysis?.[0] || null;
    const baseHistory = existing?.historico_alteracoes || [];
    const h = {
      usuario: user?.email || 'sistema', data: new Date().toISOString(), campo: 'duplicidade_canonica_id',
      valor_anterior: existing?.duplicidade_canonica_id || '', valor_novo: canonicalId,
      justificativa: note || `Duplicidade confirmada manualmente; canônica: ${canonical.nome || canonicalId}`,
    };
    const payload = {
      status_analise: 'resolvido',
      prioridade: existing?.prioridade || 'alta',
      responsavel_revisao: existing?.responsavel_revisao || user?.email || '',
      decisao: 'duplicidade_confirmada',
      motivos_originais: existing?.motivos_originais?.length ? existing.motivos_originais : ['possivel_duplicidade'],
      evidencias_consultadas: [...new Set([...(existing?.evidencias_consultadas || []), ...evidence, 'comparacao_duplicidades'])],
      regra_aplicada: 'Duplicidade só é confirmada após escolha humana explícita da inscrição canônica.',
      resultado_final: `Inscrição ${duplicateId} marcada como duplicada de ${canonicalId}.`,
      duplicidade_canonica_id: canonicalId,
      observacao: note,
      historico_alteracoes: [...baseHistory, h],
    };
    if (existing) await base44.entities.M31PendenciaConciliacao.update(existing.id, payload);
    else await base44.entities.M31PendenciaConciliacao.create({ tipo_registro: 'inscricao', registro_id: duplicateId, ...payload });

    await logAction('Duplicidade confirmada pela auditoria', { duplicada_de_id: duplicate.duplicada_de_id || '' }, { duplicada_de_id: canonicalId });
    const rec = await reconcile([duplicateId, canonicalId]);
    if (!rec.ok) feedback.warning('Decisão salva, mas a conciliação canônica precisa ser executada novamente.');
    return rec;
  }

  async function rejectDuplicates() {
    const ids = duplicates.map((d) => d.id);
    if (!ids.length) throw new Error('Não há candidatos de duplicidade para descartar.');
    const currentDismissed = pendencia.duplicidade_descartada_ids || [];
    const dismissed = [...new Set([...currentDismissed, ...ids])];
    const otherMotives = (pendencia.motivos || []).filter((m) => m !== 'possivel_duplicidade');
    await saveAnalysis({
      decisao: 'duplicidade_descartada',
      status_analise: otherMotives.length ? 'em_analise' : 'resolvido',
      duplicidade_descartada_ids: dismissed,
      evidencias_consultadas: [...new Set([...evidence, 'comparacao_duplicidades'])],
      regra_aplicada: 'Duplicidade descartada após comparação humana de CPF, WhatsApp e/ou e-mail.',
      resultado_final: `Candidatos descartados como duplicidade: ${ids.join(', ')}`,
    }, [{
      usuario: user?.email || 'sistema', data: new Date().toISOString(), campo: 'duplicidade_descartada_ids',
      valor_anterior: currentDismissed.join(','), valor_novo: dismissed.join(','),
      justificativa: note || 'Não é duplicidade',
    }]);
  }

  async function saveAndNext() {
    setSaving(true);
    try {
      let message = 'Análise salva.';
      if (decision === 'pagamento_encontrado') {
        await handlePaymentFound();
        message = 'Pagamento conferido e análise atualizada.';
      } else if (decision === 'corrigir_cadastro') {
        await handleCadastroCorrection();
        message = 'Cadastro corrigido.';
      } else if (decision === 'duplicidade_descartada') {
        await rejectDuplicates();
        message = 'Duplicidade descartada.';
      } else if (decision === 'duplicidade_confirmada') {
        throw new Error('Escolha abaixo qual registro é o canônico antes de salvar.');
      } else {
        const status = decision === 'aguardar_resposta' ? 'aguardando_contato'
          : decision === 'descartar_auditoria' ? 'descartado'
          : decision === 'manter_pendente' ? 'resolvido'
          : 'em_analise';
        await saveAnalysis({
          decisao: decision || undefined,
          status_analise: status,
          regra_aplicada: decision === 'manter_pendente' ? 'Situação conferida e mantida como pendente por decisão humana.' : '',
          resultado_final: decision === 'manter_pendente' ? 'Inscrição permanece pendente; nenhuma confirmação financeira foi criada.' : '',
        }, decision ? [{
          usuario: user?.email || 'sistema', data: new Date().toISOString(), campo: 'decisao',
          valor_anterior: pendencia.decisao || '', valor_novo: decision,
          justificativa: note || 'Decisão manual de auditoria',
        }] : []);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['m31_aud_analises'] }),
        qc.invalidateQueries({ queryKey: ['m31_aud_inscricoes'] }),
        qc.invalidateQueries({ queryKey: ['m31_stats_inscricoes'] }),
        qc.invalidateQueries({ queryKey: ['m31inscricoes-table'] }),
      ]);
      feedback.success(message);
      onNext?.();
    } catch (err) {
      feedback.error(err?.response?.data?.error || err?.message || 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  const btn = { minHeight: '44px', borderRadius: '10px', border: `1px solid ${TOKENS.border}`, background: TOKENS.surface, color: TOKENS.text, fontSize: '12px', fontWeight: '700', cursor: 'pointer', padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' };
  const input = { width: '100%', minHeight: '44px', borderRadius: '10px', border: `1px solid ${TOKENS.borderStrong}`, padding: '9px 10px', fontSize: '14px', boxSizing: 'border-box', background: '#fff', color: TOKENS.text, outline: 'none' };
  const label = { display: 'block', fontSize: '11px', fontWeight: '800', color: TOKENS.textSubtle, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '5px' };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.38)', zIndex: 999 }} />
      <aside style={{ position: 'fixed', inset: '0 0 0 auto', width: '520px', maxWidth: '100vw', zIndex: 1000, background: TOKENS.surface, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 28px rgba(0,0,0,.10)' }}>
        <header style={{ padding: '16px 18px', borderBottom: `1px solid ${TOKENS.border}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '17px', fontWeight: '800', color: TOKENS.text }}>{pendencia.nome || 'Pendência'}</div>
            <div style={{ marginTop: '2px', fontSize: '11px', color: TOKENS.textMuted }}>{pendencia.codigo_inscricao || pendencia.registro_id} · {(pendencia.motivos || []).length} motivo(s)</div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ ...btn, width: 44, padding: 0 }}><X size={18} /></button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 110px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <section style={{ borderRadius: 12, border: `1px solid ${TOKENS.border}`, padding: 12 }}>
            <span style={label}>Jornada da Participante</span>
            {(() => {
              const i = inscricao;
              const sent = (auto) => journeyData.logs.some(l => l.automacao === auto && l.status === 'enviado') || journeyData.fila.some(f => f.automacao === auto && f.status === 'enviado');
              const manualOk = (e) => journeyData.manual.some(m => m.etapa === e && m.confirmado);
              const etapas = [
                ['Cadastro', !!i.created_date || manualOk('cadastro')],
                ['Pagamento', ['aprovado','gratuito'].includes(i.status_pagamento) || !!i.pagamento_confirmado_em || manualOk('pagamento')],
                ['Aprovada', ['aprovado','gratuito'].includes(i.status_pagamento)],
                ['QR gerado', !!i.qrcode_url || !!i.qrcode_gerado_em || manualOk('qr')],
                ['QR enviado', i.qr_envio_status === 'enviado_com_sucesso' || sent('QR_CODE') || manualOk('qr')],
                ['Boas-vindas', !!i.data_envio_boas_vindas || sent('BOAS_VINDAS') || manualOk('boas_vindas')],
                ['Grupo', i.entrou_no_grupo === true || manualOk('grupo')],
              ];
              return <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>{etapas.map(([n,ok]) => <div key={n} style={{ minWidth: 88, padding: '8px 7px', borderRadius: 9, background: ok ? '#ECFDF3' : TOKENS.surfaceSubtle, color: ok ? '#15803D' : TOKENS.textMuted, fontSize: 10, fontWeight: 700, textAlign: 'center' }}>{ok ? '✓' : '●'}<br/>{n}</div>)}</div>;
            })()}
            <div style={{ marginTop: 9, fontSize: 11, color: TOKENS.textMuted }}><b>Grupo de inscritas:</b> {inscricao.entrou_no_grupo === true ? '✓ Encontrada' : 'Não verificado / não encontrada'}</div>
            {inscricao.entrou_no_grupo === true && !inscricao.codigo_inscricao && <div style={{ marginTop: 6, fontSize: 11, color: TOKENS.warning }}>⚠ Está no grupo, mas cadastro precisa conciliação.</div>}
          </section>

          <section style={{ borderRadius: '12px', background: TOKENS.surfaceSubtle, padding: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
            <div style={{ gridColumn: '1 / -1', ...label }}>Cadastro</div>
            <div><span style={{ color: TOKENS.textMuted }}>WhatsApp</span><br /><b>{pendencia.whatsapp || '—'}</b></div>
            <div><span style={{ color: TOKENS.textMuted }}>E-mail</span><br /><b>{pendencia.email || '—'}</b></div>
            <div><span style={{ color: TOKENS.textMuted }}>CPF</span><br /><b>{pendencia.cpf || '—'}</b></div>
            <div><span style={{ color: TOKENS.textMuted }}>Valor</span><br /><b>{formatMoney(pendencia.valor)}</b></div>
            <div><span style={{ color: TOKENS.textMuted }}>Pagamento</span><br /><b>{pendencia.status_pagamento || '—'}</b></div>
            <div><span style={{ color: TOKENS.textMuted }}>Tipo</span><br /><b>{pendencia.tipo_inscricao || '—'}</b></div>
          </section>

          <section style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: 12 }}>
            <span style={label}>Comunicação</span>
            <div style={{ display: 'grid', gap: 5, fontSize: 12 }}>
              <div>Boas-vindas: <b>{inscricao.data_envio_boas_vindas || journeyData.logs.some(l => l.automacao === 'BOAS_VINDAS' && l.status === 'enviado') ? 'Enviada ✓' : 'Não enviada'}</b></div>
              <div>QR Code: <b>{inscricao.qr_envio_status === 'enviado_com_sucesso' || journeyData.logs.some(l => l.automacao === 'QR_CODE' && l.status === 'enviado') ? 'Enviado ✓' : 'Não enviado'}</b></div>
              <div>Recuperação: <b>{journeyData.logs.some(l => l.automacao === 'RECUPERACAO_CHECKOUT' && l.status === 'enviado') ? 'Enviada ✓' : journeyData.fila.some(f => f.automacao === 'RECUPERACAO_CHECKOUT' && ['pendente','processando'].includes(f.status)) ? 'Na fila' : 'Não enviada'}</b></div>
              <div>Última mensagem: <b>{journeyData.logs.find(l => l.enviado_em)?.enviado_em ? new Date(journeyData.logs.find(l => l.enviado_em).enviado_em).toLocaleString('pt-BR') : '—'}</b></div>
            </div>
          </section>

          {(inscricao.origem_pagamento === 'importacao' || inscricao.origem_inscricao === 'IMPORTACAO_MANUAL') && <section style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: 12 }}>
            <span style={label}>Conferência manual · Importação</span>
            {['cadastro','pagamento','qr','boas_vindas','grupo'].map(e => { const m = journeyData.manual.find(x => x.etapa === e); return <label key={e} style={{ minHeight: 38, display:'flex', alignItems:'center', gap:8, fontSize:12 }}><input type="checkbox" checked={!!m?.confirmado} onChange={() => toggleManualJourney(e)} /> {e.replace('_',' ')} {m?.confirmado && <small style={{color:TOKENS.textMuted}}>Confirmado manualmente · {m.confirmado_por}</small>}</label>; })}
          </section>}

          <section>
            <button onClick={() => setHistoryOpen(v => !v)} style={{ ...btn, width: '100%', justifyContent: 'space-between' }}><span>Ver histórico</span><span>{historyOpen ? '−' : '+'}</span></button>
            {historyOpen && <div style={{ marginTop: 8, borderLeft: `2px solid ${TOKENS.border}`, paddingLeft: 10, display:'grid', gap:8 }}>{journeyData.timeline.length ? journeyData.timeline.map(t => <div key={t.id} style={{fontSize:11}}><b>{String(t.evento || t.etapa || 'Evento').replace(/_/g,' ')}</b><br/><span style={{color:TOKENS.textMuted}}>{t.created_date ? new Date(t.created_date).toLocaleString('pt-BR') : ''} {t.detalhe ? `· ${String(t.detalhe).slice(0,160)}` : ''}</span></div>) : <div style={{fontSize:11,color:TOKENS.textMuted}}>Sem eventos adicionais na timeline.</div>}</div>}
          </section>

          <section>
            <span style={label}>Motivos da auditoria</span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {(pendencia.motivos || []).map((m) => <span key={m} style={{ background: TOKENS.warningSoft, color: TOKENS.warning, borderRadius: '999px', padding: '5px 9px', fontSize: '11px', fontWeight: '700' }}>{m.replace(/_/g, ' ')}</span>)}
            </div>
          </section>

          <section>
            <span style={label}>Investigar</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button onClick={openWhatsapp} disabled={!pendencia.whatsapp} style={btn}><MessageCircle size={16} /> Abrir WhatsApp</button>
              {!['aprovado', 'gratuito'].includes(pendencia.status_pagamento) && <button onClick={openRecovery} disabled={!pendencia.whatsapp} style={{ ...btn, background: TOKENS.primarySoft, color: TOKENS.primary, borderColor: TOKENS.primary }}><MessageCircle size={16} /> Recuperar</button>}
              <button onClick={() => { setShowPayment((v) => !v); addEvidence('evidencias_financeiras'); }} style={btn}><CreditCard size={16} /> Ver pagamento</button>
              <button onClick={() => { setShowDuplicates((v) => !v); addEvidence('comparacao_duplicidades'); }} style={btn}><Users size={16} /> Ver duplicidades</button>
              <button onClick={copyCpf} style={btn}><Copy size={16} /> Copiar CPF</button>
            </div>
          </section>

          {showPayment && (
            <section style={{ border: `1px solid ${TOKENS.border}`, borderRadius: '12px', padding: '12px' }}>
              <span style={label}>Evidências financeiras</span>
              <div style={{ display: 'grid', gap: '5px', fontSize: '12px' }}>
                <div><b>Asaas payment:</b> {inscricao.asaas_payment_id || '—'}</div>
                <div><b>Asaas checkout:</b> {inscricao.asaas_checkout_id || '—'}</div>
                <div><b>Origem:</b> {inscricao.origem_pagamento || '—'}</div>
                {inscricao.asaas_charge_url && <a href={inscricao.asaas_charge_url} target="_blank" rel="noreferrer" style={{ color: TOKENS.primary, display: 'inline-flex', gap: 5, alignItems: 'center', fontWeight: 700 }}><ExternalLink size={14} /> Abrir cobrança/comprovante</a>}
              </div>
              <div style={{ marginTop: 10, display: 'grid', gap: 7 }}>
                {relatedTx.length === 0 && <div style={{ fontSize: '12px', color: TOKENS.textMuted }}>Nenhuma M31TransacaoFinanceira relacionada foi encontrada.</div>}
                {relatedTx.map((t) => (
                  <button key={t.id} onClick={() => { setSelectedTx(t.id); if (t.gateway) setGateway(t.gateway); addEvidence(`transacao:${t.id}`); }} style={{ ...btn, justifyContent: 'flex-start', borderColor: selectedTx === t.id ? TOKENS.primary : TOKENS.border, background: selectedTx === t.id ? TOKENS.primarySoft : TOKENS.surface }}>
                    <span style={{ textAlign: 'left' }}><b>{t.gateway || 'gateway'}</b> · {t.status || '—'} · {formatMoney(t.valor_bruto)}<br /><span style={{ color: TOKENS.textMuted }}>{t.transaction_id || t.id}</span></span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {showDuplicates && (
            <section style={{ border: `1px solid ${TOKENS.border}`, borderRadius: '12px', padding: '12px' }}>
              <span style={label}>Possíveis duplicidades</span>
              {duplicates.length === 0 ? <div style={{ fontSize: '12px', color: TOKENS.textMuted }}>Nenhum candidato encontrado por CPF, WhatsApp ou e-mail.</div> : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {duplicates.map((d) => (
                    <div key={d.id} style={{ background: TOKENS.surfaceSubtle, borderRadius: '10px', padding: '10px' }}>
                      <b style={{ fontSize: '13px' }}>{d.nome}</b>
                      <div style={{ marginTop: 4, fontSize: '11px', color: TOKENS.textMuted }}>CPF: {d.cpf || '—'} · WA: {d.whatsapp || '—'}<br />Pagamento: {d.status_pagamento || '—'} · Estado: {d.estado_canonico || '—'}</div>
                      {decision === 'duplicidade_confirmada' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
                          <button disabled={saving} onClick={async () => {
                            setSaving(true);
                            try {
                              await confirmDuplicate(pendencia.registro_id, d.id);
                              await qc.invalidateQueries({ queryKey: ['m31_aud_analises'] });
                              await qc.invalidateQueries({ queryKey: ['m31_aud_inscricoes'] });
                              feedback.success(`${pendencia.nome} marcada como duplicada de ${d.nome}.`);
                              onNext?.();
                            } catch (err) { feedback.error(err?.message || 'Falha ao confirmar duplicidade.'); }
                            finally { setSaving(false); }
                          }} style={{ ...btn, background: TOKENS.primarySoft, color: TOKENS.primary }}>Esta é a canônica</button>
                          <button disabled={saving} onClick={async () => {
                            setSaving(true);
                            try {
                              await confirmDuplicate(d.id, pendencia.registro_id);
                              await saveAnalysis({
                                decisao: 'duplicidade_confirmada', status_analise: 'em_analise',
                                evidencias_consultadas: [...new Set([...evidence, 'comparacao_duplicidades'])],
                                resultado_final: `${d.id} foi marcada como duplicada da inscrição atual ${pendencia.registro_id}.`,
                              });
                              await qc.invalidateQueries({ queryKey: ['m31_aud_analises'] });
                              await qc.invalidateQueries({ queryKey: ['m31_aud_inscricoes'] });
                              feedback.success(`${d.nome} marcada como duplicada desta inscrição.`);
                              onNext?.();
                            } catch (err) { feedback.error(err?.message || 'Falha ao confirmar duplicidade.'); }
                            finally { setSaving(false); }
                          }} style={{ ...btn, background: '#fff' }}>Atual é a canônica</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section>
            <span style={label}>O que você decidiu?</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {DECISOES.map(([value, text, Icon]) => (
                <button key={value} onClick={() => chooseDecision(value)} style={{ ...btn, justifyContent: 'flex-start', borderColor: decision === value ? TOKENS.primary : TOKENS.border, background: decision === value ? TOKENS.primarySoft : TOKENS.surface, color: decision === value ? TOKENS.primary : TOKENS.text }}>
                  <Icon size={15} /> {text}
                </button>
              ))}
            </div>
          </section>

          {decision === 'pagamento_encontrado' && (
            <section style={{ borderRadius: '12px', background: TOKENS.surfaceSubtle, padding: '12px' }}>
              <span style={label}>Pagamento encontrado</span>
              <select value={gateway} onChange={(e) => setGateway(e.target.value)} style={input}>
                <option value="">Selecione o gateway</option>
                {GATEWAYS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <p style={{ margin: '7px 0 0', fontSize: '11px', color: TOKENS.textMuted }}>A inscrição só será consolidada após sua confirmação. Se não houver evidência vinculada no sistema, descreva na observação onde o pagamento foi conferido.</p>
            </section>
          )}

          {decision === 'corrigir_cadastro' && (
            <section style={{ borderRadius: '12px', background: TOKENS.surfaceSubtle, padding: '12px' }}>
              <span style={label}>Corrigir cadastro real</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input style={input} value={editData.nome} onChange={(e) => setEditData({ ...editData, nome: e.target.value })} placeholder="Nome" />
                <input style={input} value={editData.email} onChange={(e) => setEditData({ ...editData, email: e.target.value })} placeholder="E-mail" />
                <input style={input} value={editData.whatsapp} onChange={(e) => setEditData({ ...editData, whatsapp: e.target.value })} placeholder="WhatsApp" />
                <input style={input} value={editData.cpf} onChange={(e) => setEditData({ ...editData, cpf: e.target.value })} placeholder="CPF" />
                <input style={input} value={editData.cidade} onChange={(e) => setEditData({ ...editData, cidade: e.target.value })} placeholder="Cidade" />
                <input style={input} value={editData.estado} onChange={(e) => setEditData({ ...editData, estado: e.target.value })} placeholder="UF" maxLength={2} />
                <input style={input} value={editData.codigo_inscricao} onChange={(e) => setEditData({ ...editData, codigo_inscricao: e.target.value })} placeholder="Código inscrição" />
                <select style={input} value={editData.tipo} onChange={(e) => setEditData({ ...editData, tipo: e.target.value })}>
                  <option value="publico_geral">Público geral</option><option value="caravana">Caravana</option><option value="voluntario">Voluntário</option><option value="doacao">Doação</option>
                </select>
              </div>
            </section>
          )}

          {decision === 'aguardar_resposta' && (
            <section style={{ borderRadius: '12px', background: TOKENS.surfaceSubtle, padding: '12px' }}>
              <span style={label}>Próxima ação</span>
              <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} style={input} placeholder="Ex: aguardar retorno no WhatsApp" />
            </section>
          )}

          <section>
            <span style={label}>Observação / justificativa</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ ...input, minHeight: 76, resize: 'vertical' }} placeholder="Registre o que você conferiu e por que tomou esta decisão." />
          </section>
        </div>

        {recoveryOpen && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(0,0,0,.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
            <div style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 18px 50px rgba(0,0,0,.18)' }}>
              <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 14 }}>Recuperação</div>
              <div style={{ display: 'grid', gap: 7, fontSize: 13 }}>
                <div><b>Status:</b> {recoveryStatus.loading ? 'Verificando…' : recoveryStatus.status === 'enviada' ? 'Enviada ✓' : recoveryStatus.status === 'na_fila' ? 'Na fila' : 'Não enviada'}</div>
                <div><b>Canal:</b> WhatsApp</div>
                {recoveryStatus.quando && <div style={{ color: TOKENS.textMuted, fontSize: 12 }}>Registro: {new Date(recoveryStatus.quando).toLocaleString('pt-BR')}</div>}
                <div style={{ marginTop: 5 }}><b>Mensagem:</b></div>
                <div style={{ whiteSpace: 'pre-wrap', background: TOKENS.surfaceSubtle, borderRadius: 10, padding: 12, lineHeight: 1.45 }}>{recoveryMessage}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 8, marginTop: 16 }}>
                <button onClick={() => setRecoveryOpen(false)} disabled={recoverySending} style={btn}>Cancelar</button>
                <button onClick={sendRecovery} disabled={recoverySending || recoveryStatus.loading || recoveryStatus.status !== 'nao_enviada'} style={{ ...btn, background: recoveryStatus.status === 'nao_enviada' ? TOKENS.primary : TOKENS.surfaceSubtle, color: recoveryStatus.status === 'nao_enviada' ? '#fff' : TOKENS.textMuted, borderColor: recoveryStatus.status === 'nao_enviada' ? TOKENS.primary : TOKENS.border }}>
                  {recoverySending ? 'Enfileirando…' : recoveryStatus.status === 'enviada' ? 'Recuperação enviada ✓' : recoveryStatus.status === 'na_fila' ? 'Recuperação na fila' : 'Enviar recuperação'}
                </button>
              </div>
            </div>
          </div>
        )}

        <footer style={{ position: 'absolute', inset: 'auto 0 0 0', padding: '12px 18px max(12px, env(safe-area-inset-bottom))', borderTop: `1px solid ${TOKENS.border}`, background: TOKENS.surface, display: 'grid', gridTemplateColumns: '1fr 1.45fr', gap: 8 }}>
          <button onClick={() => onNext?.()} disabled={saving} style={{ ...btn, minHeight: 50, color: TOKENS.textMuted }}>Pular</button>
          <button onClick={saveAndNext} disabled={saving} style={{ ...btn, minHeight: 50, background: TOKENS.primary, color: '#fff', borderColor: TOKENS.primary }}>{saving ? 'Salvando…' : <><span>Salvar e próxima</span><ArrowRight size={16} /></>}</button>
        </footer>
      </aside>
    </>
  );
}