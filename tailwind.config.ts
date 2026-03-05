import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas:  'rgb(var(--color-canvas) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        border:  'rgb(var(--color-border) / <alpha-value>)',
        muted:   'rgb(var(--color-muted) / <alpha-value>)',
        ink:     'rgb(var(--color-ink) / <alpha-value>)',
        subtle:  'rgb(var(--color-subtle) / <alpha-value>)',
        coral: {
          DEFAULT: '#C96442',
          light:   '#E8A598',
          dark:    '#A84F32',
        },
        status: {
          active:   '#C96442',
          disabled: '#9A948C',
          testing:  '#C4933A',
          error:    '#B94040',
          quota:    '#7A6830',
          unknown:  '#9A948C',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', '"Times New Roman"', 'serif'],
        sans:  ['"Inter"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        card:  '0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.04)',
        modal: '0 8px 32px 0 rgba(0,0,0,0.12)',
      },
      borderRadius: {
        DEFAULT: '6px',
        lg: '10px',
      },
    },
  },
  plugins: [],
}

export default config
