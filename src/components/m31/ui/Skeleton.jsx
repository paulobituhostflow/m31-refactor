/**
 * Skeleton — loading padrão do M31. Shimmer auto-contido.
 * Variantes: Skeleton (bloco), SkeletonText (linhas), SkeletonRow (tabela), SkeletonCard (KPI).
 */
import { TOKENS } from '@/lib/m31DesignTokens';

const SHIMMER_CSS = `
@keyframes m31-shimmer { 0% { background-position: -800px 0; } 100% { background-position: 800px 0; } }
.m31-skel { background: linear-gradient(90deg, ${TOKENS.surfaceSubtle} 0%, #eef0f3 50%, ${TOKENS.surfaceSubtle} 100%); background-size: 800px 100%; animation: m31-shimmer 1.4s infinite linear; }
@keyframes m31-skel-enter { from { opacity: 0; } to { opacity: 1; } }
.m31-skel-wrap { animation: m31-skel-enter 200ms ease-out both; }
`;

const base = { borderRadius: TOKENS.radius.sm };

export function Skeleton({ w = '100%', h = '14px', radius, style }) {
  return (
    <>
      <style>{SHIMMER_CSS}</style>
      <div className="m31-skel-wrap"><div className="m31-skel" style={{ width: w, height: h, borderRadius: radius || base.borderRadius, ...style }} /></div>
    </>
  );
}

export function SkeletonText({ lines = 3, style }) {
  return (
    <div className="m31-skel-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '6px', ...style }}>
      <style>{SHIMMER_CSS}</style>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="m31-skel" style={{ height: '12px', width: i === lines - 1 ? '60%' : '100%', borderRadius: TOKENS.radius.sm }} />
      ))}
    </div>
  );
}

export function SkeletonRow({ columns = 5 }) {
  return (
    <div className="m31-skel-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: `1px solid ${TOKENS.borderSubtle}` }}>
      <style>{SHIMMER_CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '33%' }}>
        <div className="m31-skel" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
        <div className="m31-skel" style={{ height: '12px', width: '96px', borderRadius: TOKENS.radius.sm }} />
      </div>
      {Array.from({ length: columns - 1 }).map((_, i) => (
        <div key={i} className="m31-skel" style={{ height: '12px', width: i === columns - 2 ? '40px' : '80px', borderRadius: TOKENS.radius.sm }} />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="m31-skel-wrap" style={{ padding: '18px 20px', borderRadius: TOKENS.radius.lg, border: `1px solid ${TOKENS.border}`, background: TOKENS.surface }}>
      <style>{SHIMMER_CSS}</style>
      <div className="m31-skel" style={{ height: '10px', width: '80px', borderRadius: TOKENS.radius.sm, marginBottom: '10px' }} />
      <div className="m31-skel" style={{ height: '24px', width: '60px', borderRadius: TOKENS.radius.sm, marginBottom: '6px' }} />
      <div className="m31-skel" style={{ height: '11px', width: '100px', borderRadius: TOKENS.radius.sm }} />
    </div>
  );
}

export default Skeleton;