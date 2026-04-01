// Minimal process.env types for esbuild define replacements.
// These references are replaced at build time and don't exist at runtime.
declare const process: {
	env: Record<string, string | undefined>;
};
