const fs = require('fs');
const path = require('path');
const { rspack } = require('@rspack/core');

// Build-time settings (there is no server to inject them at run time).
// An empty value turns the corresponding links off.
const config = {
  // the server-rendered nbviewer, linked from every page as a fallback
  nbviewerUrl: process.env.NBVIEWER_URL ?? 'https://nbviewer.org/',
  // Binder, for "Execute on Binder" links
  binderUrl: process.env.BINDER_URL ?? 'https://mybinder.org/v2'
};

const requirejsVersion = require('requirejs/package.json').version;
const requirejsPath = `static/vendor/require-${requirejsVersion}.js`;
const jupyterLogo = fs.readFileSync(
  require.resolve('@jupyterlab/ui-components/style/icons/jupyter/jupyter.svg'),
  'utf8'
);

// html-manager renders ipywidgets 7 with its aliased packages base7 (base
// 4.1.7) and controls7. npm can't satisfy controls7's own dependency on
// '@jupyter-widgets/base@^4' with base7, so it nests another base 4.1.7 (with
// its own Backbone) under controls7.
const htmlManager = path.dirname(
  require.resolve('@jupyter-widgets/html-manager/package.json')
);
const base7 = path.dirname(
  require.resolve('@jupyter-widgets/base7/package.json', {
    paths: [htmlManager]
  })
);

module.exports = (env, argv) => ({
  entry: './src/index.ts',
  // Handle AMD/UMD wrappers inside the bundle. Otherwise they call the page's
  // global RequireJS define() (sanitize-html's parse-srcset does, anonymously),
  // which makes the first require() in a notebook output throw.
  amd: {},
  output: {
    path: path.resolve(__dirname, 'dist'),
    // index.html is served at every path, so asset URLs must be absolute
    publicPath: '/',
    filename: 'static/js/[name].[contenthash].js',
    chunkFilename: 'static/js/[name].[contenthash].js',
    assetModuleFilename: 'static/assets/[name].[contenthash][ext]',
    clean: true
  },
  devtool: argv.mode === 'development' ? 'source-map' : false,
  resolve: {
    extensions: ['.ts', '.js'],
    fallback: { path: false, url: false, crypto: false, buffer: false }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        loader: 'builtin:swc-loader',
        options: { jsc: { parser: { syntax: 'typescript' } } },
        type: 'javascript/auto'
      },
      {
        // One base 4.1.7: controls7's views then extend the classes that
        // html-manager hands out for ipywidgets 7 models, and the widgets
        // chunk carries one copy of each.
        issuer: /[\\/]@jupyter-widgets[\\/]controls7[\\/]/,
        resolve: { alias: { '@jupyter-widgets/base$': base7 } }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
        type: 'javascript/auto'
      },
      { test: /\.(html|md)$/, type: 'asset/source' },
      { test: /\.(png|jpe?g|gif|woff2?|ttf|otf|eot)$/, type: 'asset/resource' },
      // JupyterLab imports SVG icons as strings from JS, and as URLs from CSS.
      { test: /\.svg$/, issuer: /\.[jt]s$/, type: 'asset/source' },
      {
        test: /\.svg$/,
        issuer: /\.css$/,
        // Font Awesome's SVG fonts (JupyterLab's and the widgets' icons) are
        // big, and browsers use the woff2 ones: files like the other fonts.
        exclude: /[\\/]webfonts[\\/]/,
        type: 'asset/inline'
      },
      { test: /[\\/]webfonts[\\/].*\.svg$/, type: 'asset/resource' }
    ]
  },
  plugins: [
    // index.html for viewer URLs (public/_redirects), and the same app as
    // 404.html for every other unknown path: it shows "not found", or
    // redirects nbviewer's old bare gist-id URLs (/{id}) to /gist/{id}.
    ...['index.html', '404.html'].map(
      filename =>
        new rspack.HtmlRspackPlugin({
          filename,
          template: './src/index.html',
          favicon: './src/favicon.ico',
          templateParameters: {
            requirejsUrl: '/' + requirejsPath,
            jupyterLogo
          }
        })
    ),
    new rspack.CopyRspackPlugin({
      patterns: [
        { from: 'public' },
        // classic-notebook outputs expect RequireJS as a global, loaded first
        { from: require.resolve('requirejs/require.js'), to: requirejsPath }
      ]
    }),
    new rspack.DefinePlugin({ BUILD_CONFIG: JSON.stringify(config) })
  ],
  devServer: {
    port: 8080,
    // the app for every path that isn't a file (close enough for development)
    historyApiFallback: { disableDotRule: true },
    static: false
  },
  // mathjax-full's component loader references __dirname; it is unused in
  // the browser, where JupyterLab's typesetter imports modules directly.
  ignoreWarnings: [{ module: /mathjax-full/, message: /__dirname/ }],
  performance: { hints: false }
});
