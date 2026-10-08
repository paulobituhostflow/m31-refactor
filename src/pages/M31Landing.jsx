/**
 * M31Landing — Landing page dinâmica.
 * Busca EventPageConfig com event_key='m31_filhas_2026' e renderiza via M31LandingRenderer.
 * Se não houver config publicada, exibe a landing estática hardcoded como fallback.
 */
import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import M31LandingRenderer from '@/components/m31/M31LandingRenderer';
import { motion } from 'framer-motion';
import { MapPin, Clock, Calendar, ChevronDown, Star, Sparkles, Play } from 'lucide-react';
import { CAMINHO_INSCRICAO } from '@/lib/m31LandingCta';

const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;700&family=Urbanist:wght@300;400;600;700&display=swap');
    .font-display { font-family: 'Cormorant Garamond', serif; }
    .font-body { font-family: 'Urbanist', sans-serif; }
  `}</style>
);

const JU_PHOTO = "https://media.base44.com/images/public/69d51b279da069f623e291a6/9a9b399c2_images-5.jpeg";
const M31_LOGO = "https://media.base44.com/images/public/69d51b279da069f623e291a6/a22f06b49_LOGOM31FILHAS1.png";
// Destino canônico da inscrição: o formulário dentro da própria aplicação.
// O domínio institucional antigo (m31filhas.com.br) devolvia 404.
const INSCRICAO_URL = CAMINHO_INSCRICAO;
const VIP_URL = "https://chat.whatsapp.com/LDqMehzr4Pg07NyyaEiTam?mode=ems_qr_t";
const YOUTUBE_ID = "zWuffZgykCk";

function useCountdown() {
  const [time, setTime] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  useEffect(() => {
    const target = new Date('2026-11-21T09:00:00-03:00').getTime();
    const update = () => {
      const now = Date.now();
      const diff = target - now;
      if (diff <= 0) { setTime({ days: 0, hours: 0, minutes: 0, seconds: 0 }); return; }
      setTime({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000)
      });
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function CountdownBox({ value, label }) {
  return (
    <div className="flex flex-col items-center">
      <div className="bg-white/10 backdrop-blur border border-rose-400/30 rounded-2xl w-16 h-16 md:w-20 md:h-20 flex items-center justify-center shadow-lg shadow-rose-900/40">
        <span className="text-2xl md:text-3xl font-black text-white">{String(value).padStart(2, '0')}</span>
      </div>
      <span className="text-rose-300/80 text-xs mt-1 uppercase tracking-widest font-semibold">{label}</span>
    </div>
  );
}

function FadeIn({ children, delay = 0, className = '' }) {
  return (
    <motion.div initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay, ease: 'easeOut' }} className={className}>
      {children}
    </motion.div>
  );
}

// ── Landing estática (fallback quando não há config publicada) ──────────────
function StaticLanding() {
  const countdown = useCountdown();
  const [videoOpen, setVideoOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0d0307] text-white overflow-x-hidden font-body">
      <GlobalStyles />
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4 py-12 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-rose-700 opacity-20 blur-[120px] rounded-full" />
          <div className="absolute bottom-0 right-0 w-80 h-80 bg-amber-600 opacity-10 blur-[100px] rounded-full" />
          <div className="absolute bottom-0 left-0 w-60 h-60 bg-pink-700 opacity-10 blur-[80px] rounded-full" />
        </div>
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, ease: 'easeOut' }} className="relative z-10 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 bg-rose-900/50 border border-rose-500/40 rounded-full px-4 py-1.5 mb-6 text-rose-300 text-sm font-body font-semibold">
            <Sparkles className="w-4 h-4" />
            Imersão Exclusiva para Mulheres
          </div>
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-rose-500 blur-3xl opacity-20 scale-110 rounded-full" />
            <img src={M31_LOGO} alt="M31 Filhas" className="relative h-44 md:h-64 drop-shadow-2xl" />
          </div>
          <p className="text-rose-300 font-display font-bold text-2xl md:text-3xl tracking-wide mb-2">Uma imersão em Jesus.</p>
          <p className="text-white/60 font-body text-sm md:text-base max-w-md mx-auto mb-8">
            Criada para gerar raízes profundas em Deus e produzir frutos eternos —<br />formando a mulher de Provérbios 31.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mb-10 text-sm">
            <div className="flex items-center gap-2 bg-white/10 border border-white/10 rounded-full px-4 py-2">
              <Calendar className="w-4 h-4 text-rose-400" /><span>21 de novembro</span>
            </div>
            <div className="flex items-center gap-2 bg-white/10 border border-white/10 rounded-full px-4 py-2">
              <Clock className="w-4 h-4 text-rose-400" /><span>9h às 19h</span>
            </div>
            <div className="flex items-center gap-2 bg-white/10 border border-white/10 rounded-full px-4 py-2">
              <MapPin className="w-4 h-4 text-rose-400" /><span>Igreja RIO Prado · Recife-PE</span>
            </div>
          </div>
          <div className="flex gap-4 mb-10">
            <CountdownBox value={countdown.days} label="Dias" />
            <CountdownBox value={countdown.hours} label="Horas" />
            <CountdownBox value={countdown.minutes} label="Min" />
            <CountdownBox value={countdown.seconds} label="Seg" />
          </div>
          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm mx-auto">
            <a href={INSCRICAO_URL} target="_blank" rel="noreferrer" className="flex-1">
              <button className="w-full bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-400 hover:to-pink-500 text-white font-bold text-base rounded-2xl py-4 px-6 shadow-xl shadow-rose-900/50 transition-all hover:scale-105">
                ✨ Quero me inscrever
              </button>
            </a>
            <a href={VIP_URL} target="_blank" rel="noreferrer" className="flex-1">
              <button className="w-full bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-base rounded-2xl py-4 px-6 transition-all hover:scale-105">
                💬 Grupo VIP
              </button>
            </a>
          </div>
        </motion.div>
        <motion.div animate={{ y: [0, 10, 0] }} transition={{ repeat: Infinity, duration: 2 }} className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/30">
          <ChevronDown className="w-6 h-6" />
        </motion.div>
      </section>

      <section className="relative py-20 px-4">
        <div className="absolute left-0 top-0 w-full h-px bg-gradient-to-r from-transparent via-rose-800/50 to-transparent" />
        <div className="max-w-4xl mx-auto">
          <FadeIn className="text-center mb-12">
            <span className="text-rose-400 text-sm font-semibold uppercase tracking-widest">O Evento</span>
            <h2 className="font-display text-3xl md:text-5xl font-bold mt-2 mb-4">O M31 não é um evento comum.</h2>
            <p className="text-white/60 text-lg max-w-2xl mx-auto">É uma experiência espiritual transformadora — um dia inteiro mergulhada na presença de Deus com mulheres que buscam algo real.</p>
          </FadeIn>
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {[
              { icon: '🔥', title: 'Presença de Deus', desc: 'Louvor, adoração e momentos que tocam o profundo da sua alma.' },
              { icon: '📖', title: 'Palavra que transforma', desc: 'Ensinamentos práticos e profundos da Palavra de Deus para a sua vida.' },
              { icon: '💜', title: 'Comunidade de Fé', desc: 'Mulheres unidas pelo mesmo propósito: crescer em Deus e no chamado.' }
            ].map((item, i) => (
              <FadeIn key={i} delay={i * 0.15}>
                <div className="bg-white/5 border border-white/10 rounded-3xl p-6 hover:border-rose-500/30 transition-all">
                  <div className="text-4xl mb-4">{item.icon}</div>
                  <h3 className="text-white font-bold text-lg mb-2">{item.title}</h3>
                  <p className="text-white/50 text-sm leading-relaxed">{item.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <FadeIn className="text-center mb-8">
            <span className="text-rose-400 text-sm font-semibold uppercase tracking-widest">Última Edição</span>
            <h2 className="font-display text-2xl md:text-4xl font-bold mt-2">Veja como foi o M31 Raízes</h2>
          </FadeIn>
          <FadeIn>
            <div className="relative rounded-3xl overflow-hidden cursor-pointer group" onClick={() => setVideoOpen(true)}>
              <div className="aspect-video bg-black">
                <img src={`https://img.youtube.com/vi/${YOUTUBE_ID}/maxresdefault.jpg`} alt="M31 Raízes" className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity" onError={e => { e.target.src = `https://img.youtube.com/vi/${YOUTUBE_ID}/hqdefault.jpg`; }} />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 bg-rose-500 rounded-full flex items-center justify-center shadow-2xl shadow-rose-900 group-hover:scale-110 transition-transform">
                  <Play className="w-8 h-8 text-white ml-1" fill="white" />
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
                <p className="text-white font-bold text-lg">M31 | Imersão Mulheres de Fé — Edição Raízes</p>
                <p className="text-white/60 text-sm">Assista ao aftermovie do último evento</p>
              </div>
            </div>
          </FadeIn>
        </div>
        {videoOpen && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setVideoOpen(false)}>
            <div className="w-full max-w-4xl aspect-video" onClick={e => e.stopPropagation()}>
              <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${YOUTUBE_ID}?autoplay=1`} title="M31 Raízes" frameBorder="0" allow="autoplay; encrypted-media" allowFullScreen className="rounded-2xl" />
            </div>
            <button onClick={() => setVideoOpen(false)} className="absolute top-4 right-4 text-white/60 hover:text-white text-3xl">✕</button>
          </div>
        )}
      </section>

      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <FadeIn className="text-center mb-10">
            <span className="text-rose-400 text-sm font-semibold uppercase tracking-widest">Transformações</span>
            <h2 className="font-display text-2xl md:text-4xl font-bold mt-2">O que elas vivenciaram</h2>
          </FadeIn>
          <div className="grid md:grid-cols-2 gap-5">
            {[
              { nome: 'Márcia S.', city: 'Recife-PE', texto: '"Vim pela primeira vez no ano passado, e ai em novembro do ano passado eu vim porque eu vim. Fui curada do câncer e Deus me mandou aqui para honra e glória do nome do Senhor."', stars: 5 },
              { nome: 'Ana Paula R.', city: 'João Pessoa-PB', texto: '"M31 não é um evento. É uma imersão em Jesus. Entrei achando que já tinha vivido tudo e saí com experiências ainda mais sobrenaturais."', stars: 5 },
              { nome: 'Fernanda L.', city: 'Caruaru-PE', texto: '"Cada palavra tocou de um jeito diferente. Saí de lá sendo outra mulher — mais firme no chamado e com raízes mais profundas em Deus."', stars: 5 },
              { nome: 'Juliana M.', city: 'Fortaleza-CE', texto: '"A comunidade de mulheres que encontrei aqui mudou minha vida. Voltarei todos os anos enquanto Deus permitir."', stars: 5 },
            ].map((dep, i) => (
              <FadeIn key={i} delay={i * 0.1}>
                <div className="bg-white/5 border border-white/10 rounded-3xl p-6 hover:border-rose-500/30 transition-all">
                  <div className="flex gap-1 mb-3">{Array(dep.stars).fill(0).map((_, j) => <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />)}</div>
                  <p className="text-white/70 text-sm leading-relaxed italic mb-4">{dep.texto}</p>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center text-white font-bold text-sm">{dep.nome[0]}</div>
                    <div><p className="text-white font-semibold text-sm">{dep.nome}</p><p className="text-white/40 text-xs">{dep.city}</p></div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 relative overflow-hidden">
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-96 h-96 bg-rose-800 opacity-10 blur-[100px] rounded-full pointer-events-none" />
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <FadeIn className="order-2 md:order-1">
              <span className="text-rose-400 text-sm font-semibold uppercase tracking-widest">A Organizadora</span>
              <h2 className="font-display text-3xl md:text-4xl font-bold mt-2 mb-4">Ju Beltrão</h2>
              <p className="text-white/70 leading-relaxed mb-4">Mentora, líder espiritual e mulher apaixonada por Deus. Ju Beltrão criou o M31 com o propósito de reunir mulheres que buscam ser, na prática, a mulher descrita em Provérbios 31 — valorosa, sábia e firmada no chamado.</p>
              <p className="text-white/70 leading-relaxed mb-6">Com uma sensibilidade única para conduzir mulheres ao encontro com Deus, Ju transforma cada edição do M31 em um momento histórico de fé, cura e propósito.</p>
              <div className="flex flex-wrap gap-3">
                <span className="bg-rose-900/50 border border-rose-500/30 text-rose-300 text-sm px-3 py-1 rounded-full">Mulher de Fé</span>
                <span className="bg-rose-900/50 border border-rose-500/30 text-rose-300 text-sm px-3 py-1 rounded-full">Mentora</span>
                <span className="bg-rose-900/50 border border-rose-500/30 text-rose-300 text-sm px-3 py-1 rounded-full">Líder Espiritual</span>
              </div>
            </FadeIn>
            <FadeIn delay={0.2} className="order-1 md:order-2 flex justify-center">
              <div className="relative">
                <div className="absolute -inset-4 bg-gradient-to-br from-rose-500 to-pink-700 opacity-20 blur-2xl rounded-full" />
                <img src={JU_PHOTO} alt="Ju Beltrão" className="relative w-72 h-80 object-cover object-top rounded-3xl shadow-2xl shadow-rose-900/60 border border-rose-500/20" />
                <div className="absolute -bottom-4 -right-4 bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl px-4 py-2 shadow-lg">
                  <p className="text-white text-xs font-bold">💜 Criadora do M31</p>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-rose-700 opacity-15 blur-[120px] rounded-full" />
        </div>
        <div className="relative z-10 max-w-2xl mx-auto text-center">
          <FadeIn>
            <img src={M31_LOGO} alt="M31 Filhas" className="h-28 mx-auto mb-6 drop-shadow-xl" />
            <h2 className="font-display text-3xl md:text-5xl font-bold mb-4">Sua vaga está esperando por você.</h2>
            <p className="text-white/60 text-lg mb-8">Não deixe para depois. As vagas são limitadas e os lotes encerram conforme a demanda.</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
              <a href={INSCRICAO_URL} target="_blank" rel="noreferrer">
                <button className="w-full sm:w-auto bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-400 hover:to-pink-500 text-white font-bold text-lg rounded-2xl py-5 px-10 shadow-2xl shadow-rose-900/60 transition-all hover:scale-105">
                  ✨ Garantir minha inscrição
                </button>
              </a>
            </div>
            <a href={VIP_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm">
              <span className="text-lg">💬</span> Entrar no grupo VIP do WhatsApp
            </a>
            <div className="mt-12 flex flex-col sm:flex-row justify-center gap-6 text-sm text-white/40">
              <div className="flex items-center justify-center gap-2"><Calendar className="w-4 h-4 text-rose-500" /><span>21 de novembro de 2026</span></div>
              <div className="flex items-center justify-center gap-2"><MapPin className="w-4 h-4 text-rose-500" /><span>Igreja RIO Prado · Recife-PE</span></div>
              <div className="flex items-center justify-center gap-2"><Clock className="w-4 h-4 text-rose-500" /><span>9h às 19h</span></div>
            </div>
          </FadeIn>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 px-4">
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-4">
          <img src={M31_LOGO} alt="M31 Filhas" className="h-12 opacity-60" />
          <p className="text-white/30 text-sm text-center">JU BELTRÃO © TODOS OS DIREITOS RESERVADOS</p>
          <p className="text-white/20 text-xs text-center">M31 Filhas — Imersão Mulheres de Fé · Recife-PE</p>
        </div>
      </footer>
    </div>
  );
}

// ── Página principal — busca config e decide qual renderizar ───────────────
export default function M31Landing() {
  const [landingConfig, setLandingConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.EventPageConfig.filter({ event_key: 'm31_filhas_2026' })
      .then(results => {
        const config = results.find(r => r.status === 'publicado' && r.landing_json);
        setLandingConfig(config?.landing_json || null);
      })
      .catch(() => setLandingConfig(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d0307', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, border: '3px solid rgba(244,63,94,0.2)', borderTopColor: '#f43f5e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // Se há config publicada no banco → renderiza dinamicamente
  if (landingConfig) {
    return <M31LandingRenderer landingConfig={landingConfig} />;
  }

  // Fallback → landing estática hardcoded original
  return <StaticLanding />;
}
