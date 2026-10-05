import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const fields = ['nome', 'whatsapp', 'email', 'cpf', 'cidade', 'estado'];
const labels = { nome: 'Nome', whatsapp: 'WhatsApp com DDD', email: 'E-mail', cpf: 'CPF', cidade: 'Cidade', estado: 'Estado (UF)' };

export default function M31ParticipanteOperacao({ participante, sessionId, caravanas = [], podeCaravana, onDone }) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState('');
  const [form, setForm] = useState({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  function open(value) {
    setAction(value); setError('');
    setForm(value === 'editar_participante' ? Object.fromEntries(fields.map(field => [field, participante[field] || ''])) : {});
  }
  async function save(event) {
    event.preventDefault(); setPending(true); setError('');
    try {
      await base44.functions.invoke('m31OperarParticipante', { session_id: sessionId, inscricao_id: participante.id, expected_updated_date: participante.updated_date, action, ...form, notificar: false });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['m31-operational-list'] }),
        queryClient.invalidateQueries({ queryKey: ['m31-operational-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['m31_stats_inscricoes'] }),
      ]);
      onDone();
    } catch (err) { setError(err?.response?.data?.message || err?.response?.data?.error || 'Não foi possível salvar. Atualize a lista e tente novamente.'); }
    finally { setPending(false); }
  }
  return <section className="space-y-3 border-t border-m31-border pt-4">
    {!action ? <div className="grid gap-2">
      <button className="min-h-12 rounded-xl bg-m31-primary px-4 font-bold text-white" onClick={() => open('editar_participante')}>Editar dados</button>
      <button className="min-h-12 rounded-xl border border-m31-border px-4 font-bold text-m31-primary" onClick={() => open('substituir_titular')}>Substituir participante</button>
      {podeCaravana && <button className="min-h-12 rounded-xl border border-m31-border px-4 font-bold text-m31-primary" onClick={() => open(participante.caravana_id ? 'mover_caravana' : 'incluir_caravana')}>Organizar caravana</button>}
      {podeCaravana && participante.caravana_id && <button className="min-h-12 rounded-xl border border-m31-border px-4 font-bold text-m31-primary" onClick={() => open('retirar_caravana')}>Retirar da caravana</button>}
    </div> : <form onSubmit={save} className="space-y-3">
      <p className="text-sm text-m31-text-muted">O pagamento e o QR Code da vaga serão preservados. Nenhuma mensagem será enviada ao salvar.</p>
      {['editar_participante', 'substituir_titular'].includes(action) ? fields.map(field => <label key={field} className="block text-sm font-semibold">{labels[field]}<input required={field === 'nome'} value={form[field] || ''} onChange={event => setForm(value => ({ ...value, [field]: event.target.value }))} className="mt-1 h-12 w-full rounded-xl border border-m31-border px-3" /></label>) : action === 'retirar_caravana' ? <p className="text-sm">A participante continuará inscrita como público geral.</p> : <label className="block text-sm font-semibold">Caravana de destino<select required value={form.caravana_destino_id || ''} onChange={event => setForm({ caravana_destino_id: event.target.value })} className="mt-1 h-12 w-full rounded-xl border border-m31-border px-3"><option value="">Selecione</option>{caravanas.map(caravana => <option key={caravana.id} value={caravana.id}>{caravana.nome}</option>)}</select></label>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="grid grid-cols-2 gap-2"><button type="button" disabled={pending} onClick={() => setAction('')} className="min-h-12 rounded-xl border border-m31-border">Cancelar</button><button disabled={pending} className="min-h-12 rounded-xl bg-m31-primary font-bold text-white">{pending ? 'Salvando…' : 'Salvar alteração'}</button></div>
    </form>}
  </section>;
}
