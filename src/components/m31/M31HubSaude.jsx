/**
 * M31HubSaude — Hub de Governança unificado.
 * Sub-abas: Saúde do Sistema · Garantias de Entrega · Central de Alertas
 */
import { useState } from 'react';
import { TOKENS } from '@/lib/m31DesignTokens';
import { Activity, ShieldCheck, AlertCircle } from 'lucide-react';
import M31PainelSaude from '@/components/m31/M31PainelSaude';
import M31PainelSaudeOperacional from '@/components/m31/M31PainelSaudeOperacional';
import M31AlertasOperacionais from '@/components/m31/M31AlertasOperacionais';

const SUB_TABS = [
  { id: 'saude',    label: 'Saúde do Sistema',  icon: Activity },
  { id: 'garantias', label: 'Garantias de Entrega', icon: ShieldCheck },
  { id: 'alertas',  label: 'Central de Alertas', icon: AlertCircle },
];

export default function M31HubSaude({ alertCount = 0 }) {
  const [subTab, setSubTab] = useState('saude');

  return (
    <div>
      {/* Sub-tab navigation */}
      <div className="flex gap-1 mb-5 border-b border-border overflow-x-auto scrollbar-none">
        {SUB_TABS.map(st => {
          const active = subTab === st.id;
          const Icon = st.icon;
          return (
            <button
              key={st.id}
              onClick={() => setSubTab(st.id)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors"
              style={{
                color: active ? TOKENS.primary : TOKENS.textMuted,
                borderColor: active ? TOKENS.primary : 'transparent',
                fontFamily: TOKENS.font.body,
                fontWeight: active ? 600 : 500,
              }}
            >
              <Icon size={15} color={active ? TOKENS.primary : TOKENS.textMuted} />
              {st.label}
              {st.id === 'alertas' && alertCount > 0 && (
                <span
                  className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                  style={{
                    background: TOKENS.warningSoft,
                    color: TOKENS.warning,
                    minWidth: '18px',
                    textAlign: 'center',
                  }}
                >
                  {alertCount > 99 ? '99+' : alertCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div>
        {subTab === 'saude' && <M31PainelSaude />}
        {subTab === 'garantias' && <M31PainelSaudeOperacional />}
        {subTab === 'alertas' && <M31AlertasOperacionais />}
      </div>
    </div>
  );
}