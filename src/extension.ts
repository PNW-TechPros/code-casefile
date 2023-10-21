import * as vscode from 'vscode';
import { CasefileView } from './casefileView';
import GitCasefile from './services/gitCasefile';
import Services, { Persistence } from './services';
import { Casefile } from './Casefile';
import { debug } from './debugLog';
import { CasefileSharingState } from './CasefileSharingState';
import { SharedCasefilesViewManager } from './sharedCasefilesView';

const CASEFILE_PERSISTENCE_PROPERTY = 'casefile';
const SHARING_PERSISTENCE_PROPERTY = 'sharing';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	const subscribe = context.subscriptions.push.bind(context.subscriptions);

	const services = new Services({
		getConfig: () => vscode.workspace.getConfiguration("casefile"),
		getWorkdirs: () => (
			vscode.workspace.workspaceFolders?.flatMap(
				f => f.uri.fsPath ? [f.uri.fsPath] : []
			)
			|| []
		),
		forestPersistence: workspaceStatePersister(context, CASEFILE_PERSISTENCE_PROPERTY, () => ({})),
		sharingStatePersistence: workspaceStatePersister(context, SHARING_PERSISTENCE_PROPERTY, () => ({})),
	});
	subscribe(services);

	subscribe(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('casefile.externalTools')) {
			services.casefile.configurationChanged();
		}
	}));
	subscribe(vscode.workspace.onDidChangeWorkspaceFolders(e => {
		services.casefile.configurationChanged();
	}));

	const casefileView = new CasefileView(context.extensionUri, services);
	subscribe(casefileView);
	subscribe(vscode.window.registerWebviewPanelSerializer(
		CasefileView.viewType,
		new CasefileView.PanelSerializer()
	));
	subscribe(vscode.window.registerWebviewViewProvider(
		CasefileView.viewType,
		casefileView
	));

	const sharingManager = new SharedCasefilesViewManager(services);
	subscribe(sharingManager);
	await sharingManager.loadPeerList();

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

	subscribe(...Object.entries({

		deleteAllBookmarks: () => {
			casefileView.deleteAllBookmarks();
		},

		deleteBookmark: ({ itemPath }: { itemPath: string[] }) => {
			debug("deleteBookmark command executed: %o", itemPath);
			casefileView.deleteBookmark(itemPath);
		},

		fetchCasefilesFromPeer: async () => {
			debug("Fetching casefile from peer");
			await sharingManager.fetchFromCurrentPeer();
		},

		selectSharingPeer: async () => {
			debug("Asking user to select sharing peer");
			await sharingManager.promptUserForPeer();
		},

	}).map(([name, handler]) => vscode.commands.registerCommand('codeCasefile.' + name, handler)));
}

// This method is called when your extension is deactivated
export function deactivate() {}

function workspaceStatePersister<T>(context: vscode.ExtensionContext, key: string, makeDefault: () => T): Persistence<T> {
	return [
		() => context.workspaceState.get<T>(key) ?? makeDefault(),
		(state) => context.workspaceState.update(key, state)
	];
}

