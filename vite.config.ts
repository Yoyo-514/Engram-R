import mdx from '@mdx-js/rollup';
import react from '@vitejs/plugin-react';
import path from 'node:path';
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
    rollupOptions: {
      treeshake: {
        moduleSideEffects: false,
        propertyReadSideEffects: false,
      },
      input: 'src/index.tsx',
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: '[name].[hash].chunk.js',
        assetFileNames: '[name].[ext]',
        preserveModules: false,
      },
    },
    minify: mode === 'production' ? 'terser' : false,
    sourcemap: mode === 'production' ? 'hidden' : 'inline',
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
