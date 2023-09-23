import { camelCase } from "lodash";

export const DRAG_TYPES = Object.freeze(Object.fromEntries([
    'BOOKMARK'
].map(item => [item, camelCase(item)])));
