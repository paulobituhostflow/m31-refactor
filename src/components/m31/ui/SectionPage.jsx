/**
 * SectionPage — wrapper canônico de página/seção interna.
 * Canvas --background, header consistente (título + subtítulo + ação),
 * foco visível e reduced-motion globais para os filhos.
 */
import PageHeader from './PageHeader';
import { TOKENS } from '@/lib/m31DesignTokens';

export default function SectionPage({ title, subtitle, breadcrumb, action, children, style }) {
  return (
    <div style={{ fontFamily: TOKENS.font.body, color: TOKENS.text, ...style }}>
      <style>{`
        .m31-sec :focus-visible { outline: 2px solid ${TOKENS.primary}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) {
          .m31-sec * { transition: none !important; animation: none !important; }
        }
      `}</style>
      <div className="m31-sec">
        <PageHeader breadcrumb={breadcrumb} title={title} subtitle={subtitle} action={action} />
        {children}
      </div>
    </div>
  );
}