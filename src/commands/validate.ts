import * as fs from "fs";
import { parse } from "../lib/parser";
import { errorHighlight, green, setColorEnabled } from "../lib/style";
import { printMsg } from "../lib/print";
import { iterateTranslations } from "../lib/utils";
import { checkFormat } from "../lib/validation";

export default function validate(path: string) {
    setColorEnabled(true);
    let hasErrors = false;
    const data = fs.readFileSync(path).toString();
    const poData = parse(data);
    const messages = iterateTranslations(poData.translations);
    messages.next(); // skip headers
    for (const msg of messages) {
        let invalid = false;
        for (let i = 0; i < msg.msgstr.length; i++) {
            if (!msg.msgstr[i]) {
                continue;
            }
            const result = checkFormat(msg.msgid, msg.msgstr[0]);
            if (!result.valid) {
                invalid = true;
                msg.msgstr[i] = errorHighlight(msg.msgstr[i]);
                const missing = result.missing.length
                    ? `missing ${result.missing.join(" and ")}`
                    : "";
                const redundant = result.redundant.length
                    ? `redundant ${result.redundant.join(" and ")}`
                    : "";
                const explanation = green(
                    [missing, redundant].filter(s => !!s).join(" but ")
                );
                msg.msgstr[i] += ` <--- ${explanation};`;
            }
            if (invalid) {
                hasErrors = true;
                printMsg(msg);
                console.log("\n");
            }
        }
    }
    if (hasErrors) {
        throw new Error("Errors during validation");
    }
}
