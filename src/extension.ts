import * as vscode from 'vscode';
import { CasefileView } from './casefileView';
import Services, { Persistence } from './services';
import { debug } from './debugLog';
import { CasefileInstanceIdentifier, SharedCasefilesViewManager } from './sharedCasefilesView';
import { fillMissingIds } from './Bookmark';

const CASEFILE_PERSISTENCE_PROPERTY = 'casefile';
const SHARING_PERSISTENCE_PROPERTY = 'sharing';

// Called by VS Code when this extension is activated
export async function activate(context: vscode.ExtensionContext) {
	const subscribe = context.subscriptions.push.bind(context.subscriptions);

	const services = new Services({
		getConfig: () => vscode.workspace.getConfiguration("casefile"),
		getWorkdirs: () => (
			vscode.workspace.workspaceFolders?.flatMap(
				f => f.uri.scheme === 'file' ? [f.uri.fsPath] : []
			)
			|| []
		),
		forestPersistence: workspaceStatePersister(context, CASEFILE_PERSISTENCE_PROPERTY, () => ({})),
		sharingStatePersistence: workspaceStatePersister(context, SHARING_PERSISTENCE_PROPERTY, () => ({})),
	});
	subscribe(services);

	// Bind environmental events to *services*
	subscribe(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('casefile.externalTools')) {
			services.casefile.configurationChanged();
		}
	}));
	subscribe(vscode.workspace.onDidChangeWorkspaceFolders(e => {
		services.casefile.configurationChanged();
	}));

	// Current casefile view
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

	// Casefile sharing view
	const sharingManager = new SharedCasefilesViewManager(services);
	subscribe(sharingManager);
	await sharingManager.loadPeerList();

	// Provide implementations for the commands defined in $.contributes.commands
	// of package.json (with a "codeCasefile." prefix):
	subscribe(...Object.entries({

		createBookmark: async () => {
			debug("Creating bookmark from selection");
			await casefileView.createBookmark();
		},
		
		deleteAllBookmarks: () => {
			casefileView.deleteAllBookmarks();
		},

		deleteBookmark: ({ itemPath }: { itemPath: string[] }) => {
			debug("deleteBookmark command executed: %o", itemPath);
			casefileView.deleteBookmark(itemPath);
		},

		editBookmarkNote: async () => {
			debug("Telling casfile view to switch note to edit mode");
			await casefileView.openNoteEditor();
		},

		exportTextCasefile: async () => {
			debug("Exporting casefile to text");
			casefileView.exportToNewEditor();
		},

		fetchCasefilesFromPeer: async () => {
			debug("Fetching casefile from peer");
			await sharingManager.fetchFromCurrentPeer();
		},

		importSharedCasefile: async (item: CasefileInstanceIdentifier | void) => {
			debug("Importing share from %o", item?.sharedCasefilePath);
			const importPath = (
				item?.sharedCasefilePath
				|| await sharingManager.promptUserForCasefilePath()
			);
			if (importPath) {
				const importedBookmarks = await sharingManager.getBookmarks(importPath);
				// Missing IDs would be a big problem, so fill any that are missing
				fillMissingIds(importedBookmarks);
				casefileView.addImportedBookmarks(
					importPath,
					importedBookmarks
				);
			}
		},

		importTextCasefile: async () => {
			debug("Importing casefile from current editor");
			casefileView.importFromCurrentEditor();
		},

		selectSharingPeer: async () => {
			debug("Asking user to select sharing peer");
			await sharingManager.promptUserForPeer();
		},

	}).map(([name, handler]) => vscode.commands.registerCommand('codeCasefile.' + name, handler)));
}

// Called by VS Code when this extension is deactivated
export function deactivate() {}

function workspaceStatePersister<T>(context: vscode.ExtensionContext, key: string, makeDefault: () => T): Persistence<T> {
	return [
		() => context.workspaceState.get<T>(key) ?? makeDefault(),
		(state) => context.workspaceState.update(key, state)
	];
}
