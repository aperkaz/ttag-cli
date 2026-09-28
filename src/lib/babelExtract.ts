import "../declarations";
import * as babel from "@babel/core";
import * as fs from "fs";
import { extname } from "path";
import * as os from "os";
import * as path from "path";
import { makeExtractBabelConf } from "../defaults";
import * as ttagTypes from "../types";
import { TransformFn, pathsWalk } from "./pathsWalk";

type TemplateNode = any;

export async function extractWithBabel(
    paths: string[],
    sources: Map<string, string>,
    ttagOpts: ttagTypes.TtagOpts,
    progress: ttagTypes.Progress,
    overrideOpts?: ttagTypes.TtagOpts & ttagTypes.CliOpts
): Promise<string> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ttag-"));
    const tmpFile = path.join(tmpDir, "translations.pot");
    ttagOpts.extract = { ...ttagOpts.extract, output: tmpFile };
    const babelOptions = new Map<string, babel.TransformOptions>();
    const getBabelOptions = (filename: string) => {
        const extension = extname(filename);
        const parserKind =
            extension === ".ts" ? "ts" : extension === ".tsx" ? "tsx" : "js";
        let options = babelOptions.get(parserKind);
        if (!options) {
            options = makeExtractBabelConf(
                ttagOpts,
                {
                    useProjectBabelrc:
                        overrideOpts && overrideOpts.useProjectBabelrc
                },
                filename
            );
            babelOptions.set(parserKind, options);
        }
        return options;
    };
    const transformFn: TransformFn = filepath => {
        try {
            switch (extname(filepath)) {
                case ".vue": {
                    const { parseComponent } = requireOptional(
                        "vue-sfc-parser",
                        "Vue extraction requires vue-sfc-parser"
                    );
                    const source = getSource(filepath);
                    const script = parseComponent(source).script;
                    if (script) {
                        const lineCount =
                            source.slice(0, script.start).split(/\r\n|\r|\n/)
                                .length - 1;
                        babel.transformSync(
                            "\n".repeat(lineCount) + script.content,
                            { filename: filepath, ...getBabelOptions(filepath) }
                        );
                    }
                    break;
                }
                case ".svelte": {
                    const { parse: parseSvelte } = requireOptional(
                        "svelte/compiler",
                        "Svelte extraction requires svelte"
                    );
                    const source = getSource(filepath);
                    const jsCodes: string[] = [];
                    const { html, instance, module } = parseSvelte(source);
                    if (module) {
                        walkAst(module, (node: TemplateNode) => {
                            if (node.type === "Program") {
                                jsCodes.push(
                                    source.slice(node.start, node.end)
                                );
                            }
                        });
                    }
                    walkAst(instance, (node: TemplateNode) => {
                        if (node.type === "Program") {
                            jsCodes.push(source.slice(node.start, node.end));
                        }
                    });
                    walkAst(html, (node: TemplateNode) => {
                        if (
                            node.type === "MustacheTag" ||
                            node.type === "RawMustacheTag"
                        ) {
                            jsCodes.push(
                                `(${source.slice(
                                    node.expression.start,
                                    node.expression.end
                                )});`
                            );
                        }
                    });
                    babel.transformSync(jsCodes.join("\n"), {
                        filename: filepath,
                        ...getBabelOptions(filepath)
                    });
                    break;
                }
                default:
                    babel.transformSync(getSource(filepath), {
                        filename: filepath,
                        ...getBabelOptions(filepath)
                    });
            }
        } catch (err) {
            const error = err as any;
            console.error(error.codeFrame || error);
            progress.fail("Failed to extract translations");
            process.exit(1);
        }
    };

    try {
        await pathsWalk(paths, progress, transformFn);
        babel.transformSync("", {
            filename: "ttag-extraction-finalize.js",
            ...makeExtractBabelConf(
                ttagOpts,
                {
                    useProjectBabelrc:
                        overrideOpts && overrideOpts.useProjectBabelrc
                },
                "ttag-extraction-finalize.js",
                true
            )
        });
        return fs.readFileSync(tmpFile, "utf8");
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    function getSource(filename: string): string {
        return sources.get(filename) || fs.readFileSync(filename, "utf8");
    }
}

function walkAst(node: any, visit: (node: any) => void): void {
    if (!node || typeof node !== "object") return;
    if (typeof node.type === "string") visit(node);
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(child => walkAst(child, visit));
        else if (value && typeof value === "object") walkAst(value, visit);
    }
}

function requireOptional(name: string, message: string): any {
    try {
        return require(name);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND") {
            throw new Error(`${message}. Install it in your project.`);
        }
        throw error;
    }
}
