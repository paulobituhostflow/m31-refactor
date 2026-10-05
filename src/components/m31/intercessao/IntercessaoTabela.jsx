
const LABEL = {
  aprovado: 'Pago',
  gratuito: 'Gratuito',
  pendente: 'Pendente',
  checkout_pendente: 'Checkout pendente',
  checkout_abandonado: 'Checkout abandonado',
  cancelado: 'Cancelado',
  sem_inscricao: 'Sem inscrição',
  sem_cadastro: 'Sem cadastro',
};

export default function IntercessaoTabela({ linhas }) {
  if (!linhas?.length) {
    return <p className="text-sm text-muted-foreground p-6 text-center">Nenhum registro nesta lista.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-caption text-muted-foreground border-b border-border">
            <th className="py-2 px-3">Nome</th>
            <th className="py-2 px-3">WhatsApp</th>
            <th className="py-2 px-3">Situação</th>
            <th className="py-2 px-3">Camisa</th>
            <th className="py-2 px-3">Setor</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={`${l.telefone}-${i}`} className="border-b border-border/60">
              <td className="py-2 px-3 font-medium">{l.nome || l.nome_whatsapp || '—'}</td>
              <td className="py-2 px-3 font-mono text-xs">{l.telefone}</td>
              <td className="py-2 px-3">{LABEL[l.status_pagamento] || l.status_pagamento}</td>
              <td className="py-2 px-3">{l.camisa || '—'}</td>
              <td className="py-2 px-3">{l.setor || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}