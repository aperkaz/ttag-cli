import { Progress } from "../types";

export default function progress(initial: string = ""): Progress {
    return {
        text: initial,
        start(text?: string) {
            if (text) this.text = text;
        },
        succeed(text?: string) {
            console.error(`✔ ${text || this.text}`);
        },
        warn(text?: string) {
            console.warn(`⚠ ${text || this.text}`);
        },
        fail(text?: string) {
            console.error(`✖ ${text || this.text}`);
        }
    };
}
