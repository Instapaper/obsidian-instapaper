/** Frontmatter property that links a note to its Instapaper article. */
export const INSTAPAPER_URL_PROPERTY = 'instapaper-url';

export function instapaperUrl(articleId: number): string {
    return `https://instapaper.com/read/${articleId}`;
}

/** Returns the article ID from an `instapaper-url` property value. */
export function articleIdFromInstapaperUrl(value: unknown): number | undefined {
    if (typeof value !== 'string') return undefined;
    const match = /^https?:\/\/(?:www\.)?instapaper\.com\/read\/(\d+)(?:[/?#]|$)/.exec(value.trim());
    return match ? Number(match[1]) : undefined;
}
