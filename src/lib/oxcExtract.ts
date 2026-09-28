import * as path from "path";
import { po } from "gettext-parser";
import { getNPlurals } from "plural-forms";
import { PoData, Message } from "./parser";
import * as ttagTypes from "../types";

type Node = any;
const importEsm = new Function("specifier", "return import(specifier)") as (
    specifier: string
) => Promise<typeof import("oxc-parser")>;

const apiNames: { [key: string]: string } = {
    t: "t",
    jt: "jt",
    gettext: "gettext",
    _: "gettext",
    ngettext: "ngettext",
    msgid: "msgid",
    c: "context"
};

const ttagModules = ["ttag", "ttag.macro", "babel-plugin-ttag/dist/ttag.macro"];

export function canUseOxc(
    paths: string[],
    opts?: ttagTypes.TtagOpts & ttagTypes.CliOpts
): boolean {
    if (process.env.TTAG_EXTRACTOR === "babel") return false;
    if (opts?.useProjectBabelrc) return false;
    return paths.every(filename => {
        const extension = path.extname(filename);
        return extension !== ".vue" && extension !== ".svelte";
    });
}

export async function extractWithOxc(
    files: string[],
    sources: Map<string, string>,
    lang: string,
    opts: ttagTypes.TtagOpts
): Promise<PoData | null> {
    let parseSync: typeof import("oxc-parser").parseSync;
    try {
        ({ parseSync } = await importEsm("oxc-parser"));
    } catch (_) {
        return null;
    }
    const entries: Message[] = [];
    for (const filename of files) {
        const source = sources.get(filename);
        if (
            source === undefined ||
            /(?:^|\n)\s*\/\/[#@]?\s*flow\b/.test(source) ||
            source.includes("disable ttag")
        ) {
            return null;
        }
        let parsed;
        try {
            parsed = parseSync(filename, source, { range: true });
        } catch (_) {
            return null;
        }
        if (parsed.errors.length) return null;
        entries.push(
            ...extractFile(
                parsed.program,
                parsed.comments,
                source,
                filename,
                lang,
                opts
            )
        );
    }
    return buildCatalog(entries, opts);
}

function extractFile(
    program: Node,
    comments: Node[],
    source: string,
    filename: string,
    lang: string,
    opts: ttagTypes.TtagOpts
): Message[] {
    const aliases = new Map<string, string>();
    const imports = new Set<string>(opts.discover || []);
    const candidates: Node[] = [];
    for (const [alias, api] of Object.entries(apiNames))
        aliases.set(alias, api);

    walk(program, node => {
        if (
            node.type === "ImportDeclaration" &&
            isTtagModule(node.source.value, true)
        ) {
            for (const specifier of node.specifiers) {
                if (specifier.type !== "ImportSpecifier") continue;
                const imported =
                    specifier.imported.name || specifier.imported.value;
                const api = apiNames[imported];
                if (api) {
                    aliases.set(specifier.local.name, api);
                    imports.add(specifier.local.name);
                }
            }
        }
        if (node.type === "VariableDeclarator" && isTtagRequire(node)) {
            for (const property of node.id.properties) {
                const imported = property.key.name || property.key.value;
                const local = property.value.name;
                const api = apiNames[imported];
                if (api && local) {
                    aliases.set(local, api);
                    imports.add(local);
                }
            }
        }
        if (
            node.type === "TaggedTemplateExpression" ||
            node.type === "CallExpression"
        ) {
            candidates.push(node);
        }
    });

    const entries: Message[] = [];
    const location = opts.extract?.location || "full";
    const relative = filename.replace(`${process.cwd()}${path.sep}`, "");
    const lineStarts = location === "full" ? getLineStarts(source) : [];
    const plurals = Number(getNPlurals(lang));
    for (const node of candidates) {
        let context: string | undefined;
        let target = node;
        if (node.type === "TaggedTemplateExpression") {
            const contextual = getContextTarget(node.tag);
            if (contextual) {
                context = contextual.context;
                target = { ...node, tag: contextual.target };
            }
            if (target.tag.type !== "Identifier") continue;
            const api = aliases.get(target.tag.name);
            if (
                (api !== "t" && api !== "jt") ||
                (!context && !imports.has(target.tag.name))
            )
                continue;
            const msgid = templateToMsgid(target.quasi, source, opts);
            validateUseful(
                msgid,
                source.slice(target.quasi.start + 1, target.quasi.end - 1)
            );
            entries.push(makeEntry(msgid, node, context));
            continue;
        }
        if (node.type !== "CallExpression") continue;
        const contextual = getContextTarget(node.callee);
        if (contextual) {
            context = contextual.context;
            target = { ...node, callee: contextual.target };
        }
        if (target.callee.type !== "Identifier") continue;
        const api = aliases.get(target.callee.name);
        if (!context && !imports.has(target.callee.name)) continue;
        if (api === "gettext" && target.arguments.length) {
            const arg = target.arguments[0];
            if (arg.type !== "Literal" || typeof arg.value !== "string") {
                throw new Error(
                    `You can not use ${arg.type} '${source.slice(
                        arg.start,
                        arg.end
                    )}' as an argument to gettext`
                );
            }
            validateUseful(arg.value);
            entries.push(makeEntry(arg.value, node, context));
        } else if (
            api === "ngettext" &&
            target.arguments[0]?.type === "TaggedTemplateExpression"
        ) {
            const forms = target.arguments.slice(0, -1);
            const first = forms[0];
            if (
                first.tag.type !== "Identifier" ||
                aliases.get(first.tag.name) !== "msgid"
            ) {
                throw new Error("First argument must use 'msgid' tag");
            }
            const expected = plurals;
            if (forms.length !== expected) {
                throw new Error(
                    `Expected to have ${expected} plural forms but have ${forms.length} instead`
                );
            }
            const msgid = templateToMsgid(first.quasi, source, opts);
            validateUseful(msgid);
            const plural = templateToMsgid(forms[1], source, opts);
            const entry = makeEntry(msgid, node, context);
            entry.msgid_plural = plural;
            entry.msgstr = Array(expected).fill("");
            entries.push(entry);
        }
    }
    return entries;

    function makeEntry(msgid: string, node: Node, context?: string): Message {
        const entry: Message = { msgid, msgstr: [""] };
        if (context !== undefined) entry.msgctxt = context;
        if (location !== "never") {
            entry.comments = {
                reference:
                    location === "file"
                        ? relative
                        : `${relative}:${getLine(node.start, lineStarts)}`
            };
        }
        if (/\$\{\s?[\s\S]+?\s}/.test(msgid)) {
            entry.comments = entry.comments || {};
            entry.comments.flag = "javascript-format";
        }
        const extracted = opts.addComments
            ? getExtractedComment(node, comments, source)
            : undefined;
        if (extracted) {
            entry.comments = entry.comments || {};
            entry.comments.extracted = extracted;
        }
        return entry;
    }
}

function getContextTarget(
    node: Node
): { context: string; target: Node } | null {
    if (
        node?.type !== "MemberExpression" ||
        node.computed ||
        node.object?.type !== "CallExpression" ||
        node.object.callee?.type !== "Identifier" ||
        node.object.callee.name !== "c" ||
        node.object.arguments.length !== 1 ||
        typeof node.object.arguments[0].value !== "string"
    ) {
        return null;
    }
    return { context: node.object.arguments[0].value, target: node.property };
}

function templateToMsgid(
    template: Node,
    source: string,
    opts: ttagTypes.TtagOpts
): string {
    const parts = template.quasis.map((quasi: Node) => quasi.value.cooked);
    let msgid = parts.reduce((result: string, part: string, index: number) => {
        const expression = template.expressions[index];
        if (!expression) return result + part;
        const value = opts.numberedExpressions
            ? String(index)
            : expressionToString(expression, source);
        return `${result}${part}\${ ${value} }`;
    }, "");
    if (msgid.includes("\n")) msgid = dedent(msgid);
    return msgid;
}

function expressionToString(node: Node, source: string): string {
    if (
        node.type === "Identifier" ||
        node.type === "MemberExpression" ||
        node.type === "Literal" ||
        node.type === "ThisExpression"
    ) {
        return source.slice(node.start, node.end);
    }
    throw new Error(
        `You can not use ${node.type} '\${${source.slice(
            node.start,
            node.end
        )}}' in localized strings`
    );
}

function dedent(value: string): string {
    const lines = value.split("\n");
    let indentation: number | null = null;
    for (const line of lines) {
        const match = line.match(/^(\s+)\S+/);
        if (match) {
            indentation =
                indentation === null
                    ? match[1].length
                    : Math.min(indentation, match[1].length);
        }
    }
    if (indentation !== null) {
        value = lines
            .map(line =>
                line[0] === " " || line[0] === "\t"
                    ? line.slice(indentation!)
                    : line
            )
            .join("\n");
    }
    return value.trim().replace(/\\n/g, "\n");
}

function validateUseful(msgid: string, display: string = msgid): void {
    if (
        !msgid.replace(/\${.*?}|\d|\s|[.,/#!$%^&*;{}=\-_`~()]/g, "").match(/\S/)
    ) {
        throw new Error(`Can not translate '${display}'`);
    }
}

function buildCatalog(entries: Message[], opts: ttagTypes.TtagOpts): PoData {
    const data: PoData = {
        charset: "UTF-8",
        headers: {
            "content-type": "text/plain; charset=UTF-8",
            "plural-forms": "nplurals=2; plural=(n!=1);"
        },
        translations: { "": {} }
    };
    for (const entry of entries) {
        const context = entry.msgctxt || "";
        data.translations[context] = data.translations[context] || {};
        const old = data.translations[context][entry.msgid];
        if (!old) {
            data.translations[context][entry.msgid] = entry;
        } else if (old.comments?.reference && entry.comments?.reference) {
            const refs = new Set([
                ...old.comments.reference.split("\n"),
                ...entry.comments.reference.split("\n")
            ]);
            old.comments.reference = Array.from(refs)
                .sort(referenceComparator)
                .join("\n");
        }
    }
    for (const context of Object.keys(data.translations)) {
        for (const entry of Object.values(data.translations[context])) {
            if (entry.comments?.reference) {
                entry.comments.reference = entry.comments.reference
                    .split("\n")
                    .sort(referenceComparator)
                    .join("\n");
            }
        }
        if (opts.sortByMsgid) {
            const sorted: { [key: string]: Message } = {};
            for (const key of Object.keys(data.translations[context]).sort()) {
                sorted[key] = data.translations[context][key];
            }
            data.translations[context] = sorted;
        }
    }
    return data;
}

export function compileCatalog(data: PoData): string {
    return po.compile(data).toString();
}

function getExtractedComment(
    node: Node,
    comments: Node[],
    source: string
): string | undefined {
    return precedingComment(node.start, comments, source)?.value.trimStart();
}

function precedingComment(
    start: number,
    comments: Node[],
    source: string
): Node | undefined {
    let low = 0;
    let high = comments.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (comments[middle].end <= start) low = middle + 1;
        else high = middle;
    }
    const comment = comments[low - 1];
    if (!comment || !/^[\s;{}()]*$/.test(source.slice(comment.end, start))) {
        return undefined;
    }
    return comment;
}

function isTtagModule(value: string, allowNpm: boolean): boolean {
    return ttagModules.some(
        module =>
            value === module || (allowNpm && value.startsWith(`npm:${module}`))
    );
}

function isTtagRequire(node: Node): boolean {
    return (
        node.id?.type === "ObjectPattern" &&
        node.init?.type === "CallExpression" &&
        node.init.callee?.type === "Identifier" &&
        node.init.callee.name === "require" &&
        node.init.arguments.length === 1 &&
        isTtagModule(node.init.arguments[0].value, false)
    );
}

function walk(node: Node, visitor: (node: Node) => void): void {
    if (!node || typeof node !== "object" || typeof node.type !== "string")
        return;
    visitor(node);
    for (const key of Object.keys(node)) {
        if (
            key === "type" ||
            key === "start" ||
            key === "end" ||
            key === "range"
        )
            continue;
        const value = node[key];
        if (Array.isArray(value)) {
            for (const child of value) walk(child, visitor);
        } else {
            walk(value, visitor);
        }
    }
}

function getLineStarts(source: string): number[] {
    const starts = [0];
    for (let i = 0; i < source.length; i++)
        if (source.charCodeAt(i) === 10) starts.push(i + 1);
    return starts;
}

function getLine(offset: number, starts: number[]): number {
    let low = 0;
    let high = starts.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (starts[middle] <= offset) low = middle + 1;
        else high = middle;
    }
    return low;
}

function referenceComparator(first: string, second: string): number {
    const a = /^(.*):(\d+)$/.exec(first);
    const b = /^(.*):(\d+)$/.exec(second);
    if (a && b && a[1] === b[1]) return Number(a[2]) - Number(b[2]);
    return first < second ? -1 : first > second ? 1 : 0;
}
