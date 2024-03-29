import * as vscode from 'vscode';
import { CasefileView } from './casefileView';
import Services, { Persistence } from './services';
import { debug } from './debugLog';
import { CasefileInstanceIdentifier, SharedCasefilesViewManager } from './sharedCasefilesView';
import { fillMissingIds } from './Bookmark';
import { setContext } from './vscodeUtils';

const CASEFILE_PERSISTENCE_PROPERTY = 'casefile';
const SHARING_PERSISTENCE_PROPERTY = 'sharing';
const DEFAULT_KEYBINDINGS_SETTING = 'useDefaultKeyboardShortcuts';

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

	const updateKeybindingsContext = () => {
		const config = vscode.workspace.getConfiguration('casefile');
		const settingValue = config.get<boolean>(DEFAULT_KEYBINDINGS_SETTING);
		setContext('usingDefaultKeybindings', settingValue);
	};
	updateKeybindingsContext();

	// Bind environmental events to *services*
	subscribe(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('casefile.externalTools')) {
			services.casefile.configurationChanged();
		}
		if (e.affectsConfiguration(`casefile.${DEFAULT_KEYBINDINGS_SETTING}`)) {
			updateKeybindingsContext();
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

		deleteSharedCasefile: async (item: CasefileInstanceIdentifier | void) => {
			const casefilePath = item?.sharedCasefilePath;
			if (!casefilePath) {
				await vscode.window.showErrorMessage("A casefile must be specified for deletion");
				return;
			}
			await sharingManager.deleteCasefile(casefilePath);
		},

		editBookmarkNote: async () => {
			debug("Telling casfile view to switch note to edit mode");
			await casefileView.openNoteEditor();
		},

		editCasefileName: async () => {
			debug("Starting casefile name edit");
			await casefileView.editCasefileName();
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

		shareToPeer: async () => {
			await sharingManager.shareCurrentCasefile();
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
