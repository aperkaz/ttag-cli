import * as fs from "fs";
import { parse } from "../lib/parser";
import progress from "../lib/progress";
import * as c3poTypes from "../types";
import { errorHighlight, setColorEnabled } from "../lib/style";
import { iterateTranslations } from "../lib/utils";
import { getChecker, Checker } from "../lib/spell";
import { printMsg } from "../lib/print";

const cleanRe = new RegExp(/[;:,.?"'!\(\)«»]/g);

export default function spell(path: string, locale?: string) {
    setColorEnabled(true);
    const data = fs.readFileSync(path).toString();
    const poData = parse(data);
    locale = locale || poData.headers.language || poData.headers.Language;
    if (!locale) {
        console.log("Cannot detect locale from pofile, please provide it");
        return;
    }
    const loadProgress: c3poTypes.Progress = progress(
        `Loading dict for ${locale}...`
    );
    loadProgress.start();
    getChecker(locale).then(function(checker: Checker) {
        loadProgress.succeed(`${locale} dict loaded`);
        const checkProgress: c3poTypes.Progress = progress(
            `Checking pofile ${path}...\n\n`
        );
        checkProgress.start();
        const messages = iterateTranslations(poData.translations);
        messages.next(); // skip headers
        for (const msg of messages) {
            let hasErrors = false;
            for (let i = 0; i < msg.msgstr.length; i++) {
                for (const word of msg.msgstr[i].split(" ")) {
                    const cleanWord = word.replace(cleanRe, "");
                    if (cleanWord && !checker.check(cleanWord)) {
                        msg.msgstr[i] = msg.msgstr[i].replace(
                            cleanWord,
                            errorHighlight(cleanWord)
                        );
                        hasErrors = true;
                    }
                }
            }
            if (hasErrors) {
                printMsg(msg);
                console.log("\n");
            }
        }
        checkProgress.succeed(`${path} checked`);
    });
}
