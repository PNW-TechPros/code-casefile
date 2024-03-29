import { BookmarkPeg, CasefileKeeper, GitRemote } from "git-casefile";
import { WorkspaceConfiguration } from "vscode";
import { Integration as EditorIntegration } from "./editorIntegration";
import { sortBy, tap } from "lodash";
import * as path from "path";
import { debug } from "../debugLog";
import { statSync } from "fs";
import EventEmitter = require("events");

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
                const tracer = new EventEmitter().on('execute', (program, args, opts) => {
                    debug(
                        "----- Executing (%s) -----\n> %s %s\n    (opts: %O)\n",
                        workDir,
                        program, args.map(JSON.stringify).join(' '),
                        opts
                    );
                });
                const gitKeeper = Object.assign(
                    new CasefileKeeperImpl({
                        toolOptions: {...toolOptions, cwd: workDir, tracer},
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
        await Promise.all(this.keepers.map(async (keeper) => {
            const peg = await keeper.bookmarks.computeLinePeg(ref.file, ref.line);
            debug("Computed git peg: %O", peg);
            if (peg) {
                possibilities.push(peg);
            }
        }));
        return possibilities.find(peg => peg?.commit);
    }

    getRemote(ref: {folder: string, remote: string}): GitRemote {
        for (const keeper of this.keepers) {
            if (keeper.workingDir === ref.folder) {
                return keeper.remote(ref.remote);
            }
        }
        throw new Error(`No CasefileKeeper for folder '${ref.folder}`);
    }
}