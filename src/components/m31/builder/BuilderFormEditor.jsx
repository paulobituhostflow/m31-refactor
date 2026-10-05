// Editor de Formulário — coluna esquerda do Builder (aba Form)
import { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

const FIELD_TYPES = [
  { value: 'text',     label: 'Texto livre' },
  { value: 'email',    label: 'E-mail' },
  { value: 'phone',    label: 'Telefone' },
  { value: 'cpf',      label: 'CPF' },
  { value: 'select',   label: 'Lista dropdown' },
  { value: 'toggle',   label: 'Sim / Não' },
  { value: 'radio',    label: 'Múltipla escolha' },
  { value: 'textarea', label: 'Texto longo' },
];

const inputStyle = {
  width: '100%', padding: '7px 9px', border: '1px solid #E5E7EB',
  borderRadius: 7, fontSize: 12, color: '#1F2937', outline: 'none',
  fontFamily: 'Inter, sans-serif', background: '#FAFAFA',
};

const labelStyle = { fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 3, display: 'block' };

function FieldEditor({ field, onChange, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const set = (k) => (v) => onChange({ ...field, [k]: v });

  return (
    <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', gap: 8, cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}>
        <GripVertical size={14} color="#9CA3AF" style={{ cursor: 'grab', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1F2937' }}>{field.label || '(sem label)'}</span>
          <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 8 }}>{field.type}</span>
          {field.required && <span style={{ fontSize: 10, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 4, padding: '1px 6px', marginLeft: 6, fontWeight: 700 }}>obrigatório</span>}
        </div>
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#EF4444' }}>
          <Trash2 size={13} />
        </button>
        {expanded ? <ChevronUp size={14} color="#9CA3AF" /> : <ChevronDown size={14} color="#9CA3AF" />}
      </div>

      {/* Body */}
      {expanded && (
        <div style={{ padding: '0 12px 14px', borderTop: '1px solid #E5E7EB', paddingTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={labelStyle}>Nome do campo (name)</label>
              <input style={inputStyle} value={field.name || ''} onChange={e => set('name')(e.target.value)} placeholder="full_name" />
            </div>
            <div>
              <label style={labelStyle}>Tipo</label>
              <select style={inputStyle} value={field.type || 'text'} onChange={e => set('type')(e.target.value)}>
                {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Label (exibição)</label>
            <input style={inputStyle} value={field.label || ''} onChange={e => set('label')(e.target.value)} placeholder="Nome completo" />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Placeholder</label>
            <input style={inputStyle} value={field.placeholder || ''} onChange={e => set('placeholder')(e.target.value)} placeholder="Digite seu nome..." />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Texto de ajuda (helper)</label>
            <input style={inputStyle} value={field.helper || ''} onChange={e => set('helper')(e.target.value)} placeholder="Ex: Usaremos para informações do evento." />
          </div>

          {(field.type === 'select' || field.type === 'radio') && (
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Opções (uma por linha)</label>
              <textarea
                style={{ ...inputStyle, height: 80, resize: 'vertical' }}
                value={(field.options || []).join('\n')}
                onChange={e => set('options')(e.target.value.split('\n').filter(Boolean))}
                placeholder={"Opção 1\nOpção 2\nOpção 3"}
              />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id={`req-${field.name}`} checked={!!field.required} onChange={e => set('required')(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: '#8B1A2B', cursor: 'pointer' }} />
            <label htmlFor={`req-${field.name}`} style={{ fontSize: 12, color: '#374151', cursor: 'pointer' }}>Campo obrigatório</label>
          </div>
        </div>
      )}
    </div>
  );
}

function StepEditor({ step, stepIndex, onChange, onRemove, totalSteps }) {
  const [open, setOpen] = useState(stepIndex === 0);

  const updateField = (fieldIdx, updatedField) => {
    const newFields = step.fields.map((f, i) => i === fieldIdx ? updatedField : f);
    onChange({ ...step, fields: newFields });
  };

  const removeField = (fieldIdx) => {
    onChange({ ...step, fields: step.fields.filter((_, i) => i !== fieldIdx) });
  };

  const addField = () => {
    const newField = { name: `campo_${Date.now()}`, type: 'text', label: 'Novo campo', required: false };
    onChange({ ...step, fields: [...(step.fields || []), newField] });
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const reordered = Array.from(step.fields);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    onChange({ ...step, fields: reordered });
  };

  return (
    <div style={{ border: '1.5px solid #E5E7EB', borderRadius: 12, marginBottom: 12, overflow: 'hidden', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', background: open ? '#F6E9EC' : '#F9FAFB', cursor: 'pointer', borderBottom: open ? '1px solid #E5D6D6' : 'none' }}
        onClick={() => setOpen(o => !o)}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#8B1A2B', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0, marginRight: 10 }}>
          {stepIndex + 1}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937' }}>{step.title || `Etapa ${stepIndex + 1}`}</div>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>{(step.fields || []).length} campos</div>
        </div>
        {totalSteps > 1 && (
          <button onClick={(e) => { e.stopPropagation(); onRemove(); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', color: '#EF4444', marginRight: 4 }}>
            <Trash2 size={13} />
          </button>
        )}
        {open ? <ChevronUp size={15} color="#9CA3AF" /> : <ChevronDown size={15} color="#9CA3AF" />}
      </div>

      {open && (
        <div style={{ padding: '14px 14px 16px' }}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Título da etapa</label>
            <input style={inputStyle} value={step.title || ''} onChange={e => onChange({ ...step, title: e.target.value })} placeholder="Vamos conhecer você" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Subtítulo / descrição</label>
            <input style={inputStyle} value={step.subtitle || ''} onChange={e => onChange({ ...step, subtitle: e.target.value })} placeholder="Conte-nos um pouco sobre você" />
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Campos — arraste para reordenar
          </div>

          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId={`step-${stepIndex}`}>
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef}>
                  {(step.fields || []).map((field, fi) => (
                    <Draggable key={field.name + fi} draggableId={`${stepIndex}-${fi}`} index={fi}>
                      {(prov) => (
                        <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}>
                          <FieldEditor
                            field={field}
                            onChange={(updated) => updateField(fi, updated)}
                            onRemove={() => removeField(fi)}
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

          <button onClick={addField} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1.5px dashed #D1D5DB', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', cursor: 'pointer', width: '100%', justifyContent: 'center', marginTop: 4 }}>
            <Plus size={13} /> Adicionar campo
          </button>
        </div>
      )}
    </div>
  );
}

export default function BuilderFormEditor({ config, onChange }) {
  const steps = config.steps || [];

  const updateStep = (idx, updated) => {
    const newSteps = steps.map((s, i) => i === idx ? updated : s);
    onChange({ ...config, steps: newSteps });
  };

  const removeStep = (idx) => {
    onChange({ ...config, steps: steps.filter((_, i) => i !== idx) });
  };

  const addStep = () => {
    const newStep = { title: `Nova etapa`, subtitle: '', fields: [] };
    onChange({ ...config, steps: [...steps, newStep] });
  };

  return (
    <div style={{ padding: '20px 16px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#8B1A2B', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
          Etapas do formulário
        </div>
        <p style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.5 }}>
          Organize os campos em etapas. Use arrastar para reordenar campos dentro de cada etapa.
        </p>
      </div>

      {steps.map((step, i) => (
        <StepEditor
          key={i}
          step={step}
          stepIndex={i}
          totalSteps={steps.length}
          onChange={(updated) => updateStep(i, updated)}
          onRemove={() => removeStep(i)}
        />
      ))}

      <button onClick={addStep} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F6E9EC', border: '1.5px dashed #C4485E', borderRadius: 10, padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#8B1A2B', cursor: 'pointer', width: '100%', justifyContent: 'center' }}>
        <Plus size={15} /> Adicionar nova etapa
      </button>
    </div>
  );
}