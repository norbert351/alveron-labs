/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: {
          DEFAULT: '#0A0D13',
          raised: '#11151E',
          card: '#131926',
          border: '#1F2735',
        },
        electric: {
          DEFAULT: '#3D7EFF',
          bright: '#5B92FF',
          dim: '#2C5FD9',
        },
        violet: {
          DEFAULT: '#8B5CF6',
          bright: '#A78BFA',
        },
        ink: {
          DEFAULT: '#E8ECF4',
          soft: '#A6B0C6',
          muted: '#6E7A94',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      backgroundImage: {
        'alveron-gradient': 'linear-gradient(135deg, #3D7EFF 0%, #8B5CF6 100%)',
        'alveron-glow':
          'radial-gradient(600px 300px at 20% -10%, rgba(61,126,255,0.14) 0%, rgba(139,92,246,0.08) 45%, transparent 70%)',
      },
      animation: {
        'fade-up': 'fadeUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fadeIn 0.35s ease both',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        shimmer: 'shimmer 1.8s linear infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
    },
  },
  plugins: [],
};
