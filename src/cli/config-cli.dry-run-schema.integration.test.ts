// Regression coverage for issue #157761: `config set --dry-run` must reject the
// same invalid paths the equivalent non-dry-run write rejects.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { captureEnv, setTestEnvValue } from "../test-utils/env.js";
import { useConfigCliIntegrationHarness } from "./config-cli.integration.test-harness.js";

const { runRegisteredConfigCommand, registeredRuntimeLogs, withConfigFileHarness } =
  useConfigCliIntegrationHarness();

const INVALID_PATH = "definitelyNotARealConfigTopLevelKey.profiles.deepseek.key";
const REF_ENV_VAR = "OPENCLAW_TEST_DRY_RUN_SCHEMA_VAR";
const BUILDER_REF_ARGS = [
  "--ref-provider",
  "default",
  "--ref-source",
  "env",
  "--ref-id",
  REF_ENV_VAR,
];

describe("config CLI dry-run/write schema parity", () => {
  it("rejects a ref-builder dry-run targeting an unrecognized config path", async () => {
    // Resolves cleanly so a false "dry run successful" would only be masked by requiresFullSchema's gap.
    const refEnvSnapshot = captureEnv([REF_ENV_VAR]);
    setTestEnvValue(REF_ENV_VAR, "test-value");
    await withConfigFileHarness(
      "openclaw-config-cli-dryrun-schema-",
      '{"secrets":{"providers":{"default":{"source":"env"}}}}',
      async ({ configPath }) => {
        await expect(
          runRegisteredConfigCommand([
            "config",
            "set",
            INVALID_PATH,
            ...BUILDER_REF_ARGS,
            "--dry-run",
            "--json",
          ]),
        ).rejects.toMatchObject({ name: "ExitError" });

        const payload = JSON.parse(registeredRuntimeLogs.at(-1) ?? "{}") as {
          ok: boolean;
          checks: { schema: boolean };
          errors?: Array<{ kind: string; message: string }>;
        };
        expect(payload.ok).toBe(false);
        expect(payload.checks.schema).toBe(true);
        expect(payload.errors?.some((error) => error.kind === "schema")).toBe(true);

        // The real write for the identical command must fail the same way, not succeed.
        registeredRuntimeLogs.length = 0;
        await expect(
          runRegisteredConfigCommand(["config", "set", INVALID_PATH, ...BUILDER_REF_ARGS]),
        ).rejects.toMatchObject({ name: "ExitError" });
        expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual({
          secrets: { providers: { default: { source: "env" } } },
        });
      },
    );
    refEnvSnapshot.restore();
  });
});
