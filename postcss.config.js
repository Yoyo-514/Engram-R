export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
    'postcss-minify': process.env.NODE_ENV === 'production' ? {} : false,
  },
};
