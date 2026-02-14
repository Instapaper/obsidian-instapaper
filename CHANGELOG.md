# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Block identifiers for highlights using Obsidian's block reference syntax (`^h{highlight_id}`). This enables linking to specific highlights and provides more robust duplicate detection.
- Customizable article properties: choose which properties to include and rename them to match your preferred naming scheme.
- Customizable notes templates: use [Mustache](https://mustache.github.io/) templates to fully control how highlights appear in your notes

### Changed

- Minimum Obsidian version requirement updated to 1.11.0 for access to new API features.
