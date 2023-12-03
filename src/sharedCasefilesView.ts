import * as vscode from 'vscode';
import { CancellationToken, Command, Disposable, EventEmitter, ProviderResult, TreeDataProvider, TreeItem, TreeItemCollapsibleState as FoldState } from "vscode";
import Services from "./services";
import { debug } from './debugLog';
import { cloneDeep, tap, thru } from 'lodash';
import { basename, dirname } from 'path';
import { CasefileSharingState } from './CasefileSharingState';
import { CasefileGroup, CasefileKeeper } from 'git-casefile';
import { deiconed, setContext } from './vscodeUtils';
import { Bookmark } from './Bookmark';
import { randomUUID } from 'crypto';

const PICK_PAYLOAD = Symbol('payload');
const treeItemSharedCasefiles = new WeakMap<TreeItem, string>();
const IMPORTABLE_CASEFILE = 'importableCasefileInstance';
const PUSH_ADDITIONAL_HISTORY = "Include missing history";
const SHARE_WITHOUT_HISTORY = "Share only the casefile";

interface TreeItemSource {
    renderTreeItem(): TreeItem;
    getChildren(): ProviderResult<TreeItemSource[]>;
}

export interface CasefileInstanceIdentifier {
    sharedCasefilePath?: string;
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

class CasefileNameGroup implements TreeItemSource, CasefileInstanceIdentifier {
    private _treeItem: vscode.TreeItem;
    private _instances: CasefileInstance[] = [];
    constructor(
        private readonly _manager: SharedCasefilesViewManager,
        private readonly group: CasefileGroup,
    ) {
        this._treeItem = new TreeItem(this.group.name);
        this._treeItem.id = `CasefileGroup ${this.group.name}`;
        this._treeItem.iconPath = new vscode.ThemeIcon('notebook');
        [this._treeItem.collapsibleState, this._treeItem.contextValue] = (
            this.group.instances.length > 1
            ? [FoldState.Expanded, undefined]
            : [FoldState.None, IMPORTABLE_CASEFILE]
        );
        treeItemSharedCasefiles.set(this._treeItem, this.group.instances[0].path);
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
    get sharedCasefilePath(): string | undefined {
        if (this.group.instances.length !== 1) {
            return undefined;
        }
        return this.group.instances[0].path;
    }
}

class CasefileInstance implements TreeItemSource, CasefileInstanceIdentifier {
    private _treeItem: vscode.TreeItem;
    private _instancePath: any;
    constructor(instance: { path: string, authors: string[] }) {
        this._instancePath = instance.path;
        this._treeItem = new TreeItem(
            `By ${multiterm(instance.authors, 'and')}`
        );
        this._treeItem.id = `CasefileInstance ${instance.path}`;
        this._treeItem.contextValue = IMPORTABLE_CASEFILE;
        treeItemSharedCasefiles.set(this._treeItem, instance.path);
    }
    renderTreeItem(): vscode.TreeItem {
        throw new Error('Method not implemented.');
    }
    getChildren(): vscode.ProviderResult<TreeItemSource[]> {
        throw new Error('Method not implemented.');
    }
    get sharedCasefilePath(): string | undefined {
        return this._instancePath;
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
        debug("Rendering shared casefiles");
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
        setContext('peerEstablished', Boolean(peer));
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

    async loadPeerList(): Promise<CasefileStore[]> {
        return tap(
            await Promise.all(this._services.casefile.keepers.map(
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
            )).then((items) => items.flat()),
            (newList) => {
                this._peerList = newList;
            }
        );
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
                return Promise.resolve()
                .then(() => {
                   this._stateChange.fire();
                   return true;
                });
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
        debug("Fetching from %o", peer);

        if (await this._modifySharingState((state) => {
            if (!state.peer) {
                // Save the effective peer as our peer
                state.peer = peer;
                return true;
            }
            return false;
        })) {
            this._setViewInfo();
        };

        const keeper = await this._getCurrentKeeper({
            folder: peer.folder,
        });
        debug("Using keeper %O", keeper);
        if (!keeper) {
            return;
        }

        // Call fetchSharedCasefilesFromRemote() on that keeper with the
        // remote name:
        await keeper.remote(peer.remote).fetchSharedCasefiles();

        // Call getListOfCasefiles() on that keeper and store the
        // result as *knownCasefiles* in the sharing state (i.e. this._services.setSharingState(...))
        await this._modifySharingState(async (state) => {
            state.knownCasefiles = await keeper.gitOps.getListOfCasefiles();
            return true;
        });
    }

    async promptUserForPeer() {
        const peerList = await this.loadPeerList();
        type StringGroups = { [key: string]: Set<string> };
        const basenameFolders: StringGroups = tap(Object.create(null), (groups: StringGroups) => {
            for (const { folder } of peerList) {
                const folderBase = basename(folder);
                if (!groups[folderBase]) {
                    groups[folderBase] = new Set();
                }
                groups[folderBase].add(folder);
            }
        });
        const options = peerList.map((peer) => {
            const folderBase = basename(peer.folder);
            const folderDesc = folderBase + thru(
                basenameFolders[folderBase].size,
                (basenameCount) => basenameCount > 1 ? ` ${dirname(peer.folder)}` : ''
            );
            return {
                iconPath: new vscode.ThemeIcon('remote'),
                label: deiconed(peer.remote),
                description: `$(folder) ${deiconed(folderDesc)}`,
                [PICK_PAYLOAD]: peer,
            };
        });
        const userSelection = await vscode.window.showQuickPick(options, {
            title: "Casefile: Select Sharing Peer",
            matchOnDescription: true,
        }).then((item) => item && item[PICK_PAYLOAD]);
        if (userSelection) {
            debug("User selected sharing peer %o", userSelection);
            await this._modifySharingState((state) => {
                state.peer = userSelection;
                return true;
            });
            this._setViewInfo();
            await this.fetchFromCurrentPeer();
        } else {
            debug("User canceled sharing peer selection");
        }
    }

    getAssociatedPath(treeItem: TreeItem) {
        return treeItemSharedCasefiles.get(treeItem);
    }

    async promptUserForCasefilePath(): Promise<string | undefined> {
        throw new Error("Method not implemented");
    }

    async getBookmarks(casefileInstancePath: string): Promise<Bookmark[]> {
        const peer = this.peer;
        if (!peer) {
            throw new Error("code-casefile: No peer selected");
        }
        const keeper = this._getCurrentKeeper(peer);
        if (!keeper) {
            throw new Error("code-casefile: No casefile keeper for peer");
        }
        return keeper.gitOps.getCasefile(casefileInstancePath)
        .then((casefile) => casefile.bookmarks || []);
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

    async shareCurrentCasefile(): Promise<void> {
        const { peer } = this;
        if (!peer) {
            await vscode.window.showErrorMessage("Casefile: Cannot share until sharing peer is established");
            return;
        }
        const remote = this._services.casefile.getRemote(peer);
        const casefile = {...this._services.getCurrentForest()};
        const { path: casefilePath } = casefile;
        if (!casefilePath) {
            const casefileName = await this._promptForSharedCasefileName();
            if (!casefileName) {
                return;
            }
            casefile.path = casefileName + '/' + randomUUID();
            this._services.setCurrentForest(casefile);
        } else {
            const casefileName = casefilePath.replace(/\/[^\/]*$/, '');
            const updating = Boolean(
                (this._sharingState.knownCasefiles || [])
                .find((group) => group.name === casefileName)
                ?.instances
                ?.find(({ path }) => path === casefile.path)
            );
            const ok = await vscode.window.showInformationMessage(
                "Share Current Casefile?",
                {
                    modal: true,
                    detail: (
                        `Share bookmarks in the current casefile as "${casefileName}" to "${peer.remote}" of ${peer.folder}?`
                        + (
                            updating
                            ? "\n\n This will update the casefile definition that was loaded."
                            : ''
                        )
                    ),
                },
                "OK"
            );
            if (!ok) {
                return;
            }
        }
        const unsharedCommits = await remote.commitsUnknown(casefile);
        if (unsharedCommits) {
            const userOpt = await vscode.window.showWarningMessage(
                "Unshared History",
                {
                    modal: true,
                    detail: `The '${peer.remote}' remote of '${peer.folder}' is missing knowledge of at least one referenced commit.`
                },
                PUSH_ADDITIONAL_HISTORY,
                SHARE_WITHOUT_HISTORY
            );
            switch (userOpt) {
                case undefined:
                    return;
                case PUSH_ADDITIONAL_HISTORY:
                    await remote.pushCommitRefs(...unsharedCommits);
                    break;
            }
        }
        await remote.share(casefile);
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

    private async _promptForSharedCasefileName(): Promise<string | undefined> {
        return vscode.window.showInputBox({
            title: "Casefile Name",
            prompt: "Name to give to the set of bookmarks in the current casefile",
            validateInput: (value: string): (vscode.InputBoxValidationMessage | undefined) => {
                if (value.includes('/')) {
                    return {
                        message: "Name cannot contain slash (/) characters.",
                        severity: vscode.InputBoxValidationSeverity.Error,
                    };
                }
                const existingGroup = (this._sharingState.knownCasefiles || []).find(
                    (group) => group.name === value
                );
                if (existingGroup) {
                    const fileCount = existingGroup.instances.length;
                    const groupDesc = (
                        fileCount === 1
                        ? "an existing, shared casefile"
                        : `${fileCount} existing, shared casefiles`
                    );
                    return {
                        message: `"${value}" is the name of ${groupDesc}`,
                        severity: vscode.InputBoxValidationSeverity.Warning,
                    };
                }
            },
        });
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

function multiterm(authors: string[], conjuntion: string): string {
    switch (authors.length) {
        case 0:
            return 'authors unknown';
        case 1:
            return authors[0];
        case 2:
            return authors.join(conjuntion);
        default:
            return `${authors.slice(0, -1).join(', ')}, ${conjuntion} ${authors.slice(-1)[0]}`;
    }
}

