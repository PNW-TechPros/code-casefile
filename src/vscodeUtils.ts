export function deiconed(s: string): string {
    return s.replace(/\$\(.*?\)/, '\\$&');
}
