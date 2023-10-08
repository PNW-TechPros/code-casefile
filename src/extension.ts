import * as vscode from 'vscode';
import { CasefileView } from './casefileView';
import GitCasefile from './services/gitCasefile';
import Services from './services';
import { Casefile } from './Casefile';
import { debug } from './debugLog';

const PERSISTENT_STATE_PROPERTY = 'casefile';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const subscribe = context.subscriptions.push.bind(context.subscriptions);

	const services = new Services({
		getConfig: () => vscode.workspace.getConfiguration("casefile"),
		getWorkdirs: () => (
			vscode.workspace.workspaceFolders?.flatMap(
				f => f.uri.fsPath ? [f.uri.fsPath] : []
			)
			|| []
		),
		getCurrentForest: () => context.workspaceState.get<Casefile>(PERSISTENT_STATE_PROPERTY) ?? {},
		setCurrentForest: (casefile) => context.workspaceState.update(PERSISTENT_STATE_PROPERTY, casefile),
	});

	subscribe(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('casefile.externalTools')) {
			services.casefile.configurationChanged();
		}
	}));
	subscribe(vscode.workspace.onDidChangeWorkspaceFolders(e => {
		services.casefile.configurationChanged();
	}));

	const casefileView = new CasefileView(context.extensionUri, services);
	subscribe(vscode.window.registerWebviewPanelSerializer(
		CasefileView.viewType,
		new CasefileView.PanelSerializer()
	));
	subscribe(vscode.window.registerWebviewViewProvider(
		CasefileView.viewType,
		casefileView
	));

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	
	// This is a temporary command until we have "casefile sharing" implemented
	subscribe(vscode.commands.registerCommand('codeCasefile.loadCannedCasefile', () => {
		casefileView.loadCannedCasefileData({
			onFail: (msg) => {
				vscode.window.showErrorMessage(msg);
			}
		});
	}));

	subscribe(
		vscode.commands.registerCommand('codeCasefile.deleteBookmark', ({ itemPath }) => {
			debug("deleteBookmark command executed: %o", itemPath);
			casefileView.deleteBookmark(itemPath);
		}),
		vscode.commands.registerCommand('codeCasefile.deleteAllBookmarks', () => {
			casefileView.deleteAllBookmarks();
		}),
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}
