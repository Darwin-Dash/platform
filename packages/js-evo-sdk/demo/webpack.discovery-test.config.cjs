const path = require('path');
const webpack = require('webpack');

/**
 * Minimal webpack config for wallet-lib discovery test bundle
 *
 * This builds ONLY the discovery test without full app complexity
 * Output: dist/test-discovery-bundle.js
 */

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    mode: argv.mode || 'development',
    entry: './test-discovery-bundle-source.js',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'test-discovery-bundle.js',
      clean: false,
      publicPath: '/dist/'
    },
    devtool: isProduction ? 'source-map' : 'eval-source-map',
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env']
            }
          }
        }
      ]
    },
    plugins: [
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
        process: 'process/browser'
      }),
      new webpack.DefinePlugin({
        'process.env': JSON.stringify({})
      })
    ],
    resolve: {
      extensions: ['.js', '.json'],
      fallback: {
        buffer: require.resolve('buffer/'),
        stream: require.resolve('stream-browserify'),
        crypto: require.resolve('crypto-browserify'),
        'process/browser': require.resolve('process/browser'),
        process: require.resolve('process/browser'),
        path: false,
        fs: false,
        net: false,
        tls: false
      }
    },
    optimization: {
      minimize: isProduction,
      sideEffects: false
    },
    performance: {
      hints: isProduction ? 'warning' : false,
      maxEntrypointSize: 512000,
      maxAssetSize: 512000
    }
  };
};
