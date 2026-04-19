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

export class InstapaperAPI {
    private consumerKey: string;
    private consumerSecret: string;
    options: InstapaperClientOptions;

    constructor(consumerKey: string, consumerSecret: string, options?: Partial<InstapaperClientOptions>) {
        this.consumerKey = consumerKey;
        this.consumerSecret = consumerSecret;
        this.options = Object.assign({}, DEFAULT_OPTIONS, options);
    }

    private async fetch(
        url: string,
        method: string,
        token: InstapaperAccessToken,
        data?: Record<string, unknown>,
        options?: { json?: boolean },
    ) {
        let requestURL = url;
        let body: string | undefined;
        let contentType: string | undefined;

        if (data) {
            if (method === 'GET') {
                const params = new URLSearchParams();
                for (const [k, v] of Object.entries(data)) {
                    if (v != null) params.set(k, String(v));
                }
                requestURL += '?' + params.toString();
            } else if (options?.json) {
                body = JSON.stringify(data);
                contentType = "application/json";
            } else {
                body = new URLSearchParams(data as Record<string, string>).toString();
                contentType = "application/x-www-form-urlencoded";
            }
        }

        try {
            return await requestUrl({
                url: requestURL,
                method: method,
                contentType: contentType,
                body: body,
                headers: {
                    'Authorization': `Bearer ${token.key}`,
                },
                throw: true,
            });
        } catch (e) {
            throw new Error(`${method} ${requestURL}: ${e}`, { cause: e });
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

        const data = await response.json;
        return {
            token: { key: data.access_token },
            account: data.user as InstapaperAccount,
        };
    }

    async verifyCredentials(token: InstapaperAccessToken): Promise<InstapaperAccount> {
        const response = await this.fetch(
            `${this.options.baseURL}/api/2/me`,
            'GET',
            token,
        );

        return (await response.json) as InstapaperAccount;
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
        const response = await this.fetch(
            `${this.options.baseURL}/api/2/bookmarks`,
            'POST',
            token,
            data,
            { json: true },
        );

        return (await response.json) as InstapaperBookmark;
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
        const response = await this.fetch(
            `${this.options.baseURL}/api/2/private/highlights`,
            'GET',
            token,
            data,
        );

        const { highlights, bookmarks }: {
            highlights: InstapaperHighlight[],
            bookmarks: InstapaperBookmark[],
        } = await response.json;

        return {
            highlights,
            bookmarks: Object.fromEntries(bookmarks.map(b => [b.id, b]))
        }
    }
}
