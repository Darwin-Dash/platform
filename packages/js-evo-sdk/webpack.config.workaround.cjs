const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

// Workaround: Use pre-compiled dist/sdk.js instead of TypeScript source
// This avoids TypeScript 3.9.x incompatibility with @types/node

const base = {
  entry: path.resolve(__dirname, 'dist/sdk.js'),
  mode: 'production',
  target: ['web', 'es2020'],
  devtool: 'source-map',
  module: {
    parser: { javascript: { url: false } },
  },
  optimization: {
    splitChunks: false,
    runtimeChunk: false,
    minimize: true,
    minimizer: [new TerserPlugin({ terserOptions: { keep_classnames: true } })],
  },
};

const esm = {
  ...base,
  experiments: { outputModule: true },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'evo-sdk.module.js',
    library: { type: 'module' },
    module: true,
  },
};

module.exports = esm;
