import * as path from "path";
import * as c3poTypes from "../types";
import * as fs from "fs";

export type TransformFn = (filepath: string) => void;

function walkFile(
    filepath: string,
    progress: c3poTypes.Progress,
    transformFn: TransformFn
) {
    const extname = path.extname(filepath);
    if (
        extname === ".js" ||
        extname === ".jsx" ||
        extname === ".ts" ||
        extname === ".tsx" ||
        extname === ".mjs" ||
        extname === ".cjs" ||
        extname === ".vue" ||
        extname === ".svelte"
    ) {
        progress.text = filepath;
        transformFn(filepath);
    }
}

function walkDir(
    dirpath: string,
    progress: c3poTypes.Progress,
    transformFn: TransformFn
) {
    for (const entry of fs.readdirSync(dirpath, {
        recursive: true,
        withFileTypes: true
    })) {
        if (entry.isFile()) {
            walkFile(
                path.join(entry.parentPath, entry.name),
                progress,
                transformFn
            );
        }
    }
}

export async function pathsWalk(
    paths: string[],
    progress: c3poTypes.Progress,
    transformFn: TransformFn
) {
    for (const filePath of paths) {
        if (fs.lstatSync(filePath).isDirectory()) {
            walkDir(filePath, progress, transformFn);
        } else {
            walkFile(filePath, progress, transformFn);
        }
    }
}
