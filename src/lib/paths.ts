import { globSync, lstatSync } from "fs";
import { resolve } from "path";

export function resolvePaths(
    src: string[],
    ignore?: string | string[]
): string[] {
    const toGlob = (filePath: string): string => {
        if (lstatSync(filePath).isDirectory()) {
            return `${filePath.endsWith("/") ? filePath : `${filePath}/`}**/*`;
        }
        return filePath;
    };

    const srcGlob = src.map(filePath =>
        hasGlobMagic(filePath) ? filePath : toGlob(filePath)
    );
    const ignores = typeof ignore === "string" ? [ignore] : ignore;
    const ignoreGlob = ignores?.map(filePath =>
        hasGlobMagic(filePath) ? filePath : toGlob(filePath)
    );

    const excluded = new Set(
        (ignoreGlob || []).flatMap(pattern =>
            globSync(pattern).map(filePath => resolve(filePath))
        )
    );
    return Array.from(
        new Set(
            srcGlob.flatMap(pattern =>
                globSync(pattern).map(filePath => resolve(filePath))
            )
        )
    )
        .filter(
            filePath =>
                !excluded.has(filePath) && !lstatSync(filePath).isDirectory()
        )
        .sort((a, b) => {
            const depth = a.split(/[\\/]/).length - b.split(/[\\/]/).length;
            return depth || a.localeCompare(b);
        });
}

function hasGlobMagic(filePath: string): boolean {
    return /[*?\[\]{}()!+@]/.test(filePath);
}
