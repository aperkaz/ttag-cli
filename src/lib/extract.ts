import * as fs from "fs";
import ignore from "ignore";
import * as ttagTypes from "../types";
import { mergeOpts } from "./ttagPluginOverride";
import { canUseOxc, extractWithOxc } from "./oxcExtract";
import { compileCatalog } from "./oxcExtract";
import { parse, PoData } from "./parser";

export async function extractAll(
    paths: string[],
    lang: string,
    progress: ttagTypes.Progress,
    overrideOpts?: ttagTypes.TtagOpts & ttagTypes.CliOpts,
    rcOpts?: ttagTypes.TtagRc
): Promise<string> {
    return compileCatalog(
        await extractData(paths, lang, progress, overrideOpts, rcOpts)
    );
}

export async function extractData(
    paths: string[],
    lang: string,
    progress: ttagTypes.Progress,
    overrideOpts?: ttagTypes.TtagOpts & ttagTypes.CliOpts,
    rcOpts?: ttagTypes.TtagRc
): Promise<PoData> {
    let ttagOpts: ttagTypes.TtagOpts = {
        extract: {},
        sortByMsgid: overrideOpts && overrideOpts.sortByMsgid,
        addComments: true
    };
    if (lang !== "en") ttagOpts.defaultLang = lang;
    if (overrideOpts) ttagOpts = mergeOpts(ttagOpts, overrideOpts);

    const sourceFiles = filterIgnoredFiles(
        rcOpts?.extractor?.paths || paths,
        rcOpts
    );
    const sources = new Map<string, string>();
    if (canUseOxc(sourceFiles, overrideOpts)) {
        for (const filename of sourceFiles) {
            sources.set(filename, fs.readFileSync(filename, "utf8"));
        }
        const result = await extractWithOxc(
            sourceFiles,
            sources,
            lang,
            ttagOpts
        );
        if (result !== null) return result;
    }

    const { extractWithBabel } = await import("./babelExtract");
    return parse(
        await extractWithBabel(
            sourceFiles,
            sources,
            ttagOpts,
            progress,
            overrideOpts
        )
    );
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
