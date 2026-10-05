import { useState } from 'react';
import { Bot, Loader2, Send } from 'lucide-react';

// Chat IA: consultas sobre a operação real — pedidos, pagamentos e estoque.
// Somente leitura; ações continuam nos botões da Central.
export default function HubChatIa({ preview, onEnviar }) {
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(event) {
    event.preventDefault();
    const mensagem = texto.trim();
    if (!mensagem || enviando) return;
    setTexto('');
    setMensagens((atual) => [...atual, { de: 'dulce', texto: mensagem }]);
    setEnviando(true);
    try {
      const resultado = await onEnviar(mensagem, mensagens.slice(-6).map((m) => ({ de: m.de, texto: m.texto })));
      setMensagens((atual) => [...atual, { de: 'ia', texto: resultado?.resposta || 'Sem resposta agora.' }]);
    } catch {
      setMensagens((atual) => [...atual, { de: 'ia', texto: 'Não consegui responder agora. Tente novamente em instantes.' }]);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-xl border border-m31-border bg-white p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-m31-primary-tint text-m31-primary">
          <Bot aria-hidden="true" className="h-5 w-5" />
        </span>
        <p className="text-sm leading-5 text-m31-text-muted">
          Sou o assistente da Central. Pergunte sobre pedidos, pagamentos ou estoque recebido.
          {preview ? ' (Prévia: respostas simuladas, sem dados reais.)' : ''}
        </p>
      </div>

      <div className="space-y-2">
        {mensagens.map((mensagem, index) => (
          <div
            key={index}
            className={mensagem.de === 'dulce'
              ? 'ml-8 whitespace-pre-line rounded-xl rounded-br-sm bg-m31-primary px-4 py-2.5 text-sm text-white'
              : 'mr-8 whitespace-pre-line rounded-xl rounded-bl-sm border border-m31-border bg-white px-4 py-2.5 text-sm text-m31-ink'}
          >
            {mensagem.texto}
          </div>
        ))}
        {enviando && (
          <p className="mr-8 flex items-center gap-2 text-sm text-m31-text-muted">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            Consultando a operação…
          </p>
        )}
      </div>

      <form onSubmit={enviar} className="sticky bottom-20 flex gap-2">
        <input
          value={texto}
          onChange={(event) => setTexto(event.target.value)}
          placeholder="Escreva sua pergunta"
          className="h-12 min-w-0 flex-1 rounded-xl border border-m31-border bg-white px-4 text-base text-m31-ink outline-none focus:border-m31-primary"
        />
        <button type="submit" disabled={enviando || !texto.trim()} aria-label="Enviar pergunta" className="flex h-12 w-12 items-center justify-center rounded-xl bg-m31-primary text-white disabled:opacity-50">
          <Send aria-hidden="true" className="h-5 w-5" />
        </button>
      </form>
    </section>
  );
}