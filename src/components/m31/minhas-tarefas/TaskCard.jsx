/**
 * TaskCard — Card de tarefa mobile-first.
 * Botão grande "Concluir", comentário inline, chip de área com cor de urgência.
 */
import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Check, MessageCircle, Send, Calendar } from 'lucide-react';

const AREA_LABELS = {
  logistica: 'Logística', comunicacao: 'Comunicação', voluntarios: 'Voluntários',
  financeiro: 'Financeiro', checkin: 'Check-in', recepcao: 'Recepção',
  oracao: 'Oração', geral: 'Geral',
};

const AREA_COLORS = {
  logistica: { bg: '#EEF2FF', text: '#4338CA' },
  comunicacao: { bg: '#F0F9FF', text: '#0284C7' },
  voluntarios: { bg: '#FDF4FF', text: '#A21CAF' },
  financeiro: { bg: '#FEF3C7', text: '#B45309' },
  checkin: { bg: '#ECFDF5', text: '#059669' },
  recepcao: { bg: '#FFF7ED', text: '#C2410C' },
  oracao: { bg: '#FAF5FF', text: '#7E22CE' },
  geral: { bg: '#F3F4F6', text: '#4B5563' },
};

function getUrgency(prazo, concluido) {
  if (concluido) return { color: '#059669', label: 'Concluída' };
  if (!prazo) return { color: '#6B7280', label: 'Sem prazo' };
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const due = new Date(prazo + 'T12:00:00');
  const diff = Math.ceil((due - now) / 86400000);
  if (diff < 0) return { color: '#DC2626', label: `${Math.abs(diff)}d atrasada` };
  if (diff === 0) return { color: '#EA580C', label: 'Hoje' };
  if (diff === 1) return { color: '#EA580C', label: 'Amanhã' };
  if (diff <= 3) return { color: '#D97706', label: `Em ${diff} dias` };
  return { color: '#6B7280', label: due.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) };
}

export default function TaskCard({ tarefa, user, onConcluir }) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [posting, setPosting] = useState(false);

  const isConcluido = tarefa.status === 'concluido';
  const urg = getUrgency(tarefa.prazo, isConcluido);
  const areaColor = AREA_COLORS[tarefa.area] || AREA_COLORS.geral;

  const loadComments = async () => {
    setLoadingComments(true);
    try {
      const data = await base44.entities.TarefaComentario.filter({ tarefa_id: tarefa.id }, '-created_date', 50);
      setComments(data);
    } catch { /* ignore */ } finally { setLoadingComments(false); }
  };

  useEffect(() => {
    if (showComments && comments.length === 0 && !loadingComments) loadComments();
  }, [showComments]);

  const handleComment = async () => {
    if (!commentText.trim()) return;
    setPosting(true);
    try {
      const novo = await base44.entities.TarefaComentario.create({
        tarefa_id: tarefa.id,
        autor_email: user.email,
        autor_nome: user.full_name || user.email,
        conteudo: commentText.trim(),
      });
      setComments([novo, ...comments]);
      setCommentText('');
    } catch { /* ignore */ } finally { setPosting(false); }
  };

  return (
    <div style={{
      background: '#FFFFFF', borderRadius: '14px', padding: '16px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
      border: isConcluido ? '1px solid #D1FAE5' : '1px solid #F3F0EC',
      opacity: isConcluido ? 0.75 : 1,
    }}>
      {/* Header: area chip + prazo */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ padding: '3px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: '700', background: areaColor.bg, color: areaColor.text }}>
          {AREA_LABELS[tarefa.area] || tarefa.area}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '600', color: urg.color }}>
          <Calendar size={12} /> {urg.label}
        </span>
      </div>

      {/* Title */}
      <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1F2937', margin: '0 0 4px', lineHeight: '1.3', textDecoration: isConcluido ? 'line-through' : 'none' }}>
        {tarefa.titulo}
      </h3>

      {/* Description */}
      {tarefa.descricao && (
        <p style={{ fontSize: '13px', color: '#6B7280', lineHeight: '1.4', margin: '0 0 12px' }}>
          {tarefa.descricao.length > 120 ? tarefa.descricao.slice(0, 120) + '…' : tarefa.descricao}
        </p>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {!isConcluido && (
          <button
            onClick={() => onConcluir(tarefa)}
            style={{
              flex: 1, padding: '10px', borderRadius: '10px', border: 'none',
              background: '#8B1A2B', color: '#FFFFFF', fontSize: '14px', fontWeight: '700',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}
          >
            <Check size={16} /> Concluir
          </button>
        )}
        {isConcluido && (
          <div style={{ flex: 1, padding: '10px', borderRadius: '10px', background: '#D1FAE5', color: '#059669', fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <Check size={16} /> Concluída
          </div>
        )}
        <button
          onClick={() => setShowComments(!showComments)}
          style={{
            padding: '10px 12px', borderRadius: '10px', border: '1px solid #E5E7EB',
            background: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
            fontSize: '13px', fontWeight: '600', color: '#6B7280',
          }}
        >
          <MessageCircle size={16} />
          {comments.length > 0 ? comments.length : ''}
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #F3F0EC' }}>
          {/* New comment */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            <input
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleComment()}
              placeholder="Escreva um comentário..."
              style={{ flex: 1, padding: '8px 10px', borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '13px', outline: 'none' }}
            />
            <button
              onClick={handleComment}
              disabled={posting || !commentText.trim()}
              style={{ padding: '8px 10px', borderRadius: '8px', border: 'none', background: '#8B1A2B', color: '#FFF', cursor: 'pointer', opacity: posting || !commentText.trim() ? 0.4 : 1 }}
            >
              <Send size={14} />
            </button>
          </div>
          {/* List */}
          {loadingComments ? (
            <p style={{ fontSize: '12px', color: '#9CA3AF', textAlign: 'center' }}>Carregando...</p>
          ) : comments.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#9CA3AF' }}>Nenhum comentário ainda.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {comments.map((c, i) => (
                <div key={c.id || i} style={{ background: '#F9F8F6', borderRadius: '8px', padding: '8px 10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#6B7280', marginBottom: '2px' }}>{c.autor_nome || c.autor_email}</div>
                  <div style={{ fontSize: '13px', color: '#1F2937' }}>{c.conteudo}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}