// Type declarations to fix missing types in Obsidian definitions

// Fix for missing Frontmatter type in obsidian.d.ts
// This is a known issue with the Obsidian type definitions
type Frontmatter = Record<string, unknown>;
