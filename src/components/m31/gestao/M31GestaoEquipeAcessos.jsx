import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { gestaoRequest } from '@/lib/m31GestaoApi';
import './M31GestaoEquipeAcessos.css';

const AREAS = [['inscritas', 'Inscritas'], ['voluntarias', 'Voluntárias'], ['caravanas', 'Caravanas'], ['camisas', 'Camisas']];
const EMPTY = { nome: '', user_email: '', whatsapp: '', gestao_acesso_modo: 'consulta', gestao_areas: [] };
const INVITE_LABELS = { nao_enviado: 'Não enviado', enviando: 'Envio em andamento', enviado: 'Enviado pelo sistema', falha: 'Falha no envio', incerto: 'Resultado em verificação' };

async function requestEquipe(payload) {
  return gestaoRequest('m31GestaoEquipe', payload);
}

function dateLabel(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function M31GestaoEquipeAcessos({ sessionId }) {
  const uid = useId();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(null);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    try {
      const data = await requestEquipe({ action: 'listar', session_id: sessionId });
      if (sequence === loadSequence.current) setItems(data.items || []);
    } catch (failure) {
      if (sequence === loadSequence.current) setError(failure.message);
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    setItems([]);
    setForm(null);
    setEditing(null);
    setError('');
    load();
    return () => { loadSequence.current += 1; };
  }, [load]);

  async function mutate(payload, successText) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await requestEquipe({ ...payload, session_id: sessionId });
      setNotice(result.warning || (result.convite_resultado === 'incerto' ? 'O envio do convite está em verificação. Não reenvie até conferir o resultado.'
        : result.convite_resultado === 'falha' ? 'Não foi possível confirmar o envio do convite. O membro continua cadastrado.' : successText));
      if (payload.action === 'salvar') {
        setForm(null);
        setEditing(null);
      }
      await load();
    } catch (failure) {
      setError(failure.message);
      await load();
    } finally {
      setBusy(false);
    }
  }

  function edit(item) {
    setError('');
    setNotice('');
    setEditing(item);
    setForm({
      nome: item.nome || '',
      user_email: item.user_email || '',
      whatsapp: item.whatsapp || '',
      gestao_acesso_modo: item.gestao_acesso_modo || 'consulta',
      gestao_areas: [...(item.gestao_areas || [])]
    });
  }

  function sendInvite(item) {
    const resend = item.gestao_convite_status === 'enviado';
    if (resend && !window.confirm(`Reenviar o convite de acesso para ${item.user_email}?`)) return;
    mutate({ action: 'convidar', id: item.id, expected_version: item.updated_date, confirm_resend: resend }, 'Convite enviado. O primeiro acesso ainda precisa ser confirmado.');
  }

  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  const filtered = items.filter((item) => `${item.nome || ''} ${item.user_email || ''}`.toLocaleLowerCase('pt-BR').includes(normalizedSearch));

  return (
    <section className="m31-gestao-equipe" aria-labelledby={`${uid}-title`}>
      <div className="m31-gestao-equipe__heading">
        <div>
          <h2 id={`${uid}-title`}>Equipe</h2>
          <p>Cada pessoa entra com sua própria conta.</p>
        </div>
        <div className="m31-gestao-equipe__actions">
          <button type="button" disabled={busy || loading} onClick={() => { setError(''); load(); }}>Atualizar lista</button>
          <button type="button" className="is-primary" disabled={busy} onClick={() => { setEditing(null); setForm({ ...EMPTY, gestao_areas: [] }); setError(''); setNotice(''); }}>Adicionar acesso</button>
        </div>
      </div>

      {error && <div role="alert" className="m31-gestao-equipe__error">{error}</div>}
      {notice && <div role="status" className="m31-gestao-equipe__notice">{notice}</div>}

      {form && (
        <form className="m31-gestao-equipe__form" onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          mutate({ action: 'salvar', ...(editing ? { id: editing.id, expected_version: editing.updated_date } : {}), fields: form }, editing ? 'Permissões atualizadas. As próximas ações já usam o acesso atual.' : 'Membro cadastrado. O convite ainda não foi enviado.');
        }}>
          <h3>{editing ? 'Editar acesso' : 'Novo acesso'}</h3>
          <div className="m31-gestao-equipe__fields">
            <label htmlFor={`${uid}-nome`}>Nome completo<input id={`${uid}-nome`} required minLength={3} maxLength={160} value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} disabled={busy} autoComplete="name" /></label>
            <label htmlFor={`${uid}-email`}>E-mail do login<input id={`${uid}-email`} required type="email" maxLength={254} value={form.user_email} onChange={(e) => setForm((p) => ({ ...p, user_email: e.target.value }))} disabled={busy || Boolean(editing)} autoComplete="email" /></label>
            <label htmlFor={`${uid}-whatsapp`}>WhatsApp <span>(opcional)</span><input id={`${uid}-whatsapp`} type="tel" value={form.whatsapp} onChange={(e) => setForm((p) => ({ ...p, whatsapp: e.target.value }))} disabled={busy} autoComplete="tel" /></label>
          </div>
          <fieldset disabled={busy}>
            <legend>Permissão</legend>
            <div className="m31-gestao-equipe__choices">
              <label><input type="radio" name={`${uid}-modo`} value="consulta" checked={form.gestao_acesso_modo === 'consulta'} onChange={() => setForm((p) => ({ ...p, gestao_acesso_modo: 'consulta' }))} /><span><strong>Consulta</strong><small>Ver os dados das áreas escolhidas.</small></span></label>
              <label><input type="radio" name={`${uid}-modo`} value="operacao" checked={form.gestao_acesso_modo === 'operacao'} onChange={() => setForm((p) => ({ ...p, gestao_acesso_modo: 'operacao' }))} /><span><strong>Operação</strong><small>Consultar e executar as ações operacionais permitidas.</small></span></label>
            </div>
          </fieldset>
          <fieldset disabled={busy}>
            <legend>Áreas</legend>
            <div className="m31-gestao-equipe__choices m31-gestao-equipe__areas">
              {AREAS.map(([area, title]) => (
                <label key={area}>
                  <input type="checkbox" checked={form.gestao_areas.includes(area)} onChange={(e) => setForm((p) => ({ ...p, gestao_areas: e.target.checked ? [...p.gestao_areas, area] : p.gestao_areas.filter((item) => item !== area) }))} />
                  <span>{title}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="m31-gestao-equipe__hint">Este acesso não concede financeiro ou administração.</p>
          {editing?.acesso_legado && <p className="m31-gestao-equipe__hint">Ao salvar, este membro passa a usar somente o modo e as áreas escolhidos acima.</p>}
          <div className="m31-gestao-equipe__actions">
            <button type="submit" className="is-primary" disabled={busy || form.gestao_areas.length === 0}>{busy ? 'Salvando…' : 'Salvar acesso'}</button>
            <button type="button" disabled={busy} onClick={() => { setForm(null); setEditing(null); }}>Cancelar</button>
          </div>
        </form>
      )}

      <label className="m31-gestao-equipe__search" htmlFor={`${uid}-search`}>
        Buscar na equipe
        <input id={`${uid}-search`} type="search" placeholder="Nome ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      {loading ? <p role="status">Carregando acessos…</p> : (
        <>
          <p className="m31-gestao-equipe__count">{filtered.length} de {items.length} {items.length === 1 ? 'acesso' : 'acessos'}</p>
          {filtered.length === 0 && !error && <p className="m31-gestao-equipe__empty">{search ? 'Nenhum acesso encontrado para esta busca.' : 'Nenhum acesso cadastrado.'}</p>}
          <div className="m31-gestao-equipe__list">
            {filtered.map((item) => (
              <article className="m31-gestao-equipe__card" key={item.id}>
                <div className="m31-gestao-equipe__person">
                  <h3>{item.nome || 'Nome não informado'}</h3>
                  <p>{item.user_email}</p>
                  <span className={`m31-gestao-equipe__badge${item.ativo ? '' : ' is-inactive'}`}>{item.ativo ? 'Acesso ativo' : 'Acesso desativado'}</span>
                </div>
                <div className="m31-gestao-equipe__scope">
                  <strong>{item.protegido ? 'Acesso administrativo protegido' : item.gestao_acesso_modo === 'operacao' ? 'Operação' : item.gestao_acesso_modo === 'consulta' ? 'Consulta' : 'Permissões existentes'}</strong>
                  <p>{item.gestao_areas.length ? AREAS.filter(([area]) => item.gestao_areas.includes(area)).map(([, title]) => title).join(' · ') : 'Áreas não configuradas nesta Gestão'}</p>
                </div>
                <dl className="m31-gestao-equipe__states">
                  <div><dt>Cadastro</dt><dd>Membro cadastrado</dd></div>
                  <div><dt>Convite</dt><dd>{INVITE_LABELS[item.gestao_convite_status] || 'Não confirmado'}{item.gestao_convite_enviado_em && <small>{dateLabel(item.gestao_convite_enviado_em)}</small>}</dd></div>
                  <div><dt>Login</dt><dd>{item.login_status === 'confirmado' ? 'Acesso autenticado confirmado' : item.login_status === 'indisponivel' ? 'Conta indisponível' : 'Primeiro acesso não confirmado'}{item.gestao_login_confirmado_em && <small>{dateLabel(item.gestao_login_confirmado_em)}</small>}</dd></div>
                </dl>
                {!item.protegido && (
                  <div className="m31-gestao-equipe__actions">
                    <button type="button" disabled={busy} onClick={() => edit(item)}>Editar acesso</button>
                    <button type="button" disabled={busy || !item.ativo || ['enviando', 'incerto'].includes(item.gestao_convite_status)} onClick={() => sendInvite(item)}>{item.gestao_convite_status === 'enviado' ? 'Reenviar convite' : 'Enviar convite'}</button>
                    <button type="button" disabled={busy} onClick={() => mutate({ action: 'definir_ativo', id: item.id, expected_version: item.updated_date, ativo: !item.ativo }, item.ativo ? 'Acesso desativado. Novas ações serão bloqueadas.' : 'Acesso ativado.')}>{item.ativo ? 'Desativar acesso' : 'Ativar acesso'}</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
