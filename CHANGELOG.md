# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-11-20

Relicensed for the move to [flok](https://github.com/flok-ai).

### Changed

- License changed from MIT to the GNU Affero General Public License v3.0 only (AGPL-3.0-only). Copies, modified versions and network deployments must keep the attribution in `NOTICE`. Versions up to and including 0.1.0 remain MIT.

### Added

- `NOTICE` with the attribution term, `REUSE.toml` and `CONTRIBUTING.md`.

## [0.1.0] - 2026-11-20

Initial release: the trusted platform API for runs and artifacts, deployed on AKS.

### Added

- CI with lint, dependency audit and verification ([#4](https://github.com/julie-ng/ai-native-sdlc-platform-services/pull/4), [#50](https://github.com/julie-ng/ai-native-sdlc-platform-services/pull/50)).
- Artifact API: register, upload and download artifacts through short-lived user delegation SAS URLs, backed by PostgreSQL ([#14](https://github.com/julie-ng/ai-native-sdlc-platform-services/pull/14), [#18](https://github.com/julie-ng/ai-native-sdlc-platform-services/pull/18), [#32](https://github.com/julie-ng/ai-native-sdlc-platform-services/pull/32)).
- Structured logging and a `/readyz` endpoint ([#26](https://github.com/julie-ng/ai-native-sdlc-platform-services/pull/26)).
- API documentation: JSDoc/TypeDoc and a docs site on GitHub Pages ([#23](https://github.com/julie-ng/ai-native-sdlc-platform-services/pull/23), [#25](https://github.com/julie-ng/ai-native-sdlc-platform-services/pull/25), [#30](https://github.com/julie-ng/ai-native-sdlc-platform-services/pull/30)).
- HMAC step tokens for callers, expiring after 15 minutes as a cost cap ([#43](https://github.com/julie-ng/ai-native-sdlc-platform-services/pull/43)).
- Static tests that every route requires its authentication guard ([#46](https://github.com/julie-ng/ai-native-sdlc-platform-services/pull/46)).
- Entra authentication to PostgreSQL with a workload identity token; migrations at startup ([#47](https://github.com/julie-ng/ai-native-sdlc-platform-services/pull/47)).
- Kubernetes deployment and CI publishing to the registry ([#49](https://github.com/julie-ng/ai-native-sdlc-platform-services/pull/49)).

### Changed

- Tests run on Vitest ([#17](https://github.com/julie-ng/ai-native-sdlc-platform-services/pull/17)).
- Removed the service layer in favor of explicit guards and plain functions ([#34](https://github.com/julie-ng/ai-native-sdlc-platform-services/pull/34)).

[0.2.0]: https://github.com/julie-ng/ai-native-sdlc-platform-services/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/julie-ng/ai-native-sdlc-platform-services/releases/tag/v0.1.0
