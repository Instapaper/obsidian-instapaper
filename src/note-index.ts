import { normalizePath } from "obsidian";

export interface ImportedArticleRecord {
    path: string | null;
    deleted: boolean;
}

export type ImportedArticleIndex = Record<string, ImportedArticleRecord>;

function articleKey(articleId: number): string {
    return String(articleId);
}

export function getImportedArticle(
    index: ImportedArticleIndex,
    articleId: number,
): ImportedArticleRecord | undefined {
    return index[articleKey(articleId)];
}

export function setImportedArticlePath(
    index: ImportedArticleIndex,
    articleId: number,
    path: string,
): ImportedArticleIndex {
    const normalizedPath = normalizePath(path);
    const key = articleKey(articleId);
    const current = index[key];

    if (current && current.path === normalizedPath && !current.deleted) {
        return index;
    }

    return {
        ...index,
        [key]: {
            path: normalizedPath,
            deleted: false,
        },
    };
}

export function markImportedArticleDeleted(
    index: ImportedArticleIndex,
    articleId: number,
): ImportedArticleIndex {
    const key = articleKey(articleId);
    const current = index[key];

    if (current?.deleted && current.path == null) {
        return index;
    }

    return {
        ...index,
        [key]: {
            path: null,
            deleted: true,
        },
    };
}

export function renameImportedArticlePath(
    index: ImportedArticleIndex,
    oldPath: string,
    newPath: string,
): ImportedArticleIndex {
    const normalizedOldPath = normalizePath(oldPath);
    const normalizedNewPath = normalizePath(newPath);

    for (const [articleId, record] of Object.entries(index)) {
        if (record.path !== normalizedOldPath) {
            continue;
        }

        return {
            ...index,
            [articleId]: {
                path: normalizedNewPath,
                deleted: false,
            },
        };
    }

    return index;
}

export function markImportedArticleDeletedByPath(
    index: ImportedArticleIndex,
    path: string,
): ImportedArticleIndex {
    const normalizedPath = normalizePath(path);

    for (const [articleId, record] of Object.entries(index)) {
        if (record.path !== normalizedPath) {
            continue;
        }

        return {
            ...index,
            [articleId]: {
                path: null,
                deleted: true,
            },
        };
    }

    return index;
}
