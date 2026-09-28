import * as fs from "fs";
import { parse } from "../lib/parser";
import { iterateTranslations } from "../lib/utils";
import { printHeader, printMsg } from "../lib/print";
import { setColorEnabled } from "../lib/style";

export default function color(path: string) {
    setColorEnabled(true);
    const data = fs.readFileSync(path).toString();
    const poData = parse(data);
    printMsg({ msgid: "", msgstr: [""] });
    printHeader(poData.headers);
    process.stdout.write("\n");
    const messages = iterateTranslations(poData.translations);
    messages.next(); // skip empty translation
    for (const msg of messages) {
        printMsg(msg);
        process.stdout.write("\n");
    }
}
