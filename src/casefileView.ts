import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import { debug } from './debugLog';

const sampleCasefile = {
    "bookmarks": [
        {
            "children": [
                {
                    "children": [],
                    "file": "src/views/casefile/receivedMessages.js",
                    "line": 33,
                    "markText": "'setViewState'",
                    "notes": "",
                    "peg": {
                        "line": 33,
                        "commit": "c379bc352cc02a46b01e8deb3954afc92d1cdb45"
                    },
                    "id": "1687192192767.7"
                }
            ],
            "file": "src/extension.ts",
            "line": 26,
            "markText": "'codeCasefile.loadCannedCasefile'",
            "notes": "Registration of command to load canned casefile data for testing",
            "peg": {
                "line": 26,
                "commit": "0aeeeafe32293b538d3f33e9230a6c7f71ef0c17"
            },
            "id": "1687192192767.1"
        },
        {
            "children": [
                {
                    "children": [
                        {
                            "children": [
                                {
                                    "children": [],
                                    "file": "src/views/casefile/receivedMessages.js",
                                    "line": 31,
                                    "markText": "MESSAGE HANDLERS",
                                    "notes": "Handlers for messages from the main process",
                                    "peg": {
                                        "line": 31,
                                        "commit": "c379bc352cc02a46b01e8deb3954afc92d1cdb45"
                                    },
                                    "id": "1687192192767.4"
                                },
                                {
                                    "children": [],
                                    "file": "src/views/casefile/bookmark.js",
                                    "line": 3,
                                    "markText": "const Bookmark",
                                    "notes": "",
                                    "peg": {
                                        "line": 3,
                                        "commit": "fafe024156f14854bfb52c325ec0e23450e2a3d3"
                                    },
                                    "id": "1687192192767.6"
                                }
                            ],
                            "file": "src/views/casefile/view.js",
                            "line": 13,
                            "markText": "const View",
                            "notes": "Top-level Preact component",
                            "peg": {
                                "line": 10,
                                "commit": "c379bc352cc02a46b01e8deb3954afc92d1cdb45"
                            },
                            "id": "1687192192767.3"
                        }
                    ],
                    "file": "src/casefileView.ts",
                    "line": 112,
                    "markText": "class CasefileView",
                    "notes": "`implements vscode.WebViewProvider`\n\nHandlers for messages from the webview are declared with `handleCasefileViewMessage`",
                    "peg": {
                        "line": 111,
                        "commit": "3da2acac36ca254e98380965f83b2cb22a271f54"
                    },
                    "id": "1687192192767.10"
                }
            ],
            "file": "src/extension.ts",
            "line": 14,
            "markText": "registerWebviewViewProvider",
            "notes": "Casefile view registration",
            "peg": {
                "line": 10,
                "commit": "3da2acac36ca254e98380965f83b2cb22a271f54"
            },
            "id": "1687192192767.2"
        },
        {
            "children": [],
            "file": "src/datumPlans.js",
            "line": 3,
            "markText": "const $casefile",
            "notes": "",
            "peg": {
                "line": 3,
                "commit": "3c8bfaa6c477f917e19bd6a560ff29302c311c43"
            },
            "id": "1687192192767.8"
        },
        {
            "children": [],
            "file": "src/datumPlans.js",
            "line": 8,
            "markText": "const $bookmark",
            "notes": "",
            "peg": {
                "line": 8,
                "commit": "3c8bfaa6c477f917e19bd6a560ff29302c311c43"
            },
            "id": "1687192192767.9"
        }
    ],
    "path": "Key parts of extension/511f68ea-656f-4424-bae5-d2a03edb5926"
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

const MESSAGE_HANDLERS: Map<string, { handler: (data: any) => any, registration: Error }> = new Map();
function handleCasefileViewMessage(type: string, handler: (data: any) => any): void {
    const existing = MESSAGE_HANDLERS.get(type);
    if (existing) {
        throw Object.assign(new Error(`Second registration of '${type}' handler`), {
            ["first registration"]: existing.registration,
        });
    }
    MESSAGE_HANDLERS.set(type, { handler, registration: new Error(`First registration of '${type}' handler`) });
}

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

        await connectWebveiw(webviewView.webview, (view) => this._getHtmlForWebview(view), data => {
            this._getMessageHandler(data.type)(data);
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

    private _getMessageHandler(type: string): (data: any) => any {
        return (MESSAGE_HANDLERS.get(type)?.handler || ((data) => {
            console.error(`Invalid message type '${type}' received: %O`, data);
        })).bind(this);
    }
}

async function connectWebveiw(
    webview: vscode.Webview,
    htmlBuilder: ((view: vscode.Webview) => string) | ((view: vscode.Webview) => Promise<string>),
    receivedMessageHandler: (e: any) => any,
) {
    webview.html = await htmlBuilder(webview);
    webview.onDidReceiveMessage(receivedMessageHandler);
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
