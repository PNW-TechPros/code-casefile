import { CasefileKeeper } from "git-casefile";
import GitCasefile from "./gitCasefile";
import { WorkspaceConfiguration } from "vscode";
import type { Casefile } from "../Casefile";

type ServicesConfig = {
    getConfig: () => WorkspaceConfiguration,
    getWorkdirs: () => string[],
    getCurrentForest: () => Casefile,
    setCurrentForest: (casefile: Casefile) => void,
};

export default class Services {
    casefile: GitCasefile;
    getCurrentForest: () => Casefile;
    setCurrentForest: (casefile: Casefile) => void;
    constructor(config: ServicesConfig) {
        this.casefile = new GitCasefile(config);
        this.getCurrentForest = config.getCurrentForest;
        this.setCurrentForest = config.setCurrentForest;
    }
}