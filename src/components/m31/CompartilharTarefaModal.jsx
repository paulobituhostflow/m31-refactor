import { useState } from 'react';
import { X, Copy, Check, Link2, Lock } from 'lucide-react';
import { TOKENS as T } from '@/lib/m31DesignTokens';

/**
 * CompartilharTarefaModal — abre ao clicar em "Compartilhar" no header do modal de tarefa.
 * Permite copiar o link da tarefa (interno, para membros do espaço de trabalho).
 */
export default function CompartilharTarefaModal({ tarefa, onClose }) {
  const [copied, setCopied] = useState(false);
  const [visibilidade, setVisibilidade] = useState('privado'); // privado | link

  if (!tarefa) return null;

  const baseUrl = window.location.origin;
  const linkTarefa = `${baseUrl}/minhas-tarefas?tarefa=${tarefa.id}`;

  function copiarLink() {
    navigator.clipboard.writeText(linkTarefa).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const opcoes = [
    {
      id: 'privado',
      icon: Lock,
      titulo: 'Acesso restrito',
      desc: 'Apenas membros do espaço de trabalho autenticados podem abrir o link.',
    },
    {
      id: 'link',
      icon: Link2,
      titulo: 'Link compartilhável',
      desc: 'Qualquer pessoa com o link e acesso ao painel pode visualizar a tarefa.',
    },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(0,0,0,0.40)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '440px', background: T.surface,
          borderRadius: T.radius.lg, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', maxHeight: '90vh',
          animation: 'm31-scale-in 0.2s ease-out both',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: `1px solid ${T.border}`,
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: T.text, margin: 0, fontFamily: T.font.body }}>
            Compartilhar tarefa
          </h3>
          <button onClick={onClose} style={{ color: T.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
          {/* Título da tarefa */}
          <div style={{
            padding: '10px 12px', background: T.surfaceSubtle,
            borderRadius: T.radius.md, border: `1px solid ${T.border}`,
          }}>
            <div style={{ fontSize: '11px', fontWeight: '600', color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>
              Tarefa
            </div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: T.text }}>
              {tarefa.titulo}
            </div>
          </div>

          {/* Opções de visibilidade */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: T.textMuted, marginBottom: '8px', display: 'block' }}>
              Quem pode acessar
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {opcoes.map(op => {
                const Icon = op.icon;
                const active = visibilidade === op.id;
                return (
                  <button
                    key={op.id}
                    onClick={() => setVisibilidade(op.id)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: '10px',
                      padding: '10px 12px', textAlign: 'left',
                      background: active ? T.primaryTint : T.surface,
                      border: `1px solid ${active ? T.primary : T.border}`,
                      borderRadius: T.radius.md, cursor: 'pointer',
                      fontFamily: T.font.body,
                    }}
                  >
                    <Icon size={16} color={active ? T.primary : T.textMuted} style={{ flexShrink: 0, marginTop: '1px' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: active ? T.primary : T.text }}>
                        {op.titulo}
                      </div>
                      <div style={{ fontSize: '12px', color: T.textMuted, marginTop: '1px' }}>
                        {op.desc}
                      </div>
                    </div>
                    <div style={{
                      width: '16px', height: '16px', borderRadius: '50%',
                      border: `2px solid ${active ? T.primary : T.border}`,
                      flexShrink: 0, marginTop: '2px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {active && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: T.primary }} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Link copiável */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: T.textMuted, marginBottom: '6px', display: 'block' }}>
              Link da tarefa
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={linkTarefa}
                readOnly
                style={{
                  flex: 1, minWidth: 0,
                  padding: '10px 12px', fontSize: '12px',
                  background: T.surfaceSubtle, color: T.text,
                  border: `1px solid ${T.border}`, borderRadius: T.radius.md,
                  fontFamily: 'JetBrains Mono, monospace',
                  outline: 'none',
                }}
                onFocus={e => e.target.select()}
              />
              <button
                onClick={copiarLink}
                style={{
                  background: copied ? T.success : T.primary, color: T.onPrimary,
                  border: 'none', borderRadius: T.radius.md,
                  padding: '0 14px', cursor: 'pointer', flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: '6px',
                  fontSize: '13px', fontWeight: '600', fontFamily: T.font.body,
                }}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <p style={{ fontSize: '11px', color: T.textSubtle, margin: '8px 0 0' }}>
              O destinatário precisa estar autenticado no painel para abrir a tarefa.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}