/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      borderRadius: {
        'sm': '6px',           // checkboxes, switches, tags compactas
        'md': '8px',           // inputs, botões, itens de menu
        'lg': '12px',          // cards, painéis, drawers
        'xl': '16px',          // estruturas macro
        'pill': '9999px',      // badges de status, avatars
        'base': 'var(--radius)',
        'control': '8px',      // alias semântico
        'card': '12px',        // alias semântico
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))'
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))'
        },
        // ── Paleta M31 (light, warm, bordô) ──
        m31: {
          canvas:       '#FAF7F2',
          surface:      '#FFFFFF',
          'surface-warm':'#F6EEE6',
          border:       '#E5DDD5',
          primary:      '#8B1A2B',
          'primary-dark':'#6B1422',
          'primary-tint':'#F6E9EC',
          ink:          '#2A1F1F',
          'text-muted': '#6B5E5E',
          success:      '#16A34A',
          warning:      '#D97706',
          danger:       '#DC2626',
          // ── Aliases de compatibilidade (migrar e remover) ──
          bg:           '#FAF7F2',   // era dark #0B0F19
          hover:        '#F6EEE6',   // era dark #222C47
          text:         '#2A1F1F',   // era #FFFFFF
          secondary:    '#6B1422',   // era purple #8B5CF6
          accent:       '#16A34A',   // era #10B981
          destructive:  '#DC2626',   // era #EF4444
        },
        // Aliases legados (migrar e remover)
        s1: '#FFFFFF',
        s2: '#F6EEE6',
        s3: '#E5DDD5',
        brand: '#8B1A2B',
        'brand-bright': '#6B1422',
      },
      fontFamily: {
        m31:     ['"Helvetica Now Display"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
        inter:   ['Inter', 'system-ui', 'sans-serif'],
        jakarta: ['Inter', 'system-ui', 'sans-serif'],  // alias migrado
      },
      boxShadow: {
        'm31-xs': '0 1px 2px rgba(0,0,0,0.03)',
        'm31-sm': '0 1px 2px rgba(0,0,0,0.03)',
        'm31':    '0 1px 3px rgba(0,0,0,0.04)',
        'm31-md': '0 1px 3px rgba(0,0,0,0.04)',
        'm31-lg': '0 2px 8px rgba(0,0,0,0.06)',
      },
      backgroundImage: {
        'grad-brand':   'linear-gradient(135deg, #8B1A2B 0%, #6B1422 100%)',
        'grad-success': 'linear-gradient(135deg, #16A34A 0%, #059669 100%)',
        'grad-warning': 'linear-gradient(135deg, #D97706 0%, #B45309 100%)',
        'grad-danger':  'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' }
        },
        'drawer-slide': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' }
        },
        'drawer-content': {
          from: { opacity: '0' },
          to: { opacity: '1' }
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in-up': 'fade-in-up 0.35s ease-out both',
        'scale-in': 'scale-in 0.2s ease-out both',
        'm31-drawer-slide': 'drawer-slide 250ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'm31-drawer-content': 'drawer-content 250ms cubic-bezier(0.16, 1, 0.3, 1) 50ms both',
      },
      transitionTimingFunction: {
        'm31-atomic': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'm31-structure': 'cubic-bezier(0.16, 1, 0.3, 1)',
      }
    }
  },
  plugins: [require("tailwindcss-animate")],
}

