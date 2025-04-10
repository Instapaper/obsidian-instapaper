import OAuth from "oauth-1.0a";
import hmacsha1 from "hmacsha1";
import { requestUrl } from "obsidian";

export interface InstapaperClientOptions {
    baseURL: string;
}

const DEFAULT_OPTIONS: InstapaperClientOptions = {
    baseURL: 'https://www.instapaper.com/api'
}

// Like OAuth.Token but distinct so it can be used as a stable Settings type.
export type InstapaperAccessToken = {
    key: string;
    secret: string;
}

export type InstapaperAccount = {
    type: "user";
    user_id: number;
    username: string;
}

export type InstapaperBookmark = {
    type: "bookmark";
    author: string;
    bookmark_id: number;
    description: string;
    hash: string;
    private_source: string;
    progress: number;
    progress_timestamp: number;
    pubtime: number;
    starred: "0" | "1";
    tags: InstapaperTag[];
    time: number;
    title: string;
    url: string;
    words: number;
}

export type InstapaperTag = {
    count: number;
    hash: string;
    id: number;
    name: string;
    slug: string;
    time: number;
}

export type InstapaperHighlight = {
    highlight_id: number;
    article_id: string;
    time: number;
    text: string;
    note: string | null;
}

export class InstapaperAPI {
    oauth: OAuth
    options: InstapaperClientOptions;

    constructor(consumerKey: string, consumerSecret: string, options?: InstapaperClientOptions) {
        this.oauth = new OAuth({
            consumer: {
                key: consumerKey,
                secret: consumerSecret,
            },
            signature_method: "HMAC-SHA1",
            hash_function(base_string: string, key: string) {
                return hmacsha1(key, base_string);
            },
            parameter_seperator: ", "
        });
        this.options = Object.assign({}, DEFAULT_OPTIONS, options);
    }

    private async fetch(request: OAuth.RequestOptions, token?: OAuth.Token) {
        const authorization = this.oauth.authorize(request, token);

        let url = request.url;
        let body: string | undefined;
        let contentType: string | undefined;

        if (request.data) {
            if (request.method == 'GET') {
                url += '?' + new URLSearchParams(request.data).toString();
            } else {
                body = new URLSearchParams(request.data).toString();
                contentType = "application/x-www-form-urlencoded";
            }
        }

        return await requestUrl({
            url: url,
            method: request.method,
            contentType: contentType,
            body: body,
            headers: { ...this.oauth.toHeader(authorization) },
            throw: true,
        });
    }

    async getAccessToken(username: string, password: string): Promise<InstapaperAccessToken> {
        const response = await this.fetch(
            {
                url: `${this.options.baseURL}/1.1/oauth/access_token`,
                method: 'POST',
                data: {
                    x_auth_username: username,
                    x_auth_password: password,
                    x_auth_mode: "client_auth",
                },
            }
        )

        const params = new URLSearchParams(response.text);
        const key = params.get("oauth_token") || "";
        const secret = params.get("oauth_token_secret") || "";
        return { key, secret }
    }

    async verifyCredentials(token: InstapaperAccessToken): Promise<InstapaperAccount> {
        const response = await this.fetch(
            {
                url: `${this.options.baseURL}/1.1/account/verify_credentials`,
                method: 'POST',
            },
            token,
        )

        const data = await response.json as [InstapaperAccount]
        return data[0];
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
            {
                url: `${this.options.baseURL}/1.1/bookmarks/add`,
                method: 'POST',
                data: data,
            },
            token,
        );

        const bookmarks = await response.json as [InstapaperBookmark]
        return bookmarks[0];
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
        highlights: [InstapaperHighlight],
        bookmarks: Record<string, InstapaperBookmark>,
    }> {
        const response = await this.fetch(
            {
                url: `${this.options.baseURL}/highlights`,
                method: 'GET',
                data: data,
            },
            token,
        )

        const { highlights, bookmarks }: {
            highlights: [InstapaperHighlight],
            bookmarks: [InstapaperBookmark],
        } = await response.json;

        return {
            highlights,
            bookmarks: Object.fromEntries(bookmarks.map(b => [b.bookmark_id, b]))
        }
    }
}
