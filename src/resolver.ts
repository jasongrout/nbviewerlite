import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';

/**
 * Resolve relative links and images in rendered markdown and HTML against
 * the notebook's source URL, instead of against the viewer page.
 *
 * Images and other embedded resources load from the source. Links go
 * wherever the provider's `linkFor` sends them, e.g. other notebooks stay
 * in the viewer.
 */
export class SourceResolver implements IRenderMime.IResolver {
  private readonly sourceUrl: string;
  private readonly linkFor: (absoluteUrl: string) => string;

  constructor(sourceUrl: string, linkFor: (absoluteUrl: string) => string) {
    this.sourceUrl = sourceUrl;
    this.linkFor = linkFor;
  }

  isLocal(url: string): boolean {
    // fragment links stay as they are: they point into this page
    if (url.startsWith('#') || url.startsWith('//')) {
      return false;
    }
    try {
      new URL(url);
      return false;
    } catch {
      // No scheme: relative to the notebook.
      return true;
    }
  }

  async resolveUrl(
    url: string,
    context?: IRenderMime.IResolveUrlContext
  ): Promise<string> {
    const absolute = new URL(url, this.sourceUrl).href;
    return context?.tag === 'a' ? this.linkFor(absolute) : absolute;
  }

  async getDownloadUrl(url: string): Promise<string> {
    return url;
  }
}
