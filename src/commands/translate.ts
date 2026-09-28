import * as fs from "fs";
import { createInterface } from "readline/promises";
import { stdin, stdout } from "process";
import { yellow } from "../lib/style";
import { parse, Translations, PoData } from "../lib/parser";
import { serialize } from "../lib/serializer";
import {
    printComments,
    printContext,
    printMsgid,
    printMsgidPlural
} from "../lib/print";

/* Generate untranslated messages along with context */
export function* untranslatedStream(translations: Translations): any {
    for (const contextKey of Object.keys(translations)) {
        const context = translations[contextKey];
        for (const msgid of Object.keys(context)) {
            const msg = context[msgid];
            msg.msgstr = yield [contextKey, msg];
        }
    }
}

/* Read file and parse it shorthand */
export function read(path: string): PoData {
    return parse(fs.readFileSync(path).toString());
}

/* Stream translations for each form if many(plural) */
async function translationStream(msgstr: string[]): Promise<string[]> {
    const readline = createInterface({ input: stdin, output: stdout });
    const translations: string[] = [];
    try {
        if (msgstr.length > 1) {
            for (let i = 0; i < msgstr.length; i++) {
                translations.push(
                    await readline.question(yellow(`msgstr[${i}]: `))
                );
            }
        } else {
            translations.push(await readline.question(yellow(`msgstr: `)));
        }
    } finally {
        readline.close();
    }
    return translations;
}

export default async function translate(path: string, output: string) {
    const poData = read(path);
    const stream = untranslatedStream(poData.translations);
    // skip first message(empty msgid in header)
    stream.next();
    var { value, done } = stream.next("");
    while (!done) {
        let [ctxt, msg] = value;
        printComments(msg.comments);
        printContext(ctxt);
        printMsgid(msg.msgid);
        printMsgidPlural(msg.msgid_plural);
        const translation = await translationStream(msg.msgstr);
        const data = stream.next(translation);
        [value, done] = [data.value, data.done];
        console.log();
    }
    fs.writeFileSync(output, serialize(poData));
    console.log(`Translations written to ${output}`);
}
