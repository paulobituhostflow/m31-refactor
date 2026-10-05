
// Ícone oficial do WhatsApp usado como botão de suporte nas páginas públicas.
export const WHATSAPP_ICON_URL = '/assets/6d6dc4ef0_IMG_4230.png';

// Botão flutuante de suporte via WhatsApp — APENAS o ícone clicável, sem texto.
export default function SupportWhatsAppIcon({ phone, message, size = 54, avoidBottomBar = false }) {
  const href = `https://wa.me/${phone}?text=${encodeURIComponent(message || '')}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Falar com o suporte pelo WhatsApp"
      style={{
        position: 'fixed',
        bottom: avoidBottomBar ? 'calc(92px + env(safe-area-inset-bottom))' : 'calc(16px + env(safe-area-inset-bottom))',
        right: 16,
        zIndex: 50,
        display: 'block',
        lineHeight: 0,
      }}
    >
      <img
        src={WHATSAPP_ICON_URL}
        alt="WhatsApp"
        style={{
          width: size,
          height: size,
          borderRadius: 16,
          boxShadow: '0 8px 24px rgba(0,0,0,.22)',
          display: 'block',
        }}
      />
    </a>
  );
}