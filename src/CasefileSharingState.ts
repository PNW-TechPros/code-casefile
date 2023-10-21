import { CasefileGroup } from "git-casefile";

export type CasefileSharingState = {
    knownCasefiles?: CasefileGroup[],
    peer?: { folder: string, remote: string },
};
