import { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Plus, AlertTriangle, Eye, RotateCcw, Save, Info } from 'lucide-react';
import {
  VARIAVEIS_CATALOGO,
  labelCategoria,
  validarConteudo,
  renderPreview,
} from './centralMensagensUtils';

/**
 * Editor de um template da Central de Mensagens.
 * Título, descrição do gatilho, campo de texto, tags clicáveis,
 * preview com dados de exemplo e validação que impede salvar tags inválidas.
 */
export default function CentralMensagensEditor({ template, userEmail, onClose, onSaved }) {
  const [content, setContent] = useState(template.content || '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const textareaRef = useRef(null);

  const permitidas = template.variaveis_permitidas && template.variaveis_permitidas.length > 0
    ? template.variaveis_permitidas
    : null;

  const tagsDisponiveis = VARIAVEIS_CATALOGO.filter(
    (v) => !permitidas || permitidas.includes(v.tag)
  );

  const { valido, invalidas } = validarConteudo(content, permitidas);
  const preview = renderPreview(content);
  const alterado = content !== (template.content || '');

  const inserirTag = (tag) => {
    const ta = textareaRef.current;
    const insert = `{{${tag}}}`;
    if (ta && typeof ta.selectionStart === 'number') {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const novo = content.slice(0, start) + insert + content.slice(end);
      setContent(novo);
      requestAnimationFrame(() => {
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + insert.length;
      });
    } else {
      setContent((c) => c + insert);
    }
  };

  const salvar = async () => {
    if (!valido) return;
    setSalvando(true);
    setErro(null);
    try {
      await base44.entities.M31MessageTemplate.update(template.id, {
        content,
        conteudo_anterior: template.content || '',
        alterado_por: userEmail || 'desconhecido',
        alterado_em: new Date().toISOString(),
      });
      onSaved?.();
      onClose?.();
    } catch (e) {
      setErro(e.message || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  const restaurarPadrao = () => {
    if (template.conteudo_padrao) setContent(template.conteudo_padrao);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-s1 border border-m31-border rounded-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-m31-border sticky top-0 bg-s1 z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide px-2 py-0.5 rounded-pill bg-m31-hover text-m31-text-muted">
                {labelCategoria(template.categoria)}
              </span>
              {template.essencial && (
                <span className="text-[11px] px-2 py-0.5 rounded-pill bg-amber-500/15 text-amber-400">Essencial</span>
              )}
            </div>
            <h2 className="text-lg font-jakarta font-semibold text-white mt-2">{template.name}</h2>
            {template.descricao && (
              <p className="text-sm text-m31-text-muted mt-1 max-w-xl">{template.descricao}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-m31-hover text-m31-text-muted">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Tags disponíveis */}
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-xs text-m31-text-muted">
              <Info size={13} /> Clique para inserir uma variável no texto
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tagsDisponiveis.map((v) => (
                <button
                  key={v.tag}
                  onClick={() => inserirTag(v.tag)}
                  title={v.label}
                  className="inline-flex items-center gap-1 text-xs font-mono px-2 py-1 rounded-md bg-m31-hover hover:bg-brand hover:text-white text-brand-bright transition-colors"
                >
                  <Plus size={11} /> {`{{${v.tag}}}`}
                </button>
              ))}
            </div>
          </div>

          {/* Editor de texto */}
          <div>
            <label className="block text-sm text-white mb-1.5 font-medium">Texto da mensagem</label>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              className="w-full rounded-lg font-mono text-sm leading-relaxed p-3 resize-y"
              placeholder="Escreva a mensagem usando {{tag}} para variáveis..."
            />
            {!valido && (
              <div className="flex items-start gap-2 mt-2 text-sm text-red-400">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>
                  Variáveis inválidas ou não permitidas neste modelo:{' '}
                  <strong className="font-mono">{invalidas.map((t) => `{{${t}}}`).join(', ')}</strong>. Remova-as para salvar.
                </span>
              </div>
            )}
          </div>

          {/* Preview */}
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-sm text-white font-medium">
              <Eye size={15} /> Pré-visualização <span className="text-xs text-m31-text-muted font-normal">(dados de exemplo)</span>
            </div>
            <div className="rounded-lg bg-[#0b141a] border border-m31-border p-3">
              <div className="max-w-[80%] bg-[#005c4b] text-white text-sm rounded-lg rounded-tl-none px-3 py-2 whitespace-pre-wrap break-words">
                {preview || <span className="text-white/50">A mensagem aparecerá aqui…</span>}
              </div>
              <p className="text-[11px] text-m31-text-muted mt-2">
                ⚠️ Exemplo ilustrativo — não usa dados reais de participantes.
              </p>
            </div>
          </div>

          {erro && <div className="text-sm text-red-400 bg-red-500/10 rounded-md p-2">{erro}</div>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-5 border-t border-m31-border sticky bottom-0 bg-s1">
          <button
            onClick={restaurarPadrao}
            disabled={!template.conteudo_padrao || content === template.conteudo_padrao}
            className="inline-flex items-center gap-1.5 text-sm text-m31-text-muted hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw size={14} /> Restaurar padrão
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-sm px-3 py-2 rounded-md text-m31-text-muted hover:bg-m31-hover">
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={!valido || !alterado || salvando}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-md bg-brand text-white hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save size={14} /> {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}