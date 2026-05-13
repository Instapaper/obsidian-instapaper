import { requestUrl } from "obsidian";

export interface InstapaperClientOptions {
    baseURL: string;
    oauthRedirectURI: string;
}

const DEFAULT_OPTIONS: InstapaperClientOptions = {
    baseURL: 'https://www.instapaper.com',
    oauthRedirectURI: 'obsidian://instapaper-auth',
}

export type InstapaperAccessToken = {
    key: string;
    secret?: string; // unused, retained for downgrade safety
}

export type InstapaperAccount = {
    id: number;
    username: string;
}

export type InstapaperBookmark = {
    id: number;
    url: string | null;
    title: string | null;
    description: string | null;
    image: string | null;
    progress: {
        percentage: number;
        timestamp: number;
    };
    liked: boolean;
    archived: boolean;
    time: number;
    tags: InstapaperTag[];
    private_source: string | null;
    author: string | null;
    pubtime: number | null;
}

export type InstapaperTag = {
    id: number;
    name: string;
    slug: string;
    count: number;
    baton: string | null;
}

export type InstapaperHighlight = {
    id: number;
    bookmark_id: number;
    text: string;
    note: string | null;
    position: number;
    time: number;
}

function encodeFormData(data: Record<string, string | number | boolean | null | undefined>): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(data)) {
        if (v != null) params.set(k, String(v));
    }
    return params.toString();
}

export class InstapaperAPI {
    private consumerKey: string;
    private consumerSecret: string;
    options: InstapaperClientOptions;

    constructor(consumerKey: string, consumerSecret: string, options?: Partial<InstapaperClientOptions>) {
        this.consumerKey = consumerKey;
        this.consumerSecret = consumerSecret;
        this.options = Object.assign({}, DEFAULT_OPTIONS, options);
    }

    private async fetch<T>(
        url: string,
        method: string,
        token: InstapaperAccessToken,
        data?: Record<string, string | number | boolean | null | undefined>,
        options?: { json?: boolean },
    ): Promise<T> {
        let requestURL = url;
        let body: string | undefined;
        let contentType: string | undefined;

        if (data) {
            if (method === 'GET') {
                requestURL += '?' + encodeFormData(data);
            } else if (options?.json) {
                body = JSON.stringify(data);
                contentType = "application/json";
            } else {
                body = encodeFormData(data);
                contentType = "application/x-www-form-urlencoded";
            }
        }

        try {
            const response = await requestUrl({
                url: requestURL,
                method: method,
                contentType: contentType,
                body: body,
                headers: {
                    'Authorization': `Bearer ${token.key}`,
                },
                throw: true,
            });
            return (await response.json) as T;
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            throw new Error(`${method} ${requestURL}: ${message}`, { cause: e });
        }
    }

    getAuthorizeURL(): string {
        const params = new URLSearchParams({
            client_id: this.consumerKey,
            redirect_uri: this.options.oauthRedirectURI,
            response_type: 'code',
        });
        return `${this.options.baseURL}/oauth2/authorize?${params.toString()}`;
    }

    async exchangeCode(
        code: string,
    ): Promise<{ token: InstapaperAccessToken; account: InstapaperAccount }> {
        const response = await requestUrl({
            url: `${this.options.baseURL}/oauth2/token`,
            method: 'POST',
            contentType: 'application/x-www-form-urlencoded',
            body: new URLSearchParams({
                client_id: this.consumerKey,
                redirect_uri: this.options.oauthRedirectURI,
                client_secret: this.consumerSecret,
                code: code,
            }).toString(),
            throw: true,
        });

        const data = (await response.json) as {
            access_token: string;
            user: InstapaperAccount;
        };
        return {
            token: { key: data.access_token },
            account: data.user,
        };
    }

    async verifyCredentials(token: InstapaperAccessToken): Promise<InstapaperAccount> {
        return await this.fetch<InstapaperAccount>(
            `${this.options.baseURL}/api/2/me`,
            'GET',
            token,
        );
    }

    async addBookmark(
        token: InstapaperAccessToken,
        data: {
            url: string,
            title?: string,
            description?: string,
            folder_id?: number,
        },
    ): Promise<InstapaperBookmark> {
        return await this.fetch<InstapaperBookmark>(
            `${this.options.baseURL}/api/2/bookmarks`,
            'POST',
            token,
            data,
            { json: true },
        );
    }

    async getHighlights(
        token: InstapaperAccessToken,
        data?: {
            after?: number,
            offset?: number,
            limit?: number,
            sort?: 'asc' | 'desc',
        },
    ): Promise<{
        highlights: InstapaperHighlight[],
        bookmarks: Record<number, InstapaperBookmark>,
    }> {
        const { highlights, bookmarks } = await this.fetch<{
            highlights: InstapaperHighlight[],
            bookmarks: InstapaperBookmark[],
        }>(
            `${this.options.baseURL}/api/2/private/highlights`,
            'GET',
            token,
            data,
        );

        return {
            highlights,
            bookmarks: Object.fromEntries(bookmarks.map(b => [b.id, b]))
        }
    }
}
