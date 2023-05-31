const PREFIX = 'code-casefile:';
const STYLE = "background-color: indigo; color: white;";

export const debug = (formatOrArg1: any, ...args: any[]) => {
    const format = (
        typeof formatOrArg1 === 'string'
        ? `${formatOrArg1}`
        : `%o`
    );
    console.log(`%c${PREFIX} ${format}`, STYLE, ...args);
};
