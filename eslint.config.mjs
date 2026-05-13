// @ts-check

import eslint from '@eslint/js';
import noUnsanitized from 'eslint-plugin-no-unsanitized';
import security from 'eslint-plugin-security';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    noUnsanitized.configs.recommended,
    security.configs.recommended,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
            },
        },
        rules: {
            // Noisy in TypeScript: fires on every computed property access
            // even when the key is constrained by `keyof T`.
            'security/detect-object-injection': 'off',
        },
    },
    {
        ignores: ['main.js'],
    },
);
