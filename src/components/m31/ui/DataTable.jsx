/**
 * DataTable — ÚNICA tabela canônica do M31.
 *
 * Substitui as ~8 variações de tabela manual (Inscrições, Transações,
 * Auditoria, Tarefas, Fornecedores, Caravanas, etc).
 *
 * Colunas: [{ key, label, render?(row), sortable?, sortValue?(row), width?, align? }]
 * Auto-render: SkeletonRow quando loading, EmptyState quando vazio.
 *
 * Props:
 *  columns      — array de config de coluna [{ key, label, render?, hideOnMobile?, ... }]
 *  data         — array de registros
 *  loading      — boolean (mostra skeleton)
 *  onRowClick   — (row) => void
 *  emptyTitle   — título do EmptyState
 *  emptyDesc    — descrição do EmptyState
 *  emptyIcon    — ícone lucide do EmptyState
 *  emptyAction  — elemento React (CTA do EmptyState)
 *  pagination   — { page, pageSize, total, onPageChange } | null
 *  stickyHeader — boolean (header fixo no scroll vertical)
 */
import { TOKENS } from '@/lib/m31DesignTokens';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import EmptyState from './EmptyState';

export default function DataTable({
  columns = [],
  data = [],
  loading = false,
  onRowClick,
  emptyTitle = 'Nada por aqui',
  emptyDesc,
  emptyIcon,
  emptyAction,
  pagination = null,
  stickyHeader = false,
  rowKeyField = 'id',
}) {
  const hasData = data.length > 0;

  // ── Empty / Loading states ──
  if (loading) {
    return (
      <TableShell>
        <thead>{renderHeader(columns, { sortable: false })}</thead>
        <tbody>
          {Array.from({ length: 8 }).map((_, i) => (
            <tr key={i}>
              {columns.map((col, ci) => (
                <td key={ci} className={col.hideOnMobile ? 'm31-dt-hide-mobile' : ''} style={cellStyle(col)}>
                  <div className="m31-skel" style={{ height: '12px', width: '70%', borderRadius: TOKENS.radius.sm }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <SkeletonStyle />
      </TableShell>
    );
  }

  if (!hasData) {
    return (
      <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: TOKENS.radius.lg, background: TOKENS.surface }}>
        <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDesc} action={emptyAction} />
      </div>
    );
  }

  // ── Render ──
  return (
    <TableShell stickyHeader={stickyHeader}>
      {renderHeader(columns, { sortable: true })}
      <tbody>
        {data.map((row, ri) => (
          <tr
            key={row[rowKeyField] || ri}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            style={{
              cursor: onRowClick ? 'pointer' : 'default',
              borderBottom: ri < data.length - 1 ? `1px solid ${TOKENS.borderSubtle}` : 'none',
              transition: `background ${TOKENS.transition.atomic}`,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = TOKENS.surfaceHover; }}
            onMouseLeave={e => { e.currentTarget.style.background = ri % 2 === 1 ? TOKENS.surfaceSubtle : 'transparent'; }}
          >
            {columns.map((col, ci) => (
              <td key={ci} className={col.hideOnMobile ? 'm31-dt-hide-mobile' : ''} style={cellStyle(col)}>
                {col.render ? col.render(row) : (row[col.key] ?? '—')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

// ── Sub-componentes ──────────────────────────────────────────

function TableShell({ children, stickyHeader }) {
  return (
    <div style={{
      border: `1px solid ${TOKENS.border}`,
      borderRadius: TOKENS.radius.lg,
      background: TOKENS.surface,
      overflow: 'hidden',
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse',
          fontFamily: TOKENS.font.body, fontSize: '13px',
        }}>
          {children}
        </table>
      </div>
      <SkeletonStyle />
    </div>
  );
}

function renderHeader(columns, { sortable }) {
  return (
    <thead>
      <tr style={{ background: TOKENS.surfaceSubtle }}>
        {columns.map((col, ci) => (
          <th key={ci} className={col.hideOnMobile ? 'm31-dt-hide-mobile' : ''} style={{
            ...cellStyle(col),
            textAlign: col.align || 'left',
            fontSize: '11px', fontWeight: '700',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: TOKENS.textSubtle,
            borderBottom: `1px solid ${TOKENS.border}`,
            whiteSpace: 'nowrap',
          }}>
            {col.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function cellStyle(col) {
  return {
    padding: '10px 14px',
    textAlign: col.align || 'left',
    width: col.width,
    maxWidth: col.maxWidth,
    verticalAlign: 'middle',
    color: TOKENS.text,
  };
}

// ── Paginação (inline — acoplada à tabela) ───────────────────

export function DataTablePagination({ page, pageSize, total, onPageChange }) {
  if (!total || total === 0) return null;
  const totalPages = Math.ceil(total / pageSize);
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px', borderTop: `1px solid ${TOKENS.borderSubtle}`,
      fontSize: '12px', color: TOKENS.textMuted, fontFamily: TOKENS.font.body,
    }}>
      <span>
        {from}–{to} de {total}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          style={pageBtnStyle(page <= 1)}
        >
          <ChevronLeft size={14} />
        </button>
        <span style={{ fontSize: '12px', fontWeight: '600', color: TOKENS.text, padding: '0 6px' }}>
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          style={pageBtnStyle(page >= totalPages)}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function pageBtnStyle(disabled) {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '28px', height: '28px', borderRadius: TOKENS.radius.sm,
    border: 'none', cursor: disabled ? 'default' : 'pointer',
    background: 'transparent', color: disabled ? TOKENS.textSubtle : TOKENS.text,
    transition: `background ${TOKENS.transition.atomic}`,
    opacity: disabled ? 0.4 : 1,
  };
}

// ── Skeleton style injection (evita import duplicado) ────────
function SkeletonStyle() {
  return (
    <style>{`
      @keyframes m31-shimmer { 0% { background-position: -800px 0; } 100% { background-position: 800px 0; } }
      .m31-skel { background: linear-gradient(90deg, ${TOKENS.surfaceSubtle} 0%, #eef0f3 50%, ${TOKENS.surfaceSubtle} 100%); background-size: 800px 100%; animation: m31-shimmer 1.4s infinite linear; }
      @media (max-width: 640px) { .m31-dt-hide-mobile { display: none !important; } }
    `}</style>
  );
}