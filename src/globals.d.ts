/** Build-time settings, defined in rspack.config.js. */
declare const BUILD_CONFIG: {
  /** Server-rendered nbviewer to link to, e.g. "https://nbviewer.org/", or "". */
  nbviewerUrl: string;
  /** Binder URL base, e.g. "https://mybinder.org/v2", or "". */
  binderUrl: string;
  /** JupyterLite site, e.g. "https://jupyter.org/try-jupyter/", or "". */
  jupyterliteUrl: string;
};

declare module '*.svg' {
  const svg: string;
  export default svg;
}

declare module '*.md' {
  const source: string;
  export default source;
}
