import { Check, Loader2, Trash2 } from 'lucide-react';
import { gestaoError } from '@/lib/m31GestaoApi';
import GestaoLoteDuplicidade from './GestaoLoteDuplicidade';

const STATES = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const FIELDS = [['nome', 'Nome completo'], ['whatsapp', 'WhatsApp com DDD'], ['email', 'E-mail (opcional)'], ['cpf', 'CPF (opcional)'], ['cidade', 'Cidade']];

export default function GestaoLoteBloco({ index, item, onChange, onRemove, onSubmit, onEdit }) {
  const { fields, reviewed, status, error } = item;
  const done = status === 'done';
  const busy = status === 'pending';
  const set = (key, value) => onChange({ fields: { ...fields, [key]: value }, reviewed: false, error: null, dupReviewed: false });
  return (
    <div className="m31-gestao-form" style={{ border: '1px solid #e5e8eb', borderRadius: 12, padding: 12, marginBottom: 12, opacity: done ? 0.7 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>
          Participante {index + 1}{done ? ` · ${item.result || 'Cadastrada'}` : error?.code === 'DUPLICATE_CPF' ? ' · Já existente' : error?.code === 'POSSIBLE_DUPLICATE' ? ' · Pendente de revisão' : error ? ' · Erro' : ''}
        </strong>
        {!done && (
          <button type="button" className="m31-gestao-btn m31-gestao-btn-quiet" onClick={onRemove} disabled={busy} aria-label="Remover bloco">
            <Trash2 size={16} />
          </button>
        )}
      </div>
      {done && item.semelhantes?.length > 0 && (
        <p style={{ fontSize: 12, color: '#7b6b6b', margin: '6px 0' }}>
          Já existe um cadastro com dados semelhantes. {item.semelhantes.map((d) => (
            <button key={d.id} type="button" className="m31-gestao-btn m31-gestao-btn-quiet" onClick={() => onEdit(d.id)}>
              Ver cadastro ({d.nome})
            </button>
          ))}
        </p>
      )}
      <div className="m31-gestao-fields-grid">
        {FIELDS.map(([key, label]) => (
          <div key={key} className={`m31-gestao-field ${key === 'nome' ? 'm31-gestao-field-wide' : ''}`}>
            <label>{label}</label>
            <input value={fields[key]} onChange={(e) => set(key, e.target.value)} disabled={done || busy} />
          </div>
        ))}
        <div className="m31-gestao-field">
          <label>UF</label>
          <select value={fields.estado} onChange={(e) => set('estado', e.target.value)} disabled={done || busy}>
            <option value="">Selecione</option>
            {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      {error && !done && (['POSSIBLE_DUPLICATE', 'DUPLICATE_CPF'].includes(error.code) && error.duplicidades?.length ? (
        <GestaoLoteDuplicidade
          error={error}
          fields={fields}
          onEdit={onEdit}
          onIgnore={(d) => onChange({ status: 'done', result: `Ignorada · já cadastrada (${d.nome})`, error: null })}
          onDistinct={(justificativa) => onSubmit({ dupReviewed: true, justificativa })}
        />
      ) : (
        <div className="m31-gestao-error" role="alert">
          <p>{gestaoError(error)}</p>
        </div>
      ))}
      {!done && !(error?.duplicidades?.length) && (
        <>
          <label className="m31-gestao-check">
            <input type="checkbox" checked={reviewed} onChange={(e) => onChange({ reviewed: e.target.checked })} disabled={busy} />
            Revisei e aprovo os dados desta participante.
          </label>
          <button type="button" className="m31-gestao-btn m31-gestao-btn-primary" onClick={() => onSubmit()} disabled={!reviewed || busy}>
            {busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}
            {busy ? 'Salvando…' : 'Cadastrar esta'}
          </button>
        </>
      )}
    </div>
  );
}
