import { forEach, isUndefined, last, tap, thru } from "lodash";
import { Bookmark } from "./Bookmark";

export const beginMarker = '=============================== BEGIN CASEFILE ===============================';
export const endMarker   = '================================ END CASEFILE ================================';

export class InvalidCasefile extends Error {
    constructor() {
        super("Invalid Casefile data");
    }
}

const markers = {beginMarker, endMarker};
const markerPattern = /^\s*=+\s+(BEGIN|END) +CASEFILE\s+=+\s*$/;

forEach(markers, (marker, markerName) => {
    if (!marker.match(markerPattern)) {
        throw new Error(`${markerName} does not match markerPattern`);
    }
});

const LineType: { [key: string]: number } = {
  beginMarker: 1,
  endMarker: 2,
  other: 0
};

const State = {
  start: 0,
  data: 1,
  error: -1
};

type ActionSet = {
    collect?: number,
    deserialize?: number,
};

const StateTransitions : number[][] = [];
/*                               LineType.other   LineType.beginMarker   LineType.endMarker */
StateTransitions[State.start] = [State.start,     State.data,            State.error];
StateTransitions[State.data]  = [State.data,      State.error,           State.start];


const Actions : (ActionSet | null)[][] = [];
/*                      LineType.other   LineType.beginMarker   LineType.endMarker */
Actions[State.start] = [{},              {},                    null];
Actions[State.data]  = [{collect: 1},    null,                  {deserialize: 1}];

const lineType = (line: string): number => {
    const mm = line.match(markerPattern);
    return mm ? LineType[mm[1].toLowerCase() + "Marker"] : LineType.other;
};

const transition = (state: number, lineType: number): { actions: ActionSet, nextState: number } => {
    const nextState = thru(
        StateTransitions[state]?.[lineType],
        (cand) => isUndefined(cand) ? State.error : cand
    );
    return {
        actions: Actions[state][lineType] || {},
        nextState
    };
};

export const validFile = (lines: Iterable<string>): boolean => {
    let state = State.start;
    for (const line of lines) {
        const curLineType = lineType(line), { nextState } = transition(state, curLineType);
        if (nextState === State.error) {
            return false;
        }
        state = nextState;
    }
    return true;
};

export const readPersisted = (lines: Iterable<string>): Bookmark[] => tap<Bookmark[]>([], (bookmarks) => {
    let state = State.start;
    let base64Data = '';
    for (const line of lines) {
        const curLineType = lineType(line);
        const { nextState, actions } = transition(state, curLineType);
        if (nextState === State.error) {
            throw new InvalidCasefile();
        }
        if (actions.collect) {
            base64Data += line;
        }
        if (actions.deserialize) {
            const newBookmarks = JSON.parse(
                Buffer.from(base64Data, 'base64').toString('utf8')
            );
            bookmarks.push(...newBookmarks);
            base64Data = '';
        }
        state = nextState;
    }
});

const lineRef = (bookmark: Bookmark): string => (
    bookmark.peg
    ? `${bookmark.peg.commit.slice(0, 10)}:${bookmark.file}@${bookmark.peg.line}`
    : `${bookmark.file}@${bookmark.line}`
);

function* generatePersistedLines(bookmarks: Bookmark[]): Generator<string> {
    yield "# Exported Casefile\n\n";

    const remainingLevels: Bookmark[][] = [[...bookmarks].reverse()];
    while (remainingLevels.length) {
        const bookmark = last(remainingLevels)?.pop();
        if (!bookmark) {
            remainingLevels.pop();
            continue;
        }

        const indent = '  '.repeat(remainingLevels.length - 1);
        if (bookmark.file) {
            yield `${indent}* [${lineRef(bookmark)}] ${bookmark.markText}\n`;
        } else {
            yield `${indent}* ${bookmark.markText}\n`;
        }
        if (bookmark.notes) {
            const noteLines = bookmark.notes.trimEnd().split(/(?: |\t)*(?:\r\n?|\n)/);
            if (noteLines.length) {
                yield '\n';
            }
            for (const line of noteLines) {
                const trimmedLine = line.trimEnd();
                if (trimmedLine) {
                    yield `${indent}  ${trimmedLine}\n`;
                } else {
                    yield '\n';
                }
            }
        }
        yield '\n';

        if (bookmark.children?.length) {
            remainingLevels.push([...bookmark.children].reverse());
        }
    }

    yield beginMarker + '\n';

    const cfBase64 = Buffer.from(JSON.stringify(bookmarks), 'utf8').toString('base64'), step = 68;
    for (let ls = 0; ls < cfBase64.length; ls += step) {
        yield `     ${cfBase64.slice(ls, ls + step)}\n`;
    }

    yield endMarker + '\n';
}

export const makePersisted = (bookmarks: Bookmark[]): string => {
    return Array.from(generatePersistedLines(bookmarks)).join('');
};
