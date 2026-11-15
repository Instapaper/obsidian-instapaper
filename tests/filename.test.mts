import assert from 'node:assert/strict';
import { filenamesForArticle } from '../src/filename.ts';

assert.deepEqual(filenamesForArticle({ id: 1, title: 'Plain title' }), ['Plain title']);
assert.deepEqual(filenamesForArticle({ id: 2, title: 'Hello 🚀 world™' }), ['Hello 🚀 world™']);
assert.deepEqual(filenamesForArticle({ id: 3, title: '' }), ['Untitled-3']);

assert.deepEqual(
    filenamesForArticle({ id: 4, title: 'Foo / Bar:\tBaz' }),
    ['Foo Bar Baz', 'Foo  Bar\tBaz'],
);
assert.deepEqual(
    filenamesForArticle({ id: 5, title: 'C# [tips] ^1' }),
    ['C# tips 1', 'C# [tips] ^1'],
);
assert.deepEqual(
    filenamesForArticle({ id: 6, title: '[^]' }),
    ['Untitled-6', '[^]'],
);
