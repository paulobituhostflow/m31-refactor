/**
 * espelhoService — Espelho PRIVADO de auditoria das cartinhas no Google Sheets.
 *
 * O Base44 permanece a ÚNICA autoridade operacional. A planilha é somente
 * histórico de auditoria e recuperação: NADA volta dela para as cartas
 * (nenhuma importação automática, em nenhuma circunstância).
 *
 * Reuso das estruturas existentes — nenhuma fila nova:
 *   - fonte: EventoM31Inscricao.cartinha_espelho_pendente (gravado no MESMO
 *     update da carta) + eventos de cartinha_historico com id_transacao
 *     (salvamentos) ou transferencia_id (transferências de titular).
 *   - confirmação: campo espelhado_em adicionado ao próprio evento privado.
 *
 * Idempotência real (não apenas "lookup + append"):
 *   1. Lock global (M31AutomacaoLock) serializa execuções concorrentes.
 *   2. Antes de anexar, lê a coluna de identificadores da planilha.
 *   3. Anexa somente eventos ausentes, com valueInputOption=RAW (texto nunca
 *      é interpretado como fórmula).
 *   4. Reconcilia: releitura da coluna confirma o que caiu na planilha — só
 *      então marca espelhado_em. Timeout/incerteza não marca nada; a próxima
 *      execução decide pela releitura (anexo determinístico, nunca às cegas).
 *   5. A marcação no Base44 é condicional à versão da carta: salvamento
 *      concorrente adia a confirmação para a próxima execução — o evento
 *      nunca se perde nem duplica.
 *
 * Falha no Google NUNCA impede o salvamento no Base44: o processamento vive
 * FORA do caminho do autosave, acionado por workflow agendado ou pela gestão.
 *
 * Privacidade: a linha registra identificador, inscrição, titular_ref (hash),
 * versão, data/hora, autora, tipo de alteração, status, texto e hash.
 * NUNCA exporta CPF, tokens, senhas ou dados financeiros — nem em logs.
 */

export const NOME_PLANILHA = 'M31 — Espelho Privado Cartinhas';
export const ABA_EVENTOS = 'Eventos';
export const CABECALHO = ['id_transacao', 'inscricao_id', 'titular_ref', 'versao', 'data_hora', 'autora', 'tipo_alteracao', 'status', 'texto', 'hash', 'tipo_destinataria', 'nome_completo', 'primeiro_nome', 'assinatura', 'tipo_mensagem', 'audio_uri', 'forma_operacao', 'canal_operacao', 'conclusao_explicita', 'ciclo_recife'];

const LOCK_CHAVE = 'CARTINHA_ESPELHO:SHEETS';
const LOCK_TTL_MS = 4 * 60 * 1000;

const mc = res => res?.updated ?? res?.modified_count ?? res?.modifiedCount ?? 0;

/** Identificador determinístico do evento: UUID do salvamento ou id da transferência. */
export function identificadorEvento(evento) {
  if (!evento) return null;
  if (evento.id_transacao) return evento.id_transacao;
  if (evento.transferencia_id) return `transferencia:${evento.transferencia_id}`;
  return null;
}

/** Eventos ainda não confirmados na planilha (fonte única: histórico privado). */
export function eventosParaEspelhar(row) {
  return (row?.cartinha_historico || []).filter(e => identificadorEvento(e) && !e.espelhado_em);
}

/** Linha da planilha — sem CPF, telefone, e-mail, token ou dado financeiro. */
export function linhaEvento(evento, inscricaoId) {
  const id = identificadorEvento(evento);
  const transferencia = !evento.id_transacao && !!evento.transferencia_id;
  return [
    id,
    inscricaoId,
    evento.titular_ref || '',
    evento.versao ?? '',
    evento.atualizada_em || evento.arquivada_em || '',
    evento.responsavel || '',
    transferencia ? 'transferencia' : (evento.motivo || 'salvamento'),
    evento.status || '',
    evento.texto || '',
    evento.request_hash || '',
    evento.tipo_destinataria || '',
    evento.nome_destinataria || '', // histórico antigo sem este campo não recebe inferência retroativa
    evento.primeiro_nome || '',
    evento.assinatura || '',
    evento.tipo_mensagem || '',
    evento.audio_uri || '', // referência privada; nunca URL pública permanente
    evento.forma_operacao || evento.origem || (evento.lote_id ? 'lote_legado' : 'editor_legado'),
    evento.canal_operacao || 'legado_sem_canal_registrado',
    evento.conclusao_explicita === true ? 'SIM' : 'NAO',
    evento.ciclo_conclusao || '',
  ];
}

export async function resolverPlanilha(drive) {
  const existente = await drive.buscarPlanilha();
  if (existente) return existente;
  return drive.criarPlanilha();
}

async function adquirirLock(S, executionId, agora) {
  const ativos = await S.M31AutomacaoLock.filter({ chave: LOCK_CHAVE, ativo: true }).catch(() => []);
  const vivo = (ativos || []).find(l => l.expira_em && new Date(l.expira_em) > new Date());
  if (vivo) return false; // outra execução em andamento — a próxima reconcilia
  if ((ativos || []).length > 0) {
    await S.M31AutomacaoLock.updateMany({ chave: LOCK_CHAVE, ativo: true }, { $set: { ativo: false } }).catch(() => {});
  }
  try {
    await S.M31AutomacaoLock.create({
      chave: LOCK_CHAVE, ativo: true, execution_id: executionId,
      criado_em: agora(), expira_em: new Date(Date.now() + LOCK_TTL_MS).toISOString(),
    });
    return true;
  } catch { return false; }
}

async function liberarLock(S, executionId) {
  await S.M31AutomacaoLock.updateMany(
    { chave: LOCK_CHAVE, execution_id: executionId }, { $set: { ativo: false } }).catch(() => {});
}

const versionQuery = version => version === 0
  ? { $or: [{ cartinha_versao: 0 }, { cartinha_versao: null }, { cartinha_versao: { $exists: false } }] }
  : { cartinha_versao: version };

/**
 * Processa o lote atual de pendências. Cada execução é autossuficiente e
 * reconciliável: interrompê-la em qualquer ponto nunca duplica nem perde eventos.
 */
export async function processarEspelho({ S, drive, sheets, agora = () => new Date().toISOString(), lote = 100 }) {
  const planilha = await resolverPlanilha(drive);
  await sheets.garantirEstrutura(planilha.id);
  const resumo = { nome: planilha.nome, id: planilha.id, link: planilha.link };

  const executionId = crypto.randomUUID();
  if (!(await adquirirLock(S, executionId, agora))) return { ok: true, situacao: 'lock_ocupado', planilha: resumo };
  try {
    const pendentes = await S.EventoM31Inscricao.filter({ cartinha_espelho_pendente: true }, '-updated_date', lote);
    if (!pendentes.length) return { ok: true, situacao: 'sem_pendencias', planilha: resumo };

    const idsAntes = new Set(await sheets.lerIds(planilha.id));
    // Todos os pendentes entram: quem tem eventos novos (anexo), quem aguarda
    // confirmação de anexo incerto (reconciliação) e quem só precisa de limpeza.
    const alvos = pendentes
      .map(row => ({ row, eventos: eventosParaEspelhar(row).filter(e => !idsAntes.has(identificadorEvento(e))) }));

    const linhas = alvos.flatMap(alvo => alvo.eventos.map(e => linhaEvento(e, alvo.row.id)));
    let confirmados;
    try {
      if (linhas.length) await sheets.anexar(planilha.id, linhas); // valueInputOption=RAW no cliente
      confirmados = new Set(await sheets.lerIds(planilha.id));
    } catch (error) {
      // Resultado incerto: NADA é marcado. A releitura da próxima execução decide.
      return { ok: false, situacao: 'espelho_indisponivel', planilha: resumo, erro: error?.message || 'espelho_indisponivel' };
    }

    const resultado = { ok: true, situacao: 'processado', espelhados: 0, confirmadas: 0, limpas: 0, adiadas: 0, pendentes_no_lote: pendentes.length, planilha: resumo };
    for (const { row } of alvos) {
      const fresh = await S.EventoM31Inscricao.get(row.id);
      if (!fresh) continue;
      const anterior = fresh.cartinha_historico || [];
      const historico = anterior.map(e =>
        (!e.espelhado_em && confirmados.has(identificadorEvento(e) || '')) ? { ...e, espelhado_em: agora() } : e);
      const novos = historico.filter((e, i) => e.espelhado_em && !anterior[i]?.espelhado_em).length;
      const restaPendente = eventosParaEspelhar({ cartinha_historico: historico }).length > 0;
      if (!novos && (fresh.cartinha_espelho_pendente !== true || restaPendente)) continue;

      const res = await S.EventoM31Inscricao.updateMany(
        { id: fresh.id, ...versionQuery(fresh.cartinha_versao ?? 0) },
        { $set: { cartinha_historico: historico, cartinha_espelho_pendente: restaPendente } });
      if (mc(res) === 1) {
        resultado.espelhados += novos;
        if (restaPendente) resultado.confirmadas++;
        else resultado.limpas++;
      } else {
        // Salvamento concorrente mudou a carta: confirmação fica para a próxima
        // execução — dedup pela coluna de identificadores garante ausência de duplicatas.
        resultado.adiadas++;
      }
    }
    return resultado;
  } finally {
    await liberarLock(S, executionId);
  }
}