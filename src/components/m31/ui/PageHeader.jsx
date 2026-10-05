/**
 * PageHeader — cabeçalho consistente de página.
 * breadcrumb (array de {label, href?}) + título + subtítulo + ação primária.
 * Sempre no mesmo lugar, mesma hierarquia.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { TOKENS } from '@/lib/m31DesignTokens';
import { ChevronRight } from 'lucide-react';

export default function PageHeader({ breadcrumb = [], title, subtitle, action, style }) {
  return (
    <div style={{ marginBottom: '20px', ...style }}>
      {breadcrumb.length > 0 && (
        <nav style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
          {breadcrumb.map((b, i) => (
            <React.Fragment key={i}>
              {b.href
                ? <Link to={b.href} style={{ fontSize: '12px', color: TOKENS.textMuted, textDecoration: 'none' }}>{b.label}</Link>
                : <span style={{ fontSize: '12px', color: TOKENS.text, fontWeight: '500' }}>{b.label}</span>}
              {i < breadcrumb.length - 1 && <ChevronRight size={12} color={TOKENS.textSubtle} />}
            </React.Fragment>
          ))}
        </nav>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          {title && <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: TOKENS.text, fontFamily: TOKENS.font.heading, lineHeight: 1.2, letterSpacing: '-.01em' }}>{title}</h1>}
          {subtitle && <p style={{ margin: '4px 0 0', fontSize: '13px', color: TOKENS.textMuted, lineHeight: 1.5 }}>{subtitle}</p>}
        </div>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
    </div>
  );
}