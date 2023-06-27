import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import { debug } from './debugLog';
import { OPEN_BOOKMARK } from './messageNames';
import Services from './services';
import { connectWebview, dispatchMessage, messageHandler } from './webviewHelper';
import { thru } from 'lodash';
import path = require('path');

const sampleCasefile = {
    "bookmarks": [
        {
            "children": [
                {
                    "children": [
                        {
                            "children": [],
                            "file": "lib/casefile-sharing.js",
                            "line": 503,
                            "markText": "JSON.stringify({bookmarks})",
                            "notes": "`bookmarks` is an `Array` of bookmark `Objects`.  \nSee `openBookmark`",
                            "peg": {
                                "line": "503",
                                "commit": "2995ead2690f164b4381856d93fa3cb4711eae06"
                            },
                            "id": "1582324788217.1"
                        }
                    ],
                    "file": "lib/casefile-sharing.js",
                    "line": 496,
                    "markText": "function promiseToGetHashOfCasefile",
                    "notes": "",
                    "peg": {
                        "line": "357",
                        "commit": "266b02658bf11d5f332e6c98e521b558a228806c"
                    },
                    "id": "1582324788217.0"
                }
            ],
            "file": "lib/casefile-sharing.js",
            "line": 363,
            "markText": "function promiseToShareCasefile",
            "notes": "",
            "peg": {
                "line": "265",
                "commit": "e4728a54bd0372d9ccfba3e0fbc4fabf7366065d"
            },
            "id": "1582324633673.1"
        },
        {
            "children": [
                {
                    "children": [
                        {
                            "children": [],
                            "file": "lib/bookmarks.js",
                            "line": 66,
                            "markText": "function computeGitPeggingInfo",
                            "notes": "Requesting and parsing \"hunks\" from `git diff`",
                            "peg": {
                                "line": "43",
                                "commit": "99cc0ec48ac85a8adf05bfd27329df184de36497"
                            },
                            "id": "1582324788217.4"
                        }
                    ],
                    "file": "lib/bookmarks.js",
                    "line": 300,
                    "markText": "function computeCurrentLineRange",
                    "notes": "Given a file path, commit, and line number, figure out  \nthe corresponding range of line numbers (which may  \nonly include one line) in the current revision, and which  \namong them is the _most_ likely to represent the  \nindicated line.",
                    "peg": {
                        "line": "144",
                        "commit": "99cc0ec48ac85a8adf05bfd27329df184de36497"
                    },
                    "id": "1582324788217.3"
                }
            ],
            "file": "lib/bookmarks.js",
            "line": 7,
            "markText": "function openBookmark",
            "notes": "",
            "peg": {
                "line": "5",
                "commit": "908cb84f8a33d7739540c2bf17d55bdb393173a6"
            },
            "id": "1582324788217.2"
        }
    ],
    "path": "casefile-basics/bdc74313-639c-490f-aab2-dc05e0bccf97"
};

type Bookmark = {
    children?: Bookmark[],
    file?: string,
    line?: number,
    markText?: string,
    notes?: string,
    peg?: {
        commit: string,
        line: number | string,
    },
    id?: string,
    collapsed?: boolean,
};

export class CasefileView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'codeCasefile.casefileView';
    
    private _view?: vscode.WebviewView;
    static PanelSerializer = class implements vscode.WebviewPanelSerializer {
        async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: unknown): Promise<void> {
            debug("Deserializing casefile view webview panel");
        }
    };

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _services: Services,
    ) {

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

    async loadCannedCasefileData({ onFail }: { onFail?: (msg: string) => void } = {}): Promise<void> {
        if (!this._view) {
            if (onFail) {
                onFail("CasefileView not yet resolved");
            }
            return;
        }

        this._view.webview.postMessage({ type: 'setViewState', value: sampleCasefile });
    }

    private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
        // BEGIN SAMPLE CODE from https://github.com/microsoft/vscode-extension-samples/blob/2f83557a56c37a5e48943ea0201e1729708690b6/webview-view-sample/src/extension.ts

        const viewUri = (filename: string, {common}: {common?: boolean} = {}) => {
            const path = common ? ['media'] : ['out', 'casefileView'];
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
                        ])
                    }],
                    ['meta', {
                        name: 'viewport',
                        content: `width=device-width, initial-scale=1.0`
                    }],

                    ...[styleResetUri, styleVSCodeUri, styleMainUri].map(
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

    async [messageHandler(OPEN_BOOKMARK)](data: any) {
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
                throw new Error(`No bookmark not found in any workspace folder`);
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
