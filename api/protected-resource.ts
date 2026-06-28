import type { IncomingMessage, ServerResponse } from "node:http";
import { handleProtectedResource } from "../src/lib/protectedResourceApi";

export default function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") {
    response.statusCode = 405;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const url = new URL(request.url ?? "", `https://${request.headers.host ?? "localhost"}`);
  const result = handleProtectedResource({
    agentId: url.searchParams.get("agentId"),
    resourceId: url.searchParams.get("resourceId"),
    network: url.searchParams.get("network"),
    paymentHeader: readHeader(request.headers["x-payment"]),
  });

  response.statusCode = result.status;
  response.setHeader("Content-Type", "application/json");

  for (const [key, value] of Object.entries(result.headers)) {
    response.setHeader(key, String(value));
  }

  response.end(JSON.stringify(result.body));
}

function readHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}
