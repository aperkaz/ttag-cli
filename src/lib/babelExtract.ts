import "../declarations";
import * as babel from "@babel/core";
import * as fs from "fs";
import * as tmp from "tmp";
import { extname } from "path";
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
    const tmpFile = tmp.fileSync();
    ttagOpts.extract = { ...ttagOpts.extract, output: tmpFile.name };
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
                    const { parseComponent } = require("vue-sfc-parser");
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
                    const { walk } = require("estree-walker");
                    const { parse: parseSvelte } = require("svelte/compiler");
                    const source = getSource(filepath);
                    const jsCodes: string[] = [];
                    const { html, instance, module } = parseSvelte(source);
                    if (module) {
                        walk(module, {
                            enter(node: TemplateNode) {
                                if (node.type === "Program") {
                                    jsCodes.push(source.slice(node.start, node.end));
                                }
                            }
                        });
                    }
                    walk(instance, {
                        enter(node: TemplateNode) {
                            if (node.type === "Program") {
                                jsCodes.push(source.slice(node.start, node.end));
                            }
                        }
                    });
                    walk(html, {
                        enter(node: TemplateNode) {
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
        return fs.readFileSync(tmpFile.name, "utf8");
    } finally {
        tmpFile.removeCallback();
    }

    function getSource(filename: string): string {
        return sources.get(filename) || fs.readFileSync(filename, "utf8");
    }
}
