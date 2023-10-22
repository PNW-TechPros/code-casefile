import * as vscode from "vscode";
import { debug } from "./debugLog";

export function deiconed(s: string): string {
    return s.replace(/\$\(.*?\)/, '\\$&');
}

type SetContextOptions = {
    prefix?: string | false;
};

export function setContext(
    key: string,
    value: any,
    {
        prefix = 'codeCasefile'
    }: SetContextOptions = {}
): Thenable<void> {
    if (prefix !== false) {
        key = `${prefix}.${key}`;
    }
    debug("Setting context key %o to %o", key, value);
    return vscode.commands.executeCommand('setContext', key, value);
}
