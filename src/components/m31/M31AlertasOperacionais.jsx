import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import StatCard from '@/components/m31/ui/StatCard';

const C = {
  bg1: '#FFFFFF', bg2: '#FFFFFF', bg3: '#F9FAFB', bg4: '#F9FAFB',
  text: '#1A1A1A', textSec: '#6B7280', textTer: '#9CA3AF',
  border: '#E5E7EB', borderSt: '#D1D5DB',
  brand: '#7A1F2B', success: '#10B981', successSoft: 'rgba(16,185,129,0.12)',
  warning: '#F59E0B', warningSoft: 'rgba(245,158,11,0.12)',
  danger: '#EF4444', dangerSoft: 'rgba(239,68,68,0.12)',
  info: '#3B82F6', infoSoft: 'rgba(59,130,246,0.12)',
};

const fmtBRL = n => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';
const horasAtras = d => d ? Math.floor((Date.now() - new Date(d).getTime()) / 3600000) : null;

// ── ICONS ────────────────────────────────────────────────────
const IcoZap   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
const IcoClock = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const IcoWA    = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 14c-.3-.2-1.8-.9-2-1s-.5-.2-.7.2-.8 1-.9 1.2-.3.2-.6 0c-1-.5-1.7-.9-2.3-1.9-.2-.4.2-.4.5-1.1.1-.2 0-.3 0-.5s-.7-1.8-1-2.4c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.4 1.1 2.8 1.2 3c.2.2 2.1 3.2 5.2 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.5.3-.7.3-1.4.2-1.5-.1-.1-.3-.2-.6-.4z"/><path d="M3 21l1.9-5.6A8.5 8.5 0 1 1 9 20.3L3 21"/></svg>;
const IcoChevron = ({ open }) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}><polyline points="6 9 12 15 18 9"/></svg>;
const IcoAlert = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;

// ── AÇÃO IMEDIATA ─────────────────────────────────────────────
function AcaoImediataCard({ label, items, cor, renderItem }) {
  const [open, setOpen] = useState(true);
  if (items.length === 0) return null;
  return (
    <div style={{ background: cor + '08', border: `1px solid ${cor}28`, borderRadius: '12px', overflow: 'hidden' }}>
      <button onClick={() => setOpen(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'radial-gradient(circle, #10B981, #059669)', display: 'inline-block', animation: 'ping-glow 2s ease-in-out infinite', flexShrink: 0 }} />
        <span style={{ fontSize: '13px', fontWeight: '600', color: cor, flex: 1 }}>{label}</span>
        <span style={{ fontSize: '12px', fontWeight: '700', background: cor + '20', color: cor, padding: '1px 8px', borderRadius: '100px' }}>{items.length}</span>
        <span style={{ color: cor + '80' }}><IcoChevron open={open} /></span>
      </button>
      {open && (
        <div style={{ borderTop: `1px solid ${cor}20` }}>
          {items.slice(0, 8).map((item, i) => (
            <div key={item.id || i} style={{ padding: '10px 16px', borderBottom: i < Math.min(items.length, 8) - 1 ? `1px solid rgba(0,0,0,0.06)` : 'none' }}>
              {renderItem(item)}
            </div>
          ))}
          {items.length > 8 && (
            <div style={{ padding: '8px 16px', fontSize: '11px', color: C.textTer }}>+ {items.length - 8} mais itens</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── CATEGORIA CARD ────────────────────────────────────────────
function CategoriaCard({ icon: Icon, label, count, items, renderItem }) {
  const [open, setOpen] = useState(false);
  const hasIssue = count > 0;
  return (
    <div style={{ background: C.bg2, border: `1px solid ${hasIssue ? 'rgba(248,113,113,0.15)' : C.border}`, borderRadius: '12px', overflow: 'hidden' }}>
      <button onClick={() => setOpen(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <Icon size={16} color={hasIssue ? '#F87171' : C.textTer} />
        <span style={{ flex: 1, fontSize: '14px', fontWeight: '500', color: C.text }}>{label}</span>
        <span style={{
          background: hasIssue ? 'rgba(248,113,113,0.15)' : C.bg4,
          color: hasIssue ? '#F87171' : C.textTer,
          borderRadius: '4px', padding: '2px 8px', fontSize: '12px', fontWeight: '600',
        }}>{count}</span>
        <span style={{ color: C.textTer }}><IcoChevron open={open} /></span>
      </button>
      {open && items.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.border}`, maxHeight: '320px', overflowY: 'auto' }}>
          {items.map((item, i) => (
            <div key={item.id || i} style={{ padding: '12px 18px', borderBottom: i < items.length - 1 ? `1px solid rgba(0,0,0,0.06)` : 'none' }}>
              {renderItem(item)}
            </div>
          ))}
        </div>
      )}
      {open && items.length === 0 && (
        <div style={{ padding: '16px 18px', fontSize: '13px', color: C.textTer, borderTop: `1px solid ${C.border}` }}>
          ✓ Sem pendências nesta categoria
        </div>
      )}
    </div>
  );
}

// ── MAIN ─────────────────────────────────────────────────────
export default function M31AlertasOperacionais() {
  const { data: inscricoes = [] } = useQuery({
    queryKey: ['m31alertas_inscricoes'],
    queryFn: () => base44.entities.EventoM31Inscricao.list('-created_date', 500),
    refetchInterval: 60000,
  });
  const { data: tarefas = [] } = useQuery({
    queryKey: ['m31alertas_tarefas'],
    queryFn: () => base44.entities.EventoM31Tarefa.list('-prazo', 200),
    refetchInterval: 60000,
  });
  const { data: cupons = [] } = useQuery({
    queryKey: ['m31alertas_cupons'],
    queryFn: () => base44.entities.EventoM31Cupom.filter({ usado: false }, '-created_date', 200),
  });

  const hoje = new Date();

  // ── AÇÃO IMEDIATA ──
  const acoes = useMemo(() => {
    const leadsParados = inscricoes.filter(i => {
      if (i.status_pagamento !== 'checkout_abandonado' || i.opt_out) return false;
      const horas = horasAtras(i.checkout_abandoned_at || i.updated_date);
      return horas !== null && horas >= 48;
    }).sort((a, b) => horasAtras(b.checkout_abandoned_at) - horasAtras(a.checkout_abandoned_at));

    const recusados = inscricoes.filter(i => i.status_pagamento === 'cancelado');

    const tarefasVencidas = tarefas.filter(t =>
      ['a_fazer', 'em_andamento', 'bloqueado'].includes(t.status) &&
      t.prazo && new Date(t.prazo) < hoje
    ).sort((a, b) => new Date(a.prazo) - new Date(b.prazo));

    return { leadsParados, recusados, tarefasVencidas };
  }, [inscricoes, tarefas]);

  // ── CATEGORIAS ──
  const pagamentosPendentes = inscricoes.filter(i => i.status_pagamento === 'pendente');
  const checkoutAbandonado  = inscricoes.filter(i => i.status_pagamento === 'checkout_abandonado');
  const leadsProblematicos  = inscricoes.filter(i => i.status_pagamento === 'checkout_abandonado' && (i.recovery_attempts || 0) >= 2);
  const tarefasAtrasadas    = tarefas.filter(t => ['a_fazer','em_andamento','bloqueado'].includes(t.status) && t.prazo && new Date(t.prazo) < hoje);

  const temAcoes = acoes.leadsParados.length + acoes.recusados.length + acoes.tarefasVencidas.length > 0;

  const kpis = [
    { label: 'Alertas Totais', value: pagamentosPendentes.length + checkoutAbandonado.length + tarefasAtrasadas.length, state: 'danger' },
    { label: 'Leads Parados +48h', value: acoes.leadsParados.length, state: 'warning' },
    { label: 'Ação Imediata', value: tarefasAtrasadas.length + acoes.recusados.length, state: 'danger' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: 'Inter,sans-serif', color: C.text }}>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
        {kpis.map(k => (
          <StatCard key={k.label} label={k.label} value={k.value} state={k.state} />
        ))}
      </div>

      {/* AÇÃO IMEDIATA */}
      {temAcoes && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <IcoZap />
            <span style={{ fontSize: '13px', fontWeight: '700', letterSpacing: '.07em', textTransform: 'uppercase', color: C.textTer }}>Ação Imediata</span>
            <div style={{ flex: 1, height: '1px', background: C.border }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

            <AcaoImediataCard
              label="Leads parados há mais de 48h sem resposta"
              items={acoes.leadsParados}
              cor={C.danger}
              renderItem={item => {
                const horas = horasAtras(item.checkout_abandoned_at || item.updated_date);
                const waLink = `https://wa.me/55${(item.whatsapp || '').replace(/\D/g, '')}`;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: C.text, marginBottom: '2px' }}>{item.nome}</div>
                      <div style={{ fontSize: '11px', color: C.textTer }}>
                        Parado há <strong style={{ color: C.danger }}>{horas}h</strong> · {item.recovery_attempts || 0} tentativas · {fmtBRL(item.valor_pago)}
                      </div>
                    </div>
                    <a href={waLink} target="_blank" rel="noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.2)', borderRadius: '5px', color: '#25d366', fontSize: '11px', textDecoration: 'none', fontWeight: '600', flexShrink: 0 }}>
                      <IcoWA /> WhatsApp
                    </a>
                  </div>
                );
              }}
            />

            <AcaoImediataCard
              label="Tarefas vencidas"
              items={acoes.tarefasVencidas}
              cor={C.warning}
              renderItem={item => (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: C.text, marginBottom: '2px' }}>{item.titulo}</div>
                    <div style={{ fontSize: '11px', color: C.textTer }}>
                      Venceu em <strong style={{ color: C.warning }}>{fmtDate(item.prazo)}</strong> · {item.area} · {item.responsavel_nome || 'Sem responsável'}
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '4px', background: 'rgba(239,68,68,0.1)', color: C.danger, flexShrink: 0 }}>
                    {item.prioridade}
                  </span>
                </div>
              )}
            />

            <AcaoImediataCard
              label="Pagamentos cancelados / recusados"
              items={acoes.recusados}
              cor={C.info}
              renderItem={item => {
                const waLink = `https://wa.me/55${(item.whatsapp || '').replace(/\D/g, '')}`;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: C.text, marginBottom: '2px' }}>{item.nome}</div>
                      <div style={{ fontSize: '11px', color: C.textTer }}>{fmtBRL(item.valor_pago)} · {item.lote?.replace('_', ' ')} · {fmtDate(item.updated_date)}</div>
                    </div>
                    <a href={waLink} target="_blank" rel="noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.2)', borderRadius: '5px', color: '#25d366', fontSize: '11px', textDecoration: 'none', fontWeight: '600', flexShrink: 0 }}>
                      <IcoWA /> WhatsApp
                    </a>
                  </div>
                );
              }}
            />
          </div>
        </div>
      )}

      {/* CATEGORIAS */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <IcoAlert />
          <span style={{ fontSize: '13px', fontWeight: '700', letterSpacing: '.07em', textTransform: 'uppercase', color: C.textTer }}>Monitoramento</span>
          <div style={{ flex: 1, height: '1px', background: C.border }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

          <CategoriaCard icon={IcoClock} label="Pagamentos Pendentes" count={pagamentosPendentes.length} items={pagamentosPendentes}
            renderItem={item => (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '500', color: C.text }}>{item.nome}</div>
                  <div style={{ fontSize: '11px', color: C.textTer }}>{item.email} · {fmtBRL(item.valor_pago)}</div>
                </div>
                <span style={{ fontSize: '11px', color: C.warning }}>{fmtDate(item.created_date)}</span>
              </div>
            )}
          />

          <CategoriaCard icon={IcoZap} label="Checkouts Abandonados" count={checkoutAbandonado.length} items={checkoutAbandonado}
            renderItem={item => (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '500', color: C.text }}>{item.nome}</div>
                  <div style={{ fontSize: '11px', color: C.textTer }}>{item.email} · {item.recovery_attempts || 0} tentativas</div>
                </div>
                <span style={{ fontSize: '11px', color: C.danger }}>{fmtBRL(item.valor_pago)}</span>
              </div>
            )}
          />

          <CategoriaCard icon={IcoAlert} label="Leads com 2+ Tentativas Falhas" count={leadsProblematicos.length} items={leadsProblematicos}
            renderItem={item => (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '500', color: C.text }}>{item.nome}</div>
                  <div style={{ fontSize: '11px', color: C.textTer }}>{item.email}</div>
                </div>
                <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '4px', background: 'rgba(248,113,113,0.12)', color: '#F87171' }}>{item.recovery_attempts} tentativas</span>
              </div>
            )}
          />

          <CategoriaCard icon={IcoClock} label="Tarefas Atrasadas" count={tarefasAtrasadas.length} items={tarefasAtrasadas}
            renderItem={item => (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '500', color: C.text }}>{item.titulo}</div>
                  <div style={{ fontSize: '11px', color: C.textTer }}>Prazo: {fmtDate(item.prazo)} · {item.area}</div>
                </div>
                <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '4px', background: 'rgba(245,158,11,0.12)', color: C.warning }}>{item.prioridade}</span>
              </div>
            )}
          />

          <CategoriaCard icon={IcoAlert} label="Cupons Não Utilizados" count={cupons.length} items={cupons}
            renderItem={item => (
              <div>
                <div style={{ fontSize: '13px', fontWeight: '500', color: C.text }}>{item.codigo}</div>
                <div style={{ fontSize: '11px', color: C.textTer }}>{item.descricao || '—'} · {item.batch || 'sem batch'}</div>
              </div>
            )}
          />
        </div>
      </div>

      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes ping-glow {
          0% { box-shadow: 0 0 0 0 rgba(16,185,129,0.6); }
          70% { box-shadow: 0 0 0 8px rgba(16,185,129,0); }
          100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
        }
      `}</style>
    </div>
  );
}