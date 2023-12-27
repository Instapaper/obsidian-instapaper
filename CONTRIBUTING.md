# Contributing

Contributions are welcome! This guide attempts to answer common question about how the project works.

## Getting Started

- Clone this repo to `<Vault>/.obsidian/plugins/obsidian-instapaper/`
- Make sure your NodeJS is at least v16 (`node --version`)
- `npm i` or `yarn` to install dependencies
- `npm run dev` to start compilation in watch mode
- Reload Obsidian to discover the plugin
- Enable the `Instapaper` plugin in the Obsidian Settings window

You might also want to install the [Hot-Reload](https://github.com/pjeby/hot-reload) plugin to automatically reload the code during development.

### Manual Installation

If you need to manually install a copy of this plugin, copy the `main.js`, `styles.css`, `manifest.json` files to your vault (e.g. `<Vault>/.obsidian/plugins/obsidian-instapaper/`).

## ESLint

[ESLint](https://eslint.org/) is used to maintain code quality. To run it over the entire project:

```sh
npm run lint
```

## Releases

1. Run `npm version patch`, `npm version minor` or `npm version major` to automatically `package.json`, `manifest.json`, and `versions.json`.
2. Create a new GitHub release using the new version as the "Tag version" (exactly, without a `v` prefix).
3. Upload the files `manifest.json`, `main.js`, `styles.css` as binary attachments. Note: The `manifest.json` file must be in two places: the root path of the repository and also in the release.
4. Publish the release.

Also make sure that `minAppVersion` in `manifest.json` always reflects the minimum required Obsidian version expected by the plugin code.

## License

By contributing to this project, you agree that your contributions will be licensed under its [license](LICENSE).