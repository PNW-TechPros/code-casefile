declare module 'git-casefile' {
    export class CasefileKeeper {
        constructor(kwargs?: { toolOptions: ToolOptions, editor?: {} });
        bookmarks: BookmarkFacilitator;
        gitOps: GitInteraction;
        workingDir?: string;
        remote(name: string): GitRemote;
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
        currentLocation(bookmark: Bookmark): Promise<any>;
        computeLinePeg(filePath: string, line: number): Promise<BookmarkPeg | undefined>;
    }

    class GitInteraction {
        fetchSharedCasefilesFromRemote(remote: string): Promise<void>;
        getCasefile(path: string, options?: { before?: string }): Promise<{ bookmarks?: Bookmark[] }>;
        getCasefileAuthors(path: string): Promise<{path: string, authors: string[]}>;
        getListOfCasefiles(): Promise<CasefileGroup[]>;
        getListOfRemotes(): Promise<string[]>;
    }

    class GitRemote {
        commitsUnknown(casefile: any): Promise<string[] | false>;
        delete(...casefiles: [string | { path: string }]): Promise<null>;
        fetchSharedCasefiles(): Promise<null>;
        pushCommitRefs(...commits: string[]): Promise<null>;
        share(casefile: any): Promise<{ message: string, commit: string}>;
    }

    type Bookmark = any;

    type BookmarkPeg = {
        commit: string;
        line: number | string;
    };
}
