import { globSync } from "glob";
import * as fs from "fs";
const isGlob = require("is-glob");

export function resolvePaths(
    src: string[],
    ignore?: string | string[]
): string[] {
    const toGlob = (filePath: string): string => {
        if (fs.lstatSync(filePath).isDirectory()) {
            return `${filePath.endsWith("/") ? filePath : `${filePath}/`}**/*`;
        }
        return filePath;
    };

    const srcGlob = src.map(filePath =>
        isGlob(filePath) ? filePath : toGlob(filePath)
    );
    const ignores = typeof ignore === "string" ? [ignore] : ignore;
    const ignoreGlob = ignores?.map(filePath =>
        isGlob(filePath) ? filePath : toGlob(filePath)
    );

    return globSync(srcGlob, {
        absolute: true,
        nodir: true,
        ignore: ignoreGlob
    });
}
