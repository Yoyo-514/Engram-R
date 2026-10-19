/** @type {import('tailwindcss').Config} */
const themeColor =
  (name) =>
  ({ opacityValue }) =>
    opacityValue === undefined
      ? `var(--${name})`
      : `color-mix(in srgb, var(--${name}) calc(${opacityValue} * 100%), transparent)`;

export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // 由 Tailwind 解析 /10、/50 等透明度，避免手写颜色变体遗漏实际使用的类名。
      colors: {
        border: themeColor('border'),
        input: themeColor('input'),
        ring: themeColor('ring'),
        foreground: themeColor('foreground'),
        background: themeColor('background'),
        primary: { DEFAULT: themeColor('primary'), foreground: themeColor('primary-foreground') },
        secondary: {
          DEFAULT: themeColor('secondary'),
          foreground: themeColor('secondary-foreground'),
        },
        destructive: {
          DEFAULT: themeColor('destructive'),
          foreground: themeColor('destructive-foreground'),
        },
        muted: { DEFAULT: themeColor('muted'), foreground: themeColor('muted-foreground') },
        accent: { DEFAULT: themeColor('accent'), foreground: themeColor('accent-foreground') },
        popover: { DEFAULT: themeColor('popover'), foreground: themeColor('popover-foreground') },
        card: { DEFAULT: themeColor('card'), foreground: themeColor('card-foreground') },
        sidebar: {
          DEFAULT: themeColor('sidebar'),
          foreground: themeColor('sidebar-foreground'),
          primary: themeColor('sidebar-primary'),
          'primary-foreground': themeColor('sidebar-primary-foreground'),
          accent: themeColor('sidebar-accent'),
          'accent-foreground': themeColor('sidebar-accent-foreground'),
          border: themeColor('sidebar-border'),
          ring: themeColor('sidebar-ring'),
        },
        heading: themeColor('heading'),
        label: themeColor('label'),
        meta: themeColor('meta'),
        link: themeColor('link'),
        value: themeColor('value'),
        emphasis: themeColor('emphasis'),
        success: themeColor('engram-success'),
        warning: themeColor('engram-warning'),
        error: themeColor('engram-error'),
      },
      fontFamily: { sans: ['var(--font-sans)'], mono: ['var(--font-mono)'] },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
  important: '.engram-app-root',
  corePlugins: { preflight: false },
};
