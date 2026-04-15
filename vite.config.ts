import path from 'node:path';

import mdx from '@mdx-js/rollup';
import react from '@vitejs/plugin-react';
import remarkGfm from 'remark-gfm';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const commitHash = 'unknown';

export default defineConfig(({ mode }) => ({
  plugins: [mdx({ remarkPlugins: [remarkGfm] }), tsconfigPaths(), react()],

  server: {
    port: 5173,
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
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
      scss: {},
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
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },

  target: 'esnext',
}));
