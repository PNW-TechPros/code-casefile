import { tap } from "lodash";

export class NoMark extends Error {
    constructor(itemPath) {
        super("An expected bookmark was not found");
        this.itemPath = itemPath;
    }
}

export const getMarkPath = (state, ids) => tap([], (result) => {
    let level = state;
    Object.defineProperty(result, 'finalTarget', {
        get: () => result[result.length - 1]?.mark,
    });
    for (const step of ids) {
        const i = level.findIndex((mark) => mark.id === step);
        if (i < 0) {
            throw new NoMark(ids);
        }
        result.push({ index: i, mark: level[i], in: level});
        level = level[i].children || [];
    }
});

export default getMarkPath;
