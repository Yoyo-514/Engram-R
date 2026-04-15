import { useEffect, useState } from 'react';
import type { FC } from 'react';

import { set } from '@/config/settings';
import { getTheme, setTheme } from '@/ui/services';

import { themes, type ThemeName } from '../../../styles/themes';

interface ThemeOption {
  id: ThemeName;
  name: string;
  primary: string;
  background: string;
  sidebar: string;
}

export const ThemeSelector: FC = () => {
  const [currentTheme, setCurrentTheme] = useState<ThemeName>('claudeDark');

  useEffect(() => {
    setCurrentTheme(getTheme());
  }, []);

  const handleThemeChange = (themeId: ThemeName) => {
    setTheme(themeId);
    set('theme', themeId); // Persist to ST settings
    setCurrentTheme(themeId);
  };

  // Prepare theme options for display
  const options: ThemeOption[] = Object.entries(themes).map(([key, theme]) => {
    const bg = theme.colors.background;
    const prim = theme.colors.primary;

    // Handle CSS variables for SillyTavern theme preview
    // if (key === 'sillytavern') {
    //     bg = 'var(--SmartThemeBlurTintColor, #333)';
    //     prim = 'var(--SmartThemeQuoteColor, #0af)';
    // }

    return {
      id: key as ThemeName,
      name: theme.name,
      background: bg,
      sidebar: theme.colors.sidebar, // Add sidebar color
      primary: prim,
    };
  });

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">主题设置</h3>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {options.map((option) => (
          <button
            key={option.id}
            onClick={() => handleThemeChange(option.id)}
            className={`group relative flex min-w-0 flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all ${
              currentTheme === option.id
                ? 'bg-accent/10 border-primary'
                : 'hover:bg-accent/5 border-transparent'
            } `}
          >
            {/* Circular Swatch */}
            {/* 3-Color Swatch Palette */}
            <div className="mb-2 flex items-center justify-center -space-x-3">
              {/* Main Background */}
              <div
                className="z-10 h-8 w-8 rounded-full border border-border shadow-sm"
                style={{ background: option.background }}
                title="Background"
              />
              {/* Sidebar Background */}
              <div
                className="z-20 h-8 w-8 rounded-full border border-border shadow-sm"
                style={{ background: option.sidebar }}
                title="Sidebar"
              />
              {/* Primary Accent */}
              <div
                className="z-30 h-8 w-8 rounded-full border border-border shadow-sm ring-2 ring-background"
                style={{ background: option.primary }}
                title="Primary"
              />
            </div>

            <span
              className={`max-w-full break-words text-center text-sm font-medium leading-5 ${currentTheme === option.id ? 'text-primary' : 'text-muted-foreground'}`}
            >
              {option.name}
            </span>

            {currentTheme === option.id && (
              <div className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};
