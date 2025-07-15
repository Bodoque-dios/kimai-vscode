import * as assert from "assert";
import * as vscode from "vscode";
import sinon from "sinon";

import { activate, deactivate, updateStatusBar } from "../extension";
import { KimaiTimerViewProvider } from "../extension";

suite("Kimai VSCode Extension Tests", () => {
	const context = {
		subscriptions: [] as any[],
		extensionUri: vscode.Uri.file(__dirname),
		secrets: { get: sinon.stub(), store: sinon.stub() },
	} as unknown as vscode.ExtensionContext;
	let sandbox: sinon.SinonSandbox;

	suiteSetup(() => {
		sandbox = sinon.createSandbox();
		// stub global fetch
		(global as any).fetch = sandbox
			.stub()
			.resolves({ ok: true, json: async () => [] });
		activate(context);
	});

	suiteTeardown(() => {
		deactivate();
		sandbox.restore();
	});

	test("Commands are registered", async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(
			commands.includes("kimai-vscode.statusBarClick"),
			"statusBarClick command should be registered"
		);
		assert.ok(
			commands.includes("kimai-vscode.openSettings"),
			"openSettings command should be registered"
		);
	});

	test("Status bar updates without throwing", () => {
		assert.doesNotThrow(() => updateStatusBar("Testing"));
	});

	test("_formatDuration formats zero duration correctly", () => {
		const now = new Date().toISOString();
		const result = KimaiTimerViewProvider._formatDuration(now, now);
		assert.strictEqual(result, "0h 0m");
	});

	test("_formatDuration produces correct format for large durations", () => {
		const start = new Date(
			Date.now() - (5 * 3600 + 12 * 60) * 1000
		).toISOString();
		const end = new Date().toISOString();
		const result = KimaiTimerViewProvider._formatDuration(start, end);
		assert.match(result, /5h 12m/);
	});

	test("viewType constant is correct", () => {
		assert.strictEqual(KimaiTimerViewProvider.viewType, "kimaiTimerView");
	});

	suite("HTML Generation Helpers", () => {
		let provider: KimaiTimerViewProvider;

		setup(() => {
			provider = new KimaiTimerViewProvider(context.extensionUri, context);
		});

		test("_getLoadingHtml contains Loading text", () => {
			const html = (provider as any)._getLoadingHtml();
			assert.ok(
				html.includes("Loading"),
				"Loading HTML should include 'Loading'"
			);
		});

		test("_getSetupHtml contains setup instructions", () => {
			const html = (provider as any)._getSetupHtml();
			assert.ok(
				html.includes("Kimai Setup Required"),
				"Setup HTML should include header"
			);
			assert.ok(
				html.includes("Set API Token"),
				"Setup HTML should mention setting API Token"
			);
		});

		test("_commonStyles includes CSS declarations", () => {
			const styles = (provider as any)._commonStyles();
			assert.ok(
				styles.includes("font-family"),
				"Styles should include font-family"
			);
			assert.ok(
				styles.includes(".timer-card"),
				"Styles should include timer-card class"
			);
		});
	});

	suite("Error Handling", () => {
		test("startTimer shows error when token missing", async () => {
			(context.secrets.get as sinon.SinonStub).resolves(undefined);
			const provider = new KimaiTimerViewProvider(
				context.extensionUri,
				context
			);
			const spy = sinon.spy(vscode.window, "showErrorMessage");
			try {
				await (provider as any)._startTimer({
					project: "1",
					activity: "1",
					description: "",
					tags: "",
				});
				assert.ok(spy.calledWithMatch("API token is not set"));
			} finally {
				spy.restore();
			}
		});

		test("stopTimer shows error when token missing", async () => {
			(context.secrets.get as sinon.SinonStub).resolves(undefined);
			const provider = new KimaiTimerViewProvider(
				context.extensionUri,
				context
			);
			const spy = sinon.spy(vscode.window, "showErrorMessage");
			try {
				await (provider as any)._stopTimerById("123");
				assert.ok(spy.calledWithMatch("API token is not set"));
			} finally {
				spy.restore();
			}
		});
	});
});
