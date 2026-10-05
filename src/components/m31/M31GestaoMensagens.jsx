import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const C = {
  bg0: '#F5F6FA', bg1: '#FFFFFF', bg2: '#FFFFFF', bg3: '#F9FAFB', bg4: '#F9FAFB',
  text: '#1A1A1A', textSec: '#6B7280', textTer: '#9CA3AF',
  border: '#E5E7EB', borderSt: '#D1D5DB',
  brand: '#7A1F2B', brandHov: '#6B1A25',
  success: '#10B981', successSoft: 'rgba(16,185,129,0.12)',
  warning: '#F59E0B', warningSoft: 'rgba(245,158,11,0.12)',
  info: '#3B82F6', infoSoft: 'rgba(59,130,246,0.12)',
};

const STAGE_META = {
  d0: { label: 'D+0', desc: 'Imediatamente após inscrição', color: C.info, icon: '⚡' },
  d1: { label: 'D+1', desc: '1 dia após inscrição', color: C.warning, icon: '🔔' },
  d3: { label: 'D+3', desc: '3 dias após inscrição', color: '#f97316', icon: '💬' },
  d7: { label: 'D+7', desc: '7 dias após inscrição', color: C.brand, icon: '🎯' },
};

const VARIAVEIS = [
  { tag: '{nome}', desc: 'Primeiro nome da inscrita' },
  { tag: '{valor}', desc: 'Valor pago (ex: R$ 110,00)' },
  { tag: '{link_checkout}', desc: 'Link de pagamento Asaas' },
];

// ── EMAIL TEMPLATE (fixo no código do webhook) ──
const EMAIL_TEMPLATE = {
  subject: '✅ Inscrição Confirmada — M31 Filhas | {codigo}',
  trigger: 'Quando o pagamento é confirmado no Asaas (PAYMENT_RECEIVED / PAYMENT_CONFIRMED)',
  content: `Olá, {nome}! Seu pagamento foi confirmado com sucesso. 🎉

📋 Código de inscrição: {codigo}
🔲 QR Code para check-in: [imagem enviada]

📅 Data: 21 de novembro
🕗 Horário: 9h às 19h
📍 Local: Igreja RIO Prado, Recife-PE

Guarde este e-mail e apresente o QR Code ou código no dia do evento para fazer o check-in.`,
  waContent: `✅ Inscrição Confirmada — M31 Filhas!

Olá, {nome}! Seu pagamento foi confirmado 🎉

📋 Seu código de inscrição: {codigo}

📅 Data: 21 de novembro
🕗 Horário: 9h às 19h
📍 Local: Igreja RIO Prado, Recife-PE

Guarde este código e o QR Code — você precisará para o check-in no dia do evento.`,
};

function PreviewBubble({ content, variaveis = {} }) {
  const preview = content
    .replace(/{nome}/g, variaveis.nome || 'Thaysa')
    .replace(/{valor}/g, variaveis.valor || 'R$ 110,00')
    .replace(/{link_checkout}/g, variaveis.link || 'https://asaas.com/i/exemplo')
    .replace(/{codigo}/g, variaveis.codigo || 'M31-ABC123');

  return (
    <div style={{ background: '#F0F9F0', borderRadius: '12px', padding: '16px', position: 'relative', border: '1px solid rgba(16,185,129,0.15)' }}>
      <div style={{ fontSize: '10px', color: C.success, fontWeight: '700', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.success, display: 'inline-block' }} />
        Prévia WhatsApp
      </div>
      <div style={{ background: '#25d366', borderRadius: '10px 10px 10px 2px', padding: '12px 14px', maxWidth: '85%', display: 'inline-block' }}>
        <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: '13px', color: '#111', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>
          {preview}
        </pre>
        <div style={{ fontSize: '10px', color: 'rgba(0,0,0,0.45)', textAlign: 'right', marginTop: '4px' }}>17:33 ✓✓</div>
      </div>
    </div>
  );
}

function TemplateEditor({ template, onSave, onCancel }) {
  const [content, setContent] = useState(template.content || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await base44.entities.M31MessageTemplate.update(template.id, { content });
    setSaving(false);
    onSave();
  }

  function insertVar(tag) {
    setContent(c => c + tag);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Variáveis */}
      <div>
        <div style={{ fontSize: '11px', color: C.textTer, fontWeight: '700', letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: '8px' }}>Variáveis disponíveis</div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {VARIAVEIS.map(v => (
            <button key={v.tag} onClick={() => insertVar(v.tag)} title={v.desc}
              style={{ padding: '4px 10px', background: C.infoSoft, border: `1px solid ${C.info}40`, borderRadius: '4px', color: C.info, fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'monospace' }}>
              {v.tag}
            </button>
          ))}
        </div>
      </div>

      {/* Textarea */}
      <div>
        <div style={{ fontSize: '11px', color: C.textTer, fontWeight: '700', letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: '8px' }}>Conteúdo da mensagem</div>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={10}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: C.bg1, border: `1px solid ${C.borderSt}`, borderRadius: '8px',
            color: C.text, fontFamily: 'monospace', fontSize: '13px', lineHeight: 1.6,
            padding: '14px', outline: 'none', resize: 'vertical',
          }}
        />
      </div>

      {/* Prévia */}
      <PreviewBubble content={content} />

      {/* Ações */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={onCancel}
          style={{ padding: '8px 18px', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: '6px', color: C.textSec, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
          Cancelar
        </button>
        <button onClick={handleSave} disabled={saving}
          style={{ padding: '8px 20px', background: C.brand, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1, fontFamily: 'Inter,sans-serif' }}>
          {saving ? 'Salvando...' : '💾 Salvar'}
        </button>
      </div>
    </div>
  );
}

function StageCard({ stage, template, onEdit }) {
  const meta = STAGE_META[stage];

  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '12px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: `${meta.color}20`, border: `1px solid ${meta.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>
            {meta.icon}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: '700', color: C.text }}>{meta.label}</span>
              <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${meta.color}20`, color: meta.color, fontWeight: '600' }}>
                {template ? 'Ativo' : 'Sem template'}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: C.textSec, marginTop: '2px' }}>{meta.desc}</div>
          </div>
        </div>
        {template && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '10px', color: C.textTer, marginBottom: '2px' }}>Envios</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: C.text }}>{template.sends_total || 0}</div>
            </div>
            <button onClick={onEdit}
              style={{ padding: '7px 14px', background: C.bg4, border: `1px solid ${C.borderSt}`, borderRadius: '6px', color: C.text, fontSize: '12px', fontWeight: '500', cursor: 'pointer', fontFamily: 'Inter,sans-serif', whiteSpace: 'nowrap' }}>
              ✏️ Editar
            </button>
          </div>
        )}
      </div>

      {/* Content preview */}
      {template ? (
        <div style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: '11px', color: C.textTer, fontWeight: '700', letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: '8px' }}>Mensagem atual</div>
          <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: '13px', color: C.textSec, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6, maxHeight: '80px', overflow: 'hidden', position: 'relative' }}>
            {template.content}
          </pre>
        </div>
      ) : (
        <div style={{ padding: '20px 18px', textAlign: 'center', color: C.textTer, fontSize: '13px' }}>
          Nenhum template configurado para este stage
        </div>
      )}
    </div>
  );
}

function EmailFlowCard() {
  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: `${C.success}20`, border: `1px solid ${C.success}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>
          ✅
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: '700', color: C.text }}>Confirmação de Pagamento</span>
            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${C.success}20`, color: C.success, fontWeight: '600' }}>E-mail + WhatsApp</span>
          </div>
          <div style={{ fontSize: '12px', color: C.textSec, marginTop: '2px' }}>Disparado quando Asaas confirma pagamento</div>
        </div>
      </div>

      <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Email */}
        <div>
          <div style={{ fontSize: '11px', color: C.textTer, fontWeight: '700', letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: '10px' }}>📧 E-mail (Brevo)</div>
          <div style={{ background: C.bg3, borderRadius: '8px', padding: '14px', fontSize: '13px', lineHeight: 1.6, color: C.textSec }}>
            <div style={{ color: C.text, fontWeight: '600', marginBottom: '8px', fontSize: '12px' }}>Assunto: {EMAIL_TEMPLATE.subject}</div>
            <div style={{ fontSize: '11px', color: C.info, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: C.info, display: 'inline-block' }} />
              Trigger: {EMAIL_TEMPLATE.trigger}
            </div>
            <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: C.textSec }}>
              {EMAIL_TEMPLATE.content}
            </pre>
          </div>
        </div>
        {/* WhatsApp */}
        <div>
          <div style={{ fontSize: '11px', color: C.textTer, fontWeight: '700', letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: '10px' }}>💬 WhatsApp (UAZAPI)</div>
          <PreviewBubble content={EMAIL_TEMPLATE.waContent} variaveis={{ codigo: 'M31-ABC123' }} />
        </div>
      </div>

      <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.border}`, background: C.warningSoft }}>
        <div style={{ fontSize: '12px', color: C.warning, display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <span style={{ flexShrink: 0 }}>⚠️</span>
          <span>Esta mensagem está no código da função <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: '3px', fontFamily: 'monospace' }}>m31AsaasWebhook</code>. Para editá-la, acesse o painel de funções.</span>
        </div>
      </div>
    </div>
  );
}

export default function M31GestaoMensagens() {
  const qc = useQueryClient();
  const [editingStage, setEditingStage] = useState(null);
  const [tab, setTab] = useState('bot'); // 'bot' | 'email'

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['m31-templates'],
    queryFn: () => base44.entities.M31MessageTemplate.list(),
  });

  function getTemplate(stage) {
    return templates.find(t => t.trigger_stage === stage) || null;
  }

  function handleSaved() {
    qc.invalidateQueries({ queryKey: ['m31-templates'] });
    setEditingStage(null);
  }

  const stages = ['d0', 'd1', 'd3', 'd7'];

  return (
    <div style={{ fontFamily: 'Inter,sans-serif', color: C.text }}>
      {/* HEADER */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: '600', letterSpacing: '-.015em', color: C.text, marginBottom: '4px' }}>Gestão de Mensagens</h1>
        <p style={{ fontSize: '13px', color: C.textSec, margin: 0 }}>Visualize e edite os fluxos de mensagens do bot de recuperação e do e-mail de confirmação</p>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: '4px', background: C.bg2, borderRadius: '8px', padding: '4px', marginBottom: '24px', width: 'fit-content', border: `1px solid ${C.border}` }}>
        {[{ id: 'bot', label: '💬 Fluxo do Bot (Recuperação)' }, { id: 'email', label: '✅ Confirmação de Pagamento' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '8px 18px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontFamily: 'Inter,sans-serif', fontSize: '13px', fontWeight: '500', transition: 'all .15s',
              background: tab === t.id ? C.brand : 'transparent',
              color: tab === t.id ? '#fff' : C.textSec,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'bot' && (
        <div>
          {/* Fluxo visual */}
          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '18px 20px', marginBottom: '24px' }}>
            <div style={{ fontSize: '12px', color: C.textTer, fontWeight: '700', letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: '14px' }}>Fluxo de Recuperação</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0', overflowX: 'auto', paddingBottom: '4px' }}>
              {stages.map((s, i) => {
                const meta = STAGE_META[s];
                const tmpl = getTemplate(s);
                return (
                  <React.Fragment key={s}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: `${meta.color}20`, border: `2px solid ${meta.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                        {meta.icon}
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: meta.color }}>{meta.label}</div>
                      <div style={{ fontSize: '10px', color: C.textTer, textAlign: 'center', maxWidth: '70px', lineHeight: 1.3 }}>{meta.desc}</div>
                      <div style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '3px', background: tmpl ? `${C.success}20` : C.bg4, color: tmpl ? C.success : C.textTer, fontWeight: '600' }}>
                        {tmpl ? '✓' : '—'}
                      </div>
                    </div>
                    {i < stages.length - 1 && (
                      <div style={{ flex: 1, height: '2px', background: `${C.border}`, margin: '0 8px', minWidth: '30px', position: 'relative', top: '-14px' }} />
                    )}
                  </React.Fragment>
                );
              })}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: C.bg4, border: `2px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                  🏁
                </div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: C.textTer }}>Encerrado</div>
                <div style={{ fontSize: '10px', color: C.textTer, textAlign: 'center', maxWidth: '70px', lineHeight: 1.3 }}>Sem resposta em +8d</div>
              </div>
            </div>
          </div>

          {/* Regras do bot */}
          <div style={{ background: C.infoSoft, border: `1px solid ${C.info}30`, borderRadius: '8px', padding: '14px 18px', marginBottom: '24px' }}>
            <div style={{ fontSize: '12px', color: C.info, fontWeight: '700', marginBottom: '8px' }}>ℹ️ Regras do bot</div>
            <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: '12px', color: C.textSec, lineHeight: 1.8 }}>
              <li>Roda <strong style={{ color: C.text }}>todos os dias às 09h e 18h</strong> (exceto domingos)</li>
              <li>Apenas para leads com status <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: '3px' }}>pendente</code> ou <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: '3px' }}>checkout_abandonado</code></li>
              <li>Máximo <strong style={{ color: C.text }}>1 mensagem por dia</strong> por lead</li>
              <li>Encerra automaticamente após <strong style={{ color: C.text }}>8 dias sem resposta</strong></li>
            </ul>
          </div>

          {/* Stage cards */}
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '48px', color: C.textTer }}>Carregando templates...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {stages.map(stage => (
                <div key={stage}>
                  {editingStage === stage ? (
                    <div style={{ background: C.bg2, border: `1px solid ${C.borderSt}`, borderRadius: '12px', padding: '20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                        <span style={{ fontSize: '18px' }}>{STAGE_META[stage].icon}</span>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: C.text }}>Editando {STAGE_META[stage].label}</div>
                          <div style={{ fontSize: '12px', color: C.textSec }}>{STAGE_META[stage].desc}</div>
                        </div>
                      </div>
                      {getTemplate(stage) ? (
                        <TemplateEditor
                          template={getTemplate(stage)}
                          onSave={handleSaved}
                          onCancel={() => setEditingStage(null)}
                        />
                      ) : (
                        <div style={{ color: C.textTer, textAlign: 'center', padding: '24px' }}>Template não encontrado no banco.</div>
                      )}
                    </div>
                  ) : (
                    <StageCard
                      stage={stage}
                      template={getTemplate(stage)}
                      onEdit={() => setEditingStage(stage)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'email' && (
        <EmailFlowCard />
      )}
    </div>
  );
}