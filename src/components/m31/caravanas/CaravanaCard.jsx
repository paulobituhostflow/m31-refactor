import { useState } from 'react';
import { C, STATUS_CFG, fmtBRL, isConfirmado, isPendente } from './CaravanasUtils';
import { IcoWA, IcoChevron, IcoPin, IcoEdit, IcoPhone } from './CaravanasIcons';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import CaravanaDeleteModal from './CaravanaDeleteModal';
import CaravanaExportModal from './CaravanaExportModal';

// ── ALERT BADGE ───────────────────────────────────────────────
function AlertBadge({ label, color, bg }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: '10px', fontWeight: '600', letterSpacing: '0.02em',
      padding: '2px 7px', borderRadius: '4px',
      background: bg, color: color,
      border: `1px solid ${color}28`,
    }}>{label}</span>
  );
}

// ── STATUS DOT ────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || { label: status, color: C.textTer };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      fontSize: '10px', fontWeight: '600', padding: '2px 6px',
      borderRadius: '4px', background: cfg.color + '18', color: cfg.color,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
      {cfg.label}
    </span>
  );
}

// ── MEMBER LIST ───────────────────────────────────────────────
function MemberList({ membros }) {
  const [filtro, setFiltro] = useState('todos');
  const semTelCount = membros.filter(m => !m.whatsapp || !m.whatsapp.trim()).length;

  const filtrados = membros.filter(m => {
    if (filtro === 'confirmados') return isConfirmado(m);
    if (filtro === 'pendentes')   return isPendente(m);
    if (filtro === 'sem_tel')     return !m.whatsapp || !m.whatsapp.trim();
    return true;
  });

  const chips = [
    { id: 'todos',       label: `Todos · ${membros.length}` },
    { id: 'confirmados', label: `Conf. · ${membros.filter(isConfirmado).length}` },
    { id: 'pendentes',   label: `Pend. · ${membros.filter(isPendente).length}` },
    ...(semTelCount > 0 ? [{ id: 'sem_tel', label: `Sem tel · ${semTelCount}` }] : []),
  ];

  if (membros.length === 0) return (
    <div style={{ padding: '18px', textAlign: 'center', color: C.textTer, fontSize: '12px' }}>
      Nenhum membro vinculado
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: '5px', padding: '10px 14px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
        {chips.map(ch => (
          <button key={ch.id} onClick={() => setFiltro(ch.id)} style={{
            padding: '3px 9px', borderRadius: '100px', fontSize: '10px', fontWeight: '600',
            cursor: 'pointer', fontFamily: 'Inter,sans-serif',
            background: filtro === ch.id ? C.brand : C.bg4,
            color: filtro === ch.id ? '#fff' : C.textSec,
            border: `1px solid ${filtro === ch.id ? C.brand : C.border}`,
          }}>{ch.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {filtrados.map((m, i) => {
          const waLink = `https://wa.me/55${(m.whatsapp || '').replace(/\D/g, '')}`;
          const hasWa = m.whatsapp && m.whatsapp.trim();
          return (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 14px',
              borderBottom: i < filtrados.length - 1 ? `1px solid ${C.border}` : 'none',
            }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', background: C.bg4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: '700', color: C.textSec, flexShrink: 0,
              }}>
                {(m.nome || '?')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nome}</div>
                {hasWa
                  ? <div style={{ fontSize: '10px', color: C.textTer, marginTop: '1px', display: 'flex', alignItems: 'center', gap: '3px' }}><IcoPhone />{m.whatsapp}</div>
                  : <div style={{ fontSize: '10px', color: C.danger, marginTop: '1px' }}>Sem telefone</div>
                }
              </div>
              <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexShrink: 0 }}>
                <StatusBadge status={m.status_pagamento} />
                {hasWa && (
                  <a href={waLink} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', background: C.bg4, border: `1px solid ${C.border}`, borderRadius: '5px', color: C.textSec, textDecoration: 'none' }}>
                    <IcoWA />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── EDIT MODAL ────────────────────────────────────────────────
function EditModal({ caravana, onClose, onSaved }) {
  const [form, setForm] = useState({
    nome: caravana.nome || '',
    slug: caravana.slug || '',
    lider_nome: caravana.lider_nome || '',
    lider_whatsapp: caravana.lider_whatsapp || '',
    cidade_origem: caravana.cidade_origem || '',
  });
  const [saving, setSaving] = useState(false);

  const inp = {
    width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: '6px',
    padding: '9px 12px', color: C.text, fontSize: '13px', fontFamily: 'Inter,sans-serif',
    outline: 'none', boxSizing: 'border-box',
  };

  const save = async () => {
    if (!form.nome.trim() || !form.slug.trim() || !form.lider_nome.trim()) {
      alert('Preencha todos os campos obrigatórios');
      return;
    }
    setSaving(true);
    await base44.entities.EventoM31Caravana.update(caravana.id, {
      nome: form.nome.trim(),
      slug: form.slug.trim().toLowerCase().replace(/\s+/g, '-'),
      lider_nome: form.lider_nome.trim(),
      lider_whatsapp: form.lider_whatsapp.trim(),
      cidade_origem: form.cidade_origem.trim(),
    });
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: C.bg2, border: `1px solid ${C.borderSt}`, borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '380px' }}>
        <div style={{ fontSize: '14px', fontWeight: '600', color: C.text, marginBottom: '16px' }}>Editar Caravana</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { key: 'nome',           label: 'Nome da caravana *' },
            { key: 'slug',           label: 'Slug (URL) *' },
            { key: 'lider_nome',     label: 'Líder *' },
            { key: 'lider_whatsapp', label: 'WhatsApp do líder' },
            { key: 'cidade_origem',  label: 'Cidade' },
          ].map(f => (
            <input key={f.key} placeholder={f.label} value={form[f.key]}
              onChange={e => setForm({ ...form, [f.key]: e.target.value })}
              style={inp} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px', background: 'none', border: `1px solid ${C.border}`, borderRadius: '6px', color: C.textSec, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ flex: 1, padding: '9px', background: C.brand, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1, fontFamily: 'Inter,sans-serif' }}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MAIN CARD ─────────────────────────────────────────────────
export default function CaravanaCard({ caravana, membros, highlighted, alertasExternos = [], todasCaravanas = [] }) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const qc = useQueryClient();

  const confirmados = membros.filter(isConfirmado).length;
  const pendentes   = membros.filter(isPendente).length;
  const total       = membros.length;
  const receita     = membros.filter(isConfirmado).reduce((s, m) => s + (m.valor_pago || 0), 0);
  const semTel      = membros.filter(m => !m.whatsapp || !m.whatsapp.trim()).length;
  const pctConf     = total > 0 ? Math.round(confirmados / total * 100) : 0;

  const waLiderNum = (caravana.lider_whatsapp || '').replace(/\D/g, '');
  const waLider    = waLiderNum && waLiderNum.length > 8 ? `https://wa.me/55${waLiderNum}` : null;

  const semLider  = !caravana.lider_nome || caravana.lider_nome.toLowerCase().includes('definir');
  const semCidade = !caravana.cidade_origem || caravana.cidade_origem.toLowerCase().includes('definir');

  // Consolidar todos os alertas deste card
  const badges = [];
  if (semLider)                           badges.push({ label: 'Sem líder',       color: C.warning, bg: C.warningSoft });
  if (semCidade)                          badges.push({ label: 'Sem cidade',       color: C.info,    bg: C.infoSoft });
  if (pendentes > 0 && total > 0 && pendentes / total > 0.5)
                                          badges.push({ label: 'Muitos pendentes', color: C.danger,  bg: C.dangerSoft });
  if (alertasExternos.includes('duplicada')) badges.push({ label: 'Duplicada',    color: C.danger,  bg: C.dangerSoft });

  return (
    <>
      {editOpen && (
        <EditModal
          caravana={caravana}
          onClose={() => setEditOpen(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['m31caravanas'] })}
        />
      )}

      {deleteOpen && (
        <CaravanaDeleteModal
          caravana={caravana}
          membros={membros}
          outras_caravanas={todasCaravanas.filter(c => c.id !== caravana.id)}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => {
            qc.invalidateQueries({ queryKey: ['m31caravanas'] });
            qc.invalidateQueries({ queryKey: ['m31inscricoes_caravana'] });
          }}
        />
      )}

      {exportOpen && (
        <CaravanaExportModal
          caravana={caravana}
          membros={membros}
          onClose={() => setExportOpen(false)}
        />
      )}

      <div
        id={`caravana-${caravana.id}`}
        style={{
          background: highlighted ? 'rgba(139, 26, 43,0.05)' : C.bg2,
          border: `1px solid ${highlighted ? 'rgba(139, 26, 43,0.35)' : C.border}`,
          borderRadius: '10px',
          overflow: 'hidden',
          transition: 'border-color .15s',
        }}
      >
        {/* CLICKABLE HEADER */}
        <div
          style={{ padding: '12px 14px', cursor: 'pointer' }}
          onClick={() => setOpen(o => !o)}
        >
          {/* Row 1: name + chevron */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: C.text, lineHeight: 1.3 }}>
                {caravana.nome}
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '3px', flexWrap: 'wrap' }}>
                {!semCidade && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: C.textTer }}>
                    <IcoPin />{caravana.cidade_origem}
                  </span>
                )}
                {!semCidade && !semLider && (
                  <span style={{ fontSize: '11px', color: C.textTer }}>·</span>
                )}
                {!semLider && (
                  <span style={{ fontSize: '11px', color: C.textSec }}>{caravana.lider_nome}</span>
                )}
              </div>
            </div>
            <span style={{ color: C.textTer, flexShrink: 0, marginTop: '2px' }}>
              <IcoChevron open={open} />
            </span>
          </div>

          {/* Row 2: stats inline */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: C.success, fontVariantNumeric: 'tabular-nums' }}>
              {confirmados} conf.
            </span>
            {pendentes > 0 && (
              <span style={{ fontSize: '13px', fontWeight: '700', color: C.warning, fontVariantNumeric: 'tabular-nums' }}>
                {pendentes} pend.
              </span>
            )}
            <span style={{ fontSize: '12px', color: C.textTer }}>
              {total} total
            </span>
            {receita > 0 && (
              <>
                <span style={{ fontSize: '11px', color: C.textTer }}>·</span>
                <span style={{ fontSize: '12px', fontWeight: '600', color: C.textSec, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtBRL(receita)}
                </span>
              </>
            )}
          </div>

          {/* Progress bar */}
          {total > 0 && (
            <div style={{ height: '3px', borderRadius: '100px', background: C.bg4, overflow: 'hidden', marginBottom: '10px' }}>
              <div style={{ height: '100%', width: `${pctConf}%`, background: C.success, transition: 'width .4s' }} />
            </div>
          )}

          {/* Row 3: alert badges + actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
            {/* Alert badges */}
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', flex: 1, minWidth: '150px' }}>
              {badges.map((b, i) => (
                <AlertBadge key={i} label={b.label} color={b.color} bg={b.bg} />
              ))}
              {semTel > 0 && (
                <AlertBadge label={`${semTel} sem tel`} color={C.textSec} bg={C.bg4} />
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '5px', flexShrink: 0, alignItems: 'center' }}>
              <button
                onClick={e => {
                  e.stopPropagation();
                  const link = `${window.location.origin}${window.location.pathname}?caravana=${caravana.slug}`;
                  navigator.clipboard.writeText(link);
                  alert('Link copiado: ' + link);
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '28px', height: '28px',
                  background: C.bg4, border: `1px solid ${C.border}`,
                  borderRadius: '6px', color: C.textSec,
                  cursor: 'pointer', fontFamily: 'Inter,sans-serif', fontSize: '11px',
                }}
                title="Copiar link"
              >
                🔗
              </button>
              {waLider && (
                <a
                  href={waLider} target="_blank" rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '28px', height: '28px',
                    background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.2)',
                    borderRadius: '6px', color: '#25D166', textDecoration: 'none',
                  }}
                >
                  <IcoWA />
                </a>
              )}
              <button
                onClick={e => { e.stopPropagation(); setEditOpen(true); }}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '28px', height: '28px',
                  background: C.bg4, border: `1px solid ${C.border}`,
                  borderRadius: '6px', color: C.textSec,
                  cursor: 'pointer', fontFamily: 'Inter,sans-serif',
                }}
              >
                <IcoEdit />
              </button>
              <button
                onClick={e => { e.stopPropagation(); setExportOpen(true); }}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '32px', height: '32px',
                  background: 'rgba(34,197,94,0.12)', border: '1.5px solid rgba(34,197,94,0.25)',
                  borderRadius: '6px', color: 'rgba(34,197,94,0.7)',
                  cursor: 'pointer', fontFamily: 'Inter,sans-serif', fontSize: '14px',
                  transition: 'all .15s', flexShrink: 0,
                }}
                onMouseEnter={e => { e.target.style.background = 'rgba(34,197,94,0.18)'; e.target.style.borderColor = 'rgba(34,197,94,0.4)'; e.target.style.color = 'rgba(34,197,94,0.9)'; }}
                onMouseLeave={e => { e.target.style.background = 'rgba(34,197,94,0.12)'; e.target.style.borderColor = 'rgba(34,197,94,0.25)'; e.target.style.color = 'rgba(34,197,94,0.7)'; }}
                title="Exportar inscritas"
              >
                📥
              </button>
              <button
                onClick={e => { e.stopPropagation(); setDeleteOpen(true); }}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '32px', height: '32px',
                  background: 'rgba(139, 26, 43,0.12)', border: '1.5px solid rgba(139, 26, 43,0.25)',
                  borderRadius: '6px', color: 'rgba(139, 26, 43,0.7)',
                  cursor: 'pointer', fontFamily: 'Inter,sans-serif', fontSize: '14px',
                  transition: 'all .15s', flexShrink: 0,
                }}
                onMouseEnter={e => { e.target.style.background = 'rgba(139, 26, 43,0.18)'; e.target.style.borderColor = 'rgba(139, 26, 43,0.4)'; e.target.style.color = 'rgba(139, 26, 43,0.9)'; }}
                onMouseLeave={e => { e.target.style.background = 'rgba(139, 26, 43,0.12)'; e.target.style.borderColor = 'rgba(139, 26, 43,0.25)'; e.target.style.color = 'rgba(139, 26, 43,0.7)'; }}
                title="Excluir caravana"
              >
                🗑️
              </button>
            </div>
          </div>
        </div>

        {/* EXPANDED: member list */}
        {open && (
          <div style={{ borderTop: `1px solid ${C.border}` }}>
            <MemberList membros={membros} />
          </div>
        )}
      </div>
    </>
  );
}