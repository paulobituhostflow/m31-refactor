import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const C = {
  bg0: '#0a0a0c', bg1: '#111114', bg2: '#17171b', bg3: '#1e1e23', bg4: '#26262c',
  text: '#ededee', textSec: '#8a8a93', textTer: '#56565e',
  border: 'rgba(255,255,255,0.06)',
};

const IcoSend = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
const IcoUser = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;

export default function M31TarefaComentarios({ tarefaId, responsavelEmail, responsavelNome, todosEmails = [] }) {
  const qc = useQueryClient();
  const [novoComentario, setNovoComentario] = useState('');
  const [enviando, setEnviando] = useState(false);

  const { data: comentarios = [] } = useQuery({
    queryKey: ['tarefaComentarios', tarefaId],
    queryFn: () => base44.entities.TarefaComentario.filter({ tarefa_id: tarefaId }, '-created_date', 50),
    enabled: !!tarefaId,
  });

  const mutation = useMutation({
    mutationFn: async (conteudo) => {
      const user = await base44.auth.me();
      const comentario = await base44.entities.TarefaComentario.create({
        tarefa_id: tarefaId,
        autor_email: user.email,
        autor_nome: user.full_name,
        conteudo,
      });

      // Disparar notificação de comentário
      const emailsParaNotificar = [...new Set([responsavelEmail, ...todosEmails])].filter(e => e && e !== user.email);
      if (emailsParaNotificar.length > 0) {
        await base44.functions.invoke('m31NotificarComentarioTarefa', {
          tarefa_id: tarefaId,
          titulo_tarefa: 'Tarefa', // Idealmente vinha do contexto
          autor_nome: user.full_name,
          conteudo,
          emails_para_notificar: emailsParaNotificar,
        });
      }

      return comentario;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tarefaComentarios'] });
      setNovoComentario('');
    },
  });

  const handleEnviar = async () => {
    if (!novoComentario.trim()) return;
    setEnviando(true);
    await mutation.mutateAsync(novoComentario);
    setEnviando(false);
  };

  const fmtData = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: `1px solid ${C.border}` }}>
      <h4 style={{ fontSize: '13px', fontWeight: '600', color: C.text, marginBottom: '12px' }}>Comentários ({comentarios.length})</h4>

      {/* Lista de comentários */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '14px', maxHeight: '280px', overflowY: 'auto' }}>
        {comentarios.length === 0 ? (
          <div style={{ fontSize: '12px', color: C.textTer, padding: '16px', textAlign: 'center', background: C.bg1, borderRadius: '6px' }}>Nenhum comentário ainda</div>
        ) : (
          comentarios.map(c => (
            <div key={c.id} style={{ background: C.bg1, borderRadius: '6px', padding: '10px 12px', borderLeft: `2px solid #8B1A2B` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: C.bg3, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textSec, fontSize: '10px', flexShrink: 0 }}><IcoUser /></span>
                <span style={{ fontSize: '12px', fontWeight: '600', color: C.text }}>{c.autor_nome || c.autor_email}</span>
                <span style={{ fontSize: '10px', color: C.textTer, marginLeft: 'auto' }}>{fmtData(c.created_date)}</span>
              </div>
              <p style={{ fontSize: '12px', color: C.textSec, lineHeight: 1.4, margin: 0 }}>{c.conteudo}</p>
            </div>
          ))
        )}
      </div>

      {/* Input novo comentário */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
        <textarea
          value={novoComentario}
          onChange={e => setNovoComentario(e.target.value)}
          placeholder="Adicionar um comentário…"
          rows={2}
          style={{
            flex: 1,
            background: C.bg1,
            border: `1px solid ${C.border}`,
            borderRadius: '6px',
            color: C.text,
            padding: '8px 12px',
            fontFamily: 'Inter,sans-serif',
            fontSize: '12px',
            outline: 'none',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        <button
          onClick={handleEnviar}
          disabled={!novoComentario.trim() || enviando}
          style={{
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: novoComentario.trim() && !enviando ? '#8B1A2B' : C.bg3,
            border: `1px solid ${C.border}`,
            borderRadius: '5px',
            color: novoComentario.trim() && !enviando ? '#fff' : C.textSec,
            cursor: novoComentario.trim() && !enviando ? 'pointer' : 'not-allowed',
            opacity: !novoComentario.trim() || enviando ? 0.5 : 1,
            transition: 'all .12s',
            flexShrink: 0,
          }}
        >
          <IcoSend />
        </button>
      </div>
    </div>
  );
}