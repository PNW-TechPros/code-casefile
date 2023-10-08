export function dataAttr(attrName, value) {
    return { ['data-' + attrName]: JSON.stringify(value) };
}

export function vscontext(value) {
    return dataAttr('vscode-context', value);
}

export const NO_STD_CMENU_ENTRIES = Object.freeze(
    {'preventDefaultContextMenuItems': true}
);

export function when(cond, output) {
    return cond ? output : null;
}