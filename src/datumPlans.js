import datumPlan from 'natural-lenses/datum-plan';

export const $casefile = datumPlan(({ VALUE }) => ({
    bookmarks: [], // Each item should adhere to $bookmark
    path: VALUE,
}));

export const $bookmark = datumPlan(({ VALUE }) => ({
    children: [], // Each item should adhere to $bookmark
    file: VALUE,
    line: VALUE,
    markText: VALUE,
    notes: VALUE,
    peg: {
        commit: VALUE,
        line: VALUE,
    },
    id: VALUE,
    collapsed: VALUE,
}));
