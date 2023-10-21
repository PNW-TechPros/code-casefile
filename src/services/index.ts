import { CasefileKeeper } from "git-casefile";
import GitCasefile from "./gitCasefile";
import { Event, EventEmitter, WorkspaceConfiguration } from "vscode";
import type { Casefile } from "../Casefile";
import { CasefileSharingState } from "../CasefileSharingState";
import { thru } from "lodash";

export type Persistence<T> = [
    /* load */ () => T,
    /* save */ (value: T) => Thenable<void>
];

type ServicesConfig = {
    getConfig: () => WorkspaceConfiguration,
    getWorkdirs: () => string[],
    forestPersistence: Persistence<Casefile>,
    sharingStatePersistence: Persistence<CasefileSharingState>,
};

export default class Services {
    casefile: GitCasefile;
    private _forestChanged = new EventEmitter<Casefile>();
    getCurrentForest: () => Casefile;
    setCurrentForest: (casefile: Casefile) => Thenable<void>;
    getSharingState: () => CasefileSharingState;
    setSharingState: (state: CasefileSharingState) => Thenable<void>;

    constructor(config: ServicesConfig) {
        this.casefile = new GitCasefile(config);
        this.getCurrentForest = config.forestPersistence[0];
        this.setCurrentForest = thru(
            config.forestPersistence[1],
            (setter) => (casefile: Casefile) => (setter(casefile).then(() => {
                this._forestChanged.fire(casefile);
            }))
        );
        this.getSharingState = config.sharingStatePersistence[0];
        this.setSharingState = config.sharingStatePersistence[1];
    }

    dispose() {
        this._forestChanged.dispose();
    }

    get onForestChange(): Event<Casefile> {
        return this._forestChanged.event;
    }
}