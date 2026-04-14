import { getSettings, loadSettings, set } from '@/config/settings';
import { Logger } from '@/core/logger';
import { type ThemeName, themes } from '../styles/themes';

const MODULE = 'ThemeManager';
const STORAGE_KEY = 'engram-theme';
const DEFAULT_THEME: ThemeName = 'claudeDark';

let currentTheme: ThemeName = DEFAULT_THEME;

function isDarkTheme(themeName: ThemeName): boolean {
  return !['tokyoLight', 'catppuccinLatte'].includes(themeName);
}

/**
 * 应用 CSS 变量到根元素
 */
function applyThemeVariables(themeName: ThemeName): void {
  const themeConfig = themes[themeName];
  if (!themeConfig) return;

  const root = document.documentElement;

  // Helper to set variable
  const setVar = (key: string, value: string) => {
    root.style.setProperty(key, value);
  };

  const settings = getSettings();

  // 1. Colors
  // Universal Transparency Logic
  const glassEnabled = settings.glassSettings?.enabled ?? true;

  // 如果禁用了毛玻璃，强制不透明度为 1 (不透明)
  const opacity = glassEnabled ? (settings.glassSettings?.opacity ?? 1) : 1;

  const isGlassTheme = themeName === 'glass';
  // Only apply mix if not glass theme (glass handles it internally) and opacity < 1
  // 注意：如果是 glass 主题，通常由主题自己定义透明度，但这里我们允许通过 opacity 覆盖
  const shouldApplyTransparency = !isGlassTheme && opacity < 1;
  // Calculate transparency percentage for color-mix (e.g., opacity 0.8 -> 20% transparent)
  const transparencyPercent = Math.round((1 - opacity) * 100);

  // Keys that should be transparentized (backgrounds/borders only, NOT text colors)
  const transparentKeys = [
    'background',
    'card',
    'popover',
    'sidebar',
    'secondary',
    'muted',
    'input',
    'border',
    'sidebarBorder',
  ];

  Object.entries(themeConfig.colors).forEach(([key, value]) => {
    // camelCase -> kebab-case (e.g., cardForeground -> --card-foreground)
    let cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    // Handle numbers (chart1 -> --chart-1)
    cssVar = cssVar.replace(/(\d+)/, '-$1');

    let finalValue = value;

    if (shouldApplyTransparency && transparentKeys.includes(key)) {
      // Use color-mix to inject transparency dynamically

      // Border Resistance Logic:
      // Borders should fade much slower than backgrounds to maintain structure
      // If is border, reduce transparency mix by 60% (keep 40% of the fade effect)
      const isBorder = key.toLowerCase().includes('border');
      const effectiveTransparency = isBorder
        ? Math.round(transparencyPercent * 0.1)
        : transparencyPercent;

      // Syntax: color-mix(in srgb, OriginalColor, transparent Percentage%)
      finalValue = `color-mix(in srgb, ${value}, transparent ${effectiveTransparency}%)`;
    }

    setVar(cssVar, finalValue);
  });

  // 2. Variables (radius, etc)
  Object.entries(themeConfig.variables).forEach(([key, value]) => {
    setVar(`--${key}`, value);
  });

  // 3. Toggle dark mode class
  if (isDarkTheme(themeName)) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // 4. Inject Glass Settings
  const glassSettings = settings.glassSettings;
  const glassOpacity = glassSettings?.opacity ?? 1;
  const glassBlur = glassSettings?.blur ?? 0;
  const glassEnabledForVars = glassSettings?.enabled ?? false;

  if (glassEnabledForVars) {
    setVar('--glass-opacity', glassOpacity.toString());
    setVar('--glass-blur', `${glassBlur}px`);

    // 只要设置了 blur，就应用到所有主题 (不仅仅是 glass)
    if (glassBlur > 0) {
      setVar('--glass-backdrop-filter', `blur(${glassBlur}px)`);
    } else {
      setVar('--glass-backdrop-filter', 'none');
    }
  } else {
    // Fallback / Disabled
    setVar('--glass-opacity', '1');
    setVar('--glass-blur', '0px');
    setVar('--glass-backdrop-filter', 'none');
  }
}

/**
 * 初始化主题系统
 */
export function initThemeManager(): void {
  // 1. 加载并应用已保存的主题
  // 优先使用 extension_settings，如果没有则回退到 localStorage (顺便尝试迁移)
  const settings = loadSettings();
  let saved = settings.theme as ThemeName;

  if (!saved) {
    saved = localStorage.getItem(STORAGE_KEY) as ThemeName;
    if (saved) {
      // Migrate to SettingsManager
      set('theme', saved);
    }
  }

  const themeToLoad = themes[saved] ? saved : DEFAULT_THEME;
  setTheme(themeToLoad);

  Logger.info(MODULE, `主题系统初始化完成: ${themeToLoad}`);
}

/**
 * 切换主题
 */
export function setTheme(themeName: ThemeName): void {
  let nextTheme = themeName;

  if (!themes[nextTheme]) {
    Logger.warn(MODULE, `未知主题: ${nextTheme}, 回退到 ${DEFAULT_THEME}`);
    nextTheme = DEFAULT_THEME;
  }

  currentTheme = nextTheme;

  // Save to SettingsManager (ST persistence)
  set('theme', nextTheme);

  // Also keep localStorage for redundancy/boot speed if ST isn't ready immediately
  localStorage.setItem(STORAGE_KEY, nextTheme);

  applyThemeVariables(nextTheme);
}

/**
 * 获取当前主题
 */
export function getTheme(): ThemeName {
  return currentTheme;
}
