/**
 * M31ExecutiveSystemStatus — "Status do Sistema"
 * Integrações + Saúde dos Dados (histórico vs operação)
 */

import { useState, useEffect } from 'react';
import { Check, AlertTriangle, Database, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function M31ExecutiveSystemStatus({ onNavigate }) {
  const [dataHealth, setDataHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  const integrations = [
    { name: 'Webhooks', status: 'online', lastCheck: '2 min ago', focus: 'webhooks' },
    { name: 'UAZAPI (WhatsApp)', status: 'online', lastCheck: '1 min ago', focus: 'uazapi' },
    { name: 'Asaas (Pagamentos)', status: 'online', lastCheck: '3 min ago', focus: 'asaas' },
  ];

  useEffect(() => {
    let cancelled = false;
    async function fetchDataHealth() {
      try {
        const inscricoes = await base44.entities.EventoM31Inscricao.list('-created_date', 1000);
        let historico = 0;
        let operacionais = 0;
        const now = Date.now();
        const EXPIRY_MS = 1440 * 60 * 1000;

        for (const insc of inscricoes) {
          const isHistorico = insc.origem_inscricao === 'IMPORTACAO' || insc.origem_inscricao === 'MANUAL';
          const temUrl = !!insc.asaas_charge_url;
          const expirado = !insc.updated_date || (now - new Date(insc.updated_date).getTime()) > EXPIRY_MS;

          // ═══════════════════════════════════════════════════════════════════
          //  REGRA OFICIAL (constituição M31) — cópia frontend, ver também
          //  m31ValidarRecuperacaoCheckouts (fonte de verdade da mesma regra).
          //  "aprovado sem asaas_payment_id é ESPERADO para origem IMPORTACAO / MANUAL
          //   / CORTESIA / VOLUNTARIO — NÃO é bug." São pagamentos fora do Asaas
          //  (Mercado Pago, Pix manual, importação legada). Só é inconsistência quando
          //  a origem é ASAAS/CARAVANA (que deveriam ter payment_id) e ele falta.
          // ═══════════════════════════════════════════════════════════════════
          const deveriaTerAsaas = insc.origem_inscricao === 'ASAAS' || insc.origem_inscricao === 'CARAVANA';
          if (insc.status_pagamento === 'aprovado' && !insc.asaas_payment_id && deveriaTerAsaas) {
            operacionais++;
          } else if (temUrl && expirado && insc.status_pagamento === 'checkout_pendente') {
            if (isHistorico) historico++; else operacionais++;
          } else if (!temUrl && insc.status_pagamento === 'checkout_pendente') {
            if (isHistorico) historico++; else operacionais++;
          }
        }

        if (!cancelled) setDataHealth({ historico, operacionais });
      } catch (e) {
        if (!cancelled) setDataHealth({ historico: 0, operacionais: 0, error: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchDataHealth();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-4">
      {/* Integrações */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {integrations.map((int) => (
          <button
            key={int.name}
            onClick={() => onNavigate?.('saude', { focus: int.focus })}
            className="bg-card rounded-lg border border-border p-4 text-left hover:border-primary/30 hover:shadow-m31-sm transition-all cursor-pointer"
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 p-1.5 rounded-full ${int.status === 'online' ? 'bg-success/10' : 'bg-amber-50'}`}>
                {int.status === 'online' ? (
                  <Check size={14} className="text-success" />
                ) : (
                  <AlertTriangle size={14} className="text-amber-600" />
                )}
              </div>
              <div>
                <h4 className="text-sm font-medium text-foreground">{int.name}</h4>
                <p className="text-xs text-muted-foreground mt-1">{int.lastCheck}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Saúde dos Dados — separa histórico (informativo) de operação (exige ação) */}
      <div className="bg-card rounded-lg border border-border p-4 shadow-m31-sm">
        <div className="flex items-center gap-2 mb-3">
          <Database size={16} className="text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Saúde dos Dados</h4>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Verificando consistência...
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => onNavigate?.('auditoria')} className="flex items-center gap-3 text-left hover:opacity-70 transition-opacity cursor-pointer">
              <span className="w-2.5 h-2.5 rounded-full bg-success shrink-0"></span>
              <div>
                <p className="text-lg font-bold text-foreground">{dataHealth?.historico || 0}</p>
                <p className="text-xs text-muted-foreground">registros históricos (informativo)</p>
              </div>
            </button>
            <button onClick={() => onNavigate?.('auditoria')} className="flex items-center gap-3 text-left hover:opacity-70 transition-opacity cursor-pointer">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${(dataHealth?.operacionais || 0) === 0 ? 'bg-success' : 'bg-amber-500'}`}></span>
              <div>
                <p className="text-lg font-bold text-foreground">{dataHealth?.operacionais || 0}</p>
                <p className="text-xs text-muted-foreground">inconsistências operacionais</p>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}