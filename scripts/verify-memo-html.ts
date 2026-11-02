import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sanitizeMemo } from "../src/lib/memo-html.ts";

const chromeBin = "/usr/bin/google-chrome-stable";

const payloads: readonly (readonly [string, string])[] = [
  ["img-no-space", '<img src="x"onerror="window.__hit=1">'],
  ["svg-onload", "<svg/onload=window.__hit=2>"],
  ["js-href", '<a href="javascript:window.__hit=3">x</a>'],
  ["js-href-mixed-case", '<a href="JaVaScRiPt:window.__hit=4">x</a>'],
  ["img-space", "<img src=x onerror=window.__hit=5>"],
  ["script", "<script>window.__hit=6</script>"],
  ["entity-js", '<a href="javascript&#58;window.__hit=7">x</a>'],
  ["colon-entity", '<a href="javascript&colon;window.__hit=8">x</a>'],
  ["tab-js", '<a href="jav&#x09;ascript:window.__hit=9">x</a>'],
  ["onclick-anchor", '<a href="https://example.com" onclick="window.__hit=10">x</a>'],
  [
    "math-img",
    "<math><mtext><table><mglyph><style><!--</style><img src=1 onerror=window.__hit=11>",
  ],
  ["noscript-img", "<noscript><img src=x onerror=window.__hit=12></noscript>"],
  ["breakout-href", '<a href="/\\"><img src=x onerror=window.__hit=13>">x</a>'],
  ["null-script", "<scr\u0000ipt>window.__hit=14</script>"],
  ["iframe", '<iframe src="javascript:window.__hit=15"></iframe>'],
  ["safe-link", '<p>ok <a href="https://example.com/changelog">link</a></p>'],
];

type Probe = {
  readonly name: string;
  readonly nextFails: boolean;
  readonly alerts: readonly string[];
  readonly bad: readonly string[];
  readonly dom: string;
};

const fail = (message: string): never => {
  throw new Error(message);
};

const pageFor = (rows: readonly { readonly name: string; readonly html: string }[]): string => {
  const payload = JSON.stringify(rows).replaceAll("<", "\\u003c");
  return `<!doctype html>
<meta charset="utf-8">
<pre id="out"></pre>
<script>
const rows = ${payload};
function probe(html) {
  const frame = document.createElement("iframe");
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const view = frame.contentWindow;
  const host = doc.createElement("div");
  doc.body.appendChild(host);
  view.__hit = 0;
  host.innerHTML = html;
  const link = host.querySelector("a");
  if (link) link.click();
  const alerts = view.__hit ? [String(view.__hit)] : [];
  const bad = [];
  for (const el of host.querySelectorAll("*")) {
    if (el.tagName === "SCRIPT") bad.push("script");
    for (const attr of el.attributes) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      if (name.startsWith("on")) bad.push(el.tagName + " " + name);
      if ((name === "href" || name === "src") && /javascript:/i.test(value)) {
        bad.push(el.tagName + " " + name);
      }
    }
  }
  const dom = host.innerHTML;
  frame.remove();
  return { alerts, bad, dom };
}
const report = rows.map((row) => {
  const result = probe(row.html);
  return {
    name: row.name,
    nextFails: result.alerts.length > 0 || result.bad.length > 0,
    alerts: result.alerts,
    bad: result.bad,
    dom: result.dom,
  };
});
document.getElementById("out").textContent = JSON.stringify(report);
</script>
`;
};

const listen = async (
  html: string,
): Promise<{ readonly url: string; readonly close: () => Promise<void> }> => {
  const server = createServer((request, response) => {
    if (request.url !== "/memo-sanitizer.html") {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("sanitizer page did not bind");
  }
  return {
    url: `http://127.0.0.1:${address.port}/memo-sanitizer.html`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
};

type CdpResult = {
  readonly id?: number;
  readonly result?: { readonly result?: { readonly value?: string } };
};

const devtoolsPort = (chrome: ReturnType<typeof spawn>): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      reject(new Error(`Chrome did not open a devtools port: ${Buffer.concat(chunks).toString()}`));
    }, 8000);
    chrome.stderr?.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(
        Buffer.concat(chunks).toString(),
      );
      if (match?.[1] !== undefined) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    chrome.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited ${code}: ${Buffer.concat(chunks).toString()}`));
    });
  });

const pageSocketFor = async (port: string): Promise<string> => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const list = await fetch(`http://127.0.0.1:${port}/json/list`)
      .then((response) => response.json())
      .catch(() => null);
    if (Array.isArray(list)) {
      const socket = (
        list as readonly { readonly url?: string; readonly webSocketDebuggerUrl?: string }[]
      ).find((item) => item.url?.includes("memo-sanitizer.html") && item.webSocketDebuggerUrl)
        ?.webSocketDebuggerUrl;
      if (socket !== undefined) {
        return socket;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return fail("Chrome did not open the sanitizer page");
};

const evaluateReport = (socketUrl: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(socketUrl);
    const pending = new Map<number, (message: CdpResult) => void>();
    let id = 0;
    const timer = setTimeout(() => reject(new Error("Chrome page socket timed out")), 8000);
    const finish = (error?: unknown, text?: string) => {
      clearTimeout(timer);
      socket.close();
      if (error) reject(error);
      else resolve(text ?? "");
    };
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpResult;
      if (message.id !== undefined) {
        pending.get(message.id)?.(message);
      }
    });
    socket.addEventListener("error", () => finish(new Error("Chrome page socket failed")));
    socket.addEventListener("open", () => {
      const send = (method: string, params: unknown) =>
        new Promise<CdpResult>((done, failSend) => {
          const next = ++id;
          const callTimer = setTimeout(() => failSend(new Error(`${method} timed out`)), 4000);
          pending.set(next, (message) => {
            clearTimeout(callTimer);
            done(message);
          });
          socket.send(JSON.stringify({ id: next, method, params }));
        });
      void (async () => {
        let found = "";
        for (let attempt = 0; attempt < 10 && found.length === 0; attempt += 1) {
          const evaluated = await send("Runtime.evaluate", {
            expression:
              "document.getElementById('out') ? document.getElementById('out').textContent : ''",
            returnByValue: true,
          });
          found = evaluated.result?.result?.value ?? "";
          if (found.length === 0) {
            await new Promise((wait) => setTimeout(wait, 200));
          }
        }
        if (found.length === 0) finish(new Error("Chrome report was empty"));
        else finish(undefined, found);
      })().catch((error: unknown) => finish(error));
    });
  });

const readReport = async (url: string): Promise<string> => {
  const profile = mkdtempSync(join(tmpdir(), "memo-html-chrome-"));
  const chrome = spawn(
    chromeBin,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
      url,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  try {
    const port = await devtoolsPort(chrome);
    const socket = await pageSocketFor(port);
    return await evaluateReport(socket);
  } finally {
    chrome.kill("SIGKILL");
  }
};

const main = async (): Promise<void> => {
  const rows = payloads.map(([name, input]) => ({ name, html: sanitizeMemo(input) }));
  const page = await listen(pageFor(rows));
  let report: readonly Probe[];
  try {
    const text = await readReport(page.url);
    report = JSON.parse(text) as readonly Probe[];
  } finally {
    await page.close();
  }

  const names = new Set(report.map((row) => row.name));
  for (const [name] of payloads) {
    if (!names.has(name)) {
      fail(`missing corpus row ${name}`);
    }
  }

  const nextFails = report.filter((row) => row.nextFails);
  const hostile = report.filter(
    (row) =>
      row.bad.some((item) => item === "script" || item.toLowerCase().includes(" on")) ||
      /<script[\s>]/iu.test(row.dom) ||
      /\son[a-z0-9]+\s*=/iu.test(row.dom) ||
      /javascript:/iu.test(row.dom),
  );
  const safe = report.find((row) => row.name === "safe-link");
  if (safe === undefined || !safe.dom.includes('href="https://example.com/changelog"')) {
    fail("safe link did not keep its https href");
  }
  if (nextFails.length > 0 || hostile.length > 0) {
    console.error(JSON.stringify({ nextFails, hostile }));
    fail(`nextFails ${nextFails.length}`);
  }
  console.log(`nextFails ${nextFails.length}`);
};

await main();
