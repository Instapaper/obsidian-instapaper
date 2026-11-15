import { App, TFile, Vault, normalizePath } from "obsidian";
import Mustache from "mustache";
import type InstapaperPlugin from "./main";
import type { InstapaperAccessToken, InstapaperBookmark, InstapaperHighlight } from "./api";
import { applyArticleFrontmatter, frontmatterFor } from "./frontmatter";
import { filenamesForArticle } from "./filename";
import { INSTAPAPER_URL_PROPERTY, articleIdFromInstapaperUrl, instapaperUrl } from "./urls";

// Disable HTML escaping. We render to Markdown.
Mustache.escape = (text: string) => text;

/** A sync failure whose message is meant to be shown to the user. */
export class SyncError extends Error { }

export interface SyncNotesOptions {
    /**
     * Whether to create new files for articles.
     * @default true
     */
    createFiles?: boolean;

    /**
     * Whether to update frontmatter properties: all enabled properties
     * (`true`), only the `instapaper-url` property of notes that lack it
     * (`INSTAPAPER_URL_PROPERTY`), or none (`false`).
     * @default true
     */
    syncProperties?: boolean | typeof INSTAPAPER_URL_PROPERTY;

    /**
     * Whether to remove disabled frontmatter properties.
     * @default false
     */
    removeDisabledProperties?: boolean;

    /**
     * Whether to sync highlights to notes.
     * When false, only frontmatter is updated.
     * @default true
     */
    syncHighlights?: boolean;

    /**
     * Replace highlights rendered with `from` template using `to` template.
     * Highlights that don't match the `from` rendering are skipped.
     */
    updateHighlightTemplate?: { from?: string; to: string };

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
    succeeded: boolean;
}> {
    const opts = {
        createFiles: true,
        syncProperties: true,
        removeDisabledProperties: false,
        syncHighlights: true,
        maxErrors: 3,
        ...options
    };
    const { vault, fileManager } = plugin.app;
    const template = plugin.settings.highlightTemplate;

    const folder = normalizePath(plugin.settings.notesFolder);
    if (!vault.getFolderByPath(folder)) {
        // The folder doesn't appear in the vault index. If it nonetheless exists
        // on disk, the index is stale and nothing here can repair it: createFolder
        // won't touch an existing path, and writing anyway would put the notes
        // somewhere Obsidian will never display.
        if (await vault.adapter.exists(folder)) {
            throw new SyncError(
                `The notes folder "${folder}" exists on disk but is not visible to Obsidian. ` +
                `Restart Obsidian or choose a different notes folder.`
            );
        }
        if (!opts.createFiles) {
            return { cursor, count: 0, succeeded: true };
        }
        await vault.createFolder(folder);
        cursor = 0;
    }

    const index = await indexNotes(plugin.app, folder);

    let count = 0;
    let errors = 0;
    let succeeded = true;

    while (true) {
        let highlights: InstapaperHighlight[];
        let bookmarks: Record<number, InstapaperBookmark>;

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
                succeeded = false;
                break;
            }
            continue;
        }

        if (highlights.length === 0) break;

        for (const highlight of highlights) {
            cursor = highlight.id;

            const article = bookmarks[highlight.bookmark_id];
            if (!article) continue;

            // Resolve a TFile for this article. This will be an existing file,
            // a new (empty) file if creation is enabled, or null if it doesn't
            // exist and wasn't created (in which case we skip this article).
            let file: TFile | null;
            try {
                file = await fileForArticle(article, vault, folder, index, opts.createFiles);
                if (!file) continue;
            } catch (e) {
                plugin.log(`fileForArticle("${article.title}"):`, e);
                continue;
            }

            const indexed = index.has(article.id);
            index.set(article.id, file);

            // Refresh the file's front matter (for new and existing files).
            // Invalid YAML makes this throw; skip it so one note can't block
            // every sync.
            try {
                if (opts.syncProperties === INSTAPAPER_URL_PROPERTY) {
                    if (!indexed) {
                        await fileManager.processFrontMatter(file, (frontmatter: Frontmatter) => {
                            frontmatter[INSTAPAPER_URL_PROPERTY] = instapaperUrl(article.id);
                        });
                    }
                } else if (opts.syncProperties) {
                    await applyArticleFrontmatter(
                        file,
                        article,
                        plugin.settings.frontmatter,
                        fileManager,
                        { removeDisabled: opts.removeDisabledProperties }
                    );
                }
            } catch (e) {
                plugin.log(`Failed to update properties of "${file.path}":`, e);
            }

            // Update existing highlights if a template replacement is requested.
            if (opts.updateHighlightTemplate) {
                const { from, to } = opts.updateHighlightTemplate;
                const oldFormat = (from == null
                    ? legacyContentForHighlight(highlight)
                    : contentForHighlight(highlight, from)
                ).trimEnd();
                const newFormat = contentForHighlight(highlight, to).trimEnd();
                const fileContent = await vault.read(file);
                if (fileContent.includes(oldFormat)) {
                    await vault.modify(file, fileContent.replace(oldFormat, newFormat));
                }
            }

            // Append this highlight if syncing is enabled and it doesn't already
            // exist in the file.
            if (opts.syncHighlights) {
                const fileContent = await vault.read(file);
                if (!hasHighlightMarker(fileContent, highlight)) {
                    await vault.append(file, contentForHighlight(highlight, template));
                    count++;
                }
            }
        }
    }

    return { cursor, count, succeeded };
}

/**
 * Notes anywhere in the vault, by article ID. When several notes share an ID
 * (e.g. a copied note), the one inside our notes folder is preferred.
 */
async function indexNotes(app: App, folder: string): Promise<Map<number, TFile>> {
    const index = new Map<number, TFile>();
    const inFolder = (file: TFile) => file.path.startsWith(`${folder}/`);
    for (const file of app.vault.getMarkdownFiles()) {
        const frontmatter = await frontmatterFor(app, file);
        const id = articleIdFromInstapaperUrl(frontmatter?.[INSTAPAPER_URL_PROPERTY]);
        if (id === undefined) continue;
        const existing = index.get(id);
        if (!existing || (inFolder(file) && !inFolder(existing))) {
            index.set(id, file);
        }
    }
    return index;
}

async function fileForArticle(
    article: InstapaperBookmark,
    vault: Vault,
    folder: string,
    index: Map<number, TFile>,
    create: boolean = true
): Promise<TFile | null> {
    const existing = index.get(article.id);
    if (existing) return existing;

    const indexedFiles = new Set(index.values());
    const pathFor = (name: string) => normalizePath(`${folder}/${name}.md`);

    // Prefer the legacy name when both exist so an existing note cannot be
    // shadowed by a newly generated name.
    const [name, ...legacyNames] = filenamesForArticle(article);
    const file = [...legacyNames, name]
        .map(name => vault.getFileByPath(pathFor(name)))
        .find(file => file !== null && !indexedFiles.has(file));
    if (file || !create) return file ?? null;

    // Build a unique path for the selected name by appending an increasing
    // number each time we run into an existing file.
    let path = pathFor(name);
    for (let n = 1; vault.getAbstractFileByPath(path); n++) {
        path = pathFor(`${name} ${n}`);
    }

    return vault.create(path, '');
}

function linkForHighlight(highlight: InstapaperHighlight): string {
    return `https://www.instapaper.com/read/${highlight.bookmark_id}/${highlight.id}`
}

// https://help.obsidian.md/links#Link+to+a+block+in+a+note
function blockIdentifierForHighlight(highlight: InstapaperHighlight): string {
    return `^h${highlight.id}`;
}

function hasHighlightMarker(content: string, highlight: InstapaperHighlight): boolean {
    return content.includes(blockIdentifierForHighlight(highlight))
        || content.includes(linkForHighlight(highlight));
}

// Reproduces the exact output of the pre-template code (1.1.5 release format).
function legacyContentForHighlight(highlight: InstapaperHighlight): string {
    let content = highlight.text.replace(/^/gm, '> ');
    content += ` [↗](${linkForHighlight(highlight)})`;
    content += '\n\n';
    if (highlight.note) {
        content += highlight.note + '\n\n';
    }
    return content.trimEnd() + '\n\n';
}

function contentForHighlight(
    highlight: InstapaperHighlight,
    template: string,
): string {
    const link = linkForHighlight(highlight);
    const blockId = blockIdentifierForHighlight(highlight);

    let content = Mustache.render(template, {
        text: highlight.text,
        note: highlight.note,
        link: link,
        blockId: blockId,
    });

    // Ensure a deduplication anchor is present. If neither the link nor the
    // block identifier is included, append the block identifier. Block
    // identifiers must be preceded by a space (required by Obsidian).
    if (!content.includes(link) && !content.includes(blockId)) {
        content = content.trimEnd() + ` ${blockId}`;
    }

    // Ensure spacing between highlights.
    return content.trimEnd() + '\n\n';
}
