import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { X, Loader2 } from 'lucide-react';
import { TOKENS as T } from '@/lib/m31DesignTokens';

/**
 * FrenteFormModal — cria uma nova Frente dentro de uma Área.
 * Cria o registro M31Frente com area_id, slug, nome, descricao, lider_perfil.
 * Não altera notificações nem registros existentes.
 */
export default function FrenteFormModal({ area, onClose }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState('');
  const [slug, setSlug] = useState('');
  const [descricao, setDescricao] = useState('');
  const [liderPerfil, setLiderPerfil] = useState('');
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  // Auto-gera slug a partir do nome
  useEffect(() => {
    if (!slug || slug === slugify(nome.slice(0, -1))) {
      setSlug(slugify(nome));
    }
  }, [nome]);

  function slugify(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  async function handleSave(e) {
    e.preventDefault();
    setErro('');

    if (!nome.trim()) {
      setErro('Nome da frente é obrigatório.');
      return;
    }

    setSaving(true);
    try {
      const dados = {
        area_id: area.id,
        area_slug: area.slug,
        slug: slug.trim() || slugify(nome),
        nome: nome.trim(),
        descricao: descricao.trim(),
        lider_perfil: liderPerfil.trim() || 'Líder da Frente',
        status_definicao: 'confirmada',
        ativo: true,
      };

      await base44.entities.M31Frente.create(dados);
      qc.invalidateQueries(['m31frentes']);
      onClose();
    } catch (err) {
      setErro(err.message || 'Erro ao criar frente.');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: T.radius.md,
    border: `1px solid ${T.border}`,
    background: T.surface,
    color: T.text,
    fontSize: '14px',
    fontFamily: T.font.body,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    fontSize: '12px',
    fontWeight: '600',
    color: T.textMuted,
    marginBottom: '4px',
    display: 'block',
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={handleSave}
        style={{
          background: T.surface,
          borderRadius: T.radius.lg,
          width: '100%', maxWidth: '480px',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '16px 20px',
          borderBottom: `1px solid ${T.border}`,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '15px', fontWeight: '600', color: T.text }}>
              Nova Frente
            </div>
            <div style={{ fontSize: '12px', color: T.textMuted, marginTop: '1px' }}>
              {area.nome}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '32px', height: '32px', borderRadius: '6px',
            border: `1px solid ${T.border}`, background: 'transparent', cursor: 'pointer',
          }}>
            <X size={16} color={T.textMuted} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Nome da frente *</label>
            <input
              style={inputStyle}
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Ex: Credenciamento, Recepção..."
              autoFocus
            />
          </div>

          <div>
            <label style={labelStyle}>Slug (identificador)</label>
            <input
              style={inputStyle}
              value={slug}
              onChange={e => setSlug(e.target.value)}
              placeholder="auto-gerado"
            />
          </div>

          <div>
            <label style={labelStyle}>Descrição</label>
            <textarea
              style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }}
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Breve descrição da especialidade da frente"
            />
          </div>

          <div>
            <label style={labelStyle}>Perfil do líder</label>
            <input
              style={inputStyle}
              value={liderPerfil}
              onChange={e => setLiderPerfil(e.target.value)}
              placeholder="Ex: Líder de Credenciamento"
            />
          </div>

          {erro && (
            <div style={{ fontSize: '13px', color: T.danger, fontWeight: '500' }}>
              {erro}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', gap: '8px', justifyContent: 'flex-end',
          padding: '14px 20px',
          borderTop: `1px solid ${T.border}`,
        }}>
          <button type="button" onClick={onClose} style={{
            padding: '9px 16px', borderRadius: T.radius.md,
            border: `1px solid ${T.border}`, background: 'transparent',
            color: T.textMuted, fontSize: '14px', fontWeight: '500',
            fontFamily: T.font.body, cursor: 'pointer',
          }}>
            Cancelar
          </button>
          <button type="submit" disabled={saving} style={{
            padding: '9px 16px', borderRadius: T.radius.md,
            border: 'none', background: T.primary, color: T.onPrimary,
            fontSize: '14px', fontWeight: '600',
            fontFamily: T.font.body, cursor: saving ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
            opacity: saving ? 0.6 : 1,
          }}>
            {saving && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            {saving ? 'Criando...' : 'Criar frente'}
          </button>
        </div>
      </form>
    </div>
  );
}