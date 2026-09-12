export type DevicePollStatus = 'authorization_pending' | 'slow_down';

export class DeviceAuthorizationError extends Error {}

function wait(ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.resolve();

    return new Promise((resolve) => {
        const done = () => {
            clearTimeout(timeout);
            signal.removeEventListener('abort', done);
            resolve();
        };
        const timeout = setTimeout(done, ms);
        signal.addEventListener('abort', done, { once: true });
    });
}

export async function pollDeviceAuthorization<T>(
    authorization: { expires_in: number; interval: number },
    poll: () => Promise<T | DevicePollStatus>,
    signal: AbortSignal,
    sleep: (ms: number, signal: AbortSignal) => Promise<void> = wait,
): Promise<T> {
    const expiresAt = Date.now() + authorization.expires_in * 1000;
    let interval = Math.max(1, authorization.interval) * 1000;

    while (!signal.aborted) {
        const remaining = expiresAt - Date.now();
        if (remaining <= 0) throw new DeviceAuthorizationError('Instapaper authorization expired; try connecting again');

        await sleep(Math.min(interval, remaining), signal);
        if (signal.aborted) throw new DeviceAuthorizationError('Instapaper authorization was canceled');
        if (Date.now() >= expiresAt) throw new DeviceAuthorizationError('Instapaper authorization expired; try connecting again');

        const result = await poll();
        if (result === 'authorization_pending') continue;
        if (result === 'slow_down') {
            interval += 5000;
            continue;
        }
        return result;
    }

    throw new DeviceAuthorizationError('Instapaper authorization was canceled');
}
