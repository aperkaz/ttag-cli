import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export function tempFile() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ttag-"));
    const name = path.join(dir, "file");
    fs.writeFileSync(name, "");
    return { name, removeCallback: () => fs.rmSync(dir, { recursive: true }) };
}

export function tempDir() {
    const name = fs.mkdtempSync(path.join(os.tmpdir(), "ttag-"));
    return { name, removeCallback: () => fs.rmSync(name, { recursive: true }) };
}
