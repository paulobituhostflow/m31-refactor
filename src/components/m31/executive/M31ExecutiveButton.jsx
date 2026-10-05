/**
 * M31Button — Botões Light SaaS (Stripe-style)
 * Variantes: primary (gradiente vinho M31), secondary, ghost, danger
 * Gradiente APENAS em primary; secondary/ghost/danger são sólidos
 * Altura 40px, radius 10px, font-weight 600, transition 150ms
 */


const M31Button = ({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  className = '',
  type = 'button',
  ...props
}) => {
  // ── Tamanhos ──
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  // ── Variantes SaaS ──
  const variantStyles = {
    primary: {
      // Gradiente vinho M31 + shadow suave + highlight interno
      bg: 'linear-gradient(135deg, #C8405C 0%, #8B1A2B 55%, #7D2637 100%)',
      text: 'text-white',
      weight: 'font-semibold',
      shadow: '0 4px 12px rgba(139, 26, 43, 0.24)',
      border: '',
      hover: 'hover:shadow-lg hover:translate-y-[-2px]',
      active: 'active:scale-[0.98]',
    },
    secondary: {
      // Branco + borda light
      bg: 'bg-white',
      text: 'text-[#2D2D2D]',
      weight: 'font-medium',
      shadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
      border: 'border border-[#E8ECF3]',
      hover: 'hover:bg-[#F8FAFC]',
      active: 'active:scale-[0.98]',
    },
    ghost: {
      // Transparente + hover sutil
      bg: 'bg-transparent',
      text: 'text-[#6B7280]',
      weight: 'font-medium',
      shadow: '',
      border: '',
      hover: 'hover:bg-gray-50',
      active: 'active:scale-[0.98]',
    },
    danger: {
      // Vermelho sólido (sem gradiente) + hover escuro
      bg: 'bg-red-600',
      text: 'text-white',
      weight: 'font-semibold',
      shadow: '0 2px 8px rgba(220, 38, 38, 0.15)',
      border: '',
      hover: 'hover:bg-red-700 hover:shadow-md hover:translate-y-[-1px]',
      active: 'active:scale-[0.98]',
    },
  };

  const style = variantStyles[variant];
  const sizeClass = sizeStyles[size];

  // ── Estilo inline: gradiente (primary), sombra e highlight ──
  const inlineStyle = {
    ...(variant === 'primary' && {
      background: style.bg,
      boxShadow: `${style.shadow}, inset 0 1px 0 rgba(255, 255, 255, 0.15)`,
    }),
    borderRadius: '10px',
    height: '40px',
    display: 'inline-flex',
    alignItems: 'center',
    transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={inlineStyle}
      className={`
        ${sizeClass}
        ${style.text}
        ${style.weight}
        ${style.bg}
        ${style.border}
        ${style.shadow ? '' : 'shadow-sm'}
        ${style.hover}
        ${style.active}
        disabled:opacity-50 disabled:cursor-not-allowed
        font-inter
        whitespace-nowrap
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
};

export default M31Button;