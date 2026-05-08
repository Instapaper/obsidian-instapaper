// Type declarations to fix missing types in Obsidian definitions

// Fix for missing Frontmatter type in obsidian.d.ts
// This is a known issue with the Obsidian type definitions
type Frontmatter = Record<string, unknown>;

// Electron's `require` is exposed on `window` in the Obsidian desktop app.
// Only the surface we actually use is typed here; guard calls with
// `Platform.isDesktopApp` since `require` is undefined on mobile.
interface Window {
    require?: (module: 'electron') => {
        shell: {
            openExternal: (url: string) => Promise<void>;
        };
    };
}
