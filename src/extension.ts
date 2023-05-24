import * as vscode from 'vscode';
import { CasefileView } from './casefileView';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const subscribe = context.subscriptions.push.bind(context.subscriptions);

	const casefileView = new CasefileView(context.extensionUri);
	subscribe(vscode.window.registerWebviewViewProvider(
		CasefileView.viewType,
		casefileView
	));

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	subscribe(vscode.commands.registerCommand('code-casefile.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from VSCode Casefile!');
	}));
}

// This method is called when your extension is deactivated
export function deactivate() {}
