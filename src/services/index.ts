import { CasefileKeeper } from "git-casefile";
import GitCasefile from "./gitCasefile";
import { WorkspaceConfiguration } from "vscode";

type ServicesConfig = {
    getConfig: () => WorkspaceConfiguration,
    getWorkdirs: () => string[],
};

export default class Services {
    casefile: GitCasefile;
    constructor(config: ServicesConfig) {
        this.casefile = new GitCasefile(config);
    }
}