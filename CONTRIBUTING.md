# Contributing

Contributions are welcome! This guide attempts to answer common question about how the project works.

## Getting Started

- Clone this repo to `<Vault>/.obsidian/plugins/obsidian-instapaper/`
- Make sure your NodeJS is at least v16 (`node --version`)
- Add your [API Credentials](#api-credentials) to a local `.env` file
- `npm i` or `yarn` to install dependencies
- `npm run dev` to start compilation in watch mode
- Reload Obsidian to discover the plugin
- Enable the `Instapaper` plugin in the Obsidian Settings window

You might also want to install the [Hot-Reload](https://github.com/pjeby/hot-reload) plugin to automatically reload the code during development.

### Manual Installation

If you need to manually install a copy of this plugin, copy the `main.js`, `manifest.json`, and `styles.css` files to your vault (e.g. `<Vault>/.obsidian/plugins/obsidian-instapaper/`).

## API Credentials

You'll need your own pair of Instapaper API [OAuth credentials](https://www.instapaper.com/api) to use the API. Some API calls require special privileges so you'll need to request that additional access.

Add them to a local `.env` file:

```
INSTAPAPER_CONSUMER_KEY=xxx
INSTAPAPER_CONSUMER_SECRET=xxx
```

## ESLint

[ESLint](https://eslint.org/) is used to maintain code quality. To run it over the entire project:

```sh
npm run lint
```

## Releases

1. Run `npm version patch`, `npm version minor`, or `npm version major` to bump `package.json`, `manifest.json`, and `versions.json` and create a version commit and tag.
2. Push the commit and the new tag (e.g. `git push origin main --follow-tags`). Pushing a `MAJOR.MINOR.PATCH` tag triggers the [release workflow](.github/workflows/release.yaml), which builds the plugin, attests build provenance, and creates a draft GitHub release with `main.js`, `manifest.json`, and `styles.css` attached.
3. Edit the draft release on GitHub to add release notes, then publish it.

Also make sure that `minAppVersion` in `manifest.json` always reflects the minimum required Obsidian version expected by the plugin code.

## License

By contributing to this project, you agree that your contributions will be licensed under its [license](LICENSE).
