const path = require('path');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');

const base = {
  entry: path.resolve(__dirname, 'src/sdk.ts'),
  mode: 'production',
  target: ['web', 'es2020'],
  devtool: 'source-map',
  module: {
    parser: { javascript: { url: false } },
    rules: [
      { test: /\.ts$/, use: 'ts-loader', exclude: /node_modules/ },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
    extensionAlias: { '.js': ['.ts', '.js'] },
    fallback: {
      // Node.js core modules - provide empty stubs for browser
      fs: false,
      path: require.resolve('path-browserify'),
      crypto: false, // Use Web Crypto API instead
      stream: false,
      http: false,
      https: false,
      net: false,
      tls: false,
      url: require.resolve('url/'),
      util: require.resolve('util/'),
      buffer: require.resolve('buffer/'),
      assert: require.resolve('assert/'),
      events: require.resolve('events/'),
      process: require.resolve('process/browser'),
      os: false,
      zlib: false,
      querystring: false,
      module: false,
    },
  },
  optimization: {
    splitChunks: false,
    runtimeChunk: false,
    minimize: true,
    minimizer: [new TerserPlugin({ terserOptions: { keep_classnames: true } })],
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser',
    }),
  ],
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
