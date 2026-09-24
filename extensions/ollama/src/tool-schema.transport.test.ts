// Real-transport regression proof for the free-form object tool-schema fix (#157039).
// Drives createOllamaStreamFn through a real loopback /api/chat NDJSON server: real
// HTTP, real SSRF-guarded fetch, real request-body serialization, real NDJSON
// parsing. Nothing is mocked; only the network endpoint is local. This proves both
// halves of the bug: the outgoing schema for a free-form object tool no longer gains
// an empty `properties`, and a populated tool_calls response from the server round
// trips into populated `toolCall.arguments` on the parsed assistant message.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createOllamaStreamFn } from "./stream-api.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

type CapturedRequest = { tools?: Array<{ function?: { parameters?: unknown } }> };

async function startToolCallChatServer(
  toolCallArguments: Record<string, unknown>,
): Promise<{ baseUrl: string; capturedRequest: Promise<CapturedRequest> }> {
  let resolveCaptured: (value: CapturedRequest) => void;
  const capturedRequest = new Promise<CapturedRequest>((resolve) => {
    resolveCaptured = resolve;
  });
  const server = createServer((req, res) => {
    if (!req.url?.endsWith("/api/chat")) {
      res.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      resolveCaptured(JSON.parse(Buffer.concat(chunks).toString("utf8")) as CapturedRequest);
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      res.end(
        `${JSON.stringify({
          model: "proof-model",
          created_at: "2026-01-01T00:00:00Z",
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              { id: "call_1", function: { name: "exec", arguments: toolCallArguments } },
            ],
          },
          done: true,
          done_reason: "stop",
          prompt_eval_count: 1,
          eval_count: 1,
        })}\n`,
      );
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, capturedRequest };
}

const freeFormExecTool = {
  name: "exec",
  description: "Run a shell command",
  parameters: { type: "object", additionalProperties: true },
};

describe("free-form object tool schema over the real Ollama NDJSON transport (#157039)", () => {
  it("sends the free-form schema unmodified and returns populated tool call arguments", async () => {
    const toolCallArguments = { command: "uname -r" };
    const { baseUrl, capturedRequest } = await startToolCallChatServer(toolCallArguments);
    const streamFn = createOllamaStreamFn(baseUrl);
    const stream = streamFn(
      {
        api: "ollama",
        provider: "ollama",
        id: "proof-model",
        input: ["text"],
        contextWindow: 65536,
      } as never,
      {
        messages: [{ role: "user", content: "what kernel is this?" }],
        tools: [freeFormExecTool],
      } as never,
      {},
    );

    let toolCall: { name?: unknown; arguments?: unknown } | undefined;
    for await (const event of stream as AsyncIterable<Record<string, unknown>>) {
      if (event.type === "done") {
        const message = event.message as { content?: unknown[] } | undefined;
        toolCall = message?.content?.find(
          (block): block is { type: string; name?: unknown; arguments?: unknown } =>
            (block as { type?: unknown }).type === "toolCall",
        );
      }
    }

    // The request we actually sent over the wire never gained an empty `properties`.
    const request = await capturedRequest;
    expect(request.tools?.[0]?.function?.parameters).toEqual({
      type: "object",
      additionalProperties: true,
    });

    // The server's populated tool_calls response round trips into populated arguments,
    // not the {} the pre-fix schema produced from a real Ollama server.
    expect(toolCall?.name).toBe("exec");
    expect(toolCall?.arguments).toEqual(toolCallArguments);
  });
});
