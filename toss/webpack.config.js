const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

// main.ts(토스 IAP 브릿지)만 번들 → public/index.html 헤드에 주입. 기존 정적 자산(app.js/data.js/comments.js/styles.css/아이콘)은 그대로 dist로 복사.
module.exports = {
  entry: './src/main.ts',
  output: { path: path.resolve(__dirname, 'dist'), filename: 'toss-bridge.[contenthash].js', clean: true },
  resolve: { extensions: ['.ts', '.js'] },
  module: { rules: [{ test: /\.ts$/, use: 'ts-loader', exclude: /node_modules/ }] },
  plugins: [
    new HtmlWebpackPlugin({ template: 'public/index.html', inject: 'head', scriptLoading: 'blocking' }),
    new CopyPlugin({ patterns: [{ from: 'public', to: '.', globOptions: { ignore: ['**/index.html'] } }] }),
  ],
};
