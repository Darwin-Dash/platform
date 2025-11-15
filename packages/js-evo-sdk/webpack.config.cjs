const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const webpack = require('webpack');

// Externalize all node_modules
function externals({ request }, callback) {
  if (/^[@a-z]/.test(request)) {
    return callback(null, 'commonjs ' + request);
  }
  callback();
}

const base = {
  entry: path.resolve(__dirname, 'src/sdk.ts'),
  mode: 'production',
  target: 'node',
  devtool: 'source-map',
  externalsPresets: { node: true },
  externals: [externals],
  module: {
    parser: { javascript: { url: false } },
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            compilerOptions: {
              noEmitOnError: false,
              skipLibCheck: true
            }
          }
        },
        exclude: /node_modules/
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
    extensionAlias: { '.js': ['.ts', '.js'] },
    fallback: {
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer'),
      path: require.resolve('path-browserify'),
      process: require.resolve('process/browser'),
      util: require.resolve('util'),
      url: require.resolve('url'),
      events: require.resolve('events'),
      string_decoder: require.resolve('string_decoder'),
      assert: require.resolve('assert'),
      os: false,
      fs: false,
      module: false,
      http: false,
      https: false,
      zlib: false,
      child_process: false,
    },
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser',
    }),
  ],
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
