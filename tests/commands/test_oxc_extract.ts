import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";
import { execFileSync } from "child_process";
import { parse } from "../../src/lib/parser";

const fixtures = [
    "baseTest/test1.js",
    "baseTest/nested/test2.js",
    "testJSXParse.jsx",
    "tSParse.ts",
    "tSXParse.tsx",
    "ukLocaleTest/index.js",
    "updateTest/comments.jsx",
    "updateTest/context.jsx",
    "oxcCompatibility.js"
].map(file => path.resolve(__dirname, `../fixtures/${file}`));

test("Oxc extraction matches Babel PO data", () => {
    const oxcFile = tmp.fileSync();
    const babelFile = tmp.fileSync();
    const args = ["src/index.ts", "extract", "-l", "uk"];

    execFileSync("ts-node", [...args, "-o", oxcFile.name, ...fixtures]);
    execFileSync("ts-node", [...args, "-o", babelFile.name, ...fixtures], {
        env: { ...process.env, TTAG_EXTRACTOR: "babel" }
    });

    expect(parse(fs.readFileSync(oxcFile.name, "utf8"))).toEqual(
        parse(fs.readFileSync(babelFile.name, "utf8"))
    );
    oxcFile.removeCallback();
    babelFile.removeCallback();
});
