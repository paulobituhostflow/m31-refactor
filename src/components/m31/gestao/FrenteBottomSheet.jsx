import { useState, useEffect } from 'react';
import { X, Check, Loader } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { TOKENS as T } from '@/lib/m31DesignTokens';

function slugify(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * FrenteBottomSheet — criação/edição mobile-first de Frentes.
 * Campos: nome, descrição, responsável (lider_perfil).
 * Cria ou atualiza M31Frente conforme o prop `frente`.
 */
export default function FrenteBottomSheet({ open, area, frente, onClose }) {
  const qc = useQueryClient();
  const isEditing = !!frente;
  const [nome, setNome] = useState('');
  const [slug, setSlug] = useState('');
  const [descricao, setDescricao] = useState('');
  const [liderPerfil, setLiderPerfil] = useState('');
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open) return;
    if (frente) {
      setNome(frente.nome || '');
      setSlug(frente.slug || '');
      setDescricao(frente.descricao || '');
      setLiderPerfil(frente.lider_perfil || '');
    } else {
      setNome(''); setSlug(''); setDescricao(''); setLiderPerfil('');
    }
    setErro('');
  }, [frente, open]);

  useEffect(() => {
    if (!isEditing) setSlug(slugify(nome));
  }, [nome]);

  if (!open) return null;

  async function handleSave() {
    setErro('');
    if (!nome.trim()) { setErro('Nome da frente é obrigatório.'); return; }
    setSaving(true);
    try {
      if (isEditing) {
        await base44.entities.M31Frente.update(frente.id, {
          nome: nome.trim(),
          descricao: descricao.trim(),
          lider_perfil: liderPerfil.trim() || 'Líder da Frente',
        });
      } else {
        await base44.entities.M31Frente.create({
          area_id: area.id,
          area_slug: area.slug,
          slug: slug.trim() || slugify(nome),
          nome: nome.trim(),
          descricao: descricao.trim(),
          lider_perfil: liderPerfil.trim() || 'Líder da Frente',
          status_definicao: 'confirmada',
          ativo: true,
        });
      }
      qc.invalidateQueries(['m31frentes']);
      onClose();
    } catch (err) {
      setErro(err.message || 'Erro ao salvar frente.');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: '100%', minHeight: '44px', padding: '0 14px', background: T.surface,
    border: `1px solid ${T.border}`, borderRadius: T.radius.md, fontSize: '16px',
    color: T.text, outline: 'none', fontFamily: T.font.body, boxSizing: 'border-box',
  };
  const labelStyle = {
    fontSize: '12px', fontWeight: '600', color: T.textSubtle,
    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px', display: 'block',
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, animation: 'm31-fade 0.2s ease' }} />
      <style>{`@keyframes m31-fade { from { opacity: 0 } to { opacity: 1 } } @keyframes m31-slide-up { from { transform: translateY(100%) } to { transform: translateY(0) } } @keyframes m31-spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
        background: T.surface, borderTopLeftRadius: T.radius.xl, borderTopRightRadius: T.radius.xl,
        maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
        animation: 'm31-slide-up 0.28s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '8px', flexShrink: 0 }}>
          <div style={{ width: '36px', height: '4px', background: T.border, borderRadius: T.radius.pill }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 12px', flexShrink: 0 }}>
          <h2 style={{ fontSize: '17px', fontWeight: '700', color: T.text, fontFamily: T.font.body, margin: 0 }}>
            {isEditing ? 'Editar frente' : 'Nova frente'}
          </h2>
          <button onClick={onClose} aria-label="Fechar" style={{ minWidth: '44px', minHeight: '44px', background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, margin: '-8px -8px -8px 0' }}>
            <X size={20} />
          </button>
        </div>

        {area && (
          <div style={{ padding: '0 16px 8px', flexShrink: 0 }}>
            <span style={{ fontSize: '11px', fontWeight: '600', color: T.primary, background: T.primarySoft, padding: '4px 10px', borderRadius: T.radius.pill }}>{area.nome}</span>
          </div>
        )}

        <div style={{ overflowY: 'auto', padding: '0 16px 16px', flex: 1, WebkitOverflowScrolling: 'touch', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Nome da frente *</label>
            <input value={nome} onChange={e => setNome(e.target.value)} autoFocus placeholder="Ex: Credenciamento, Recepção..." style={inputStyle} />
          </div>
          {!isEditing && (
            <div>
              <label style={labelStyle}>Identificador (auto)</label>
              <input value={slug} readOnly style={{ ...inputStyle, color: T.textMuted, background: T.surfaceSubtle }} />
            </div>
          )}
          <div>
            <label style={labelStyle}>Descrição</label>
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Breve descrição da especialidade da frente" style={{ ...inputStyle, minHeight: '80px', padding: '12px 14px', resize: 'vertical' }} />
          </div>
          <div>
            <label style={labelStyle}>Responsável / Perfil do líder</label>
            <input value={liderPerfil} onChange={e => setLiderPerfil(e.target.value)} placeholder="Ex: Líder de Credenciamento" style={inputStyle} />
          </div>
          {erro && <div style={{ fontSize: '13px', color: T.danger, padding: '8px 12px', background: T.dangerSoft, borderRadius: T.radius.md }}>{erro}</div>}
        </div>

        <div style={{ padding: '12px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))', borderTop: `1px solid ${T.border}`, flexShrink: 0, background: T.surface }}>
          <button onClick={handleSave} disabled={saving || !nome.trim()} style={{ width: '100%', minHeight: '48px', background: nome.trim() ? T.primary : T.border, color: T.onPrimary, border: 'none', borderRadius: T.radius.md, fontSize: '16px', fontWeight: '700', cursor: nome.trim() && !saving ? 'pointer' : 'not-allowed', fontFamily: T.font.body, opacity: nome.trim() ? 1 : 0.6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            {saving ? <Loader size={18} style={{ animation: 'm31-spin 0.8s linear infinite' }} /> : <Check size={18} />}
            {saving ? 'Salvando...' : (isEditing ? 'Salvar' : 'Criar frente')}
          </button>
        </div>
      </div>
    </>
  );
}