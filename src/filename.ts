import type { InstapaperBookmark } from './api';

// Characters that are invalid in filenames on at least one platform.
const INVALID_CHARS = /[\\/:<>?|*"]/g;

// Characters that break Obsidian links to a file. `#` does too, but it's kept
// because it often carries meaning in titles (e.g. "C#").
// https://obsidian.md/help/Linking+notes+and+files/Internal+links
const LINK_BREAKING_CHARS = /[\^[\]]/g;

/**
 * Return the note filenames for an article, ordered by preference.
 */
export function filenamesForArticle(
    article: Pick<InstapaperBookmark, 'id' | 'title'>,
): string[] {
    const title = (article.title ?? '').replace(INVALID_CHARS, '');
    const legacyName = finalize(title, article.id);
    const preferredName = finalize(
        title.replace(LINK_BREAKING_CHARS, '').replace(/\s+/g, ' '),
        article.id,
    );
    return preferredName === legacyName ? [preferredName] : [preferredName, legacyName];
}

function finalize(name: string, id: number): string {
    return name.substring(0, 250).trim() || `Untitled-${id}`;
}
