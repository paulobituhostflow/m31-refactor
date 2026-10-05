/**
 * NewTaskModal — Formulário minimalista para criar nova demanda.
 * Campos: Título, Área (locked), Descrição, Delegar para (opcional), Prazo.
 * Validação: título e prazo obrigatórios. Responsável sempre definido.
 * Se delegado, dispara notificação via m31EnviarMensagemGovernada (governada).
 */
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { X, Send } from 'lucide-react';

const AREA_LABELS = {
  logistica: 'Logística', comunicacao: 'Comunicação', voluntarios: 'Voluntários',
  financeiro: 'Financeiro', checkin: 'Check-in', recepcao: 'Recepção',
  oracao: 'Oração', geral: 'Geral',
};

export default function NewTaskModal({ user, userArea, userNome, colegas, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ titulo: '', descricao: '', delegar_para: '', prazo: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setError('');
    if (!form.titulo.trim()) { setError('Digite um título.'); return; }
    if (!form.prazo) { setError('Defina um prazo.'); return; }

    setSaving(true);
    try {
      const responsavel_email = form.delegar_para || user.email;
      const responsavel_nome = form.delegar_para
        ? (colegas.find(c => c.email === form.delegar_para)?.nome || form.delegar_para)
        : userNome;

      const tarefa = await base44.entities.EventoM31Tarefa.create({
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim(),
        area: userArea,
        status: 'a_fazer',
        prioridade: 'media',
        responsavel_email,
        responsavel_nome,
        prazo: form.prazo,
        criado_por_email: user.email,
      });

      // Se delegado para outra pessoa, dispara notificação via camada governada
      if (form.delegar_para && form.delegar_para !== user.email) {
        const colega = colegas.find(c => c.email === form.delegar_para);
        if (colega?.whatsapp) {
          const msg = `Olá ${colega.nome?.split(' ')[0] || ''}! Você recebeu uma nova tarefa no M31 Filhas:\n\n*${form.titulo.trim()}*\nPrazo: ${new Date(form.prazo + 'T12:00:00').toLocaleDateString('pt-BR')}\n\nAcesse /minhas-tarefas para acompanhar.`;
          try {
            await base44.functions.invoke('m31EnviarMensagemGovernada', {
              telefone: colega.whatsapp,
              email: colega.email,
              automacao: 'OPERACIONAL',
              origem: 'minhas_tarefas_delegacao',
              mensagens: [{ message: msg }],
            });
          } catch { /* governance layer handles blocking; task still created */ }
        }
      }

      qc.invalidateQueries({ queryKey: ['m31_minhas_tarefas'] });
      onClose();
    } catch (err) {
      setError('Erro ao criar tarefa: ' + (err.message || 'tente novamente'));
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1.5px solid #E5E7EB', fontSize: '14px', outline: 'none', boxSizing: 'border-box' };
  const labelStyle = { fontSize: '12px', fontWeight: '700', color: '#6B7280', marginBottom: '4px', display: 'block' };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: '500px', margin: '0 auto',
        background: '#FFFFFF', borderRadius: '20px 20px 0 0', padding: '20px', zIndex: 1000,
        boxShadow: '0 -4px 24px rgba(0,0,0,0.1)', animation: 'slideUp 0.25s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <style>{`@keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }`}</style>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: '700', color: '#1F2937', margin: 0, fontFamily: '"Inter", sans-serif' }}>Nova demanda</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}><X size={20} /></button>
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Título *</label>
            <input style={inputStyle} value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="O que precisa ser feito?" />
          </div>

          <div>
            <label style={labelStyle}>Área</label>
            <input style={{ ...inputStyle, background: '#F9F8F6', color: '#6B7280' }} value={AREA_LABELS[userArea] || userArea} disabled />
          </div>

          <div>
            <label style={labelStyle}>Descrição (opcional)</label>
            <textarea style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Detalhes da tarefa..." />
          </div>

          <div>
            <label style={labelStyle}>Delegar para (opcional)</label>
            <select style={inputStyle} value={form.delegar_para} onChange={e => setForm({ ...form, delegar_para: e.target.value })}>
              <option value="">— Para mim mesmo —</option>
              {colegas.filter(c => c.email !== user.email).map(c => (
                <option key={c.id} value={c.email}>{c.nome} {c.whatsapp ? '· ' + c.whatsapp : ''}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Prazo *</label>
            <input type="date" style={inputStyle} value={form.prazo} onChange={e => setForm({ ...form, prazo: e.target.value })} />
          </div>

          {error && <p style={{ fontSize: '13px', color: '#DC2626', margin: 0 }}>{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%', padding: '13px', borderRadius: '12px', border: 'none',
              background: '#8B1A2B', color: '#FFFFFF', fontSize: '15px', fontWeight: '700',
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}
          >
            {saving ? 'Criando...' : <><Send size={15} /> Criar tarefa</>}
          </button>
        </div>
      </div>
    </>
  );
}