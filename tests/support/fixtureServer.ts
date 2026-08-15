import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";

export function startFixtureServer(): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server: Server = createServer((req, res) => {
      const name = (req.url ?? "/").replace(/^\//, "") || "healthy.html";
      try {
        const body = readFileSync(`tests/fixtures/pages/${name}`, "utf8");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(body);
      } catch {
        res.writeHead(404).end("not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}
