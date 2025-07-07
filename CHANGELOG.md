# Changelog

All notable changes to this project will be documented in this file.
This project follows [Semantic Versioning](https://semver.org/).

---

## \[1.0.0] - 2025-07-07

### Added

* Initial release of **Kimai VSCode** extension.
* Status bar integration showing the current timer and updating live.
* Sidebar webview to:
  * Start new timers (selecting customer, project, activity, and description).
  * List active timers with stop buttons.
  * Display recent (last 5) timers with expandable details.
* Commands:
  * `Kimai: Set API Token` to securely store the token.
  * `Kimai: Open Settings` to configure the URL.
* Secure storage of API tokens using the VSCode SecretStorage API.
* Auto-refresh of the sidebar after timer actions.
* Graceful handling of missing tokens and API errors.