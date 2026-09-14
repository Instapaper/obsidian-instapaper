import assert from 'node:assert/strict';
import { DeviceAuthorizationError, pollDeviceAuthorization } from '../src/oauth.ts';

const waits = [];
const responses = ['authorization_pending', 'slow_down', { token: 'ok' }];
const result = await pollDeviceAuthorization(
    { expires_in: 60, interval: 5 },
    () => Promise.resolve(responses.shift()),
    new AbortController().signal,
    (ms) => { waits.push(ms); return Promise.resolve(); },
);
assert.deepEqual(result, { token: 'ok' });
assert.deepEqual(waits, [5000, 5000, 10000]);

const controller = new AbortController();
await assert.rejects(
    pollDeviceAuthorization(
        { expires_in: 60, interval: 5 },
        () => Promise.reject(new Error('should not poll')),
        controller.signal,
        () => { controller.abort(); return Promise.resolve(); },
    ),
    (error) => error instanceof DeviceAuthorizationError && error.message === 'Instapaper authorization was canceled',
);

await assert.rejects(
    pollDeviceAuthorization(
        { expires_in: 0, interval: 5 },
        () => Promise.reject(new Error('should not poll')),
        new AbortController().signal,
    ),
    (error) => error instanceof DeviceAuthorizationError && error.message.startsWith('Instapaper authorization expired'),
);
