import assert from 'node:assert/strict';
import { articleIdFromInstapaperUrl, instapaperUrl } from '../src/urls.ts';

assert.equal(articleIdFromInstapaperUrl(instapaperUrl(123)), 123);
assert.equal(articleIdFromInstapaperUrl(' https://www.instapaper.com/read/45/678 '), 45);
assert.equal(articleIdFromInstapaperUrl('http://instapaper.com/read/9?x=1'), 9);

assert.equal(articleIdFromInstapaperUrl('https://instapaper.com/read/12abc'), undefined);
assert.equal(articleIdFromInstapaperUrl('https://example.com/read/1'), undefined);
assert.equal(articleIdFromInstapaperUrl(123), undefined);
assert.equal(articleIdFromInstapaperUrl(undefined), undefined);
