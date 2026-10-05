import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// ── TOKENS (light mode) ──────────────────────────────────────
const L = {
  bg:       '#FFFFFF',
  bgSub:    '#F9FAFB',
  bgHover:  '#F3F4F6',
  border:   '#E5E7EB',
  borderFocus: '#8B1A2B',
  text:     '#111827',
  textSec:  '#6B7280',
  textTer:  '#9CA3AF',
  brand:    '#8B1A2B',
  brandSoft:'rgba(168,52,74,0.08)',
  brandBorder:'rgba(168,52,74,0.2)',
  success:  '#059669',
  successSoft:'rgba(5,150,105,0.08)',
  warning:  '#D97706',
  warningSoft:'rgba(217,119,6,0.08)',
  info:     '#2563EB',
  infoSoft: 'rgba(37,99,235,0.08)',
  infoBorder:'rgba(37,99,235,0.2)',
};

const STAGES = [
  { stage: 'd0', label: 'D+0', when: 'Imediato', whenSub: 'logo após o abandono', color: L.info, colorSoft: L.infoSoft },
  { stage: 'd1', label: 'D+1', when: '+1 dia · 09:00', whenSub: 'um dia após inscrição', color: L.warning, colorSoft: L.warningSoft },
  { stage: 'd3', label: 'D+3', when: '+3 dias · 09:00', whenSub: 'três dias após inscrição', color: '#7C3AED', colorSoft: 'rgba(124,58,237,0.08)' },
  { stage: 'd7', label: 'D+7', when: '+7 dias · 18:00', whenSub: 'última tentativa', color: L.brand, colorSoft: L.brandSoft },
];

const VARIAVEIS = [
  { tag: '{nome}', desc: 'Primeiro nome da inscrita' },
  { tag: '{valor}', desc: 'Valor (ex: R$ 110,00)' },
  { tag: '{link_checkout}', desc: 'Link de pagamento Asaas' },
];

// ── TOGGLE ───────────────────────────────────────────────────
function Toggle({ checked, onChange }) {
  return (
    <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px', cursor: 'pointer', flexShrink: 0 }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ opacity: 0, width: 0, height: 0 }} />
      <span style={{ position: 'absolute', inset: 0, background: checked ? L.brand : L.border, borderRadius: '100px', transition: '.2s' }}>
        <span style={{ position: 'absolute', height: '16px', width: '16px', left: checked ? '18px' : '2px', top: '2px', background: '#fff', borderRadius: '50%', transition: '.2s', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
      </span>
    </label>
  );
}

// ── CHIP VARIAVEL ─────────────────────────────────────────────
function VarChip({ tag, desc, onInsert }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      title={desc}
      onClick={() => onInsert(tag)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '3px 10px', borderRadius: '100px',
        background: hov ? L.infoBorder : L.infoSoft,
        border: `1px solid ${L.infoBorder}`,
        color: L.info, fontSize: '12px', fontWeight: '600',
        cursor: 'pointer', fontFamily: 'monospace',
        transition: 'all .12s',
      }}
    >
      {tag}
    </button>
  );
}

// ── WA PREVIEW ───────────────────────────────────────────────
function WAPreview({ content }) {
  const preview = (content || '')
    .replace(/{nome}/g, 'Thaysa')
    .replace(/{valor}/g, 'R$ 110,00')
    .replace(/{link_checkout}/g, 'https://asaas.com/i/exemplo');
  return (
    <div style={{ background: '#E5DDD5', borderRadius: '12px', padding: '14px', backgroundImage: 'url("data:image/png;base64,iVBORw0KGgo=")', backgroundSize: 'cover' }}>
      <div style={{ fontSize: '10px', color: L.textSec, fontWeight: '700', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: '8px' }}>Prévia WhatsApp</div>
      <div style={{ background: '#fff', borderRadius: '10px 10px 10px 2px', padding: '10px 12px', maxWidth: '80%', boxShadow: '0 1px 2px rgba(0,0,0,0.12)' }}>
        <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: '13px', color: '#111', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>
          {preview || <span style={{ color: L.textTer, fontStyle: 'italic' }}>Digite a mensagem para ver a prévia…</span>}
        </pre>
        <div style={{ fontSize: '10px', color: L.textTer, textAlign: 'right', marginTop: '4px' }}>17:33 ✓✓</div>
      </div>
    </div>
  );
}

// ── STAGE ROW (expansível inline) ────────────────────────────
function StageRow({ stageMeta, template, onSaved }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState(template?.content || '');
  const [active, setActive] = useState(template?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const taRef = useRef(null);
  const qc = useQueryClient();

  // Sincroniza quando template muda externamente
  React.useEffect(() => {
    if (!open) {
      setContent(template?.content || '');
      setActive(template?.is_active ?? true);
    }
  }, [template, open]);

  function insertVar(tag) {
    const ta = taRef.current;
    if (!ta) { setContent(c => c + tag); return; }
    const s = ta.selectionStart, e = ta.selectionEnd;
    const next = content.slice(0, s) + tag + content.slice(e);
    setContent(next);
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + tag.length; ta.focus(); }, 0);
  }

  async function handleSave() {
    if (!template) return;
    setSaving(true);
    await base44.entities.M31MessageTemplate.update(template.id, { content, is_active: active });
    qc.invalidateQueries({ queryKey: ['m31templates-regua'] });
    setSaving(false);
    setOpen(false);
    onSaved?.();
  }

  const hasTemplate = !!template;
  const envios = template?.sends_total || 0;

  return (
    <div style={{ borderBottom: `1px solid ${L.border}` }}>
      {/* ROW HEADER — clicável */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 20px',
          cursor: 'pointer', background: open ? L.bgSub : L.bg,
          transition: 'background .12s',
        }}
      >
        {/* Dot */}
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: hasTemplate && active ? stageMeta.color : L.border, flexShrink: 0, boxShadow: hasTemplate && active ? `0 0 0 3px ${stageMeta.colorSoft}` : 'none' }} />

        {/* Timing */}
        <div style={{ minWidth: '140px', flexShrink: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: L.text }}>{stageMeta.when}</div>
          <div style={{ fontSize: '11px', color: L.textTer }}>{stageMeta.whenSub}</div>
        </div>

        {/* Content preview */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {hasTemplate ? (
            <div style={{ fontSize: '13px', color: L.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {template.content?.split('\n')[0] || <span style={{ color: L.textTer, fontStyle: 'italic' }}>Mensagem vazia</span>}
            </div>
          ) : (
            <div style={{ fontSize: '13px', color: L.textTer, fontStyle: 'italic' }}>Nenhum template configurado</div>
          )}
          <div style={{ fontSize: '11px', color: L.textTer, marginTop: '2px' }}>
            {hasTemplate && active ? (
              <><span style={{ color: L.success }}>Ativo</span>{envios > 0 ? ` · ${envios} envios` : ' · aguardando leads'}</>
            ) : (
              <span>Pausado</span>
            )}
          </div>
        </div>

        {/* Stage badge */}
        <div style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px', background: stageMeta.colorSoft, color: stageMeta.color, flexShrink: 0 }}>
          {stageMeta.label}
        </div>

        {/* Chevron */}
        <div style={{ color: L.textTer, transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>

      {/* EXPANDED EDITOR */}
      {open && (
        <div style={{ background: L.bgSub, borderTop: `1px solid ${L.border}`, padding: '20px 20px 24px' }}>
          {!hasTemplate ? (
            <div style={{ color: L.textTer, fontSize: '13px', padding: '12px 0' }}>Template não encontrado no banco de dados.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {/* LEFT — editor */}
              <div>
                {/* Toggle ativo */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: L.text }}>Ativa esta etapa</div>
                    <div style={{ fontSize: '11px', color: L.textTer }}>Desative para pular esta mensagem na régua</div>
                  </div>
                  <Toggle checked={active} onChange={e => setActive(e.target.checked)} />
                </div>

                {/* Variáveis */}
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: L.textTer, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: '7px' }}>Variáveis — clique para inserir</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {VARIAVEIS.map(v => <VarChip key={v.tag} tag={v.tag} desc={v.desc} onInsert={insertVar} />)}
                  </div>
                </div>

                {/* Textarea */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: L.textTer, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: '7px' }}>Mensagem WhatsApp</div>
                  <textarea
                    ref={taRef}
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    rows={7}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: L.bg, border: `1.5px solid ${L.border}`,
                      borderRadius: '8px', color: L.text,
                      fontFamily: 'monospace', fontSize: '13px', lineHeight: 1.6,
                      padding: '12px', outline: 'none', resize: 'vertical',
                      transition: 'border-color .15s',
                    }}
                    onFocus={e => { e.target.style.borderColor = L.brand; }}
                    onBlur={e => { e.target.style.borderColor = L.border; }}
                  />
                  <div style={{ fontSize: '11px', color: L.textTer, textAlign: 'right', marginTop: '4px' }}>
                    {content.length} caracteres
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setOpen(false)}
                    style={{ padding: '8px 16px', background: L.bg, border: `1px solid ${L.border}`, borderRadius: '6px', color: L.textSec, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{ padding: '8px 18px', background: L.brand, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1, fontFamily: 'Inter,sans-serif' }}
                  >
                    {saving ? 'Salvando…' : '💾 Salvar'}
                  </button>
                </div>
              </div>

              {/* RIGHT — preview */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: L.textTer, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: '10px' }}>Prévia</div>
                <WAPreview content={content} />
                {/* Stats */}
                {envios > 0 && (
                  <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {[
                      { label: 'Envios', value: template.sends_total || 0 },
                      { label: 'Respostas', value: template.responses_total || 0 },
                    ].map(s => (
                      <div key={s.label} style={{ background: L.bg, border: `1px solid ${L.border}`, borderRadius: '8px', padding: '10px 14px' }}>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: L.text }}>{s.value}</div>
                        <div style={{ fontSize: '11px', color: L.textTer }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── PAINEL LATERAL — PROTEÇÕES ────────────────────────────────
function PainelProtecoes({ config, onChange }) {
  const field = (label, key, type = 'toggle', opts = {}) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 0', borderBottom: `1px solid ${L.border}` }}>
      <div>
        <div style={{ fontSize: '13px', fontWeight: '500', color: L.text }}>{label}</div>
        {opts.sub && <div style={{ fontSize: '11px', color: L.textTer, marginTop: '2px' }}>{opts.sub}</div>}
      </div>
      {type === 'toggle' ? (
        <Toggle checked={!!config[key]} onChange={e => onChange(key, e.target.checked)} />
      ) : (
        <input
          type="number"
          value={config[key] ?? opts.default ?? ''}
          onChange={e => onChange(key, Number(e.target.value))}
          min={opts.min ?? 0}
          max={opts.max ?? 100}
          style={{ width: '60px', padding: '5px 8px', border: `1px solid ${L.border}`, borderRadius: '6px', fontSize: '13px', fontFamily: 'Inter,sans-serif', color: L.text, background: L.bg, outline: 'none', textAlign: 'center' }}
        />
      )}
    </div>
  );

  return (
    <div style={{ background: L.bg, border: `1px solid ${L.border}`, borderRadius: '12px', padding: '20px', height: 'fit-content' }}>
      <div style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '.06em', textTransform: 'uppercase', color: L.textTer, marginBottom: '4px' }}>Proteções da Régua</div>
      <div style={{ fontSize: '12px', color: L.textSec, marginBottom: '16px' }}>Regras que controlam quando e como a régua dispara.</div>

      {field('Bloquear domingos', 'bloquear_domingo', 'toggle', { sub: 'Não envia mensagens aos domingos' })}
      {field('Pausar se respondeu', 'pausar_se_respondeu', 'toggle', { sub: 'Para envios se lead interagiu' })}
      {field('Respeitar opt-out', 'respeitar_opt_out', 'toggle', { sub: 'Remove leads que pediram saída' })}

      <div style={{ padding: '12px 0', borderBottom: `1px solid ${L.border}` }}>
        <div style={{ fontSize: '13px', fontWeight: '500', color: L.text, marginBottom: '8px' }}>Janela de horário</div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="time"
            value={config.hora_inicio ?? '09:00'}
            onChange={e => onChange('hora_inicio', e.target.value)}
            style={{ flex: 1, padding: '6px 8px', border: `1px solid ${L.border}`, borderRadius: '6px', fontSize: '13px', fontFamily: 'Inter,sans-serif', color: L.text, background: L.bg, outline: 'none' }}
          />
          <span style={{ fontSize: '12px', color: L.textTer }}>até</span>
          <input
            type="time"
            value={config.hora_fim ?? '20:00'}
            onChange={e => onChange('hora_fim', e.target.value)}
            style={{ flex: 1, padding: '6px 8px', border: `1px solid ${L.border}`, borderRadius: '6px', fontSize: '13px', fontFamily: 'Inter,sans-serif', color: L.text, background: L.bg, outline: 'none' }}
          />
        </div>
      </div>

      {field('Máx. por dia (por lead)', 'max_por_dia', 'number', { sub: 'Limite de mensagens por lead/dia', min: 1, max: 5, default: 1 })}
      {field('Dias até encerrar', 'dias_encerrar', 'number', { sub: 'Arquiva lead após X dias sem pagamento', min: 1, max: 30, default: 8 })}

      <div style={{ marginTop: '16px', padding: '12px', background: L.warningSoft, borderRadius: '8px', border: `1px solid rgba(217,119,6,0.2)` }}>
        <div style={{ fontSize: '11px', color: L.warning, fontWeight: '600', marginBottom: '4px' }}>⚠️ Configurações locais</div>
        <div style={{ fontSize: '11px', color: L.textSec, lineHeight: 1.5 }}>
          As proteções são referência visual. As regras efetivas estão na função <code style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.06)', padding: '1px 4px', borderRadius: '3px' }}>m31ReguaAutomatica</code>.
        </div>
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────
export default function M31ReguaAutomacao() {
  const qc = useQueryClient();
  const [config, setConfig] = useState({
    bloquear_domingo: true,
    pausar_se_respondeu: true,
    respeitar_opt_out: true,
    hora_inicio: '09:00',
    hora_fim: '20:00',
    max_por_dia: 1,
    dias_encerrar: 8,
  });
  const [disparando, setDisparando] = useState(false);
  const [disparoResult, setDisparoResult] = useState(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['m31templates-regua'],
    queryFn: () => base44.entities.M31MessageTemplate.list('trigger_stage', 20),
  });

  function getTemplate(stage) {
    return templates.find(t => t.trigger_stage === stage) || null;
  }

  function handleConfigChange(key, value) {
    setConfig(c => ({ ...c, [key]: value }));
  }

  async function handleDisparar() {
    setDisparando(true);
    setDisparoResult(null);
    const res = await base44.functions.invoke('m31ReguaAutomatica', {});
    setDisparando(false);
    const r = res?.data || {};
    setDisparoResult({
      enviados: r.enviados ?? r.mensagens_enviadas ?? r.sent ?? 0,
      processados: r.atualizados ?? r.leads_processados ?? r.processed ?? 0,
      falhas: r.falhas ?? r.erros ?? r.errors ?? 0,
    });
  }

  return (
    <div style={{ fontFamily: 'Inter,sans-serif', color: L.text, WebkitFontSmoothing: 'antialiased' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: L.text, margin: 0, marginBottom: '4px' }}>Régua de Automação</h2>
          <div style={{ fontSize: '13px', color: L.textSec }}>Gerencie as etapas e mensagens do fluxo automático de follow-up</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {disparoResult && (
            <div style={{ display: 'flex', gap: '12px', padding: '8px 14px', background: L.successSoft, border: `1px solid rgba(5,150,105,0.2)`, borderRadius: '8px', fontSize: '12px', color: L.success, fontWeight: '600' }}>
              ✓ {disparoResult.enviados} enviadas · {disparoResult.processados} processadas {disparoResult.falhas > 0 && `· ${disparoResult.falhas} falhas`}
            </div>
          )}
          <button
            onClick={handleDisparar}
            disabled={disparando}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px', background: L.brand, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: disparando ? 'not-allowed' : 'pointer', opacity: disparando ? .7 : 1, fontFamily: 'Inter,sans-serif' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            {disparando ? 'Disparando…' : 'Disparar régua agora'}
          </button>
        </div>
      </div>

      {/* SPLIT LAYOUT */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '24px', alignItems: 'start' }}>

        {/* LEFT — stages */}
        <div>
          {/* Intro info */}
          <div style={{ background: L.infoSoft, border: `1px solid ${L.infoBorder}`, borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', fontSize: '12px', color: L.info, lineHeight: 1.6 }}>
            <strong>Como funciona:</strong> A régua roda automaticamente às 09h e 18h. Clique em qualquer etapa abaixo para expandir e editar a mensagem inline.
          </div>

          {/* Stages list */}
          <div style={{ background: L.bg, border: `1px solid ${L.border}`, borderRadius: '12px', overflow: 'hidden' }}>
            {/* Column headers */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '10px 20px', background: L.bgSub, borderBottom: `1px solid ${L.border}` }}>
              <div style={{ width: '10px', flexShrink: 0 }} />
              <div style={{ minWidth: '140px', flexShrink: 0, fontSize: '11px', fontWeight: '700', letterSpacing: '.06em', textTransform: 'uppercase', color: L.textTer }}>Quando</div>
              <div style={{ flex: 1, fontSize: '11px', fontWeight: '700', letterSpacing: '.06em', textTransform: 'uppercase', color: L.textTer }}>Mensagem</div>
              <div style={{ width: '60px', flexShrink: 0 }} />
              <div style={{ width: '14px', flexShrink: 0 }} />
            </div>

            {isLoading ? (
              <div style={{ textAlign: 'center', padding: '48px', color: L.textTer }}>
                <div style={{ width: '24px', height: '24px', border: `2px solid ${L.border}`, borderTopColor: L.brand, borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 12px' }} />
                Carregando templates…
              </div>
            ) : (
              STAGES.map(s => (
                <StageRow
                  key={s.stage}
                  stageMeta={s}
                  template={getTemplate(s.stage)}
                  onSaved={() => qc.invalidateQueries({ queryKey: ['m31templates-regua'] })}
                />
              ))
            )}

            {/* Encerramento */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 20px', background: L.bgSub }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: L.border, flexShrink: 0 }} />
              <div style={{ minWidth: '140px', flexShrink: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: L.textSec }}>Encerrado</div>
                <div style={{ fontSize: '11px', color: L.textTer }}>após {config.dias_encerrar} dias sem pagamento</div>
              </div>
              <div style={{ flex: 1, fontSize: '13px', color: L.textTer, fontStyle: 'italic' }}>
                Lead arquivado para remarketing futuro
              </div>
              <div style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px', background: L.bgHover, color: L.textTer }}>
                FIM
              </div>
              <div style={{ width: '14px' }} />
            </div>
          </div>

          {/* Legenda */}
          <div style={{ display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap' }}>
            {[
              { dot: L.success, label: 'Ativa' },
              { dot: L.border, label: 'Pausada' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: L.textSec }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: l.dot }} />
                {l.label}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — proteções */}
        <PainelProtecoes config={config} onChange={handleConfigChange} />
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}