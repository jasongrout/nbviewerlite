/**
 * JupyterLab's dark theme defines its variables on :root, as the light one
 * does. This loader (rspack.config.js) scopes them to the page's dark theme
 * (src/theme.ts), so both themes' variables load and the page switches
 * between them with an attribute.
 */
module.exports = function (source) {
  return source.replaceAll(':root', ":root[data-nbv-theme='dark']");
};
