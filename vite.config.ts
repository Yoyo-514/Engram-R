import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => ({
  plugins: [tsconfigPaths(), react()],

  server: {
    port: 5173,
    // 酒馆页面跨源加载开发脚本，统一交给 Vite 处理 CORS。
    cors: true,
    hmr: {
      overlay: false,
    },
    fs: {
      allow: ['..'],
    },
  },

  publicDir: 'public',

  css: {
    devSourcemap: true,
    preprocessorOptions: {
    },
  },

  build: {
    outDir: 'dist',
    emptyDirOnBuild: true,
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(__dirname, 'src/index.tsx'),
      formats: ['iife'],
      name: 'EngramPlugin',
      fileName: () => 'index.js',
    },
    rollupOptions: {
      treeshake: {
        moduleSideEffects: false,
        propertyReadSideEffects: false,
      },
      output: {
        format: 'iife',
        name: 'EngramPlugin',
        inlineDynamicImports: true,
        manualChunks: undefined,
        entryFileNames: 'index.js',
        chunkFileNames: 'index.js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.names.some((name) => name.endsWith('.css'))) {
            return 'index.css';
          }

          return '[name][extname]';
        },
      },
    },
    minify: mode === 'production' ? 'terser' : false,
    sourcemap: mode === 'production' ? false : 'inline',
    terserOptions:
      mode === 'production'
        ? {
            format: { quote_style: 1 },
            mangle: { reserved: ['_', 'toastr', 'YAML', '$', 'z'] },
          }
        : {
            format: { beautify: true, indent_level: 2 },
            compress: false,
            mangle: false,
          },
  },

  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },

  target: 'esnext',
}));
