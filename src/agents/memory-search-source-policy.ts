type MemorySearchSource = "memory" | "sessions";

const DEFAULT_SOURCES: MemorySearchSource[] = ["memory"];

function normalizeSources(
  sources: readonly MemorySearchSource[] | undefined,
  sessionMemoryEnabled: boolean,
): MemorySearchSource[] {
  const normalized = new Set<MemorySearchSource>();
  const input = sources?.length ? sources : DEFAULT_SOURCES;
  for (const source of input) {
    if (source === "memory") {
      normalized.add("memory");
    }
    if (source === "sessions" && sessionMemoryEnabled) {
      normalized.add("sessions");
    }
  }
  if (normalized.size === 0) {
    normalized.add("memory");
  }
  return Array.from(normalized);
}

/** Resolve query and indexed sources from already-selected memory policy facts. */
export function resolveMemorySearchSourcePolicy(params: {
  configuredSources?: readonly MemorySearchSource[];
  rememberAcrossConversations: boolean;
  configuredSessionMemory: boolean;
}): {
  sources: MemorySearchSource[];
  searchSources: MemorySearchSource[];
  sessionMemory: boolean;
  sessionsSourceIgnored: boolean;
} {
  const { configuredSources, rememberAcrossConversations, configuredSessionMemory } = params;
  const sessionMemory = rememberAcrossConversations || configuredSessionMemory;
  const searchSources = normalizeSources(
    configuredSources,
    configuredSessionMemory ||
      (rememberAcrossConversations && configuredSources?.includes("sessions") === true),
  );
  const sources = normalizeSources(
    rememberAcrossConversations ? [...searchSources, "sessions"] : configuredSources,
    sessionMemory,
  );
  // "sessions" is the only source normalizeSources() ever gates away, so an explicit
  // request for it that didn't survive means the prerequisite flag silently won.
  const sessionsSourceIgnored =
    configuredSources?.includes("sessions") === true && !sources.includes("sessions");
  return { sources, searchSources, sessionMemory, sessionsSourceIgnored };
}
