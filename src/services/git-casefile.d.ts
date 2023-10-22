declare module 'git-casefile' {
    export class CasefileKeeper {
        constructor(kwargs?: { toolOptions: ToolOptions, editor?: {} });
        bookmarks: BookmarkFacilitator;
        gitOps: GitInteraction;
        workingDir?: string;
    }

    type ToolOptions = {

    };

    type CasefileGroup = {
        name: string,
        instances: {
            path: string
        }[],
    };

    class BookmarkFacilitator {
        currentLocation(bookmark: Bookmark): any;
    }

    class GitInteraction {
        fetchSharedCasefilesFromRemote(remote: string): Promise<void>;
        getCasefile(path: string, options?: { before?: string }): Promise<{ bookmarks?: Bookmark[] }>;
        getCasefileAuthors(path: string): Promise<{path: string, authors: string[]}>;
        getListOfCasefiles(): Promise<CasefileGroup[]>;
        getListOfRemotes(): Promise<string[]>;
    }

    type Bookmark = any;
}
