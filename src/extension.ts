import * as vscode from "vscode";
import {
	KimaiCustomer,
	KimaiProject,
	KimaiActivity,
	KimaiTimesheetEntry,
} from "./types";

let statusBarItem: vscode.StatusBarItem;
let statusBarInterval: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext) {
	//Create and populate status bar with latest timer
	statusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Left
	);
	statusBarItem.text = "$(clock) Kimai: Idle";
	statusBarItem.show();
	statusBarItem.command = "kimai-vscode.statusBarClick";

	const provider = new KimaiTimerViewProvider(context.extensionUri, context);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			KimaiTimerViewProvider.viewType,
			provider
		),
		vscode.commands.registerCommand("kimai-vscode.openSettings", () => {
			vscode.commands.executeCommand("workbench.action.openSettings", "kimai");
		}),
		statusBarItem,
		vscode.commands.registerCommand("kimai-vscode.statusBarClick", async () => {
			const config = vscode.workspace.getConfiguration("kimai-vscode");
			const url = config.get("url")!;
			const token = await context.secrets.get("kimaiToken");
			if (!token) {
				vscode.window.showErrorMessage(
					"API token is not set. Run 'Kimai: Set API Token' command."
				);
				return;
			}

			const response = await fetch(`${url}/api/timesheets?active=1`, {
				headers: { Authorization: `Bearer ${token}` },
			});
			const entries = (await response.json()) as any[];
			if (entries.length === 0) {
				vscode.window.showInformationMessage("No active timer.");
			} else {
				const confirm = await vscode.window.showInformationMessage(
					"Stop the current (latest) timer?",
					"Yes",
					"No"
				);
				if (confirm === "Yes") {
					await provider._stopTimerById(entries[0].id);
					updateStatusBar("Idle");
					provider._refreshWebview();
				}
			}
		}),
		vscode.commands.registerCommand("kimai-vscode.setApiToken", async () => {
			const token = await vscode.window.showInputBox({
				prompt: "Enter your Kimai API token",
				ignoreFocusOut: true,
				password: true,
			});
			if (token) {
				await context.secrets.store("kimaiToken", token);
				vscode.window.showInformationMessage("API token saved securely.");
				provider._refreshWebview();
			}
		}),
		vscode.commands.registerCommand("kimai-vscode.refreshTimers", async () => {
			if (provider) {
				provider._refreshWebview();
			} else {
				vscode.window.showErrorMessage("Kimai view is not loaded.");
			}
		})
	);
}

export class KimaiTimerViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "kimaiTimerView";
	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly context: vscode.ExtensionContext
	) {}

	resolveWebviewView(webviewView: vscode.WebviewView) {
		this._view = webviewView;
		webviewView.webview.options = { enableScripts: true };
		this._refreshWebview();

		webviewView.webview.onDidReceiveMessage(async (message) => {
			if (message.command === "startTimer") {
				await this._startTimer(message);
				this._refreshWebview();
			} else if (message.command === "stopTimer") {
				await this._stopTimerById(message.id);
				this._refreshWebview();
			}
		});
	}

	async _refreshWebview() {
		if (!this._view) {
			return;
		}
		const config = vscode.workspace.getConfiguration("kimai-vscode");
		const url = config.get("url")!;
		const token = await this.context.secrets.get("kimaiToken");
		if (!url || !token) {
			this._view.webview.html = this._getSetupHtml();
			return;
		}
		this._view.webview.html = this._getLoadingHtml();
		try {
			// Run all fetches in parallel
			const [
				customersRes,
				projectsRes,
				activitiesRes,
				activeTimesheetsRes,
				recentTimesheetsRes,
				tagsRes,
			] = await Promise.all([
				fetch(`${url}/api/customers`, {
					headers: { Authorization: `Bearer ${token}` },
				}),
				fetch(`${url}/api/projects`, {
					headers: { Authorization: `Bearer ${token}` },
				}),
				fetch(`${url}/api/activities`, {
					headers: { Authorization: `Bearer ${token}` },
				}),
				fetch(`${url}/api/timesheets?active=1`, {
					headers: { Authorization: `Bearer ${token}` },
				}),
				fetch(`${url}/api/timesheets?order=DESC&size=5`, {
					headers: { Authorization: `Bearer ${token}` },
				}),
				fetch(`${url}/api/tags`, {
					headers: { Authorization: `Bearer ${token}` },
				}),
			]);

			// Check all responses
			if (!customersRes.ok) {
				throw new Error("Failed to fetch customers");
			}
			if (!projectsRes.ok) {
				throw new Error("Failed to fetch projects");
			}
			if (!activitiesRes.ok) {
				throw new Error("Failed to fetch activities");
			}
			if (!activeTimesheetsRes.ok) {
				throw new Error("Failed to fetch timesheets");
			}
			if (!recentTimesheetsRes.ok) {
				throw new Error("Failed to fetch recent timers");
			}
			if (!tagsRes.ok) {
				throw new Error("Failed to fetch tags");
			}

			const [
				customers,
				projects,
				activities,
				activeTimesheets,
				recentTimesheets,
				tags,
			] = await Promise.all([
				customersRes.json() as Promise<KimaiCustomer[]>,
				projectsRes.json() as Promise<KimaiProject[]>,
				activitiesRes.json() as Promise<KimaiActivity[]>,
				activeTimesheetsRes.json() as Promise<KimaiTimesheetEntry[]>,
				recentTimesheetsRes.json() as Promise<KimaiTimesheetEntry[]>,
				tagsRes.json() as Promise<string[]>,
			]);

			const latestTimer = activeTimesheets[0];
			if (latestTimer) {
				this._startStatusBarTimer(latestTimer);
			} else {
				this._stopStatusBarTimer();
				statusBarItem.text = "$(clock) Kimai: Idle";
			}

			this._view!.webview.html = this._getMergedHtml(
				customers,
				projects,
				activities,
				activeTimesheets,
				recentTimesheets,
				tags
			);
		} catch (err: any) {
			this._view!.webview.html = `<p>Error fetching data: ${err.message}</p>`;
		}
	}

	_getMergedHtml(
		customers: KimaiCustomer[],
		projects: KimaiProject[],
		activities: KimaiActivity[],
		activeTimesheets: KimaiTimesheetEntry[],
		recentTimesheets: KimaiTimesheetEntry[],
		tags: string[]
	): string {
		
		//------------------- CUSTOMER FILTER -------------------
		const projectsByCustomer = customers.reduce((acc, customer) => {
			acc[customer.id] = projects.filter((p) => p.customer === customer.id);
			return acc;
		}, {} as Record<number, KimaiProject[]>);

		//------------------- ACTIVE TIMERS HTML -------------------
		const activeTimersHtml =
			activeTimesheets.length > 0
				? activeTimesheets
						.map((timesheet) => {
							const projectName =
								timesheet.project !== null
									? projects.find((p) => p.id === timesheet.project)?.name ??
									  "Unknown Project"
									: "No Project";

							return `
								 <div class="timer-card">
									<div class="timer-card-header">
										<strong>${projectName}</strong>
									</div>
									<div class="timer-card-details active">
										<div>
										<strong>Activity:</strong> ${
											activities.find((a) => a.id === timesheet.activity)
												?.name || ""
										}
										</div>
										${
											timesheet.description
												? `<div>
												<strong>Description:</strong>
												<span class="truncate-text">
												${timesheet.description.replace(/"/g, "&quot;")}
												</span>
											</div>`
												: ""
										}
										${
											timesheet.tags && timesheet.tags.length
												? `<div><strong>Tags:</strong> <span class="tags">${timesheet.tags
														.map(
															(tag) => `<span class="tag-pill">${tag}</span>`
														)
														.join("")}</span></div>`
												: ""
										}
										<button onclick="stopTimer('${timesheet.id}')">⏹ Stop Timer</button>
									</div>
								</div>
							`;
						})
						.join("")
				: `<p>No active timers.</p>`;

		//------------------- SELECT VALUES -------------------
		const customersOptions = customers
			.map((c) => `<option value="${c.id}">${c.name}</option>`)
			.join("");
		const projectsOptions = projects
			.map((p) => `<option value="${p.id}">${p.name}</option>`)
			.join("");
		const activitiesOptions = activities
			.map((a) => `<option value="${a.id}">${a.name}</option>`)
			.join("");

		//------------------- RECENT TIMERS HTML -------------------
		const recentTimersHtml = recentTimesheets
			.map((entry, index) => {
				const duration = entry.end
					? KimaiTimerViewProvider._formatDuration(entry.begin, entry.end)
					: "(ongoing)";
				const safeDescription = entry.description
					? entry.description.replace(/"/g, "&quot;")
					: "";
				const projectName =
					entry.project !== null
						? projects.find((p) => p.id === entry.project)?.name ??
						  "Unknown Project"
						: "No Project";

				return `
					<div class="timer-card">
						<div class="timer-card-header" onclick="toggleDetails(${index})">
							<strong>${projectName}</strong> <span>${duration}</span>
						</div>
						<div id="details-${index}" class="timer-card-details">
							<div><strong>Activity:</strong> ${
								activities.find((a) => a.id === entry.activity)?.name || ""
							}</div>
							${
								safeDescription !== ""
									? `<div><strong>Description:</strong> ${safeDescription}</div>`
									: ""
							}
							${
								entry.tags && entry.tags.length
									? `<div><strong>Tags:</strong> <span class="tags">${entry.tags
											.map((tag) => `<span class="tag-pill">${tag}</span>`)
											.join("")}</span></div>`
									: ""
							}
						</div>
					</div>
	  `;
			})
			.join("");

		//----------------------- TAGS HTML -----------------------
		const tagsHTML = tags
			.map(
				(tag) => `<label><input type="checkbox" value="${tag}">${tag}</label>`
			)
			.join("");

		return `
		<html>
			<body>

				<h3>Active Timers</h3>
				${activeTimersHtml}

				<h3>Recent Timers</h3>
				${recentTimersHtml}

				<h3>Start New Timer</h3>
				<div id="newTimerSection">
					<label for="client">Client</label>
					<select id="client" onchange="updateProjectOptions()">
						<option value="">Select Client</option>
						${customersOptions}
					</select>

					<label for="project">Project</label>
					<select id="project" onchange="updateActivitiesOptions()">
						${projectsOptions}
					</select>

					<label for="activity">Activity</label>
					<select id="activity">
						${activitiesOptions}
					</select>
					<label for="tagSelector">Tags</label>
					<div id="tagSelector">
						<button id="toggleTagsButton" type="button">Select Tags ⏷</button>
						<div id="tagsContainer">
							${tagsHTML}
						</div>
					</div>

					<label for="description">Description</label>
					<textarea id="description" type="text"></textarea>

					<button onclick="start()">▶ Start Timer</button>
				</div>
				<script>
					const projectsByCustomer = ${JSON.stringify(projectsByCustomer)};
					const activities = ${JSON.stringify(activities)};
					const vscode = acquireVsCodeApi();

					function start() {
						const client = document.getElementById('client').value;
						const project = document.getElementById('project').value;
						const activity = document.getElementById('activity').value;
						const description = document.getElementById('description').value;
						const tagCheckboxes = document.querySelectorAll('#tagsContainer input[type=checkbox]');
						const selectedTags = Array.from(tagCheckboxes)
							.filter(cb => cb.checked)
							.map(cb => cb.value)
							.join(",");

						vscode.postMessage({
							command: 'startTimer',
							client,
							project,
							activity,
							description,
							tags: selectedTags
						});
					}

					function stopTimer(id) {
						vscode.postMessage({
							command: 'stopTimer',
							id
						});
					}
		
					function toggleDetails(index) {
						const el = document.getElementById('details-' + index);
						el.classList.toggle('active');
					}

					function updateProjectOptions() {
						const clientSelect = document.getElementById('client');
						const projectSelect = document.getElementById('project');
						const selectedClientId = clientSelect.value;

						// Clear existing options
						projectSelect.innerHTML = '';

						if (selectedClientId === '') {
							// set all projects if no client is selected
							const allProjects = Object.values(projectsByCustomer).flat();
							if (allProjects.length < 1) {
								// Add placeholder option
								const placeholder = document.createElement('option');
								placeholder.value = '';
								placeholder.textContent = 'No Projects available';
								projectSelect.appendChild(placeholder);
							} else {
								// Populate new options
								allProjects.forEach(p => {
									const option = document.createElement('option');
									option.value = p.id;
									option.textContent = p.name;
									projectSelect.appendChild(option);
								});
							}
							updateActivitiesOptions();
							return;
						}

						// Get projects for selected client
						const projects = projectsByCustomer[selectedClientId] || [];

						if (projects.length < 1 ){
							// Add placeholder option
							const placeholder = document.createElement('option');
							placeholder.value = '';
							placeholder.textContent = 'No Projects available';
							projectSelect.appendChild(placeholder);
						}

						// Populate new options
						projects.forEach(p => {
							const option = document.createElement('option');
							option.value = p.id;
							option.textContent = p.name;
							projectSelect.appendChild(option);
						});
						updateActivitiesOptions();
					}

					function updateActivitiesOptions() {
						const projectSelect = document.getElementById('project');
						const activitySelect = document.getElementById('activity');
						const selectedProjectId = projectSelect.value;

						// Clear existing options
						activitySelect.innerHTML = '';

						if (selectedProjectId === '') {
							// Add placeholder option
							const placeholder = document.createElement('option');
							placeholder.value = '';
							placeholder.textContent = 'No Activities available';
							activitySelect.appendChild(placeholder);
							return;
						}

						// Populate new options
						activities.forEach(a => {
							if (a.project === Number(selectedProjectId) || a.project === null) {
								const option = document.createElement('option');
								option.value = a.id;
								option.textContent = a.name;
								activitySelect.appendChild(option);
							}
						});
					}

					document.getElementById('toggleTagsButton').addEventListener('click', () => {
						const container = document.getElementById('tagsContainer');
						const button = document.getElementById('toggleTagsButton');
						const isVisible = container.style.display === 'flex';
						container.style.display = isVisible ? 'none' : 'flex';
						button.textContent = isVisible ? 'Select Tags ⏷' : 'Select Tags ⏶';
					});
				</script>  
				${this._commonStyles()}
			</body>  
		</html>
	`;
	}

	public static _formatDuration(start: string, end: string): string {
		const startMs = new Date(start).getTime();
		const endMs = new Date(end).getTime();
		const totalSeconds = Math.floor((endMs - startMs) / 1000);

		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);

		return `${hours}h ${minutes}m`;
	}

	async _startTimer(message: any) {
		const config = vscode.workspace.getConfiguration("kimai-vscode");
		const url = config.get("url")!;
		const token = await this.context.secrets.get("kimaiToken");
		if (!token) {
			vscode.window.showErrorMessage(
				"API token is not set. Run 'Kimai: Set API Token' command."
			);
			return;
		}
		const response = await fetch(`${url}/api/timesheets`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				project: Number(message.project),
				activity: Number(message.activity),
				description: message.description,
				tags: message.tags,
			}),
		});
		if (!response.ok) {
			throw new Error(await response.text());
		}
		vscode.window.showInformationMessage("Timer started.");
	}

	async _stopTimerById(id: string) {
		const config = vscode.workspace.getConfiguration("kimai-vscode");
		const url = config.get("url")!;
		const token = await this.context.secrets.get("kimaiToken");
		if (!token) {
			vscode.window.showErrorMessage(
				"API token is not set. Run 'Kimai: Set API Token' command."
			);
			return;
		}

		const result = await fetch(`${url}/api/timesheets/${id}`, {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ end: new Date().toISOString() }),
		});

		if (result.ok) {
			vscode.window.showInformationMessage(`Stopped timer`);
			updateStatusBar("Idle");
		} else {
			vscode.window.showErrorMessage("Failed to stop timer");
		}
	}
	_commonStyles(): string {
		return `
  	<style>
		body {
			font-family: var(--vscode-font-family);
			color: var(--vscode-editor-foreground);
			background: var(--vscode-editor-background);
			font-size: var(--vscode-font-size);
			padding: 10px;
		}
		h3 {
			margin-top: 16px;
			margin-bottom: 8px;
			font-weight: 500;
			border-bottom: 1px solid var(--vscode-editorWidget-border);
			padding-bottom: 4px;
		}
		label {
			display: block;
			margin-top: 8px;
			margin-bottom: 4px;
			font-weight: 500;
		}
		select, input[type="text"], textarea {
			width: 100%;
			box-sizing: border-box;
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border);
			border-radius: 3px;
			padding: 4px 6px;
		}
		button {
			margin-top: 12px;
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			padding: 6px 12px;
			border-radius: 3px;
			cursor: pointer;
		}
		button:hover {
			background: var(--vscode-button-hoverBackground);
		}
		.timer-card {
			margin-bottom: 8px;
			padding: 6px;
			border: 1px solid var(--vscode-editorWidget-border);
			border-radius: 4px;
			background: var(--vscode-editorWidget-background);
		}
		.timer-card-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			cursor: pointer;
		}
		.timer-card-details {
			margin-top: 4px;
			display: none;
		}
		.timer-card-details.active {
			display: block;
		}
		.timer-card:hover {
			border-color: var(--vscode-tab-activeBorder);
		}
		.timer-card strong {
			display: block;
			margin-bottom: 2px;
		}
		#toggleTagsButton {
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-foreground);
			border: none;
			padding: 6px 12px;
			border-radius: 3px;
			cursor: pointer;
			width: 100%;
			text-align: left;
			margin-bottom:4px;
			margin-top: 0px;
		}
		#toggleTagsButton:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}
		#tagsContainer {
			display: none;
			flex-wrap: wrap;
			gap: 4px;
		}
		#tagsContainer label {
			display: inline-flex !important;
			margin-top: 4px !important;
			margin-bottom: 2px !important;
			align-items: center;
			background: var(--vscode-editorWidget-background);
			border: 1px solid var(--vscode-editorWidget-border);
			border-radius: 4px;
			padding: 3px 6px;
			font-size: 85%;
			cursor: pointer;
			/* This keeps labels at natural width */
			white-space: nowrap;
		}
		#tagsContainer input[type="checkbox"] {
			margin-right: 6px;
		}
		.tags {
			display: inline-flex;
			flex-wrap: wrap;
			gap: 4px;
			margin-top: 4px;
		}
		.tag-pill {
			display: inline-block;
			background: var(--vscode-editorWidget-background);
			border: 1px solid var(--vscode-editorWidget-border);
			border-radius: 12px;
			padding: 2px 8px;
			font-size: 80%;
			color: var(--vscode-editor-foreground);
			white-space: nowrap;
		}
  	</style>`;
	}

	_startStatusBarTimer(entry: KimaiTimesheetEntry) {
		this._stopStatusBarTimer(); // Clear any old intervals

		const startTime = new Date(entry.begin).getTime();

		const update = () => {
			const now = Date.now();
			const elapsedMs = now - startTime;

			const totalSeconds = Math.floor(elapsedMs / 1000);
			const hours = Math.floor(totalSeconds / 3600);
			const minutes = Math.floor((totalSeconds % 3600) / 60);
			const seconds = totalSeconds % 60;

			const timeStr = `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
				.toString()
				.padStart(2, "0")}`;

			statusBarItem.text = `$(clock) Kimai: ${timeStr}`;
		};

		update();
		statusBarInterval = setInterval(update, 1000);
	}

	_stopStatusBarTimer() {
		if (statusBarInterval) {
			clearInterval(statusBarInterval);
			statusBarInterval = undefined;
		}
	}

	_getLoadingHtml(): string {
		return `
			<html>
				<body>
				<div style="
					display:flex;
					justify-content:center;
					align-items:center;
					height:100vh;
					font-family: var(--vscode-font-family);
					color: var(--vscode-editor-foreground);
					background: var(--vscode-editor-background);
				">
					<div>
					<span>⏳ Loading...</span>
					</div>
				</div>
				</body>
			</html>
			`;
	}

	_getSetupHtml(): string {
		return `
			<html>
				<body>
					<h2>Kimai Setup Required</h2>
					<p>
						To use this extension, you need a running 
						<a href="https://www.kimai.org" target="_blank">Kimai</a> instance 
							with API access enabled.
					</p>
					<p>Please set up the Kimai URL and API token:</p>
					<ol>
						<li>Open the command palette (<code>Ctrl+Shift+P</code>).</li>
						<li>Run <strong>Kimai: Set URL</strong> to configure the server URL.</li>
						<li>Run <strong>Kimai: Set API Token</strong> to save your API token securely.</li>
					</ol>
					<p>
						After configuration, reload this view by clicking the reload icon 
						at the top right corner of this panel.
					</p>
					${this._commonStyles()}
				</body>
			</html>

		`;
	}
}

export function updateStatusBar(text: string) {
	if (!statusBarItem) {
		statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left
		);
		statusBarItem.show();
	}
	statusBarItem.text = `$(clock) ${text}`;
}

export function deactivate() {
	if (statusBarItem) {
		statusBarItem.dispose();
	}
	if (statusBarInterval) {
		clearInterval(statusBarInterval);
	}
}
