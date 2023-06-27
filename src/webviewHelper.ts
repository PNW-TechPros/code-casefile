import * as vscode from 'vscode';
import { debug } from './debugLog';

export async function connectWebview(
    webview: vscode.Webview,
    htmlBuilder: ((view: vscode.Webview) => string) | ((view: vscode.Webview) => Promise<string>),
    receivedMessageHandler: (e: any) => any,
) {
    webview.html = await htmlBuilder(webview);
    webview.onDidReceiveMessage(receivedMessageHandler);
}

const HANDLER_PREFIX = "handle message";
export function messageHandler(messageName: string): string {
    return `${HANDLER_PREFIX} ${messageName}`;
}

export function dispatchMessage(handlerHost: any, data: {type: string}) {
    debug("Dispatching message: %O", data);
    const specifiedHandler = handlerHost[messageHandler(data.type)];
    if (!specifiedHandler) {
        const handlers = [];
        for (const key in handlerHost) {
            if (key.startsWith(HANDLER_PREFIX + ' ')) {
                handlers.push(key);
            }
        }
        handlers.sort();
        debug(
            `Handler host (%s) missing '%s' (available handlers: %O)`,
            handlerHost?.constructor?.name,
            messageHandler(data.type),
            handlers,
        );
    }
    const handler = (
        specifiedHandler as ((data: any) => any)
        || ((data) => {
            console.error(`Invalid message type '%s', received: %O`, data.type, data);
        })
    );
    handler.call(handlerHost, data);
}
