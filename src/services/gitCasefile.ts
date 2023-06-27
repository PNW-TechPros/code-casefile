import { CasefileKeeper } from "git-casefile";
import { WorkspaceConfiguration } from "vscode";
import { Integration as EditorIntegration } from "./editorIntegration";
import { tap } from "lodash";
import { debug } from "../debugLog";

const { CasefileKeeper: CasefileKeeperImpl } = require('git-casefile');

type GitCasefileConfig = {
    getConfig: () => WorkspaceConfiguration,
    getWorkdirs: () => string[],
};

export default class GitCasefile {
    private readonly _getConfig: () => WorkspaceConfiguration;
    private readonly _getCwd: () => string[];
    private _keeperInsts: (null | CasefileKeeper[]);
    
    constructor({ getConfig, getWorkdirs }: GitCasefileConfig) {
        this._getConfig = getConfig;
        this._getCwd = getWorkdirs;
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
        return tap(this._keeperInsts = this._getCwd().map(
            cwd => Object.assign(
                new CasefileKeeperImpl({
                    toolOptions: {...toolOptions, cwd },
                    editor: new EditorIntegration({ cwd }),
                }), {
                    workingDir: cwd
                }
            )
        ), (keepers) => {
            // debug("CasefileKeeper editors: %O", keepers.map(k => k.bookmarks.editor.constructor.name));
        });
    }
    
}