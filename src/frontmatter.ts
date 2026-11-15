import { App, TFile, FileManager, getFrontMatterInfo, moment, parseYaml } from "obsidian";
import type { InstapaperBookmark, InstapaperTag } from "./api";
import type { FrontmatterField, FrontmatterSettings } from "./settings";
import { DEFAULT_SETTINGS } from "./settings";
import { INSTAPAPER_URL_PROPERTY, instapaperUrl } from "./urls";

/**
 * Obsidian default properties
 *
 * @see https://help.obsidian.md/properties#Default+properties
 */
const OBSIDIAN_PROPERTIES = new Set(['cssclasses', 'aliases', 'tags']);

/**
 * Apply article frontmatter properties to a file based on settings.
 *
 * @param file The file to update
 * @param article Partial article data to apply
 * @param settings Frontmatter configuration settings
 * @param fileManager Obsidian file manager
 * @param options Optional settings for the operation
 *
 * @see https://help.obsidian.md/properties
 */
export async function applyArticleFrontmatter(
    file: TFile,
    article: Partial<InstapaperBookmark>,
    settings: FrontmatterSettings,
    fileManager: FileManager,
    options?: { removeDisabled?: boolean }
): Promise<void> {
    // Property order is preserved for existing files while new files
    // will have properties added in the order below.
    await fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
        if (settings.title.enabled && settings.title.propertyName) {
            if (article.title) {
                frontmatter[settings.title.propertyName] = article.title;
            } else {
                delete frontmatter[settings.title.propertyName];
            }
        }

        if (settings.author.enabled && settings.author.propertyName) {
            if (article.author) {
                frontmatter[settings.author.propertyName] = article.author;
            } else {
                delete frontmatter[settings.author.propertyName];
            }
        }

        if (settings.url.enabled && settings.url.propertyName) {
            if (article.url) {
                frontmatter[settings.url.propertyName] = article.url;
            } else {
                delete frontmatter[settings.url.propertyName];
            }
        }

        if (article.id) {
            frontmatter[INSTAPAPER_URL_PROPERTY] = instapaperUrl(article.id);
        }

        if (settings.pubdate.enabled && settings.pubdate.propertyName) {
            if (article.pubtime) {
                frontmatter[settings.pubdate.propertyName] = formatTimestamp(article.pubtime);
            } else {
                delete frontmatter[settings.pubdate.propertyName];
            }
        }

        if (settings.date.enabled && settings.date.propertyName) {
            if (article.time) {
                frontmatter[settings.date.propertyName] = formatTimestamp(article.time);
            } else {
                delete frontmatter[settings.date.propertyName];
            }
        }

        if (settings.tags.enabled && settings.tags.propertyName) {
            if (article.tags && article.tags.length > 0) {
                frontmatter[settings.tags.propertyName] = article.tags.map(normalizeTag);
            } else {
                delete frontmatter[settings.tags.propertyName];
            }
        }

        if (settings.source.enabled && settings.source.propertyName) {
            frontmatter[settings.source.propertyName] = settings.source.value;
        }

        if (options?.removeDisabled) {
            const settingsFields = Object.values(settings) as FrontmatterField[];
            const defaultFields = Object.values(DEFAULT_SETTINGS.frontmatter) as FrontmatterField[];

            // Enabled properties (in settings)
            const enabledNames = new Set(
                settingsFields.flatMap(field =>
                    field.enabled && field.propertyName ? [field.propertyName] : []
                )
            );

            // Known Instapaper properties (defaults and current settings)
            const knownNames = new Set(
                [...defaultFields, ...settingsFields].flatMap(field =>
                    field.propertyName ? [field.propertyName] : []
                )
            );

            // Remove properties that are:
            // 1. Currently disabled in settings (!enabledNames)
            // 2. Recognized as Instapaper properties (knownNames)
            // 3. Not Obsidian system properties (!OBSIDIAN_PROPERTIES)
            //
            // This preserves:
            // - User custom properties (not in knownNames)
            // - Obsidian system properties (tags, aliases, cssclasses)
            for (const key of Object.keys(frontmatter)) {
                if (!enabledNames.has(key) && knownNames.has(key) && !OBSIDIAN_PROPERTIES.has(key)) {
                    delete frontmatter[key];
                }
            }
        }
    });
}

/**
 * Read a file's frontmatter. getFileCache() is null until Obsidian indexes a
 * file (e.g. one synced from another device while closed), so those are read
 * directly.
 */
export async function frontmatterFor(app: App, file: TFile): Promise<Frontmatter | undefined> {
    const cache = app.metadataCache.getFileCache(file);
    if (cache) return cache.frontmatter;
    try {
        const info = getFrontMatterInfo(await app.vault.cachedRead(file));
        return info.exists ? parseYaml(info.frontmatter) as Frontmatter : undefined;
    } catch {
        return undefined;
    }
}

// https://help.obsidian.md/tags#Tag+format
function normalizeTag(tag: InstapaperTag): string {
    // Obsidian tags cannot contain spaces.
    let name = tag.name.trim().replace(/\s+/g, '-');

    // Obsidian tags cannot be entirely numeric.
    if (/^\d+$/.test(name)) {
        name += "_";
    }

    return name;
}

// https://help.obsidian.md/properties#Date
function formatTimestamp(timestamp: number): string {
    return moment.unix(timestamp).format("YYYY-MM-DD");
}
