import openBrowser from "../lib/browser";
import * as fs from "fs";
import { createServer, IncomingMessage, ServerResponse } from "http";

const editor = `
<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
<meta name="theme-color" content="#000000">
<link rel="manifest" href="https://unpkg.com/c-3po-editor/public/manifest.json">
<link rel="shortcut icon" href="https://unpkg.com/c-3po-editor/public/favicon.ico">
<title>C-3po editor</title></head><body>
<noscript>You need to enable JavaScript to run this app.</noscript><div id="root"></div>
<script>window.C3POEDITOR={source:'local',load:fetch('/open').then(r=>r.text()),save(content){fetch('/save',{method:'POST',headers:{'Content-Type':'text/plain'},body:content})}}</script>
<script src="https://unpkg.com/c-3po-editor"></script></body></html>`;

export default function translate(filePath: string) {
    const server = createServer(async (req, res) => {
        try {
            const pathname = new URL(req.url || "/", "http://localhost")
                .pathname;
            if (req.method === "GET" && pathname === "/") {
                return send(res, 200, editor, "text/html; charset=utf-8");
            }
            if (req.method === "GET" && pathname === "/open") {
                return send(res, 200, fs.readFileSync(filePath, "utf8"));
            }
            if (req.method === "GET" && pathname === "/bundle.js") {
                return send(
                    res,
                    200,
                    fs.readFileSync("bundle.js"),
                    "text/javascript"
                );
            }
            if (req.method === "POST" && pathname === "/save") {
                fs.writeFileSync(filePath, await readBody(req));
                return send(res, 200, "ok");
            }
            send(res, 404, "Not found");
        } catch (error) {
            send(res, 500, String(error));
        }
    });
    server.listen(3000, "127.0.0.1");
    openBrowser("http://127.0.0.1:3000/");
}

function send(
    res: ServerResponse,
    status: number,
    body: string | Buffer,
    contentType: string = "text/plain; charset=utf-8"
): void {
    res.writeHead(status, { "Content-Type": contentType });
    res.end(body);
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = Buffer.from(chunk);
        size += buffer.length;
        if (size > 10 * 1024 * 1024) throw new Error("Request body too large");
        chunks.push(buffer);
    }
    return Buffer.concat(chunks);
}
