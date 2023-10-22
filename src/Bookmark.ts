import nextId from "./idGen";

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

export function fillMissingIds(bookmarks: Bookmark[]) {
	const remaining = [...bookmarks];
	while (remaining.length) {
		const current = remaining.pop();
		if (!current) {
			break;
		}
		if (!current.id) {
			current.id = nextId();
		}
		remaining.push(...(current.children || []));
	}
}
