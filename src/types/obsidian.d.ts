// Type declarations to fix missing types in Obsidian definitions

export {};

declare global {
	// Fix for missing Frontmatter type in obsidian.d.ts
	// This is a known issue with the Obsidian type definitions
	type Frontmatter = Record<string, unknown>;
}

declare module 'obsidian' {
	interface SecretStorage {
		// Available at runtime but missing from Obsidian's public types.
		deleteSecret(id: string): void;
	}
}
