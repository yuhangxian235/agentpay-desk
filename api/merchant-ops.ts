import type { IncomingMessage, ServerResponse } from "node:http";
import { handleMerchantOps } from "../src/lib/merchantOpsApi.js";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "", `https://${request.headers.host ?? "localhost"}`);
  const result = handleMerchantOps({
    body: request.method === "POST" ? await readJsonBody(request) : undefined,
    method: request.method ?? "GET",
    searchParams: url.searchParams,
  });

  response.statusCode = result.status;

  for (const [key, value] of Object.entries(result.headers)) {
    response.setHeader(key, value);
  }

  response.end(typeof result.body === "string" ? result.body : JSON.stringify(result.body));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const raw = await readTextBody(request);

  if (!raw.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function readTextBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on("error", reject);
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}
