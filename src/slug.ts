/**
 * Heading ids as Python-Markdown's toc extension makes them (slugify and
 * unique in markdown/extensions/toc.py). nbviewer's FAQ uses it, so links to
 * its questions keep working here where the question is the same.
 */

/** A heading's text as an id: ASCII words joined by '-'. */
export function slugify(text: string): string {
  return (
    text
      // accented Latin letters lose their accents, other non-ASCII goes
      .normalize('NFKD')
      .replace(/[^\x00-\x7f]/g, '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[-\s]+/g, '-')
  );
}

/** `id`, or if it is empty or taken, `id_1`, `id_2`, ...; added to `ids`. */
export function uniqueId(id: string, ids: Set<string>): string {
  while (!id || ids.has(id)) {
    const count = /^(.*)_([0-9]+)$/.exec(id);
    id = count ? `${count[1]}_${Number(count[2]) + 1}` : `${id}_1`;
  }
  ids.add(id);
  return id;
}
