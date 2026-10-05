/**
 * EmptyState — estado vazio reutilizável.
 * ícone + título + descrição + CTA opcional.
 */
import { TOKENS } from '@/lib/m31DesignTokens';
import { Inbox } from 'lucide-react';

export default function EmptyState({ icon: Icon = Inbox, title = 'Nada por aqui', description, action, style }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: '48px 24px', gap: '12px', ...style,
    }}>
      <div style={{
        width: '56px', height: '56px', borderRadius: TOKENS.radius.lg,
        background: TOKENS.surfaceSubtle, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: TOKENS.textSubtle,
      }}>
        <Icon size={26} strokeWidth={1.5} />
      </div>
      <div style={{ fontSize: '15px', fontWeight: '600', color: TOKENS.text, fontFamily: TOKENS.font.heading }}>{title}</div>
      {description && <div style={{ fontSize: '13px', color: TOKENS.textMuted, maxWidth: '360px', lineHeight: 1.5 }}>{description}</div>}
      {action && <div style={{ marginTop: '4px' }}>{action}</div>}
    </div>
  );
}