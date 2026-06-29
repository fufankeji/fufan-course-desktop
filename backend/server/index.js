import http from "node:http";

import { createApp } from "./app.js";

const port = Number(process.env.PORT || 5178);
const host = process.env.HOST || "127.0.0.1";
const app = await createApp({ webRoot: "../frontend" });

const server = http.createServer(async (incoming, outgoing) => {
  const request = new Request(`http://${incoming.headers.host}${incoming.url}`, {
    method: incoming.method,
    headers: incoming.headers,
    body: incoming.method === "GET" || incoming.method === "HEAD" ? undefined : incoming,
    duplex: "half",
  });

  const response = await app.handleRequest(request);
  outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));

  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      outgoing.write(value);
    }
  }

  outgoing.end();
});

server.listen(port, host, () => {
  console.log(`Course LLM Wiki demo running at http://${host}:${port}`);
});
