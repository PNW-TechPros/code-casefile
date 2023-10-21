import * as vscode from 'vscode';
import { CancellationToken, Command, Disposable, EventEmitter, ProviderResult, TreeDataProvider, TreeItem, TreeItemCollapsibleState as FoldState } from "vscode";
import Services from "./services";
import { debug } from './debugLog';
import { cloneDeep, tap, thru } from 'lodash';
import { basename, dirname } from 'path';
import { CasefileSharingState } from './CasefileSharingState';
import { CasefileGroup, CasefileKeeper } from 'git-casefile';

interface TreeItemSource {
    renderTreeItem(): TreeItem;
    getChildren(): ProviderResult<TreeItemSource[]>;
}

type CasefileStore = {
    folder: string,
    remote: string,
};

type CasefileInstanceMetadata = {
    path: string,
    authors?: string[],
};

class StoreSelector implements TreeItemSource {
    private _treeItem: vscode.TreeItem;

    constructor() {
        this._treeItem = new TreeItem(
            `Select sharing peer to display available casefiles`

        );
        this._treeItem.iconPath = new vscode.ThemeIcon('inspect');
        this._treeItem.command = {
            command: "codeCasefile.selectSharingPeer",
            title: "Select sharing peer",
        };
    }

    renderTreeItem(): vscode.TreeItem {
        return this._treeItem;
    }

    getChildren(): vscode.ProviderResult<TreeItemSource[]> {
        return [];
    }
}

class LibraryLoader implements TreeItemSource {
    private _treeItem: vscode.TreeItem;

    constructor() {
        this._treeItem = new TreeItem(
            `Fetch the shared casefiles list`
        );
        this._treeItem.iconPath = new vscode.ThemeIcon('inspect');
        this._treeItem.command = {
            command: "codeCasefile.fetchCasefilesFromPeer",
            title: "Select sharing peer",
        };
    }

    renderTreeItem(): vscode.TreeItem {
        return this._treeItem;
    }

    getChildren(): vscode.ProviderResult<TreeItemSource[]> {
        return [];
    }
}

class CasefileNameGroup implements TreeItemSource {
    private _treeItem: vscode.TreeItem;
    private _instances: CasefileInstance[] = [];
    constructor(
        private readonly _manager: SharedCasefilesViewManager,
        private readonly group: CasefileGroup,
    ) {
        this._treeItem = new TreeItem(this.group.name);
        this._treeItem.id = `CasefileGroup ${this.group.name}`;
        this._treeItem.iconPath = new vscode.ThemeIcon('bookmark');
        if (this.group.instances.length > 1) {
            this._treeItem.collapsibleState = FoldState.Expanded;
        }
    }
    renderTreeItem(): TreeItem {
        return this._treeItem;
    }
    async getChildren(): Promise<TreeItemSource[]> {
        await Promise.all(this.group.instances.map(async (instance) => {
            await this._manager.includeAuthors(instance);
        }));
        return this._instances;
    }
}

class CasefileInstance implements TreeItemSource {
    private _treeItem: vscode.TreeItem;
    constructor(instance: { path: string, authors: string[] }) {
        this._treeItem = new TreeItem("");
    }
    renderTreeItem(): vscode.TreeItem {
        throw new Error('Method not implemented.');
    }
    getChildren(): vscode.ProviderResult<TreeItemSource[]> {
        throw new Error('Method not implemented.');
    }
}

class CasefileLibrary implements TreeDataProvider<TreeItemSource> {
    onDidChangeTreeData: vscode.Event<void | TreeItemSource | TreeItemSource[] | null | undefined>;

    constructor(
        private readonly _manager: SharedCasefilesViewManager,
        options: {
            dataChangedEvent: vscode.Event<void | TreeItemSource | TreeItemSource[]>,
        }
    ) {
        this.onDidChangeTreeData = options.dataChangedEvent;
    }
    dispose() {}

    getTreeItem(element: TreeItemSource): Thenable<vscode.TreeItem> {
        return Promise.resolve(element.renderTreeItem());
    }
    async getChildren(element?: TreeItemSource | undefined): Promise<TreeItemSource[] | null | undefined> {
        if (element) {
            return element.getChildren();
        }

        if (!this._manager.peerList) {
            await this._manager.loadPeerList();
        }
        if (!this._manager.getEffectivePeer()) {
            return [new StoreSelector()];
        }
        const knownCasefiles = this._manager.knownCasefiles;
        if (!knownCasefiles) {
            return [new LibraryLoader()];
        }
        return knownCasefiles.map(
            (casefileGroup) => new CasefileNameGroup(this._manager, casefileGroup)
        );
    }
    // getParent?(element: SharedCasefile): vscode.ProviderResult<SharedCasefile> {
    //     throw new Error('Method not implemented.');
    // }
    // resolveTreeItem?(item: vscode.TreeItem, element: SharedCasefile, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TreeItem> {
    //     throw new Error('Method not implemented.');
    // }

};

export class SharedCasefilesViewManager {
    public static readonly viewType = 'codeCasefile.sharedCasefilesView';

    private readonly _disposables = new Set<Disposable>();
    private _currentLibrary: CasefileLibrary;
    private _peerList: CasefileStore[] | null = null;
    private _sharingState: CasefileSharingState;
    private _sharingView: vscode.TreeView<TreeItemSource>;
    private _stateChange = new EventEmitter<void | TreeItemSource | TreeItemSource[]>();

    constructor(
        private readonly _services: Services,
    ) {
        this._sharingState = this._services.getSharingState();
        const viewId = SharedCasefilesViewManager.viewType;
        this._currentLibrary = this._subscribe(new CasefileLibrary(this, {
            dataChangedEvent: this._stateChange.event,
        }));
        this._sharingView = vscode.window.createTreeView(viewId, {
            treeDataProvider: this._currentLibrary,
        });
        this._setViewInfo();
    }

    private _subscribe<T extends Disposable>(disposable: T): T {
        this._disposables.add(disposable);
        return disposable;
    }

    dispose() {
        this._disposables.forEach((disposable) => {
            try {
                disposable.dispose();
            } catch (error) {
                console.error(error);
            }
        });
    }

    private _setViewInfo() {
        const peer = this.getEffectivePeer();

        this._sharingView.message = undefined;
        this._sharingView.description = thru(
            this.getEffectivePeer(),
            (peer) => {
                if (peer) {
                    const folderDesc = thru(
                        basename(peer.folder),
                        (folderName) => (
                            workspaceFolderBasenameCount(folderName) > 1
                            ? `${folderName} (${dirname(peer.folder)})`
                            : folderName
                        )
                    );
                    return `"${peer.remote}" of ${folderDesc}`;
                }
            }
        );
    }

    getEffectivePeer(): CasefileStore | null {
        if (this.peer) {
            return this.peer;
        }
        const { workspaceFolders } = vscode.workspace;
        if (!workspaceFolders) {
            return null;
        }
        const localFolders = workspaceFolders.filter(
            ({ uri }) => Boolean(uri.fsPath)
        );
        if (localFolders.length !== 1) {
            return null;
        }
        const localFolderPath = localFolders[0].uri.fsPath;
        if (!this._peerList || !this._peerList.find(
            ({ folder, remote }) => (
                remote === 'origin'
                && folder === localFolderPath
            )
        )) {
            return null;
        }
        return {
            folder: localFolderPath,
            remote: 'origin',
        };
    }

    get peerList(): CasefileStore[] | null {
        return this._peerList;
    }

    async loadPeerList() {
        this._peerList = await Promise.all(this._services.casefile.keepers.map(
            (keeper) => {
                if (!keeper.workingDir) {
                    return [];
                }
                const folder = keeper.workingDir;
                return keeper.gitOps.getListOfRemotes().then(
                    (remotes) => remotes.map(
                        (remote) => ({ folder, remote })
                    )
                );
            }
        )).then((items) => items.flat());
    }

    get peer(): CasefileStore | undefined {
        return this._sharingState.peer;
    }
    get knownCasefiles(): CasefileGroup[] | undefined {
        return this._sharingState.knownCasefiles;
    }

    private _modifySharingState(fn: (state: CasefileSharingState) => (boolean | Promise<boolean>)) : Promise<boolean> {
        const state = cloneDeep(this._sharingState);
        return Promise.resolve()
        .then(() => fn(state))
        .then(
            async (indicator) => {
                if (indicator !== false) {
                    await this._services.setSharingState(state);
                    this._sharingState = state;
                }
                return true;
            },

            (error) => {
                console.error(error);
                return false;
            }
        );
    }

    async fetchFromCurrentPeer() {
        const peer = this.getEffectivePeer();
        if (!peer) {
            console.error(
                "code-casefile: Cannot fetch if no peer is selected or inferable",
            );
            return;
        }
        debug("Fetching from %O", peer);

        await this._modifySharingState((state) => {
            if (!state.peer) {
                // Save the effective peer as our peer
                state.peer = peer;
                return true;
            }
            return false;
        });

        const keeper = await this._getCurrentKeeper({
            folder: peer.folder,
        });
        debug("Using keeper %O", keeper);
        if (!keeper) {
            return;
        }

        // Call fetchSharedCasefilesFromRemote() on that keeper with the
        // remote name:
        await keeper.gitOps.fetchSharedCasefilesFromRemote(peer.remote);

        // Call getListOfCasefiles() on that keeper and store the
        // result as *knownCasefiles* in the sharing state (i.e. this._services.setSharingState(...))
        await this._modifySharingState(async (state) => {
            state.knownCasefiles = await keeper.gitOps.getListOfCasefiles();
            return true;
        });

        // Signal that the tree data has changed
        this._stateChange.fire();
    }

    async includeAuthors(instance: CasefileInstanceMetadata): Promise<void> {
        if (!this.peer) {
            console.error(
                "code-casefile: Cannot look up authors if no peer selected"
            );
            return;
        }

        // It would be possible to get authors using all keepers in parallel,
        // but this is complicated because each keeper will return the authors
        // it finds in order of modification, with most recent first.  This
        // ordering is important.
        const keeper = await this._getCurrentKeeper({
            folder: this.peer.folder,
        });
        if (!keeper) {
            return;
        }

        const { authors } = await keeper.gitOps.getCasefileAuthors(
            instance.path
        );
        instance.authors = authors;
    }

    private _getCurrentKeeper(options: {
        folder: string,
    }): CasefileKeeper | undefined {
        // Look through the casefile keepers to find *peer.folder*:
        debug(
            "Working directories of keepers: %O",
            this._services.casefile.keepers.map(
                (keeper) => keeper.workingDir
            )
        );
        const keeper = this._services.casefile.keepers.find(
            (item) => item.workingDir === options.folder
        );
        if (!keeper) {
            console.error("code-casefile: Unable to locate casefile keeper for %s", options.folder);
            return;
        }
        return keeper;
    }
}

/**
 * @summary Count the number of workspace folders with a given basename
 * @param folderName Basename to count in workspaceFolders
 * @returns Count of folders with the basename *folderName*
 */
function workspaceFolderBasenameCount(folderName: string): number {
    const { workspaceFolders } = vscode.workspace;
    if (!workspaceFolders) {
        return 0;
    }
    return workspaceFolders.reduce(
        (prevCount, { uri }) => prevCount + (
            basename(uri.fsPath) === folderName
            ? 1
            : 0
        ),
        0
    );
}
