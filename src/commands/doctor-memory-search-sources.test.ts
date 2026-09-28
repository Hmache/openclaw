import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";

const resolveDefaultAgentId = vi.hoisted(() => vi.fn(() => "agent-default"));
const listAgentIds = vi.hoisted(() => vi.fn(() => ["agent-default"]));
const resolveAgentDir = vi.hoisted(() => vi.fn(() => "/tmp/agent-default"));
const resolveAgentWorkspaceDir = vi.hoisted(() => vi.fn(() => "/tmp/agent-default/workspace"));
const resolveMemorySearchConfig = vi.hoisted(() => vi.fn());
const resolveActiveMemoryBackendConfig = vi.hoisted(() => vi.fn(() => ({ backend: "builtin" })));
const getActiveMemorySearchManagerCore = vi.hoisted(() => vi.fn());
const noteWorkspaceMemoryHealth = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("../agents/agent-scope.js", () => ({
  listAgentIds,
  tryResolveDefaultAgentId: resolveDefaultAgentId,
  resolveAgentDir,
  resolveAgentWorkspaceDir,
}));

vi.mock("../agents/memory-search.js", () => ({
  resolveMemorySearchConfig,
}));

vi.mock("../plugins/memory-runtime.js", () => ({
  getActiveMemorySearchManagerCore,
  resolveActiveMemoryBackendConfig,
}));

vi.mock("./doctor-workspace.js", () => ({
  noteWorkspaceMemoryHealth,
}));

import { collectMemorySearchHealthFindings } from "./doctor-memory-search.js";

describe("memory search doctor: ignored sessions source", () => {
  const cfg = {} as OpenClawConfig;

  beforeEach(() => {
    resolveDefaultAgentId.mockClear();
    listAgentIds.mockClear();
    resolveAgentDir.mockClear();
    resolveAgentWorkspaceDir.mockClear();
    resolveMemorySearchConfig.mockReset();
    resolveActiveMemoryBackendConfig.mockClear();
    getActiveMemorySearchManagerCore.mockReset();
    noteWorkspaceMemoryHealth.mockClear();
  });

  async function collectFindings() {
    return collectMemorySearchHealthFindings({
      mode: "lint",
      cfg,
      env: { OPENCLAW_STATE_DIR: "/isolated-memory-state" },
      runtime: { log: vi.fn(), error: vi.fn(), exit: vi.fn() },
    });
  }

  it("reports a warning when sessions are configured but silently dropped", async () => {
    resolveMemorySearchConfig.mockReturnValue({
      provider: "none",
      local: {},
      remote: {},
      experimental: { sessionsSourceIgnored: true },
    });

    expect(await collectFindings()).toEqual([
      expect.objectContaining({
        checkId: "core/doctor/memory-search",
        severity: "warning",
        path: "memory.search.sources",
        fixHint: expect.stringContaining("Verify:"),
      }),
    ]);
  });

  it("stays silent when sessions were never explicitly configured", async () => {
    resolveMemorySearchConfig.mockReturnValue({
      provider: "none",
      local: {},
      remote: {},
      experimental: { sessionsSourceIgnored: false },
    });

    expect(await collectFindings()).toEqual([]);
  });
});
