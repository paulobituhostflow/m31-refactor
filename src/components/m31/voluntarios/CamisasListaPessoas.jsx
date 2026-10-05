import { PAGAMENTO_CFG, DIVERGENCIA_LABEL } from '@/lib/m31VoluntariaConsolidado';

const CHIP = {
  pago: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  isento: 'bg-blue-50 text-blue-700 border-blue-200',
  pendente: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelado: 'bg-muted text-muted-foreground border-border',
};

/** Lista consolidada: uma linha por PESSOA. */
export default function CamisasListaPessoas({ pessoas }) {
  if (pessoas.length === 0) {
    return (
      <div className="bg-card border border-border rounded-card p-8 text-center text-sm text-muted-foreground">
        Nenhuma voluntária com esses filtros.
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-card divide-y divide-border">
      {pessoas.map((p) => (
        <div key={p.id} className="p-4 flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-[180px]">
            <div className="text-title text-foreground">{p.nome}</div>
            <div className="text-sm text-muted-foreground">
              {p.whatsapp || '—'}{p.setor ? ` · ${p.setor}` : ''}{p.codigo ? ` · ${p.codigo}` : ''}
            </div>
            {p.divergencias.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {p.divergencias.map((d) => (
                  <span key={d} className="text-micro px-2 py-0.5 rounded-pill bg-amber-50 text-amber-700 border border-amber-200">
                    {DIVERGENCIA_LABEL[d]}
                    {d === 'camisa_conflitante' && p.tamanhos_conflitantes.length
                      ? `: ${p.tamanhos_conflitantes.join(' / ')}` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-micro px-2 py-1 rounded-pill border ${CHIP[p.pagamento]}`}>
              {PAGAMENTO_CFG[p.pagamento].label}
            </span>
            <span className={`text-micro px-2 py-1 rounded-pill border ${p.tamanho ? 'bg-secondary text-foreground border-border' : 'bg-muted text-muted-foreground border-border'}`}>
              {p.tamanho ? `Camisa ${p.tamanho}` : 'Camisa não informada'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}