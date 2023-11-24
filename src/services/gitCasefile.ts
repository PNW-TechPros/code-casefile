import { BookmarkPeg, CasefileKeeper } from "git-casefile";
import { WorkspaceConfiguration } from "vscode";
import { Integration as EditorIntegration } from "./editorIntegration";
import { sortBy, tap } from "lodash";
import * as path from "path";
import { debug } from "../debugLog";
import { statSync } from "fs";

const { CasefileKeeper: CasefileKeeperImpl } = require('git-casefile');

type GitCasefileConfig = {
    getConfig: () => WorkspaceConfiguration,
    getWorkdirs: () => string[],
};

export default class GitCasefile {
    private readonly _getConfig: () => WorkspaceConfiguration;
    private readonly _getWorkDirs: () => string[];
    private _keeperInsts: (null | CasefileKeeper[]);

    constructor({ getConfig, getWorkdirs }: GitCasefileConfig) {
        this._getConfig = getConfig;
        this._getWorkDirs = getWorkdirs;
        this._keeperInsts = null;
    }

    configurationChanged() {
        this._keeperInsts = null;
    }

    public get keepers() : CasefileKeeper[] {
        if (this._keeperInsts) {
            return this._keeperInsts;
        }
        const toolOptions = {
            env: {...process.env},
        };
        const conf = this._getConfig();
        const toolsPath = conf.get<string>('externalTools.path');
        if (toolsPath) {
            toolOptions.env.PATH = toolsPath;
        }
        return tap(this._keeperInsts = [], (keepers: CasefileKeeper[]) => {
            for (const workDir of this._getWorkDirs()) {
                const gitDir = path.join(workDir, '.git');
                if (!statSync(gitDir, { throwIfNoEntry: false })) {
                    continue;
                }
                const gitKeeper = Object.assign(
                    new CasefileKeeperImpl({
                        toolOptions: {...toolOptions, cwd: workDir},
                        editor: new EditorIntegration({ cwd: workDir }),
                    }), {
                        workingDir: workDir,
                    }
                );
                keepers.push(gitKeeper);
            }
        });
    }

    relativizeFilePath(fullFilePath: string): string | undefined {
        const possibilities: string[] = this._getWorkDirs().flatMap((workingDir) => {
            if (!workingDir) {
                return [];
            }
            const relPath = path.relative(workingDir, fullFilePath);
            return relPath.startsWith('..' + path.sep) ? [] : [relPath];
        });
        return sortBy(possibilities, (cand) => cand.length)[0];
    }

    async derivePeg(ref: {file: string, line: number}): Promise<BookmarkPeg | undefined> {
        const possibilities: any[] = [];
        await Promise.all(this.keepers.map((keeper) => {
            const peg = keeper.bookmarks.computeLinePeg(ref.file, ref.line);
            if (peg) {
                possibilities.push(peg);
            }
        }));
        return possibilities[0];
    }
}