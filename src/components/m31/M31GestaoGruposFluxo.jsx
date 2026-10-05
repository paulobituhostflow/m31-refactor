import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { TOKENS } from '@/lib/m31DesignTokens';
import M31Drawer from '@/components/m31/M31Drawer';
import { Users, Settings2, RefreshCw, MessageSquare, Tag, ArrowRightLeft, Save, AlertCircle, CheckCircle2 } from 'lucide-react';

const T = TOKENS;

export default function M31GestaoGruposFluxo() {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedGrupo, setSelectedGrupo] = useState(null);
  const [formData, setFormData] = useState({});
  const [syncing, setSyncing] = useState(null);

  // ── Queries ──
  const { data: grupos = [], isLoading } = useQuery({
    queryKey: ['m31-grupo-configs'],
    queryFn: async () => {
      const resp = await base44.entities.M31GrupoConfig.list();
      return resp;
    },
  });

  const { data: membros = [] } = useQuery({
    queryKey: ['m31-grupo-membros-ativos'],
    queryFn: async () => {
      const resp = await base44.entities.M31GrupoMembro.filter({ status: 'ativa' });
      return resp;
    },
  });

  const contagemPorGrupo = useMemo(() => {
    const map = {};
    membros.forEach((m) => {
      const jid = m.group_jid;
      map[jid] = (map[jid] || 0) + 1;
    });
    return map;
  }, [membros]);

  // ── Mutations ──
  const saveMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await base44.entities.M31GrupoConfig.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['m31-grupo-configs'] });
      setDrawerOpen(false);
    },
  });

  const toggleAutomacao = async (grupo) => {
    try {
      await base44.entities.M31GrupoConfig.update(grupo.id, {
        automacao_ativa: !grupo.automacao_ativa,
      });
      queryClient.invalidateQueries({ queryKey: ['m31-grupo-configs'] });
    } catch (e) {
      console.error('Erro ao toggle automação:', e);
    }
  };

  const handleSync = async (grupo) => {
    setSyncing(grupo.id);
    try {
      await base44.functions.invoke('m31ExtrairGrupoInscritadas', { sync_membros: true });
      queryClient.invalidateQueries({ queryKey: ['m31-grupo-membros-ativos'] });
    } catch (e) {
      console.error('Erro no snapshot:', e);
    } finally {
      setSyncing(null);
    }
  };

  const handleOpenConfig = (grupo) => {
    setSelectedGrupo(grupo);
    setFormData({
      welcome_message: grupo.welcome_message || '',
      tag_entrada: grupo.tag_entrada || 'M31_FILHAS_ENTROU',
      tag_saida: grupo.tag_saida || 'M31_FILHAS_SAIU',
      automacao_ativa: grupo.automacao_ativa !== false,
    });
    setDrawerOpen(true);
  };

  const handleSave = () => {
    saveMutation.mutate({ id: selectedGrupo.id, data: formData });
  };

  // ── Métricas gerais ──
  const totalGrupos = grupos.length;
  const totalMembros = Object.values(contagemPorGrupo).reduce((a, b) => a + b, 0);
  const automacoesAtivas = grupos.filter(g => g.automacao_ativa !== false).length;

  return (
    <div style={{ fontFamily: T.font.body, color: T.text, padding: '4px 0' }}>
      {/* Header */}
      <div style={{ marginBottom: T.spacing.xl }}>
        <h1 style={{
          fontFamily: T.font.heading, fontSize: '22px', fontWeight: '700',
          margin: '0 0 4px 0', letterSpacing: '-0.02em',
        }}>
          Fluxos de Grupos
        </h1>
        <p style={{ fontSize: '13px', color: T.textMuted, margin: 0 }}>
          Gerencie automações de entrada/saída e mensagens de boas-vindas dos seus grupos de WhatsApp.
        </p>
      </div>

      {/* Métricas topo */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: T.spacing.md, marginBottom: T.spacing.xl,
      }}>
        <SummaryCard icon={Users} label="Grupos Monitorados" value={totalGrupos} color={T.info} />
        <SummaryCard icon={CheckCircle2} label="Membros Ativos" value={totalMembros} color={T.success} />
        <SummaryCard icon={Settings2} label="Automações Ativas" value={`${automacoesAtivas}/${totalGrupos}`} color={T.primary} />
      </div>

      {/* Grid de Cards (Bento) */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: T.spacing.lg }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: T.radius.lg, padding: T.spacing.xl,
              height: '200px', animation: 'm31-skel 1.4s ease-in-out infinite',
            }} />
          ))}
          <style>{`@keyframes m31-skel { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
        </div>
      ) : grupos.length === 0 ? (
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: T.radius.lg, padding: '48px', textAlign: 'center',
        }}>
          <Users size={32} style={{ color: T.textSubtle, marginBottom: '8px' }} />
          <p style={{ color: T.textMuted, fontSize: '13px', margin: 0 }}>
            Nenhum grupo configurado. Execute um snapshot para popular a base.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: T.spacing.lg,
        }}>
          {grupos.map((grupo) => (
            <GrupoCard
              key={grupo.id}
              grupo={grupo}
              contagem={contagemPorGrupo[grupo.chat_id] || 0}
              onConfig={() => handleOpenConfig(grupo)}
              onToggle={() => toggleAutomacao(grupo)}
              onSync={() => handleSync(grupo)}
              syncing={syncing === grupo.id}
            />
          ))}
        </div>
      )}

      {/* Drawer de Configuração */}
      <M31Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={`Configurar: ${selectedGrupo?.nome_grupo || 'Grupo'}`}
        subtitle={selectedGrupo?.finalidade}
        width="500px"
        footer={
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            style={{
              background: T.primary, color: T.onPrimary, border: 'none',
              borderRadius: T.radius.md, padding: '0 20px',
              height: T.buttonHeight.md, fontSize: '13px', fontWeight: '600',
              cursor: saveMutation.isPending ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
              opacity: saveMutation.isPending ? 0.6 : 1,
              fontFamily: T.font.body,
            }}
          >
            <Save size={15} />
            {saveMutation.isPending ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        }
      >
        {selectedGrupo && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: T.spacing.xl }}>
            {/* Status atual */}
            <div style={{
              background: T.surfaceSubtle, borderRadius: T.radius.md,
              padding: T.spacing.md, display: 'flex', gap: T.spacing.md,
            }}>
              <InfoPill label="Chat ID" value={selectedGrupo.chat_id || '—'} mono />
              <InfoPill label="Ativos" value={contagemPorGrupo[selectedGrupo.chat_id] || 0} />
            </div>

            {/* Toggle automação */}
            <ConfigRow icon={Settings2} label="Automação de Entrada/Saída">
              <ToggleSwitch
                checked={formData.automacao_ativa}
                onChange={(v) => setFormData({ ...formData, automacao_ativa: v })}
              />
            </ConfigRow>

            {/* Mensagem de boas-vindas */}
            <div>
              <ConfigLabel icon={MessageSquare} text="Mensagem de Boas-vindas (PV)" />
              <textarea
                value={formData.welcome_message}
                onChange={(e) => setFormData({ ...formData, welcome_message: e.target.value })}
                rows={5}
                placeholder="Olá {nome}! 👋 Que alegria ter você com a gente..."
                style={{
                  width: '100%', padding: '10px 12px', fontSize: '13px',
                  border: `1px solid ${T.border}`, borderRadius: T.radius.md,
                  background: T.surface, color: T.text,
                  fontFamily: T.font.body, resize: 'vertical',
                  boxSizing: 'border-box', lineHeight: '1.5',
                }}
              />
              <p style={{ fontSize: '11px', color: T.textSubtle, margin: '4px 0 0 0' }}>
                Use <code style={{ fontFamily: T.font.mono, color: T.primary }}>{'{nome}'}</code> para o primeiro nome da inscrita.
              </p>
            </div>

            {/* Tag de entrada */}
            <div>
              <ConfigLabel icon={Tag} text="Tag de Entrada (CRM)" />
              <select
                value={formData.tag_entrada}
                onChange={(e) => setFormData({ ...formData, tag_entrada: e.target.value })}
                style={selectStyle}
              >
                <option value="M31_FILHAS_ENTROU">M31_FILHAS_ENTROU</option>
                <option value="LEAD_ENTROU_GRUPO">LEAD_ENTROU_GRUPO</option>
                <option value="GRUPO_ATIVO">GRUPO_ATIVO</option>
              </select>
            </div>

            {/* Tag de saída */}
            <div>
              <ConfigLabel icon={ArrowRightLeft} text="Tag de Saída / Abandono" />
              <select
                value={formData.tag_saida}
                onChange={(e) => setFormData({ ...formData, tag_saida: e.target.value })}
                style={selectStyle}
              >
                <option value="M31_FILHAS_SAIU">M31_FILHAS_SAIU</option>
                <option value="LEAD_SAIU_GRUPO">LEAD_SAIU_GRUPO</option>
                <option value="GRUPO_ABANDONO">GRUPO_ABANDONO</option>
              </select>
            </div>

            {saveMutation.isError && (
              <div style={{
                background: T.dangerSoft, borderRadius: T.radius.md,
                padding: '10px 14px', display: 'flex', alignItems: 'center',
                gap: '8px', fontSize: '12px', color: T.danger,
              }}>
                <AlertCircle size={15} /> Erro ao salvar. Tente novamente.
              </div>
            )}
          </div>
        )}
      </M31Drawer>
    </div>
  );
}

// ── Sub-componentes ──────────────────────────────────────────

function SummaryCard({ icon: Icon, label, value, color }) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: T.radius.lg, padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: T.spacing.md,
    }}>
      <div style={{
        width: '36px', height: '36px', borderRadius: T.radius.md,
        background: T.surfaceSubtle, display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: '20px', fontWeight: '700', color, letterSpacing: '-0.02em' }}>{value}</div>
        <div style={{ fontSize: '11px', color: T.textMuted }}>{label}</div>
      </div>
    </div>
  );
}

function GrupoCard({ grupo, contagem, onConfig, onToggle, onSync, syncing }) {
  const autoAtiva = grupo.automacao_ativa !== false;
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: T.radius.lg, padding: T.spacing.xl,
      display: 'flex', flexDirection: 'column', gap: T.spacing.md,
      boxShadow: T.shadow,
    }}>
      {/* Header do card */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{
            fontFamily: T.font.heading, fontSize: '15px', fontWeight: '700',
            color: T.text, margin: '0 0 3px 0',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <Users size={15} style={{ color: T.primary, flexShrink: 0 }} />
            {grupo.nome_grupo || 'Grupo sem nome'}
          </h3>
          <p style={{
            fontSize: '11px', color: T.textSubtle, margin: 0,
            fontFamily: T.font.mono, whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {grupo.chat_id || '— sem JID —'}
          </p>
        </div>
        <ToggleSwitch checked={autoAtiva} onChange={onToggle} size="sm" />
      </div>

      {/* Métricas */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
        background: T.surfaceSubtle, borderRadius: T.radius.md, padding: '10px 12px',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: '700', color: T.primary }}>{contagem}</div>
          <div style={{ fontSize: '10px', color: T.textMuted }}>Participantes</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: autoAtiva ? T.success : T.textSubtle, marginTop: '3px' }}>
            {autoAtiva ? '● Ativa' : '○ Pausada'}
          </div>
          <div style={{ fontSize: '10px', color: T.textMuted }}>Automação</div>
        </div>
      </div>

      {/* Finalidade badge */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <span style={{
          fontSize: '10px', fontWeight: '600', padding: '2px 8px',
          borderRadius: T.radius.pill, background: T.primarySoft, color: T.primary,
        }}>
          {grupo.finalidade || '—'}
        </span>
      </div>

      {/* Ações */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        <button
          onClick={onConfig}
          style={{
            flex: 1, background: T.surface, color: T.text,
            border: `1px solid ${T.borderStrong}`, borderRadius: T.radius.md,
            height: '34px', fontSize: '12px', fontWeight: '600',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: '5px', fontFamily: T.font.body,
          }}
        >
          <Settings2 size={14} /> Configurar
        </button>
        <button
          onClick={onSync}
          disabled={syncing}
          style={{
            flex: 1, background: T.surface, color: T.textMuted,
            border: `1px solid ${T.border}`, borderRadius: T.radius.md,
            height: '34px', fontSize: '12px', fontWeight: '500',
            cursor: syncing ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '5px', fontFamily: T.font.body, opacity: syncing ? 0.5 : 1,
          }}
        >
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Sincronizando...' : 'Snapshot'}
        </button>
      </div>
    </div>
  );
}

function ConfigRow({ icon: Icon, label, children }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0', borderBottom: `1px solid ${T.borderSubtle}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon size={15} style={{ color: T.textMuted }} />
        <span style={{ fontSize: '13px', fontWeight: '500', color: T.text }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

function ConfigLabel({ icon: Icon, text }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      fontSize: '12px', fontWeight: '600', color: T.textMuted,
      marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.03em',
    }}>
      <Icon size={13} /> {text}
    </label>
  );
}

function InfoPill({ label, value, mono }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: '10px', color: T.textSubtle, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
      <div style={{
        fontSize: '12px', fontWeight: '600', color: T.text,
        fontFamily: mono ? T.font.mono : T.font.body,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{value}</div>
    </div>
  );
}

function ToggleSwitch({ checked, onChange, size = 'md' }) {
  const w = size === 'sm' ? 34 : 42;
  const h = size === 'sm' ? 20 : 24;
  const knob = size === 'sm' ? 14 : 18;
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: `${w}px`, height: `${h}px`, borderRadius: T.radius.pill,
        background: checked ? T.success : T.borderStrong, border: 'none',
        cursor: 'pointer', position: 'relative', flexShrink: 0,
        transition: `background ${T.transition.atomic}`,
      }}
    >
      <div style={{
        position: 'absolute', top: `${(h - knob) / 2}px`,
        left: checked ? `${w - knob - 3}px` : '3px',
        width: `${knob}px`, height: `${knob}px`, borderRadius: '50%',
        background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        transition: `left ${T.transition.atomic}`,
      }} />
    </button>
  );
}

const selectStyle = {
  width: '100%', padding: '8px 12px', fontSize: '13px',
  border: `1px solid ${T.border}`, borderRadius: T.radius.md,
  background: T.surface, color: T.text,
  fontFamily: T.font.body, cursor: 'pointer', boxSizing: 'border-box',
};