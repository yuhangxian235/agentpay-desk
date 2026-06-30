import react from "@vitejs/plugin-react";
import type { IncomingMessage } from "node:http";
import { defineConfig, type Plugin } from "vite";
import { handleMerchantOps } from "./src/lib/merchantOpsApi";
import { handleProtectedResource } from "./src/lib/protectedResourceApi";

function merchantOpsApi(): Plugin {
  return {
    name: "agentpay-merchant-ops-api",
    configureServer(server) {
      server.middlewares.use("/api/merchant-ops", (request, response) => {
        void (async () => {
          const url = new URL(request.url ?? "", "http://localhost/api/merchant-ops");
          const result = handleMerchantOps({
            body: request.method === "POST" ? await readJsonBody(request) : undefined,
            method: request.method ?? "GET",
            searchParams: url.searchParams,
          });

          response.statusCode = result.status;

          for (const [key, value] of Object.entries(result.headers)) {
            response.setHeader(key, value);
          }

          response.end(
            typeof result.body === "string" ? result.body : JSON.stringify(result.body),
          );
        })();
      });
    },
  };
}

function protectedResourceApi(): Plugin {
  return {
    name: "agentpay-protected-resource-api",
    configureServer(server) {
      server.middlewares.use("/api/protected-resource", (request, response) => {
        if (request.method !== "GET") {
          response.statusCode = 405;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const url = new URL(request.url ?? "", "http://localhost/api/protected-resource");
        const result = handleProtectedResource({
          agentId: url.searchParams.get("agentId"),
          apiKeyHeader: readHeader(request.headers["x-api-key"]),
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
      });
    },
  };
}

function readHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
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

export default defineConfig({
  plugins: [merchantOpsApi(), protectedResourceApi(), react()],
});
