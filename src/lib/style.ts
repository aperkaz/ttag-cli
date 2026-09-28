let forceColor = false;

export function setColorEnabled(enabled: boolean): void {
    forceColor = enabled;
}

function style(open: string, close: string, text: string): string {
    if (!forceColor && !process.stdout.isTTY) return text;
    return text
        .split("\n")
        .map(line => `\u001b[${open}m${line}\u001b[${close}m`)
        .join("\n");
}

export const blue = (text: string) => style("34", "39", text);
export const cyan = (text: string) => style("36", "39", text);
export const gray = (text: string) => style("90", "39", text);
export const green = (text: string) => style("32", "39", text);
export const red = (text: string) => style("31", "39", text);
export const yellow = (text: string) => style("33", "39", text);
export const errorHighlight = (text: string) =>
    forceColor || process.stdout.isTTY
        ? `\u001b[4m\u001b[41m${text}\u001b[49m\u001b[24m`
        : text;
