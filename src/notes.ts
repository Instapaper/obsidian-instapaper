import { TFile, Vault, moment, normalizePath } from "obsidian";
import type InstapaperPlugin from "./main";
import type { InstapaperAccessToken, InstapaperBookmark, InstapaperHighlight, InstapaperTag } from "./api";

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

    let count = 0;
    let errors = 0;
    const maxErrors = 3;

    while (true) {
        let highlights: InstapaperHighlight[];
        let bookmarks: Record<string, InstapaperBookmark>;

        try {
            ({ highlights, bookmarks } = await plugin.api.getHighlights(token, {
                after: cursor,
                sort: 'asc',
            }));
            errors = 0; // Reset on success
        } catch (e) {
            plugin.log('Failed to get highlights:', e);
            if (++errors >= maxErrors) {
                plugin.log(`Stopping sync after ${maxErrors} consecutive errors`);
                break;
            }
            continue;
        }

        if (highlights.length === 0) break;

        for (const highlight of highlights) {
            cursor = highlight.highlight_id;

            const article = bookmarks[highlight.article_id];
            if (!article) continue;

            // Resolve a TFile for this article. This will either be an
            // existing file or a new, empty file.
            let file: TFile;
            try {
                file = await fileForArticle(article, vault, folder);
            } catch (e) {
                plugin.log(`fileForArticle("${article.title}"):`, e);
                continue;
            }

            // Refresh the file's front matter (for new and existing files).
            fileManager.processFrontMatter(file, (frontmatter) => {
                frontmatter['url'] = article.url;
                frontmatter['date'] = formatTimestamp(article.time);
                frontmatter['tags'] = (article.tags.length > 0)
                    ? article.tags.map(normalizeTag) : undefined;
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
    }

    return { cursor, count };
}

async function fileForArticle(
    article: InstapaperBookmark,
    vault: Vault,
    folder: string,
): Promise<TFile> {
    // Use a sanitized version of the article's title for our filename.
    let name = article.title.replace(/[\\/:<>?|*"]/gm, '').substring(0, 250).trim();
    if (!name) {
        name = `Untitled-${article.bookmark_id}`;
    }

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

function normalizeTag(tag: InstapaperTag): string {
    // Obsidian tags cannot contain spaces.
    let name = tag.name.trim().replace(/\s+/g, '-');

    // Obsidian tags cannot be entirely numeric.
    if (/^\d+$/.test(name)) {
        name += "_";
    }

    return name;
}

function formatTimestamp(timestamp: number): string {
    return moment.unix(timestamp).utc().format("YYYY-MM-DD");
}