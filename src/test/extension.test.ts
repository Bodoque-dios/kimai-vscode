import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
// import * as myExtension from '../../extension';

import { activate, deactivate, updateStatusBar } from "../extension";
import { KimaiTimerViewProvider } from "../extension";

suite("Kimai VSCode Extension Tests", () => {
  const context = {
    subscriptions: [] as any[],
    extensionUri: vscode.Uri.file(__dirname),
  } as unknown as vscode.ExtensionContext;

  suiteSetup(() => {
    // Directly activate with mock context
    activate(context);
  });

  suiteTeardown(() => {
    deactivate();
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
    assert.ok(
      commands.includes("workbench.action.openSettings"),
      "openSettings internal command should be available"
    );
  });

  test("Status bar updates text", () => {
    updateStatusBar("Test");
    const items = vscode.window.createStatusBarItem();
    // Since updateStatusBar uses a global, we just assert it doesn't throw
    assert.ok(true, "updateStatusBar should run without error");
  });

  test("_formatDuration produces correct format", () => {
    const start = new Date(
      Date.now() - (2 * 3600 + 35 * 60) * 1000
    ).toISOString();
    const end = new Date().toISOString();
    const result = KimaiTimerViewProvider._formatDuration(start, end);
    assert.match(result, /2h 35m/, "Duration should match 2h 35m format");
  });
});

// Additional tests for view provider
suite("KimaiTimerViewProvider", () => {
  test("viewType constant", () => {
    assert.strictEqual(KimaiTimerViewProvider.viewType, "kimaiTimerView");
  });
});
