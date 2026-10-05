/**
 * PendenciaTable — Tabela desktop com colunas fixas, scroll horizontal e ordenação.
 */
import { useState } from 'react';
import { TOKENS } from '@/lib/m31DesignTokens';
import { STATUS_LABELS, STATUS_COLORS, PRIORIDADE_COLORS, waMeUrl } from '@/hooks/useM31PendenciasConciliacao';
import { ArrowUpDown, MessageCircle } from 'lucide-react';

const fmtBRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
const fmtDate = (d) => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return '—'; } };

const MOTIVO_SHORT = {
  nome_incompleto: 'Nome', email_ausente: 'E-mail', email_invalido: 'E-mail inv.',
  whatsapp_ausente: 'WhatsApp', whatsapp_invalido: 'WhatsApp inv.', cpf_ausente: 'CPF', cpf_invalido: 'CPF inv.',
  cidade_uf_ausente: 'Cidade/UF', codigo_ausente: 'Código', origem_nao_identificada: 'Origem',
  gateway_nao_identificado: 'Gateway', aprovado_sem_transacao: 'Sem transação', valor_ausente: 'Sem valor',
  valor_divergente: 'Valor div.', pagamento_terceiro: '3º pagou', possivel_duplicidade: 'Duplicidade',
  presenteada_incompleta: 'Presenteada', pagamento_sem_confirmacao: 'Sem confirmação',
  confirmacao_sem_qr: 'Sem QR', qr_sem_envio: 'QR não enviado',
};

const COLS = [
  { key: 'nome', label: 'Nome', w: '180px', sortable: true },
  { key: 'whatsapp', label: 'WhatsApp', w: '120px' },
  { key: 'email', label: 'E-mail', w: '160px' },
  { key: 'cpf', label: 'CPF', w: '110px' },
  { key: 'cidade', label: 'Cidade/UF', w: '100px' },
  { key: 'tipo_inscricao', label: 'Tipo', w: '80px' },
  { key: 'gateway', label: 'Gateway', w: '80px' },
  { key: 'status_pagamento', label: 'Status Pag.', w: '90px' },
  { key: 'valor', label: 'Valor', w: '80px', sortable: true },
  { key: 'codigo_inscricao', label: 'Código', w: '100px' },
  { key: 'motivos', label: 'Motivos', w: '160px' },
  { key: 'prioridade', label: 'Prioridade', w: '70px', sortable: true },
  { key: 'status_analise', label: 'Status Análise', w: '130px' },
  { key: 'responsavel_revisao', label: 'Responsável', w: '120px' },
  { key: 'observacao', label: 'Observação', w: '140px' },
  { key: 'data_ultima_atualizacao', label: 'Atualizada', w: '90px', sortable: true },
];

export default function PendenciaTable({ pendencias, onRowClick }) {
  const [sortCol, setSortCol] = useState('prioridade');
  const [sortDir, setSortDir] = useState('asc');

  const sorted = [...pendencias].sort((a, b) => {
    let va = a[sortCol], vb = b[sortCol];
    if (sortCol === 'valor') { va = Number(va) || 0; vb = Number(vb) || 0; }
    else if (sortCol === 'data_ultima_atualizacao') { va = new Date(va || 0).getTime(); vb = new Date(vb || 0).getTime(); }
    else if (sortCol === 'prioridade') { const o = { alta: 0, media: 1, baixa: 2 }; va = o[va] ?? 3; vb = o[vb] ?? 3; }
    else { va = String(va || '').toLowerCase(); vb = String(vb || '').toLowerCase(); }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (key) => {
    if (sortCol === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortCol(key); setSortDir('asc'); }
  };

  if (!pendencias.length) {
    return (
      <div style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: TOKENS.radius.lg, padding: '40px', textAlign: 'center', boxShadow: TOKENS.shadowSm }}>
        <p style={{ fontSize: '14px', color: TOKENS.textMuted, margin: 0 }}>Nenhuma pendência encontrada com os filtros atuais.</p>
      </div>
    );
  }

  const tdBase = { padding: '7px 10px', fontSize: '12px', color: TOKENS.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: `1px solid ${TOKENS.borderSubtle}`, fontFamily: TOKENS.font.body };

  return (
    <div style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: TOKENS.radius.lg, overflow: 'hidden', boxShadow: TOKENS.shadowSm }}>
      <div style={{ overflowX: 'auto', maxHeight: '600px', overflowY: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              {COLS.map(c => (
                <th
                  key={c.key}
                  onClick={c.sortable ? () => handleSort(c.key) : undefined}
                  style={{
                    ...tdBase, fontWeight: '700', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em',
                    color: TOKENS.textSubtle, background: TOKENS.surfaceSubtle, minWidth: c.w, cursor: c.sortable ? 'pointer' : 'default',
                    userSelect: 'none',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                    {c.label}
                    {c.sortable && <ArrowUpDown size={10} color={sortCol === c.key ? TOKENS.primary : TOKENS.textSubtle} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, idx) => {
              const sc = STATUS_COLORS[p.status_analise] || STATUS_COLORS.pendente_analise;
              const pc = PRIORIDADE_COLORS[p.prioridade] || PRIORIDADE_COLORS.media;
              return (
                <tr
                  key={p.id}
                  onClick={() => onRowClick(p)}
                  style={{ cursor: 'pointer', background: idx % 2 === 0 ? TOKENS.surface : TOKENS.surfaceSubtle, transition: `background ${TOKENS.transition.atomic}` }}
                  onMouseEnter={e => e.currentTarget.style.background = TOKENS.surfaceHover}
                  onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? TOKENS.surface : TOKENS.surfaceSubtle}
                >
                  <td style={{ ...tdBase, fontWeight: '600', position: 'sticky', left: 0, background: idx % 2 === 0 ? TOKENS.surface : TOKENS.surfaceSubtle, zIndex: 1 }}>{p.nome || '—'}</td>
                  <td style={{ ...tdBase }}>
                    {p.whatsapp ? (
                      <a href={waMeUrl(p.whatsapp)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: TOKENS.text, fontWeight: '600', textDecoration: 'none' }}>
                        <MessageCircle size={11} color="#25D366" fill="#25D366" />{p.whatsapp}
                      </a>
                    ) : '—'}
                  </td>
                  <td style={{ ...tdBase }}>{p.email || '—'}</td>
                  <td style={{ ...tdBase }}>{p.cpf || '—'}</td>
                  <td style={{ ...tdBase }}>{[p.cidade, p.estado].filter(Boolean).join('/') || '—'}</td>
                  <td style={{ ...tdBase }}>{p.tipo_inscricao || '—'}</td>
                  <td style={{ ...tdBase }}>{p.gateway || '—'}</td>
                  <td style={{ ...tdBase }}>{p.status_pagamento || '—'}</td>
                  <td style={{ ...tdBase, fontWeight: '600' }}>{fmtBRL(p.valor)}</td>
                  <td style={{ ...tdBase, fontFamily: TOKENS.font.mono, fontSize: '11px' }}>{p.codigo_inscricao || '—'}</td>
                  <td style={{ ...tdBase }}>
                    <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                      {p.motivos.slice(0, 4).map((m, i) => {
                        const ok = (p.motivos_resolvidos || []).includes(m);
                        return (
                          <span key={i} style={{ padding: '1px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: '700', background: ok ? '#DCFCE7' : TOKENS.warningSoft, color: ok ? '#15803D' : TOKENS.warning }}>
                            {ok ? '✓ ' : ''}{MOTIVO_SHORT[m] || m}
                          </span>
                        );
                      })}
                      {p.motivos.length > 4 && <span style={{ fontSize: '9px', color: TOKENS.textMuted }}>+{p.motivos.length - 4}</span>}
                    </div>
                  </td>
                  <td style={{ ...tdBase }}>
                    <span style={{ padding: '2px 6px', borderRadius: TOKENS.radius.pill, fontSize: '9px', fontWeight: '700', background: pc.bg, color: pc.text, textTransform: 'uppercase' }}>{p.prioridade}</span>
                  </td>
                  <td style={{ ...tdBase }}>
                    <span style={{ padding: '2px 8px', borderRadius: TOKENS.radius.pill, fontSize: '10px', fontWeight: '700', background: sc.bg, color: sc.text }}>{STATUS_LABELS[p.status_analise]}</span>
                  </td>
                  <td style={{ ...tdBase }}>{p.responsavel_revisao || '—'}</td>
                  <td style={{ ...tdBase, color: TOKENS.textMuted, maxWidth: '140px' }}>{p.observacao || '—'}</td>
                  <td style={{ ...tdBase }}>{fmtDate(p.data_ultima_atualizacao)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}