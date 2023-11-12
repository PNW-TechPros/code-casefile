import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import { debug } from './debugLog';
import { DELETE_BOOKMARK, MOVE_BOOKMARK, OPEN_BOOKMARK, REQUEST_INITIAL_FILL, UPDATE_NOTE } from './messageNames';
import Services from './services';
import { connectWebview, dispatchMessage, messageHandler } from './webviewHelper';
import { cloneDeep, thru } from 'lodash';
import path = require('path');
import type { Bookmark } from './Bookmark';
import type { Casefile } from './Casefile';
import nextId from './idGen';

type MarkPathStep = {
    index: number,
    mark: Bookmark,
    in: Bookmark[],
};

const DELETE_SUBTREE = "Eliminate subtree";
const PROMOTE_CHILDREN = "Promote child marks";

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
                        detail: "All descendant marks of the selected bookmark will also be deleted.",
                    },
                    DELETE_SUBTREE,
                );
                switch (choice) {
                    case undefined:
                        return false;
                    // case PROMOTE_CHILDREN:
                    //     substitutions.push(...mark.children);
                    //     break;
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
                throw new Error(`Bookmark not found in any workspace folder`);
            }
        );
        debug("...bookmark located: %O", targetLocation);

        const filePath = path.join(targetLocation.baseDir, targetLocation.file);
        const document = await vscode.workspace.openTextDocument(filePath);
        const line = document.lineAt(targetLocation.line - 1);
        // TODO: Determination of selStart and selEnd would ideally normalize whitespace
        // spans to single space, but back-mapping is more complicated than MVP
        const selStart = line.text.indexOf(bookmark.markText);
        const selEnd = selStart >= 0 ? selStart + bookmark.markText.length : 0;
        await vscode.window.showTextDocument(document, {
            preserveFocus: false,
            preview: true,
            selection: new vscode.Range(
                new vscode.Position(line.lineNumber, Math.max(0, selStart)),
                new vscode.Position(line.lineNumber, selEnd)
            ),
        });
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
