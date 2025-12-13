const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    mode: argv.mode || 'development',
    entry: './app.js',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isProduction ? 'bundle.[contenthash].js' : 'bundle.js',
      clean: true
    },
    devtool: isProduction ? 'source-map' : 'eval-source-map',
    module: {
      rules: [
        {
          test: /\.m?js$/,
          resolve: {
            fullySpecified: false
          }
        },
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env']
            }
          }
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader']
        }
      ]
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './index.html',
        title: 'Dash Identity Manager',
        inject: 'body'
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: '../dist/evo-sdk.module.js', to: 'sdk-browser.js' },
          { from: '../dist/wasm_bg.wasm', to: 'wasm_bg.wasm' },
          { from: 'styles.css', to: 'styles.css' }
        ]
      }),
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
      fullySpecified: false,
      fallback: {
        buffer: require.resolve('buffer/'),
        stream: require.resolve('stream-browserify'),
        crypto: require.resolve('crypto-browserify'),
        events: require.resolve('events/'),
        'process/browser': require.resolve('process/browser'),
        process: require.resolve('process/browser'),
        vm: require.resolve('vm-browserify'),
        os: require.resolve('os-browserify/browser'),
        zlib: require.resolve('browserify-zlib'),
        http: require.resolve('stream-http'),
        https: require.resolve('https-browserify'),
        dns: false,
        path: false,
        fs: false,
        net: false,
        tls: false,
        module: false
      }
    },
    devServer: {
      static: [
        { directory: path.join(__dirname, 'public') },
        { directory: path.join(__dirname, 'dist'), publicPath: '/dist' }
      ],
      compress: true,
      port: 8080,
      hot: true,
      open: false, // Don't auto-open browser (conflicts with Playwright)
      historyApiFallback: true
    },
    optimization: {
      minimize: isProduction
    },
    performance: {
      hints: isProduction ? 'warning' : false,
      maxEntrypointSize: 512000,
      maxAssetSize: 512000
    }
  };
};