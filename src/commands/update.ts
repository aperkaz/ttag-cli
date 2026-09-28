import progress from "../lib/progress";
import * as ttagTypes from "../types";
import * as fs from "fs";
import { extractData } from "../lib/extract";
import { updatePo } from "../lib/update";
import { parse } from "../lib/parser";
import { serialize, SerializeOptions } from "../lib/serializer";
import { checkDuplicateKeys } from "../lib/checkDuplicateKeys";
import { resolvePaths } from "../lib/paths";

async function update(
    pofile: string,
    src: string[],
    ignore: string[] | string | undefined,
    lang: string,
    ttagOverrideOpts?: ttagTypes.TtagOpts,
    ttagRcOpts?: ttagTypes.TtagRc,
    serializeOpts?: SerializeOptions
) {
    const paths = resolvePaths(src, ignore);

    const progressState: ttagTypes.Progress = progress(
        `[ttag] updating ${pofile} ...`
    );
    progressState.start();
    try {
        const pot = await extractData(
            paths,
            lang,
            progressState,
            ttagOverrideOpts,
            ttagRcOpts
        );
        const errMessage = checkDuplicateKeys(pot);

        if (errMessage) {
            progressState.fail(errMessage);
            process.exit(1);
        }
        const po = parse(fs.readFileSync(pofile).toString());
        const resultPo = updatePo(pot, po);
        fs.writeFileSync(pofile, serialize(resultPo, serializeOpts));
        progressState.succeed(`${pofile} updated`);
    } catch (err) {
        progressState.fail(`Failed to update. ${err.message}. ${err.stack}`);
        process.exit(1);
    }
}

export default update;
