# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - Unreleased

### Changed

- Account connection now uses browser-based OAuth 2 authorization instead of entering credentials directly.
- Added a "Sync now" button to the settings page.

## [1.2.1] - 2026-04-04

### Changed

- Build and package improvements

## [1.2.0] - 2026-03-04

### Added

- Block identifiers for highlights using Obsidian's block reference syntax (`^h{highlight_id}`).
- Customizable article properties: choose which properties to include and rename them to match your preferred naming scheme.
- Customizable notes templates: use [Mustache](https://mustache.github.io/) templates to fully control how highlights appear in your notes.

### Changed

- Minimum Obsidian version requirement updated to 1.11.0 for access to new API features.
