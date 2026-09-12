import { requestUrl } from "obsidian";
import { DeviceAuthorizationError, type DevicePollStatus } from "./oauth";

export interface InstapaperClientOptions {
    baseURL: string;
}

const DEFAULT_OPTIONS: InstapaperClientOptions = {
    baseURL: 'https://www.instapaper.com',
}

export type InstapaperAccessToken = {
    key: string;
    secret?: string; // unused, retained for downgrade safety
}

export type InstapaperAccount = {
    id: number;
    username: string;
}

export type InstapaperDeviceAuthorization = {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
    expires_in: number;
    interval: number;
}

export type InstapaperDeviceToken = {
    token: InstapaperAccessToken;
    account: InstapaperAccount;
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

function isURLFromOrigin(value: unknown, origin: string): value is string {
    try {
        return typeof value === 'string' && new URL(value).origin === origin;
    } catch {
        return false;
    }
}

function deviceErrorMessage(error: string): string {
    if (error === 'access_denied') return 'Instapaper authorization was denied';
    if (error === 'expired_token') return 'Instapaper authorization expired; try connecting again';
    return 'Failed to connect Instapaper account';
}

export class InstapaperAPI {
    private consumerKey: string;
    options: InstapaperClientOptions;

    constructor(consumerKey: string, options?: Partial<InstapaperClientOptions>) {
        this.consumerKey = consumerKey;
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

    async requestDeviceCode(): Promise<InstapaperDeviceAuthorization> {
        const response = await requestUrl({
            url: `${this.options.baseURL}/oauth2/device/code`,
            method: 'POST',
            contentType: 'application/x-www-form-urlencoded',
            body: new URLSearchParams({ client_id: this.consumerKey }).toString(),
            throw: true,
        });
        const data = response.json as Partial<InstapaperDeviceAuthorization>;
        const baseOrigin = new URL(this.options.baseURL).origin;

        if (
            typeof data.device_code !== 'string' ||
            typeof data.user_code !== 'string' ||
            !isURLFromOrigin(data.verification_uri, baseOrigin) ||
            (data.verification_uri_complete != null &&
                !isURLFromOrigin(data.verification_uri_complete, baseOrigin)) ||
            typeof data.expires_in !== 'number' ||
            !Number.isFinite(data.expires_in) ||
            data.expires_in <= 0 ||
            typeof data.interval !== 'number' ||
            !Number.isFinite(data.interval) ||
            data.interval <= 0
        ) {
            throw new Error('Invalid device authorization response');
        }

        return data as InstapaperDeviceAuthorization;
    }

    async pollDeviceToken(deviceCode: string): Promise<InstapaperDeviceToken | DevicePollStatus> {
        const response = await requestUrl({
            url: `${this.options.baseURL}/oauth2/token`,
            method: 'POST',
            contentType: 'application/x-www-form-urlencoded',
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
                device_code: deviceCode,
                client_id: this.consumerKey,
            }).toString(),
            throw: false,
        });
        const data = response.json as {
            access_token?: unknown;
            user?: Partial<InstapaperAccount>;
            error?: unknown;
            error_description?: unknown;
        };

        if (response.status >= 400) {
            const error = typeof data.error === 'string' ? data.error : 'unknown_error';
            if (error === 'authorization_pending' || error === 'slow_down') return error;
            throw new DeviceAuthorizationError(
                typeof data.error_description === 'string' ? data.error_description : deviceErrorMessage(error),
            );
        }

        if (
            typeof data.access_token !== 'string' ||
            typeof data.user?.id !== 'number' ||
            typeof data.user.username !== 'string'
        ) {
            throw new Error('Invalid device token response');
        }

        return {
            token: { key: data.access_token },
            account: data.user as InstapaperAccount,
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
