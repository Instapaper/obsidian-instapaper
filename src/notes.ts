import { TFile, Vault, normalizePath } from "obsidian";
import type InstapaperPlugin from "./main";
import type { InstapaperAccessToken, InstapaperBookmark, InstapaperHighlight } from "./api";
import { applyArticleFrontmatter } from "./frontmatter";

const linkSymbol = '↗';

export interface SyncNotesOptions {
    /**
     * Whether to create new files for articles.
     * @default true
     */
    createFiles?: boolean;

    /**
     * Whether to sync highlights to notes.
     * When false, only frontmatter is updated.
     * @default true
     */
    syncHighlights?: boolean;

    /**
     * Whether to remove disabled frontmatter properties.
     * @default false
     */
    removeDisabledProperties?: boolean;

    /**
     * Maximum number of consecutive API errors before failing.
     * @default 3
     */
    maxErrors?: number;
}

export async function syncNotes(
    plugin: InstapaperPlugin,
    token: InstapaperAccessToken,
    cursor: number,
    options?: SyncNotesOptions
): Promise<{
    cursor: number;
    count: number;
}> {
    const opts: Required<SyncNotesOptions> = {
        createFiles: true,
        syncHighlights: true,
        removeDisabledProperties: false,
        maxErrors: 3,
        ...options
    };
    const { vault, fileManager } = plugin.app;

    const folder = normalizePath(plugin.settings.notesFolder);
    if (!await vault.adapter.exists(folder)) {
        if (!opts.createFiles) {
            return { cursor, count: 0 };
        }
        await vault.createFolder(folder);
        cursor = 0;
    }

    let count = 0;
    let errors = 0;

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
            if (++errors >= opts.maxErrors) {
                plugin.log(`Stopping sync after ${opts.maxErrors} consecutive errors`);
                break;
            }
            continue;
        }

        if (highlights.length === 0) break;

        for (const highlight of highlights) {
            cursor = highlight.highlight_id;

            const article = bookmarks[highlight.article_id];
            if (!article) continue;

            // Resolve a TFile for this article. This will be an existing file,
            // a new (empty) file if creation is enabled, or null if it doesn't
            // exist and wasn't created (in which case we skip this article).
            let file: TFile | null;
            try {
                file = await fileForArticle(article, vault, folder, opts.createFiles);
                if (!file) continue;
            } catch (e) {
                plugin.log(`fileForArticle("${article.title}"):`, e);
                continue;
            }

            // Refresh the file's front matter (for new and existing files).
            await applyArticleFrontmatter(
                file,
                article,
                plugin.settings.frontmatter,
                fileManager,
                { removeDisabled: opts.removeDisabledProperties }
            );

            // Append this highlight if syncing is enabled and it doesn't already
            // exist in the file.
            if (opts.syncHighlights) {
                const content = await vault.read(file);
                if (!hasHighlight(content, highlight)) {
                    await vault.append(file, contentForHighlight(highlight));
                    count++;
                }
            }
        }
    }

    return { cursor, count };
}

async function fileForArticle(
    article: InstapaperBookmark,
    vault: Vault,
    folder: string,
    create: boolean = true
): Promise<TFile | null> {
    // Use a sanitized version of the article's title for our filename.
    let name = article.title.replace(/[\\/:<>?|*"]/gm, '').substring(0, 250).trim();
    if (!name) {
        name = `Untitled-${article.bookmark_id}`;
    }

    const path = normalizePath(`${folder}/${name}.md`);
    const file = vault.getFileByPath(path);

    return file || (create ? vault.create(path, '') : null);
}

function linkForHighlight(highlight: InstapaperHighlight): string {
    return `https://www.instapaper.com/read/${highlight.article_id}/${highlight.highlight_id}`
}

// https://help.obsidian.md/links#Link+to+a+block+in+a+note
function blockIdentifierForHighlight(highlight: InstapaperHighlight): string {
    return `^h${highlight.highlight_id}`;
}

function hasHighlight(content: string, highlight: InstapaperHighlight): boolean {
    return content.contains(blockIdentifierForHighlight(highlight))
        || content.contains(linkForHighlight(highlight));
}

function contentForHighlight(highlight: InstapaperHighlight): string {
    let content = highlight.text.replace(/^/gm, '> ');
    content += ` [${linkSymbol}](${linkForHighlight(highlight)})`;
    content += ` ${blockIdentifierForHighlight(highlight)}`;
    content += "\n\n"
    if (highlight.note) {
        content += highlight.note + "\n\n";
    }

    return content;
}

