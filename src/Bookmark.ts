export type Bookmark = {
    children?: Bookmark[];
    file?: string;
    line?: number;
    markText?: string;
    notes?: string;
    peg?: {
        commit: string;
        line: number | string;
    };
    id?: string;
    collapsed?: boolean;
};
