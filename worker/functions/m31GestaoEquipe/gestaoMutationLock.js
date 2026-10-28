export const GESTAO_CREATE_LOCK_ID = '6adae9ba185a8e81d260eb2e';
export const GESTAO_CREATE_LOCK_KEY = 'GESTAO:CADASTROS:CAS:v1';

function failure(status, code, message) { return Object.assign(new Error(message), { status, code }); }

export async function withGestaoCreateLock(client, callback) {
  const E = client.asServiceRole.entities.M31AutomacaoLock;
  let lock = await E.get(GESTAO_CREATE_LOCK_ID).catch(() => null);
  if (!lock) {
    lock = await E.create({
      id: GESTAO_CREATE_LOCK_ID,
      chave: GESTAO_CREATE_LOCK_KEY,
      ativo: false,
      criado_em: new Date().toISOString()
    }).catch(() => null);
  }
  if (!lock || lock.chave !== GESTAO_CREATE_LOCK_KEY) {
    throw failure(503, 'CREATE_NOT_READY', 'Cadastro temporariamente indisponível. Atualize a página.');
  }
  const execution = crypto.randomUUID();
  const claim = await E.updateMany({ id: GESTAO_CREATE_LOCK_ID, ativo: false }, { $set: { ativo: true, execution_id: execution, criado_em: new Date().toISOString() } });
  if (claim.updated !== 1) {
    throw failure(409, 'CREATE_BUSY', 'Outro cadastro está em processamento. Atualize a lista antes de tentar novamente.');
  }
  let attempted = false;
  try {
    const result = await callback(() => { attempted = true; });
    const release = await E.updateMany({ id: GESTAO_CREATE_LOCK_ID, ativo: true, execution_id: execution }, { $set: { ativo: false } });
    if (release.updated !== 1) throw failure(503, 'CREATE_RESULT_UNCERTAIN', 'Confira o resultado na lista antes de tentar novamente.');
    return result;
  } catch (error) {
    if (!attempted) {
      await E.updateMany({ id: GESTAO_CREATE_LOCK_ID, ativo: true, execution_id: execution }, { $set: { ativo: false } }).catch(() => {});
    }
    throw error;
  }
}
