import { execFileSync } from "node:child_process";

const root = process.env.AGENTPAY_SMOKE_URL ?? "https://agentpay-desk.vercel.app";

const apiPath = "/api/protected-resource?agentId=quanta-scout&resourceId=rwa-yield&network=base-sepolia";
const apiKey = "ak_live_7Qm9_demo";

async function main() {
  const home = await fetchWithRetry(root);
  assert(home.ok, `Expected homepage 2xx, received ${home.status}`);

  const html = await home.text();
  const scriptPath = html.match(/\/assets\/index-[^"']+\.js/)?.[0];
  assert(scriptPath, "Could not find built JS asset in homepage HTML");

  const script = await fetchText(new URL(scriptPath, root));
  assert(script.includes("AgentPay Desk"), "Bundle missing AgentPay Desk copy");
  assert(script.includes("API keys & webhooks"), "Bundle missing Merchant ops copy");
  assert(script.includes("audit-list"), "Bundle missing merchant audit trail");
  assert(script.includes("export-ledger"), "Bundle missing CSV export test id");
  assert(script.includes("storage-adapter"), "Bundle missing storage adapter status");

  const merchantOps = await fetchWithRetry(new URL("/api/merchant-ops", root), {
    headers: { Accept: "application/json" },
  });
  assert(merchantOps.status === 200, `Expected merchant ops 200, received ${merchantOps.status}`);

  const merchantOpsBody = await merchantOps.json();
  assert(Array.isArray(merchantOpsBody.ledger), "Merchant ops state missing ledger");
  assert(Array.isArray(merchantOpsBody.apiKeys), "Merchant ops state missing API keys");
  assert(Array.isArray(merchantOpsBody.auditEvents), "Merchant ops state missing audit events");
  assert(
    merchantOpsBody.storage?.driver === "memory" || merchantOpsBody.storage?.driver === "file",
    "Merchant ops state missing storage driver",
  );

  const ledgerCsv = await fetchWithRetry(new URL("/api/merchant-ops?format=csv", root), {
    headers: { Accept: "text/csv" },
  });
  assert(ledgerCsv.status === 200, `Expected ledger CSV 200, received ${ledgerCsv.status}`);
  assert(
    ledgerCsv.headers.get("content-type")?.includes("text/csv"),
    "Ledger CSV missing text/csv content type",
  );
  assert((await ledgerCsv.text()).includes("payment_id,created_at,status"), "Ledger CSV missing headers");

  const unauthenticated = await fetchWithRetry(new URL(apiPath, root), {
    headers: { Accept: "application/json" },
  });
  assert(
    unauthenticated.status === 401,
    `Expected missing API key 401, received ${unauthenticated.status}`,
  );

  const challenge = await fetchWithRetry(new URL(apiPath, root), {
    headers: { Accept: "application/json", "X-API-Key": apiKey },
  });
  assert(challenge.status === 402, `Expected API challenge 402, received ${challenge.status}`);
  assert(challenge.headers.get("x-402-version") === "1", "Missing X-402-Version header");

  const challengeBody = await challenge.json();
  assert(challengeBody.error === "X-PAYMENT header is required", "Unexpected 402 challenge body");
  assert(Array.isArray(challengeBody.accepts), "Challenge body missing accepts array");

  const paymentHeader = Buffer.from(
    JSON.stringify({
      payload: {
        from: "0x71c4...F219",
        to: "0x9f3A...71D4",
        value: "240000",
        network: "base-sepolia",
        asset: "USDC",
      },
      signature: "0xsmoke_test",
    }),
  ).toString("base64");

  const paid = await fetchWithRetry(new URL(apiPath, root), {
    headers: {
      Accept: "application/json",
      "X-API-Key": apiKey,
      "X-PAYMENT": paymentHeader,
    },
  });
  assert(paid.status === 200, `Expected paid API 200, received ${paid.status}`);

  const settlementRef = paid.headers.get("x-payment-response");
  assert(/^api_[0-9a-f]+$/.test(settlementRef ?? ""), "Missing X-PAYMENT-RESPONSE settlement ref");
  const facilitatorReceipt = paid.headers.get("x-facilitator-receipt");
  assert(
    /^fac_[0-9a-f]+$/.test(facilitatorReceipt ?? ""),
    "Missing X-FACILITATOR-RECEIPT receipt",
  );

  const paidBody = await paid.json();
  assert(paidBody.data?.market === "tokenized_treasuries", "Unexpected paid payload market");
  assert(paidBody.payment?.validated === true, "Paid response missing validated payment");
  assert(paidBody.facilitator?.status === "settled", "Paid response missing facilitator settlement");

  console.log(
    JSON.stringify(
      {
        api: "ok",
        facilitatorReceipt,
        homepage: "ok",
        merchantOps: "ok",
        settlementRef,
        url: root,
      },
      null,
      2,
    ),
  );
}

async function fetchText(url) {
  const response = await fetchWithRetry(url);
  assert(response.ok, `Expected ${url} 2xx, received ${response.status}`);
  return response.text();
}

async function fetchWithRetry(url, options = {}) {
  if (process.platform === "win32" && !process.env.CI) {
    return fetchWithPowerShell(url, options);
  }

  const attempts = Number(process.env.AGENTPAY_SMOKE_ATTEMPTS ?? 3);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        await sleep(1_000 * attempt);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

function fetchWithPowerShell(url, options = {}) {
  const headers = options.headers ?? {};
  const method = options.method ?? "GET";
  const headerLines = Object.entries(headers)
    .map(
      ([key, value]) =>
        `$request.Headers.TryAddWithoutValidation('${psEscape(key)}', '${psEscape(String(value))}') | Out-Null`,
    )
    .join("\n");
  const script = `
Add-Type -AssemblyName System.Net.Http
$client = [System.Net.Http.HttpClient]::new()
$request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new('${psEscape(method)}'), '${psEscape(String(url))}')
${headerLines}
$response = $client.SendAsync($request).GetAwaiter().GetResult()
$body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
$headers = @{}
foreach ($header in $response.Headers.GetEnumerator()) { $headers[$header.Key.ToLowerInvariant()] = [string]::Join(',', $header.Value) }
foreach ($header in $response.Content.Headers.GetEnumerator()) { $headers[$header.Key.ToLowerInvariant()] = [string]::Join(',', $header.Value) }
[pscustomobject]@{
  status = [int]$response.StatusCode
  headers = $headers
  body = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($body))
} | ConvertTo-Json -Depth 4 -Compress
`;
  const raw = execFileSync("powershell", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
  });
  const result = JSON.parse(raw);
  const body = Buffer.from(result.body, "base64").toString("utf8");

  return {
    ok: result.status >= 200 && result.status < 300,
    status: result.status,
    headers: {
      get(name) {
        return result.headers?.[name.toLowerCase()] ?? null;
      },
    },
    async json() {
      return JSON.parse(body);
    },
    async text() {
      return body;
    },
  };
}

function psEscape(value) {
  return value.replaceAll("'", "''");
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
