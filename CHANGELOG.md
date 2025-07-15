# Changelog

All notable changes to this project will be documented in this file.
This project follows [Semantic Versioning](https://semver.org/).

---

## [0.0.1] - 2025-07-07

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

---

## [0.1.0] - 2025-07-09

### Added

* **Tag Support**

  * Allow adding multiple tags to new timers via a collapsible, multi-checkbox UI.
  * Display tags in active timers and recent timers.

* **Project Filtering**

  * Automatically filter projects based on the selected client when starting a new timer.

* **Loading State**

  * Show a loading screen while fetching data from the Kimai API.

* **Setup Instructions View**

  * Display a clear initial setup view if the Kimai URL or API token are not configured.
  * Include guidance and links to the [Kimai website](https://www.kimai.org/) for setting up a server.
  * Added instructions to reload the view via the reload icon.

* **Improved Timer Display**

  * Refined HTML and CSS to unify styling of timer cards.
  * Consistent conditional rendering of description and tags.

### Changed

* **HTML Structure**

  * Reworked timer card markup to match the extension’s common styles.

* **Styling**

  * Refined styles to improve alignment, spacing, and tag wrapping in the timer UI.

### Notes

This marks the first **feature-complete version** of the extension.
You now need a running Kimai instance and a valid API token to use all features.

---

## [0.1.1] - 2025-07-14

### Added

* **Default Client Option**

  * Added a default `<option>` in the client selection dropdown to indicate no client selected (`"Select Client"`).

* **Display All Projects When No Client Selected**

  * Added logic to show all projects if no client is selected in the timer view.

* **Dynamic Activity Options**

  * Automatically update the list of activities based on the selected project when starting a timer.

* **Extended Tests**

  * Added additional test coverage for timer creation, client/project selection, and error cases.

### Changed

* **Improved Error Handling**

  * Enhanced error handling in the timer start function.
  * Log detailed error information to help diagnose API or network issues.
