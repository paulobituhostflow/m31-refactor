import { Lock, Clock, MessageCircle } from 'lucide-react';

const M31_LOGO = "/assets/a22f06b49_LOGOM31FILHAS1.png";
const PAULO_WA = 'https://wa.me/5581992008889?text=Olá! Gostaria de falar sobre meu acesso ao painel M31.';

export default function M31SemAcesso() {
  return (
    <div className="min-h-screen bg-[#0d0307] flex items-center justify-center px-4">
      <div className="relative z-10 max-w-md w-full text-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-rose-800 opacity-15 blur-[100px] rounded-full pointer-events-none" />

        <div className="relative">
          <img src={M31_LOGO} alt="M31 Filhas" className="h-24 mx-auto mb-8 drop-shadow-xl" />

          <div className="bg-white/5 border border-rose-800/40 rounded-3xl p-8">
            <div className="w-20 h-20 bg-rose-900/40 rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock className="w-10 h-10 text-rose-400" />
            </div>

            <h1 className="text-white text-2xl font-black mb-3">Seu acesso ainda não foi liberado</h1>
            <p className="text-white/60 leading-relaxed mb-6">
              Sua solicitação foi enviada automaticamente ao administrador.
              <br /><br />
              Assim que seu cadastro for aprovado, você poderá acessar o painel.
            </p>

            <a
              href={PAULO_WA}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 transition-colors text-white rounded-2xl px-4 py-3 text-sm font-semibold mb-3"
            >
              <MessageCircle className="w-4 h-4 flex-shrink-0" />
              <span>Falar com o administrador</span>
            </a>

            <div className="flex items-center justify-center gap-2 bg-rose-900/30 border border-rose-700/40 rounded-2xl px-4 py-3 text-rose-300 text-sm">
              <Clock className="w-4 h-4 flex-shrink-0" />
              <span>Aguarde a liberação do acesso</span>
            </div>
          </div>

          <p className="text-white/20 text-xs mt-6">
            M31 Filhas — Painel Administrativo
          </p>
        </div>
      </div>
    </div>
  );
}