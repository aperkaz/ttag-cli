import "../declarations";
import * as babel from "@babel/core";
import * as fs from "fs";
import * as tmp from "tmp";
import { extname } from "path";
import ignore from "ignore";
import { makeExtractBabelConf } from "../defaults";
import * as ttagTypes from "../types";
import { TransformFn, pathsWalk } from "./pathsWalk";
import { mergeOpts } from "./ttagPluginOverride";
import { canUseOxc, extractWithOxc } from "./oxcExtract";

type TemplateNode = any;

export async function extractAll(
    paths: string[],
    lang: string,
    progress: ttagTypes.Progress,
    overrideOpts?: ttagTypes.TtagOpts & ttagTypes.CliOpts,
    rcOpts?: ttagTypes.TtagRc
): Promise<string> {
    let ttagOpts: ttagTypes.TtagOpts = {
        extract: {},
        sortByMsgid: overrideOpts && overrideOpts.sortByMsgid,
        addComments: true
    };
    if (lang !== "en") {
        ttagOpts.defaultLang = lang;
    }
    if (overrideOpts) {
        ttagOpts = mergeOpts(ttagOpts, overrideOpts);
    }
    const walkingPaths = getWalkingPaths(paths, rcOpts);
    const sourceFiles = filterIgnoredFiles(walkingPaths, rcOpts);
    if (canUseOxc(sourceFiles, overrideOpts)) {
        const sources = new Map(
            sourceFiles.map(filename => [
                filename,
                fs.readFileSync(filename, "utf8")
            ])
        );
        const result = await extractWithOxc(
            sourceFiles,
            sources,
            lang,
            ttagOpts
        );
        if (result !== null) return result;
    }

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
                    const source = fs.readFileSync(filepath).toString();
                    const script = parseComponent(source).script;
                    if (script) {
                        const lineCount =
                            source.slice(0, script.start).split(/\r\n|\r|\n/)
                                .length - 1;
                        babel.transformSync(
                            "\n".repeat(lineCount) + script.content,
                            {
                                filename: filepath,
                                ...getBabelOptions(filepath)
                            }
                        );
                    }
                    break;
                }
                case ".svelte": {
                    const { walk } = require("estree-walker");
                    const { parse: parseSvelte } = require("svelte/compiler");
                    const source = fs.readFileSync(filepath).toString();
                    const jsCodes: string[] = [];
                    const { html, instance, module } = parseSvelte(source);

                    // <script> tag should include `import { t } from 'ttag'`
                    // We put this in the front.
                    // FIXME: Because we need to put imports first,
                    // the extracted line numbers will be messed up.
                    //
                    if (module) {
                        walk(module, {
                            enter(node: TemplateNode) {
                                if (node.type !== "Program") return;
                                jsCodes.push(
                                    source.slice(node.start, node.end)
                                );
                            }
                        });
                    }
                    walk(instance, {
                        enter(node: TemplateNode) {
                            if (node.type !== "Program") return;
                            jsCodes.push(source.slice(node.start, node.end));
                        }
                    });

                    // Collect t`...` in {...} in template
                    walk(html, {
                        enter(node: TemplateNode) {
                            if (
                                node.type !== "MustacheTag" &&
                                node.type !== "RawMustacheTag"
                            )
                                return;
                            // Attributes can be any valid Javascript expression,
                            // thus wrap in `(...);` and collect them in `jsCodes`
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
                    babel.transformFileSync(
                        filepath,
                        getBabelOptions(filepath)
                    );
            }
        } catch (err) {
            const error = err as any;
            if (error.codeFrame) {
                console.error(error.codeFrame);
            } else {
                console.error(error);
            }
            progress.fail("Failed to extract translations");
            process.exit(1);
            return;
        }
    };
    await pathsWalk(
        walkingPaths,
        progress,
        decorateTransformFn(transformFn, rcOpts)
    );
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
    const result = fs.readFileSync(tmpFile.name).toString();
    tmpFile.removeCallback();
    return result;
}

function filterIgnoredFiles(
    paths: string[],
    rcOpts?: ttagTypes.TtagRc
): string[] {
    const ignoreFiles = rcOpts?.extractor?.ignoreFiles;
    if (!ignoreFiles) return paths;
    const ig = ignore().add(ignoreFiles);
    return paths.filter(filename => !ig.ignores(filename));
}

function getWalkingPaths(
    originPaths: string[],
    rcOpts?: ttagTypes.TtagRc
): string[] {
    return rcOpts?.extractor?.paths || originPaths;
}

function decorateTransformFn(
    originFunc: TransformFn,
    rcOpts?: ttagTypes.TtagRc
): TransformFn {
    const ignoreFiles = rcOpts?.extractor?.ignoreFiles;
    if (ignoreFiles) {
        const ig = ignore().add(ignoreFiles);
        return function(filename: string): void {
            if (ig.ignores(filename) === false) {
                originFunc(filename);
            }
        };
    }
    return originFunc;
}
