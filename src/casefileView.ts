import { randomBytes, randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { debug } from './debugLog';
import { DELETE_BOOKMARK, EDIT_CASEFILE_NAME, MOVE_BOOKMARK, OPEN_BOOKMARK, REQUEST_INITIAL_FILL, SET_NOTES_DISPLAYING, UPDATE_NOTE } from './messageNames';
import Services from './services';
import { connectWebview, dispatchMessage, messageHandler } from './webviewHelper';
import { debounce, thru } from 'lodash';
import path = require('path');
import type { Bookmark } from './Bookmark';
import type { Casefile } from './Casefile';
import nextId from './idGen';
import { setContext } from './vscodeUtils';
import { makePersisted, readPersisted } from './persistedCasefile';

type MarkPathStep = {
    index: number,
    mark: Bookmark,
    in: Bookmark[],
};

const DOC_CHANGE_DEBOUNCE = 700;

const DELETE_SUBTREE = "Eliminate whole subtree";
const PROMOTE_CHILDREN = "Replace bookmark with its children";

const CASEFILE_IN_EDITOR_CONTEXT_KEY = 'casefileInEditor';

export class CasefileView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'codeCasefile.casefileView';

    private _view?: vscode.WebviewView;
    static PanelSerializer = class implements vscode.WebviewPanelSerializer {
        async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: unknown): Promise<void> {
            debug("Deserializing casefile view webview panel");
        }
    };
    private _casefile: any;
    private _disposables: vscode.Disposable[] = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _services: Services,
    ) {
        this._disposables.push(this._services.onForestChange((casefile) => {
            if (casefile !== this._casefile) {
                this._casefile = casefile;
                if (this._view) {
                    this._view.webview.postMessage({ type: 'setViewState', value: casefile });
                }
            }
        }));
        // When focus moves to a new text editor, look for a serialized casefile in the contents
        this._disposables.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                this._scanDocumentForCasefile(editor.document);
            } else {
                setContext(CASEFILE_IN_EDITOR_CONTEXT_KEY, false);
            }
        }));
        // When the currently focused text document changes, scan it for a serialized casefile
        // (debounced with DOC_CHANGE_DEBOUNCE window)
        thru(
            debounce(
                (document) => this._scanDocumentForCasefile(document),
                DOC_CHANGE_DEBOUNCE,
                { trailing: true }
            ),
            (scanDocument) => {
                this._disposables.push(vscode.workspace.onDidChangeTextDocument(
                    ({ document }) => {
                        if (document === vscode.window.activeTextEditor?.document) {
                            scanDocument(document);
                        }
                    }
                ));
            }
        );
    }

    dispose() {
        this._disposables.forEach((item) => {
            try {
                item.dispose();
            } catch (error) {
                console.error(error);
            }
        });
    }

    async resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext<unknown>,
        token: vscode.CancellationToken,
    ): Promise<void> {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,

            localResourceRoots: [
                this._extensionUri,
            ],
        };

        await connectWebview(webviewView.webview, (view) => this._getHtmlForWebview(view), data => {
            debug(`Received message: %O`, data);
            dispatchMessage(this, data);
        });
    }

    async createBookmark() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            await vscode.window.showErrorMessage("Casefile: Creating bookmark requires a text editor to be active");
            return;
        }
        if (editor.selections.length === 0) {
            await vscode.window.showErrorMessage("Casefile: Text must be selected for bookmark creation");
            return;
        } else if (editor.selections.length !== 1) {
            await vscode.window.showErrorMessage("Casefile: Cannot create bookmark from multiple selections");
            return;
        }
        if (editor.selection.end.line !== editor.selection.start.line) {
            await vscode.window.showErrorMessage("Casefile: Bookmark text must be on a single line");
            return;
        }
        const markText = editor.document.getText(editor.selection);
        if (editor.document.uri.scheme !== 'file') {
            await vscode.window.showErrorMessage("Casefile: Can only bookmark files in the local filesystem");
            return;
        }
        const fullFilePath = editor.document.uri.fsPath;
        const file = this._services.casefile.relativizeFilePath(fullFilePath);
        if (!file) {
            await vscode.window.showErrorMessage("Casefile: Selected file is not bookmarkable");
            return;
        }
        const lineRef = { file, line: editor.selection.start.line };
        const newBookmark: Bookmark = {
            id: nextId(),
            ...lineRef,
            markText,
        };
        const peg = await this._services.casefile.derivePeg(lineRef);
        if (peg) {
            newBookmark.peg = peg;
        }
        debug("Adding new bookmark: %O", newBookmark);
        this._modifyCasefileContent((casefile) => {
            if (!casefile.bookmarks) {
                casefile.bookmarks = [];
            }
            casefile.bookmarks.push(newBookmark);
            return true;
        });
    }

    deleteBookmark(itemPath: string[]): Promise<boolean> {
        return this._modifyCasefileContent(async (casefile) => {
            const bookmarkForest = casefile.bookmarks || [];
            const modPath = getMarkPath(bookmarkForest, itemPath);
            if (modPath.length === 0) {
                return false;
            }
            const { index: delIndex, in: markList, mark } = modPath.pop() || {};
            if (delIndex === undefined) {
                return false;
            }
            const substitutions: Bookmark[] = [];
            if (mark?.children?.length) {
                const choice = await vscode.window.showWarningMessage(
                    "The selected bookmark has children",
                    {
                        modal: true,
                    },
                    PROMOTE_CHILDREN,
                    DELETE_SUBTREE,
                );
                switch (choice) {
                    case undefined:
                        return false;
                    case PROMOTE_CHILDREN:
                        substitutions.push(...mark.children);
                        break;
                }
            }
            markList?.splice(delIndex, 1, ...substitutions);
            return true;
        });
    }

    async deleteAllBookmarks() {
        const choice = await vscode.window.showWarningMessage(
            "Delete all bookmarks from current casefile?",
            {
                modal: true,
            },
            "Yes"
        );
        switch (choice) {
            case undefined:
                return;
        }
        return this._modifyCasefileContent((casefile) => {
            casefile.bookmarks = [];
            delete casefile.path;
            return true;
        });
    }

    openNoteEditor() {
        this._view?.webview.postMessage({ type: 'editNotes' });
    }

    async importFromCurrentEditor() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const newBookmarks = bookmarksFromDocument(editor.document);
        if (newBookmarks.length !== 0) {
            await this._modifyCasefileContent((casefile) => {
                if (!casefile.bookmarks?.length) {
                    casefile.bookmarks = newBookmarks;
                } else {
                    casefile.bookmarks.push({
                        id: nextId(),
                        markText: "Imported bookmarks",
                        children: newBookmarks,
                    });
                }
                return true;
            });
        }
    }

    async exportToNewEditor() {
        const casefile = this._getCasefileContent();
        const { bookmarks } = casefile;
        if (!bookmarks?.length) {
            vscode.window.showErrorMessage("No bookmarks to export!");
            return;
        }
        const document = await vscode.workspace.openTextDocument({
            language: 'markdown',
            content: makePersisted(casefile),
        });
        await vscode.window.showTextDocument(document);
    }

    async editCasefileName(): Promise<void> {
        const { path } = this._getCasefileContent();
        const casefileName = path?.replace(/\/[^/]*$/, '');
        const newName = await vscode.window.showInputBox({
            title: "Casefile Name",
            value: casefileName,
        });
        if (newName === undefined) {
            return;
        }
        await this._modifyCasefileContent((casefile) => {
            casefile.path = newName ? newName + '/' + randomUUID() : undefined;
            return true;
        });
    }

    private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
        // BEGIN SAMPLE CODE from https://github.com/microsoft/vscode-extension-samples/blob/2f83557a56c37a5e48943ea0201e1729708690b6/webview-view-sample/src/extension.ts

        const viewUri = (filename: string, {common, module: modRef}: {common?: boolean, module?: Array<string>} = {}) => {
            const path = thru(null, () => {
                if (modRef) {
                    return ['node_modules', ...modRef];
                }
                if (common) {
                    return ['media'];
                }
                return ['out', 'casefileView'];
            });
            return webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, ...path, filename)
            );
        };

        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = viewUri('main.js');

        // Do the same for the stylesheet.
        const styleResetUri = viewUri('reset.css', { common: true });
        const styleVSCodeUri = viewUri('vscode.css', { common: true });
        const styleMainUri = viewUri('main.css');
        const codiconsUri = viewUri('codicon.css', { module: ['@vscode/codicons', 'dist'] });
        const animateUri = viewUri('animate.min.css', { module: ['animate.css'] });

        // Use a nonce to only allow a specific script to be run.
        const nonce = getNonce();

        // END SAMPLE CODE

        const { serialize: buildHtml } = await import('@thi.ng/hiccup');
        return buildHtml([
            ['!DOCTYPE', 'html'],
            ['html', {lang: 'en-US'}, [
                ['head', {}, [
                    ['meta', {
                        charset: 'UTF-8'
                    }],
                    ['meta', {
                        "http-equiv": "Content-Security-Policy",
                        content: buildString({term: ';'}, [
                            `default-src 'none'`,
                            `style-src   ${webview.cspSource}`,
                            `script-src  'nonce-${nonce}'`,
                            `font-src    ${webview.cspSource}`,
                        ])
                    }],
                    ['meta', {
                        name: 'viewport',
                        content: `width=device-width, initial-scale=1.0`
                    }],

                    ...[styleResetUri, styleVSCodeUri, styleMainUri, codiconsUri, animateUri].map(
                        ssUri => ['link', {rel: 'stylesheet', href: ssUri.toString() }]
                    ),

                    ['title', "Casefile"],
                ]],
                ['body', {}, [
                    ['script', { nonce, src: scriptUri.toString() }],
                ]],
            ]],
        ]);
    }

    private async _setCasefileContent(stateValue: Casefile, { onFail }: { onFail?: (msg: string) => void } = {}) {
        this._casefile = stateValue;
        if (!this._view) {
            onFail?.("CasefileView not yet resolved");
            return;
        }

        await this._services.setCurrentForest(stateValue);
        this._view.webview.postMessage({ type: 'setViewState', value: stateValue });
    }

    private _modifyCasefileContent(fn: (casefile: Casefile) => (boolean | Promise<boolean>)): Promise<boolean> {
        const casefile = this._getCasefileContent();
        return Promise.resolve()
        .then(() => fn(casefile))
        .then(
            async (indicator) => {
                if (indicator !== false) {
                    await this._setCasefileContent(casefile);
                }
                return true;
            },

            (error) => {
                console.error(error);
                return false;
            }
        );
    }

    private _getCasefileContent() {
        return this._services.getCurrentForest();
    }

    private _scanDocumentForCasefile(document: vscode.TextDocument) {
        const casefilePresent: boolean = thru(null, () => {
            if (document.lineCount === 0) {
                return false;
            }

            const bookmarks = thru(null, () => {
                try {
                    return bookmarksFromDocument(document);
                } catch (error) {
                    return [];
                }
            });

            return bookmarks.length > 0;
        });
        setContext(CASEFILE_IN_EDITOR_CONTEXT_KEY, casefilePresent);
    }

    private async _openBestMatch(bookmark: Bookmark): Promise<boolean> {
        if (!bookmark.file || !bookmark.markText) {
            return false;
        }
        for (const folder of vscode.workspace.workspaceFolders || []) {
            debug("...checking folder %s", folder.uri.toString());
            const bookmarkTargetUri = vscode.Uri.joinPath(folder.uri, bookmark.file);
            const fileContent = await vscode.workspace.fs.readFile(
                bookmarkTargetUri
            )
            .then(r => Buffer.from(r).toString('utf8'))
            .then(r => r, () => null);
            if (!fileContent) {
                debug("...content cannot be read, at least not as UTF-8");
                continue;
            }
            // TODO: Improve this algorithm -- currently just finds the first
            // instance of bookmark.markText in the file
            const index = fileContent.indexOf(bookmark.markText);
            if (index >= 0) {
                const document = await vscode.workspace.openTextDocument(bookmarkTargetUri);
                const lineNumber = fileContent.slice(0, index).split(/\r\n?|\n/).length;
                const line = document.lineAt(lineNumber - 1);
                // TODO: Determination of selStart and selEnd would ideally normalize whitespace
                // spans to single space, but back-mapping is more complicated than MVP
                const selStart = line.text.indexOf(bookmark.markText);
                const selEnd = selStart >= 0 ? selStart + bookmark.markText.length : 0;
                await this._revealText(document, line.lineNumber, [selStart, selEnd]);
                return true;
            }
        }
        return false;
    }

    private async _revealText(document: vscode.TextDocument, lineNum: number, [selStart, selEnd]: [number, number]) {
        await vscode.window.showTextDocument(document, {
            preserveFocus: false,
            preview: true,
            selection: new vscode.Range(
                new vscode.Position(lineNum, Math.max(0, selStart)),
                new vscode.Position(lineNum, selEnd)
            ),
        });
    }

    async [messageHandler(REQUEST_INITIAL_FILL)](data: any): Promise<void> {
        const content = this._services.getCurrentForest();
        await this._setCasefileContent(content, {
            onFail(msg) { console.error(msg); },
        });
    }

    async [messageHandler(OPEN_BOOKMARK)](data: any): Promise<void> {
        const { bookmark = {} } = data || {};
        debug("Starting to look up bookmark %O", bookmark);
        const targetLocation = await thru(
            this._services.casefile.keepers,
            async (keepers) => {
                for (const keeper of keepers) {
                    try {
                        const location = await keeper.bookmarks.currentLocation(bookmark);
                        location.baseDir = keeper.workingDir;
                        return location;
                    } catch (error) {
                        // continue to next keeper
                    }
                }
                return {};
            }
        );
        if (targetLocation.baseDir) {
            debug("...bookmark located: %O", targetLocation);
        } else if (bookmark.file) {
            debug("...bookmark not located through git-casefile, searching workspace folders");
            if (await this._openBestMatch(bookmark)) {
                return;
            }
        }
        
        if (thru(targetLocation, ({ baseDir, file, line }) => {
            if (!line) {
                return 'no line target';
            }
            const canConstructFilePath = baseDir && file;
            if (!canConstructFilePath) {
                return 'no file target';
            }
        })) {
            await vscode.window.showErrorMessage(`Unable to find file "${bookmark.file}" with matching text in workspace folders`);
            return;
        }

        const filePath = path.join(targetLocation.baseDir, targetLocation.file);
        const document = await vscode.workspace.openTextDocument(filePath);
        const line = document.lineAt(targetLocation.line - 1);
        // TODO: Determination of selStart and selEnd would ideally normalize whitespace
        // spans to single space, but back-mapping is more complicated than MVP
        const selStart = line.text.indexOf(bookmark.markText);
        const selEnd = selStart >= 0 ? selStart + bookmark.markText.length : 0;
        await this._revealText(document, line.lineNumber, [selStart, selEnd]);
    }

    async [messageHandler(MOVE_BOOKMARK)](data: any): Promise<void> {
        const { subject, newParent: newParentPath, position } = data || {};
        this._modifyCasefileContent((casefile) => {
            if (!casefile.bookmarks) {
                casefile.bookmarks = [];
            }
            const bookmarkForest = casefile.bookmarks;

            const movingMarkPath = getMarkPath(bookmarkForest, subject);
            const { index: delIndex, in: previousFamily } = movingMarkPath.pop() || {};
            const  movingMark = previousFamily?.[delIndex || 0];
            if (delIndex === undefined || movingMark === undefined) {
                return false;
            }

            const newParent = (
                newParentPath.length
                ? getMarkPath(bookmarkForest, newParentPath).pop()?.mark
                : { children: bookmarkForest }
            );
            if (newParent === undefined) {
                return false;
            }
            const insertIndex = (
                position
                ? newParent.children?.findIndex(
                    (mark) => mark.id === (position.before || position.after)
                ) || 0
                : 0
            ) + (position?.after ? 1 : 0);

            debug("Moving mark at index %d from %o to index %d of %o", delIndex, previousFamily, insertIndex, newParent.children);
            previousFamily?.splice(delIndex, 1);
            if (!newParent.children) {
                newParent.children = [];
            }
            newParent.children.splice(insertIndex, 0, movingMark);
            debug("Old family: %o; new family: %o", previousFamily, newParent.children);
            return true;
        });
    }

    async [messageHandler(DELETE_BOOKMARK)](data: any): Promise<void> {
        const { itemPath = [] } = data || {};
        debug("Starting to delete bookmark %O", data);
        await this._modifyCasefileContent((casefile) => {
            const bookmarkForest = casefile.bookmarks || [];
            const modPath = getMarkPath(bookmarkForest, itemPath);
            debug("Resolved itemPath %O to effective path %O", itemPath, modPath);
            if (modPath.length === 0) {
                return false;
            }
            const { index: delIndex, in: markList } = modPath.pop() || {};
            if (delIndex === undefined) {
                return false;
            }
            markList?.splice(delIndex, 1);
            return true;
        });
    }

    async [messageHandler(UPDATE_NOTE)](data: any): Promise<void> {
        const { itemPath = [], content = '' } = data || {};
        debug("Starting to update note content on %O", itemPath);
        await this._modifyCasefileContent((casefile) => {
            const bookmarkForest = casefile.bookmarks || [];
            const modPath = getMarkPath(bookmarkForest, itemPath);
            debug("Resolved itemPath %O to effective path %O", itemPath, modPath);
            if (modPath.length === 0) {
                return false;
            }
            const { mark } = modPath.pop() || {};
            if (!mark) {
                return false;
            }
            mark.notes = content;
            return true;
        });
    }

    async [messageHandler(SET_NOTES_DISPLAYING)](data: any): Promise<void> {
        const { displaying } = data || {};
        vscode.commands.executeCommand('setContext', 'codeCasefile.notesShowing', displaying);
    }

    async [messageHandler(EDIT_CASEFILE_NAME)](data: any): Promise<void> {
        return this.editCasefileName();
    }

    addImportedBookmarks(importPath: string, importedBookmarks: Bookmark[]) {
        if (!importedBookmarks.length) {
            return;
        }
        this._modifyCasefileContent((casefile) => {
            if (casefile.bookmarks?.length) {
                // Import under a header
                casefile.bookmarks.push({
                    id: nextId(),
                    markText: casefileGroupName(importPath),
                    children: importedBookmarks,
                });
            } else {
                casefile.bookmarks = importedBookmarks;
                casefile.path = importPath;
            }
            return true;
        });
    }
}

function bookmarksFromDocument(document: vscode.TextDocument): Bookmark[] {
    const { lineCount } = document;
    return readPersisted(thru(null, function* () {
        for (let i = 0; i < lineCount; i++) {
            yield document.lineAt(i).text;
        }
    }));
}

function buildString(
    {sep = ' ', term = ''}: {sep?: string, term?: string},
    chunks: string[]
): string {
    return chunks.reduce((result, chunk) => {
        if (!chunk.endsWith(term)) {
            chunk += term;
        }
        return result + sep + chunk;
    }, '');
}

function getNonce() : string {
    return randomBytes(16).toString('base64');
}

function getMarkPath(state: Bookmark[], ids: string[]) : MarkPathStep[] {
    const result : MarkPathStep[] = [];
    let level = state;
    for (const step of ids) {
        const i = level.findIndex((mark) => mark.id === step);
        if (i < 0) {
            return [];
        }
        result.push({ index: i, mark: level[i], in: level });
        level = level[i].children || [];
    }
    return result;
}

function casefileGroupName(sharedCasefilePath: string): string {
    return sharedCasefilePath.replace(/\/[^/]+$/, '');
}
