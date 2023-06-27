import { range } from "lodash";
import { TextDecoder } from "util";
import { TextDocument, Uri, workspace } from "vscode";
import path = require("path");

const ENDL_PATTERN = /\r?\n|\r/;

interface EditBuffer {
    lineText(lnum: number): (string | undefined);
};

// Implements Editor interface from git-casefile
export class Integration {
    private readonly _cwd: string;

    constructor({ cwd }: { cwd: string }) {
        this._cwd = cwd;
    }

    async open(filePath: string): Promise<EditBuffer> {
        filePath = path.resolve(this._cwd, filePath);
        const openDoc = liveDoc(filePath);
        const lines = (
            openDoc
            ? documentLines(openDoc)
            : await readFile(filePath)
        );
        return {
            lineText: (lnum) => lines[lnum - 1],
        };
    }

    async liveContent(filePath: string): Promise<string | undefined> {
        filePath = path.resolve(this._cwd, filePath);
        const openDoc = liveDoc(filePath);
        if (!openDoc) {
            return;
        }
        const result = openDoc.getText();
        return result;
    }
}

function liveDoc(filePath: string): (TextDocument | undefined) {
    return workspace.textDocuments.find(
        doc => doc.fileName === filePath
    );
}

function documentLines(doc: TextDocument) {
    return range(doc.lineCount).map(n => doc.lineAt(n).text);
}

async function readFile(filePath: string): Promise<string[]> {
    const byteContent = await workspace.fs.readFile(Uri.file(filePath));
    return new TextDecoder('utf-8').decode(byteContent).split(ENDL_PATTERN);
}
