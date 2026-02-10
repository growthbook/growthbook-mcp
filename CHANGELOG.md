# Changelog

All notable changes to this project will be documented in this file.

## [1.5.1] - 2026-02-03

### Changed

- Made URL environment variables slash (/) agnostic for better configuration flexibility
- Improved flag type generation tool
- Update deps

## [1.5.0] - 2026-01-21

### Added

- Unit tests for core functionality (#27)
- Support for Rust SDK code generation
- `valueType` parameter to experiment tools

### Changed

- Refined tool descriptions in manifest.json for clarity
- Improved instructions in index.ts
- Experiments and force feature rules now additively update flags
- Added `fetchWithPagination` utility for better API data handling
- Refactored tool registration to use `registerTool` method

### Fixed

- Logic for parsing defaultValues

## [1.4.2] - 2025-12-30

### Changed

- Updated server configuration and TypeScript settings (#24)
- Added GitHub MCP registry publish action
- Updated npm authentication workflow

### Fixed

- URL in workflow configuration

## [1.4.0] - 2025-12-24

### Added

- Rate limit protection for API calls
- Summary mode for experiments
- Wrapped prompt improvements

### Changed

- Refined experiment fetching logic (#23)
- Updated search functionality
- Improved prompts and tool behavior

### Fixed

- Potential bugs with JSON stringify and experiment fetching

## [1.3.0] - 2025-11-01

### Added

- Tools to update, toggle, and delete feature flags (#16)
- Project filtering support for tools
- Dev script for development workflow
- Analyze mode for tools

### Changed

- Tool annotations and hints updated
- Made tool behavior more consistent
- Reconfigured flag defaults
- Updated regex to match actual feature flag name conditions

### Documentation

- Fixed example command for MCP Inspector in CONTRIBUTING
- Updated build directory and command references

## [1.2.0] - 2025-09-19

### Added

- Metric tools for working with GrowthBook metrics (#15)
- `server.json` for publishing to GitHub's MCP repo (#14)

### Changed

- Refined resource fetching to accommodate most recent items
- Updated package.json version and formatting

## [1.1.0] - 2025-07-03

### Added

- `create_experiment` tool for creating experiments (#10)
- MCP server badge (#7)
- `get_defaults` tool
- New documentation stubs for features

### Changed

- Generate flags command now runs in background
- Refactored for consistency across tools
- Updated dependencies

## [1.0.0] - 2025-05-15

### Added

- Initial npm release (#2)
- Core feature flag management tools:
  - `get_feature` - Get a single feature flag
  - `search` - Search for feature flags
  - `create_force_rule` - Create force rules for features
  - `get_stale_safe_rollouts` - Get stale safe rollout rules
  - `generate_types` - Generate TypeScript types for feature flags
- Experiment tools:
  - `get_experiment` - Get experiment details
  - `create_experiment` - Create new experiments
- SDK and environment tools:
  - `get_environments` - List available environments
  - `get_sdk_connections` - Get SDK connection details
  - `create_sdk_connection` - Create new SDK connections
- Documentation generation for multiple frameworks
- Attribute management tools
- Safe rollout rule creation

### Documentation

- Added README with usage instructions
- Added CONTRIBUTING guide
- Added LICENSE (MIT)

## [0.1.0] - 2025-05-14

### Added

- Initial commit with basic MCP server structure
- GrowthBook API integration
- Basic tool implementations for feature flags
