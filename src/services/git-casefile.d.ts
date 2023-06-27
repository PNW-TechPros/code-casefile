declare module 'git-casefile' {
    export class CasefileKeeper {
        constructor(kwargs?: { toolOptions: ToolOptions, editor?: {} });
        bookmarks: BookmarkFacilitator;
        workingDir?: string;
    }

    type ToolOptions = {

    };

    class BookmarkFacilitator {
        currentLocation(bookmark: Bookmark): any;
    }

    type Bookmark = any;
}
