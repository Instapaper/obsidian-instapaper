import { TFile, Vault, normalizePath } from "obsidian";
import type InstapaperPlugin from "./main";
import type { InstapaperAccessToken, InstapaperBookmark, InstapaperHighlight } from "./api";

const linkSymbol = '↗';

export async function syncNotes(
    plugin: InstapaperPlugin,
    token: InstapaperAccessToken,
    cursor: number,
): Promise<{
    cursor: number;
    count: number;
}> {
    const { vault, fileManager } = plugin.app;

    const folder = normalizePath(plugin.settings.notesFolder);
    if (!await vault.adapter.exists(folder)) {
        await vault.createFolder(folder)
        cursor = 0;
    }

    let highlights: [InstapaperHighlight]
    let count = 0;

    do {
        let bookmarks: Record<string, InstapaperBookmark>

        try {
            ({ highlights, bookmarks } = await plugin.api.getHighlights(token, {
                after: cursor,
                sort: 'asc',
            }));
        } catch (e) {
            plugin.log('Failed to get highlights:', e);
            return { cursor, count };
        }

        for (const highlight of highlights) {
            cursor = highlight.highlight_id;

            const article = bookmarks[highlight.article_id];
            if (!article) continue;

            const file = await fileForArticle(article, vault, folder);
            if (!file) continue;

            // Refresh the file's front matter (for new and existing files).
            fileManager.processFrontMatter(file, (frontmatter) => {
                frontmatter['url'] = article.url;
                frontmatter['date'] = formatTimestamp(article.time);
                if (article.pubtime) {
                    frontmatter['pubdate'] = formatTimestamp(article.pubtime);
                }
                if (article.author) {
                    frontmatter['author'] = article.author;
                }
            })

            // We'll nearly always append the new highlight to the file, but
            // we first check if the highlight has previously been added just
            // in case the cursor was reset or is otherwise out-of-sync with
            // the contents of the vault.
            if (!hasHighlight(await vault.read(file), highlight)) {
                await vault.append(file, contentForHighlight(highlight));
                count++;
            }
        }
    } while (highlights.length > 0);

    return { cursor, count };
}

async function fileForArticle(
    article: InstapaperBookmark,
    vault: Vault,
    folder: string,
): Promise<TFile | null> {
    const name = article.title.replace(/[\\/:<>?|*"]/gm, '').substring(0, 250);
    const path = normalizePath(`${folder}/${name}.md`);
    const file = vault.getFileByPath(path);

    return file || vault.create(path, '');
}

function linkForHighlight(highlight: InstapaperHighlight): string {
    return `https://www.instapaper.com/read/${highlight.article_id}/${highlight.highlight_id}`
}

function hasHighlight(content: string, highlight: InstapaperHighlight): boolean {
    return content.contains(linkForHighlight(highlight));
}

function contentForHighlight(highlight: InstapaperHighlight): string {
    let content = highlight.text.replace(/^/gm, '> ');
    content += ` [${linkSymbol}](${linkForHighlight(highlight)})`;
    content += "\n\n"
    if (highlight.note) {
        content += highlight.note + "\n\n";
    }

    return content;
}

function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return `${date.getFullYear().toString().padStart(4, '0')}-`
        + `${(date.getMonth() + 1).toString().padStart(2, '0')}-`
        + `${date.getDate().toString().padStart(2, '0')}`;
}