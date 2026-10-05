import { useState, useEffect } from 'react';
import {
  Clock, User, Monitor, Film, MapPin, Building2, Upload, Link2,
  CheckCircle2, AlertCircle, X, Pencil, Copy, CheckCircle, Plus,
  MessageSquare, Save,
} from 'lucide-react';
import QuickMessagePopover from './QuickMessagePopover';

const AREA_OPTIONS = [
  { value: 'geral', label: 'Geral' },
  { value: 'palco', label: 'Palco' },
  { value: 'recepcao', label: 'Recepção' },
  { value: 'credenciamento', label: 'Credenciamento' },
  { value: 'alimentacao', label: 'Alimentação' },
  { value: 'intercessao', label: 'Intercessão' },
  { value: 'producao', label: 'Produção' },
];

const STATUS_OPTIONS = [
  { value: 'planejada', label: 'Planejada' },
  { value: 'em_andamento', label: 'Em Andamento' },
  { value: 'concluida', label: 'Concluída' },
  { value: 'atrasada', label: 'Atrasada' },
  { value: 'cancelada', label: 'Cancelada' },
];

const inputClass =
  'w-full bg-background border border-border rounded-md text-sm px-3 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring';

function DetailRow({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <Icon size={14} className="text-muted-foreground flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="text-sm text-foreground">{value}</div>
      </div>
    </div>
  );
}

function ActionBtn({ icon: Icon, label, onClick, variant = 'default' }) {
  const variants = {
    default: 'bg-muted text-foreground hover:bg-accent',
    success: 'bg-m31-success/10 text-m31-success hover:bg-m31-success/20',
    danger:  'bg-m31-danger/10 text-m31-danger hover:bg-m31-danger/20',
  };
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${variants[variant]}`}
    >
      <Icon size={13} /> {label}
    </button>
  );
}

/**
 * Painel lateral — detalhes completos + ações operacionais + mídias.
 * No mobile abre como drawer (controlado pelo parent).
 */
export default function CronogramaSidebar({ item, onQuickMessage, onMediaUpload, onMediaLink, onClose, onUpdate, onDuplicate, onMove }) {
  const [linkInput, setLinkInput] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [showObsInput, setShowObsInput] = useState(false);
  const [obsInput, setObsInput] = useState('');

  useEffect(() => {
    setIsEditing(false);
    setShowObsInput(false);
    setObsInput('');
    setLinkInput('');
  }, [item?.id]);

  if (!item) {
    return (
      <div className="bg-card border border-border rounded-lg p-8 flex flex-col items-center justify-center gap-3 min-h-[400px]">
        <Monitor size={32} className="text-muted-foreground/30" />
        <span className="text-sm text-muted-foreground text-center max-w-[200px]">
          Selecione uma atividade para ver detalhes e gerenciar mídias do telão.
        </span>
      </div>
    );
  }

  const handleSaveEdit = () => {
    onUpdate(item, editForm);
    setIsEditing(false);
  };

  const handleAddObs = () => {
    if (!obsInput.trim()) return;
    const newObs = item.observacao ? `${item.observacao}\n${obsInput}` : obsInput;
    onUpdate(item, { observacao: newObs });
    setObsInput('');
    setShowObsInput(false);
  };

  const handleComplete = () => {
    onUpdate(item, { status: item.status === 'concluida' ? 'planejada' : 'concluida' });
  };

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border bg-accent/30 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <Clock size={14} className="text-primary flex-shrink-0" />
            <span className="text-sm font-bold text-primary tabular-nums">
              {item.hora_inicio_normalizada || item.hora_inicio_original || '—'}
            </span>
            {item.hora_fim_original && (
              <span className="text-xs text-muted-foreground">→ {item.hora_fim_original}</span>
            )}
            {item.status && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                item.status === 'concluida' ? 'bg-m31-success/10 text-m31-success' :
                item.status === 'atrasada' ? 'bg-m31-danger/10 text-m31-danger' :
                item.status === 'em_andamento' ? 'bg-m31-warning/10 text-m31-warning' :
                'bg-muted text-muted-foreground'
              }`}>
                {STATUS_OPTIONS.find(s => s.value === item.status)?.label || item.status}
              </span>
            )}
          </div>
          <h3 className="text-base font-semibold text-foreground">{item.programacao}</h3>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Detalhes ou Form de edição */}
      {isEditing ? (
        <div className="px-5 py-4 border-b border-border flex flex-col gap-3">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Atividade</label>
            <input className={inputClass} value={editForm.programacao || ''} onChange={e => setEditForm(p => ({ ...p, programacao: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Início</label>
              <input className={inputClass} value={editForm.hora_inicio_normalizada || ''} onChange={e => setEditForm(p => ({ ...p, hora_inicio_normalizada: e.target.value }))} placeholder="HH:MM" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Fim</label>
              <input className={inputClass} value={editForm.hora_fim_original || ''} onChange={e => setEditForm(p => ({ ...p, hora_fim_original: e.target.value }))} placeholder="HH:MM" />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Responsável</label>
            <input className={inputClass} value={editForm.responsavel || ''} onChange={e => setEditForm(p => ({ ...p, responsavel: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Área</label>
              <select className={inputClass} value={editForm.area || 'geral'} onChange={e => setEditForm(p => ({ ...p, area: e.target.value }))}>
                {AREA_OPTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Ambiente</label>
              <input className={inputClass} value={editForm.ambiente || ''} onChange={e => setEditForm(p => ({ ...p, ambiente: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Telão</label>
            <input className={inputClass} value={editForm.telao || ''} onChange={e => setEditForm(p => ({ ...p, telao: e.target.value }))} />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Cena</label>
            <input className={inputClass} value={editForm.cena || ''} onChange={e => setEditForm(p => ({ ...p, cena: e.target.value }))} />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Status</label>
            <select className={inputClass} value={editForm.status || 'planejada'} onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}>
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Observação</label>
            <textarea className={inputClass} rows={2} value={editForm.observacao || ''} onChange={e => setEditForm(p => ({ ...p, observacao: e.target.value }))} />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setIsEditing(false)} className="px-3 py-2 rounded-md text-xs font-medium bg-muted text-foreground hover:bg-accent">Cancelar</button>
            <button onClick={handleSaveEdit} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90">
              <Save size={13} /> Salvar
            </button>
          </div>
        </div>
      ) : (
        <div className="px-5 py-4 border-b border-border flex flex-col gap-3">
          {item.responsavel && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User size={14} className="text-muted-foreground" />
                <span className="text-sm text-foreground">{item.responsavel}</span>
              </div>
              <QuickMessagePopover variant="button" responsavel={item.responsavel} onSend={(qm) => onQuickMessage(item, qm)} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <DetailRow icon={MapPin} label="Área" value={item.area && item.area !== 'geral' ? item.area : null} />
            <DetailRow icon={Building2} label="Ambiente" value={item.ambiente} />
            <DetailRow icon={Monitor} label="Telão" value={item.telao} />
            <DetailRow icon={Film} label="Cena" value={item.cena} />
          </div>
          {item.observacao && (
            <div className="flex items-start gap-2 pt-2 border-t border-border">
              <MessageSquare size={14} className="text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Observação</div>
                <div className="text-sm text-foreground whitespace-pre-wrap">{item.observacao}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ações */}
      {!isEditing && (
        <div className="px-5 py-3 border-b border-border grid grid-cols-2 gap-2">
          <ActionBtn icon={Pencil} label="Editar" onClick={() => { setEditForm({ ...item }); setIsEditing(true); }} />
          <ActionBtn icon={Copy} label="Duplicar" onClick={() => onDuplicate(item)} />
          <ActionBtn icon={Clock} label="Mover" onClick={() => onMove(item)} />
          <ActionBtn
            icon={CheckCircle}
            label={item.status === 'concluida' ? 'Reabrir' : 'Concluir'}
            onClick={handleComplete}
            variant={item.status === 'concluida' ? 'default' : 'success'}
          />
        </div>
      )}

      {/* Adicionar observação */}
      {!isEditing && (
        <div className="px-5 py-3 border-b border-border">
          {showObsInput ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={obsInput}
                onChange={e => setObsInput(e.target.value)}
                placeholder="Nova observação..."
                rows={2}
                className={inputClass}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowObsInput(false)} className="px-3 py-1.5 rounded-md text-xs font-medium bg-muted text-foreground hover:bg-accent">Cancelar</button>
                <button onClick={handleAddObs} className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90">Salvar</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowObsInput(true)}
              className="w-full text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 py-1"
            >
              <Plus size={12} /> Adicionar observação
            </button>
          )}
        </div>
      )}

      {/* Gerenciador de Mídias */}
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mídias e Telão</h4>
          {item.media_vinculada ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-m31-success/10 text-m31-success">
              <CheckCircle2 size={10} /> Vinculado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-m31-warning/10 text-m31-warning">
              <AlertCircle size={10} /> Pendente
            </span>
          )}
        </div>

        {item.media_vinculada && item.media_url && (
          <div className="mb-3 p-2.5 bg-muted rounded-md flex items-center gap-2">
            {item.media_tipo === 'upload' ? (
              <img src={item.media_url} alt="Mídia" className="w-10 h-10 object-cover rounded flex-shrink-0" />
            ) : (
              <div className="w-10 h-10 bg-card rounded flex items-center justify-center flex-shrink-0">
                <Link2 size={14} className="text-muted-foreground" />
              </div>
            )}
            <span className="text-xs text-muted-foreground truncate flex-1">{item.media_url}</span>
          </div>
        )}

        <label className="flex items-center justify-center gap-2 w-full px-3 py-2.5 border border-dashed border-border rounded-md text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors mb-2">
          <Upload size={14} /> Enviar arquivo
          <input
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) onMediaUpload(item, f);
              e.target.value = '';
            }}
          />
        </label>

        <div className="flex gap-2">
          <input
            type="url"
            value={linkInput}
            onChange={e => setLinkInput(e.target.value)}
            placeholder="Cole um link (Drive, Vimeo...)"
            className="flex-1 bg-background border border-border rounded-md text-xs px-3 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            onClick={() => { if (linkInput) { onMediaLink(item, linkInput); setLinkInput(''); } }}
            disabled={!linkInput}
            className="px-3 py-2 rounded-md text-xs font-medium bg-primary text-primary-foreground disabled:opacity-50 hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            Vincular
          </button>
        </div>
      </div>
    </div>
  );
}