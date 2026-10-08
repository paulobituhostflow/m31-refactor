// Editor Visual de Landing Page — Blocos Drag & Drop estilo Elementor
import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  GripVertical, Plus, Trash2, ChevronDown, ChevronUp, Layout, Image,
  Type, Palette, AlignLeft, MoveUp, MoveDown, Copy, Star,
  MousePointerClick, Play, Info, Quote, MessageCircle, Minus,
  ArrowDown, Code,
} from 'lucide-react';
import { BLOCK_TYPES, ensureV2 } from './blocksConfig';
import { CAMINHO_INSCRICAO, validarDestinoInscricao } from '@/lib/m31LandingCta';

const iconMap = { Layout, Star, MousePointerClick, Play, Info, Quote, MessageCircle, Minus, ArrowDown, Code };

const inputS = {
  width: '100%', padding: '7px 9px', border: '1px solid #E5E7EB',
  borderRadius: 7, fontSize: 12, color: '#1F2937', outline: 'none',
  fontFamily: 'Inter, sans-serif', background: '#FAFAFA',
};

// ── Block Editor Panel ──────────────────────────────────────────────────
function BlockEditor({ block, onChange, onRemove, onDuplicate, onMoveUp, onMoveDown, isFirst, isLast }) {
  const [open, setOpen] = useState(true);
  const type = BLOCK_TYPES[block.type] || {};
  const Icon = iconMap[type.icon] || Layout;
  const data = block.data || {};

  const setData = (key, val) => onChange({ ...block, data: { ...data, [key]: val } });

  return (
    <div style={{ background: '#fff', border: '1.5px solid #E5E7EB', borderRadius: 12, marginBottom: 8, overflow: 'hidden' }}>
      {/* Header bar */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
          cursor: 'pointer', background: open ? '#F6E9EC' : '#FAFAFA',
          borderBottom: open ? '1px solid #E5D6D6' : 'none',
        }}
      >
        <GripVertical size={14} color="#9CA3AF" style={{ flexShrink: 0 }} />
        <Icon size={14} color="#8B1A2B" />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#1F2937' }}>{type.label || block.type}</span>
        <span style={{ fontSize: 10, color: '#9CA3AF', background: '#F3F4F6', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
          {block.type}
        </span>
        {open ? <ChevronUp size={14} color="#9CA3AF" /> : <ChevronDown size={14} color="#9CA3AF" />}
      </div>

      {open && (
        <div style={{ padding: '14px 14px 16px' }}>
          {/* Core fields based on type */}
          {block.type === 'hero' && <HeroFields data={data} setData={setData} />}
          {block.type === 'features' && <FeaturesFields data={data} setData={setData} />}
          {block.type === 'cta_section' && <CTASectionFields data={data} setData={setData} />}
          {block.type === 'video' && <VideoFields data={data} setData={setData} />}
          {block.type === 'info_card' && <InfoCardFields data={data} setData={setData} />}
          {block.type === 'verse' && <VerseFields data={data} setData={setData} />}
          {block.type === 'testimonials' && <TestimonialsFields data={data} setData={setData} />}
          {block.type === 'footer' && <FooterFields data={data} setData={setData} />}
          {block.type === 'custom_html' && <CustomHTMLFields data={data} setData={setData} />}
          {block.type === 'camisas_hero' && <CamisasHeroFields data={data} setData={setData} />}
          {block.type === 'purchase_flow' && <PurchaseFlowFields data={data} setData={setData} />}
          {block.type === 'divider' && <DividerFields data={data} setData={setData} />}

          {/* Actions */}
          <div style={{
            display: 'flex', gap: 6, marginTop: 16, paddingTop: 12,
            borderTop: '1px solid #E5E7EB', flexWrap: 'wrap',
          }}>
            {!isFirst && (
              <ActionBtn icon={MoveUp} label="Subir" onClick={onMoveUp} />
            )}
            {!isLast && (
              <ActionBtn icon={MoveDown} label="Descer" onClick={onMoveDown} />
            )}
            <ActionBtn icon={Copy} label="Duplicar" onClick={onDuplicate} />
            <ActionBtn icon={Trash2} label="Remover" onClick={onRemove} danger />
          </div>
        </div>
      )}
    </div>
  );
}

function ActionBtn({ icon: Icon, label, onClick, danger }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
      background: danger ? '#FEF2F2' : '#F9FAFB',
      border: `1px solid ${danger ? '#FECACA' : '#E5E7EB'}`,
      borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
      color: danger ? '#DC2626' : '#6B7280',
    }}>
      <Icon size={12} /> {label}
    </button>
  );
}

// ── Field Helpers ────────────────────────────────────────────────────────
function F({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function Txt({ value, onChange, placeholder, textarea }) {
  return textarea ? (
    <textarea value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      rows={2} style={{ ...inputS, resize: 'vertical' }} />
  ) : (
    <input value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputS} />
  );
}

function ItemEditor({ items, onChange, fields, label }) {
  const add = () => onChange([...items, fields.reduce((o, f) => ({ ...o, [f.key]: f.default }), {})]);
  const update = (i, key, val) => {
    const n = [...items];
    n[i] = { ...n[i], [key]: val };
    onChange(n);
  };
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280' }}>{label} ({items.length})</span>
        <button onClick={add} style={{ background: 'none', border: 'none', color: '#8B1A2B', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
          + Adicionar
        </button>
      </div>
      {items.map((item, i) => (
        <div key={i} style={{
          background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8,
          padding: '10px 10px 0', marginBottom: 6,
          position: 'relative',
        }}>
          {fields.map(f => (
            <F key={f.key} label={f.label}>
              <Txt value={item[f.key]} onChange={v => update(i, f.key, v)} placeholder={f.placeholder} textarea={f.textarea} />
            </F>
          ))}
          <button onClick={() => remove(i)} style={{
            position: 'absolute', top: 6, right: 6,
            background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 4,
            cursor: 'pointer', padding: '2px 4px', color: '#DC2626',
          }}>
            <Trash2 size={10} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Per-Type Field Editors ───────────────────────────────────────────────
const LIVE_URLS = {
  // Inscrição: caminho da própria aplicação (mesmo domínio da landing).
  inscricao: CAMINHO_INSCRICAO,
  caravana:  'https://inscricoes.m31filhas.com.br/m31-caravana',
  servir:    'https://inscricoes.m31filhas.com.br/m31-servir',
};

// Avisa no construtor quando o CTA aponta para o site institucional antigo (404).
function AvisoCtaInscricao({ url }) {
  const v = validarDestinoInscricao(url);
  if (v.ok) return null;
  return (
    <div style={{
      marginTop: 5, fontSize: 10, fontWeight: 600, color: '#B45309',
      background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6,
      padding: '5px 8px', lineHeight: 1.4,
    }}>
      {v.motivo === 'site_antigo'
        ? 'Este link aponta para o site antigo (WordPress), que devolve página não encontrada. Use "Inscrição" para levar ao formulário da aplicação.'
        : 'Este link aponta para outro domínio. Use "Inscrição" para levar ao formulário da aplicação.'}
    </div>
  );
}

function QuickUrl({ label, url, onSet }) {
  return (
    <button onClick={() => onSet(url)} title={`Usar: ${url}`} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', background: '#F0FDF4', border: '1px solid #86EFAC',
      borderRadius: 5, fontSize: 10, fontWeight: 600, color: '#166534',
      cursor: 'pointer', whiteSpace: 'nowrap',
    }}>
      🔗 {label}
    </button>
  );
}

function CamisasHeroFields({ data, setData }) {
  return (
    <>
      <F label="URL do banner (imagem do topo)"><Txt value={data.banner_url} onChange={v => setData('banner_url', v)} placeholder="https://.../banner.png" /></F>
      <F label="Texto de instrução (abaixo do banner)"><Txt value={data.subtitle} onChange={v => setData('subtitle', v)} placeholder="Escolha o modelo e o tamanho..." textarea /></F>
      <F label="Texto do link de acompanhamento"><Txt value={data.track_link_text} onChange={v => setData('track_link_text', v)} placeholder="Acompanhar meu pedido" /></F>
    </>
  );
}

function PurchaseFlowFields({ data, setData }) {
  return (
    <>
      <div style={{ fontSize: 11, color: '#6B7280', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '10px 12px', lineHeight: 1.5, marginBottom: 10 }}>
        Bloco funcional fixo da Lojinha: escolha de modelo/tamanho → dados → Pix. O fluxo é renderizado ao vivo na página publicada; edite apenas a nota abaixo.
      </div>
      <F label="Nota interna (não aparece na página)"><Txt value={data.note} onChange={v => setData('note', v)} textarea /></F>
    </>
  );
}

function HeroFields({ data, setData }) {
  return (
    <>
      <F label="Badge superior"><Txt value={data.badge} onChange={v => setData('badge', v)} placeholder="M31 Filhas · 2026" /></F>
      <F label="Título principal"><Txt value={data.title} onChange={v => setData('title', v)} placeholder="Uma noite que vai marcar sua história" textarea /></F>
      <F label="Subtítulo"><Txt value={data.subtitle} onChange={v => setData('subtitle', v)} placeholder="Junte-se a milhares de mulheres..." textarea /></F>
      <F label="Texto do CTA"><Txt value={data.cta_text} onChange={v => setData('cta_text', v)} placeholder="Quero minha vaga →" /></F>
      <div style={{ marginBottom: 10 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 4 }}>URL do CTA</label>
        <Txt value={data.cta_url} onChange={v => setData('cta_url', v)} placeholder={LIVE_URLS.inscricao} />
        <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: '#9CA3AF', alignSelf: 'center' }}>Links no ar:</span>
          <QuickUrl label="Inscrição" url={LIVE_URLS.inscricao} onSet={v => setData('cta_url', v)} />
          <QuickUrl label="Caravana" url={LIVE_URLS.caravana} onSet={v => setData('cta_url', v)} />
          <QuickUrl label="Servir" url={LIVE_URLS.servir} onSet={v => setData('cta_url', v)} />
        </div>
        <AvisoCtaInscricao url={data.cta_url} />
      </div>
      <F label="URL da imagem de fundo"><Txt value={data.hero_image} onChange={v => setData('hero_image', v)} placeholder="https://..." /></F>
    </>
  );
}

function FeaturesFields({ data, setData }) {
  return (
    <>
      <F label="Título da seção"><Txt value={data.title} onChange={v => setData('title', v)} placeholder="O que você vai viver" /></F>
      <F label="Colunas (2, 3 ou 4)">
        <select value={data.columns || 3} onChange={e => setData('columns', parseInt(e.target.value))} style={inputS}>
          {[2, 3, 4].map(n => <option key={n} value={n}>{n} colunas</option>)}
        </select>
      </F>
      <ItemEditor
        items={data.items || []}
        onChange={v => setData('items', v)}
        label="Itens"
        fields={[
          { key: 'icon', label: 'Ícone (emoji)', placeholder: '✨', default: '✨' },
          { key: 'title', label: 'Título', placeholder: 'Adoração', default: 'Item' },
          { key: 'text', label: 'Descrição', placeholder: 'Descrição do benefício', default: '', textarea: true },
        ]}
      />
    </>
  );
}

function CTASectionFields({ data, setData }) {
  return (
    <>
      <F label="Título"><Txt value={data.title} onChange={v => setData('title', v)} placeholder="Garanta sua vaga agora" /></F>
      <F label="Subtítulo"><Txt value={data.subtitle} onChange={v => setData('subtitle', v)} placeholder="Vagas limitadas" /></F>
      <F label="Texto do botão"><Txt value={data.button_text} onChange={v => setData('button_text', v)} placeholder="Quero me inscrever →" /></F>
      <div style={{ marginBottom: 10 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 4 }}>URL do botão</label>
        <Txt value={data.button_url} onChange={v => setData('button_url', v)} placeholder={LIVE_URLS.inscricao} />
        <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: '#9CA3AF', alignSelf: 'center' }}>Links no ar:</span>
          <QuickUrl label="Inscrição" url={LIVE_URLS.inscricao} onSet={v => setData('button_url', v)} />
          <QuickUrl label="Caravana" url={LIVE_URLS.caravana} onSet={v => setData('button_url', v)} />
          <QuickUrl label="Servir" url={LIVE_URLS.servir} onSet={v => setData('button_url', v)} />
        </div>
        <AvisoCtaInscricao url={data.button_url} />
      </div>
    </>
  );
}

function VideoFields({ data, setData }) {
  return (
    <>
      <F label="Título da seção"><Txt value={data.title} onChange={v => setData('title', v)} placeholder="Assista ao convite" /></F>
      <F label="URL do vídeo (YouTube/Vimeo)"><Txt value={data.embed_url} onChange={v => setData('embed_url', v)} placeholder="https://www.youtube.com/embed/..." /></F>
      <F label="Delay do botão (segundos) — 0 = mostrar sempre">
        <input type="number" value={data.delay_seconds || 0} onChange={e => setData('delay_seconds', parseInt(e.target.value) || 0)}
          style={inputS} min="0" max="300" />
      </F>
      {data.delay_seconds > 0 && (
        <>
          <F label="Texto do botão (após delay)"><Txt value={data.delay_cta_text} onChange={v => setData('delay_cta_text', v)} placeholder="Quero participar →" /></F>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 4 }}>URL do botão (após delay)</label>
            <Txt value={data.delay_cta_url} onChange={v => setData('delay_cta_url', v)} placeholder={LIVE_URLS.inscricao} />
            <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: '#9CA3AF', alignSelf: 'center' }}>Links no ar:</span>
              <QuickUrl label="Inscrição" url={LIVE_URLS.inscricao} onSet={v => setData('delay_cta_url', v)} />
              <QuickUrl label="Caravana" url={LIVE_URLS.caravana} onSet={v => setData('delay_cta_url', v)} />
              <QuickUrl label="Servir" url={LIVE_URLS.servir} onSet={v => setData('delay_cta_url', v)} />
            </div>
            <AvisoCtaInscricao url={data.delay_cta_url} />
          </div>
        </>
      )}
    </>
  );
}

function InfoCardFields({ data, setData }) {
  return (
    <>
      <F label="Data"><Txt value={data.date} onChange={v => setData('date', v)} placeholder="14 de Junho de 2026" /></F>
      <F label="Local"><Txt value={data.location} onChange={v => setData('location', v)} placeholder="Recife, PE" /></F>
      <F label="Endereço"><Txt value={data.address} onChange={v => setData('address', v)} placeholder="Av. Agamenon Magalhães, 500" /></F>
      <F label="Preço (exibição)"><Txt value={data.price_display} onChange={v => setData('price_display', v)} placeholder="A partir de R$ 90" /></F>
    </>
  );
}

function VerseFields({ data, setData }) {
  return (
    <>
      <F label="Texto"><Txt value={data.text} onChange={v => setData('text', v)} placeholder="O Senhor é a minha luz..." textarea /></F>
      <F label="Referência"><Txt value={data.reference} onChange={v => setData('reference', v)} placeholder="Salmos 27:1" /></F>
    </>
  );
}

function TestimonialsFields({ data, setData }) {
  return (
    <>
      <F label="Título da seção"><Txt value={data.title} onChange={v => setData('title', v)} placeholder="Quem já viveu" /></F>
      <ItemEditor
        items={data.items || []}
        onChange={v => setData('items', v)}
        label="Depoimentos"
        fields={[
          { key: 'name', label: 'Nome', placeholder: 'Maria Silva', default: 'Nome' },
          { key: 'text', label: 'Depoimento', placeholder: 'Foi incrível!', default: '', textarea: true },
          { key: 'photo', label: 'URL da foto', placeholder: 'https://...', default: '' },
        ]}
      />
    </>
  );
}

function FooterFields({ data, setData }) {
  return (
    <>
      <F label="Texto de segurança"><Txt value={data.security_text} onChange={v => setData('security_text', v)} placeholder="Pagamento 100% seguro" /></F>
      <F label="Texto do rodapé"><Txt value={data.footer_text} onChange={v => setData('footer_text', v)} placeholder="M31 Filhas · 2026 · Ju Beltrão" /></F>
    </>
  );
}

function CustomHTMLFields({ data, setData }) {
  return (
    <F label="HTML (use com cuidado)">
      <Txt value={data.html} onChange={v => setData('html', v)} placeholder="<div>...</div>" textarea />
    </F>
  );
}

function DividerFields({ data, setData }) {
  return (
    <F label="Cor da linha">
      <input type="color" value={data.color || '#E5E7EB'} onChange={e => setData('color', e.target.value)}
        style={{ width: 40, height: 32, border: '1px solid #E5E7EB', borderRadius: 6, cursor: 'pointer' }} />
    </F>
  );
}

// ── Add Block Menu ───────────────────────────────────────────────────────
function AddBlockMenu({ onAdd }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginBottom: 8 }}>
      {!open ? (
        <button onClick={() => setOpen(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          background: '#F6E9EC', border: '1.5px dashed #C4485E',
          borderRadius: 10, padding: '10px', cursor: 'pointer',
          fontSize: 13, fontWeight: 700, color: '#8B1A2B', justifyContent: 'center',
        }}>
          <Plus size={14} /> Adicionar bloco
        </button>
      ) : (
        <div style={{
          border: '1.5px solid #E5D6D6', borderRadius: 12,
          background: '#FFF', padding: '10px', display: 'grid',
          gridTemplateColumns: '1fr 1fr', gap: 6,
        }}>
          {Object.entries(BLOCK_TYPES).map(([key, t]) => {
            const Icon = iconMap[t.icon] || Layout;
            return (
              <button key={key} onClick={() => { onAdd(key); setOpen(false); }} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px',
                background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8,
                cursor: 'pointer', textAlign: 'left',
              }}>
                <Icon size={14} color="#8B1A2B" />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1F2937' }}>{t.label}</div>
                  <div style={{ fontSize: 10, color: '#9CA3AF' }}>{t.description}</div>
                </div>
              </button>
            );
          })}
          <button onClick={() => setOpen(false)} style={{
            gridColumn: '1 / -1', padding: '6px', background: 'none',
            border: '1px solid #E5E7EB', borderRadius: 6, cursor: 'pointer',
            fontSize: 11, color: '#9CA3AF',
          }}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Editor ──────────────────────────────────────────────────────────
export default function BuilderLandingEditor({ config, onChange }) {
  const parsed = ensureV2(config);
  const blocks = parsed.blocks || [];
  const colors = parsed.colors || {};

  const setBlocks = (newBlocks) => {
    onChange?.({ ...parsed, version: 2, blocks: newBlocks });
  };

  const setColor = (key, val) => {
    onChange?.({ ...parsed, colors: { ...colors, [key]: val } });
  };

  const addBlock = (type) => {
    const t = BLOCK_TYPES[type];
    const newBlock = {
      id: `block_${Date.now()}`,
      type,
      data: JSON.parse(JSON.stringify(t.defaultData)),
    };
    setBlocks([...blocks, newBlock]);
  };

  const updateBlock = (idx, updated) => {
    setBlocks(blocks.map((b, i) => i === idx ? updated : b));
  };

  const removeBlock = (idx) => {
    setBlocks(blocks.filter((_, i) => i !== idx));
  };

  const duplicateBlock = (idx) => {
    const original = blocks[idx];
    const copy = { ...original, id: `block_${Date.now()}`, data: JSON.parse(JSON.stringify(original.data)) };
    const n = [...blocks];
    n.splice(idx + 1, 0, copy);
    setBlocks(n);
  };

  const moveBlock = (fromIdx, toIdx) => {
    const n = [...blocks];
    const [removed] = n.splice(fromIdx, 1);
    n.splice(toIdx, 0, removed);
    setBlocks(n);
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;
    moveBlock(result.source.index, result.destination.index);
  };

  return (
    <div style={{ padding: '16px 14px', fontFamily: 'Inter, sans-serif' }}>
      {/* Colors quick-access */}
      <div style={{
        marginBottom: 16, padding: '10px 14px',
        background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10,
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', letterSpacing: '0.05em', marginRight: 4 }}>
          Cores:
        </span>
        {[
          { key: 'primary', label: 'Marca' },
          { key: 'bg', label: 'Fundo' },
          { key: 'card', label: 'Card' },
          { key: 'text', label: 'Texto' },
          { key: 'gold', label: 'Ouro' },
        ].map(c => (
          <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="color" value={colors[c.key] || '#8B1A2B'}
              onChange={e => setColor(c.key, e.target.value)}
              style={{ width: 24, height: 24, border: '1px solid #E5E7EB', borderRadius: 4, cursor: 'pointer', padding: 1 }} />
            <span style={{ fontSize: 10, color: '#9CA3AF' }}>{c.label}</span>
          </div>
        ))}
      </div>

      {/* Block count */}
      <div style={{
        fontSize: 12, fontWeight: 700, color: '#8B1A2B',
        letterSpacing: '0.08em', textTransform: 'uppercase',
        marginBottom: 12, display: 'flex', justifyContent: 'space-between',
      }}>
        <span>Blocos ({blocks.length})</span>
        <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 400 }}>Arraste para reordenar</span>
      </div>

      {/* Blocks DnD */}
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="landing-blocks">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef}>
              {blocks.map((block, i) => (
                <Draggable key={block.id} draggableId={block.id} index={i}>
                  {(prov) => (
                    <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}>
                      <BlockEditor
                        block={block}
                        onChange={(updated) => updateBlock(i, updated)}
                        onRemove={() => removeBlock(i)}
                        onDuplicate={() => duplicateBlock(i)}
                        onMoveUp={() => i > 0 && moveBlock(i, i - 1)}
                        onMoveDown={() => i < blocks.length - 1 && moveBlock(i, i + 1)}
                        isFirst={i === 0}
                        isLast={i === blocks.length - 1}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      <AddBlockMenu onAdd={addBlock} />

      {/* Quick add bottom */}
      {blocks.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px', color: '#9CA3AF', fontSize: 13 }}>
          Nenhum bloco ainda. Clique em "Adicionar bloco" para começar.
        </div>
      )}
    </div>
  );
}