import { useState } from 'react';
import { TOKENS as T } from '@/lib/m31DesignTokens';
import { LogOut } from 'lucide-react';
import BoasVindasSelector from '@/components/m31/gestao-rapida/BoasVindasSelector';
import M31GestaoTarefas from '@/components/m31/M31GestaoTarefas';
import M31IAImportButton from '@/components/m31/ia/M31IAImportButton';

const STORAGE_KEY = 'm31_gestao_rapida_user';

/**
 * M31GestaoRapida — acesso simplificado à Gestão de Tarefas.
 * 
 * Fluxo:
 * 1. Campo pesquisável "Selecione seu nome"
 * 2. Depois da seleção, solicita "Seu e-mail" (validação de formato apenas)
 * 3. Sem senha, código, confirmação ou login
 * 4. Salva nome + e-mail no dispositivo (próximos acessos entram direto)
 * 5. "Trocar pessoa" limpa o registro e volta à tela inicial
 * 
 * Identificação autodeclarada de registro operacional — não é autenticação segura.
 * Acesso restrito à Gestão de Tarefas (sem admin/financeiro/inscrições).
 */
export default function M31GestaoRapida() {
  const [usuario, setUsuario] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const handleSave = (user) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(user)); } catch { /* ignore */ }
    setUsuario(user);
  };

  const handleTrocar = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setUsuario(null);
  };

  // Tela de boas-vindas
  if (!usuario) {
    return <BoasVindasSelector onSave={handleSave} />;
  }

  // Super-usuários veem todas as áreas; coordenadores veem apenas sua área
  const lockedAreaSlug = usuario.super_user ? null : usuario.area_slug;

  return (
    <div style={{ minHeight: '100vh', background: T.background, display: 'flex', flexDirection: 'column' }}>
      {/* Barra superior: usuário + trocar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: T.palette.bordo.soft, color: T.primary,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', fontWeight: '700', flexShrink: 0,
        }}>
          {usuario.nome.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '14px', fontWeight: '600', color: T.text }}>{usuario.nome}</span>
          <span style={{ fontSize: '11px', color: T.textMuted, marginLeft: '6px', fontFamily: T.font.body }}>{usuario.email}</span>
          {!usuario.super_user && usuario.area_slug && (
            <span style={{ fontSize: '10px', color: T.textMuted, marginLeft: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{usuario.area_slug}</span>
          )}
        </div>
        <button
          onClick={handleTrocar}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'none', border: `1px solid ${T.border}`, borderRadius: T.radius.md,
            padding: '6px 12px', color: T.textMuted, fontSize: '13px', fontWeight: '500',
            cursor: 'pointer', fontFamily: T.font.body, flexShrink: 0,
          }}
        >
          <LogOut size={14} /> Trocar pessoa
        </button>
      </div>

      {/* Gestão de Tarefas — apenas a gestão, nada de financeiro/inscrições/admin */}
      <div style={{ flex: 1, padding: '14px', maxWidth: '1200px', width: '100%', margin: '0 auto' }}>
        <M31GestaoTarefas
          pode={{ verTodasTarefas: true, criarTarefa: true }}
          userEmail={usuario.email}
          userName={usuario.nome}
          lockedAreaSlug={lockedAreaSlug}
        />
      </div>

      {/* Botão flutuante — Importar tarefas com IA */}
      <M31IAImportButton userEmail={usuario.email} userName={usuario.nome} lockedAreaSlug={lockedAreaSlug} />
    </div>
  );
}