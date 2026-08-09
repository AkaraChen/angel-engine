import type {
  KeybindingUserEntry,
  KeybindingsFile,
  LoadFatal,
  LoadWarning,
} from "./types";
import { getCommandDescriptor } from "./commands";

export function emptyKeybindingsFile(): KeybindingsFile {
  return { version: 1, bindings: [] };
}

export function migrateUserBindings(file: unknown): {
  entries: KeybindingUserEntry[];
  warnings: LoadWarning[];
  fatal?: LoadFatal;
  file: KeybindingsFile;
} {
  if (file === null || file === undefined) {
    return {
      entries: [],
      warnings: [],
      file: emptyKeybindingsFile(),
    };
  }

  if (typeof file !== "object") {
    return {
      entries: [],
      warnings: [],
      fatal: {
        kind: "parse-error",
        message: "keybindings root must be an object",
      },
      file: emptyKeybindingsFile(),
    };
  }

  const record = file as Record<string, unknown>;
  const warnings: LoadWarning[] = [];

  if (!("version" in record) || record.version === undefined) {
    warnings.push({
      code: "missing-version",
      message: "version missing; treated as 1",
    });
  } else if (record.version !== 1) {
    const rawVersion = record.version;
    const version: number | string =
      typeof rawVersion === "number"
        ? rawVersion
        : typeof rawVersion === "string"
          ? rawVersion
          : "unknown";
    return {
      entries: [],
      warnings,
      fatal: { kind: "unsupported-version", version },
      file: emptyKeybindingsFile(),
    };
  }

  const rawBindings = record.bindings;
  if (rawBindings === undefined) {
    return {
      entries: [],
      warnings,
      file: { version: 1, bindings: [] },
    };
  }
  if (!Array.isArray(rawBindings)) {
    return {
      entries: [],
      warnings,
      fatal: { kind: "parse-error", message: "bindings must be an array" },
      file: emptyKeybindingsFile(),
    };
  }

  const entries: KeybindingUserEntry[] = [];
  rawBindings.forEach((raw, entryIndex) => {
    if (!raw || typeof raw !== "object") {
      warnings.push({
        code: "invalid-entry",
        message: "binding entry is not an object",
        entryIndex,
      });
      return;
    }
    const entry = raw as Record<string, unknown>;
    if (typeof entry.command !== "string" || entry.command.length === 0) {
      warnings.push({
        code: "invalid-command",
        message: "binding entry missing command",
        entryIndex,
      });
      return;
    }

    const unbind = entry.command.startsWith("-");
    const id = unbind ? entry.command.slice(1) : entry.command;
    const descriptor = getCommandDescriptor(id);
    if (!descriptor) {
      warnings.push({
        code: "unknown-command",
        message: `unknown or removed command: ${id}`,
        entryIndex,
      });
      return;
    }

    const command = unbind
      ? (`-${descriptor.deprecatedBy ?? id}` as const)
      : (descriptor.deprecatedBy ?? id);

    if (entry.key !== undefined && typeof entry.key !== "string") {
      warnings.push({
        code: "invalid-key",
        message: "key must be a string",
        entryIndex,
      });
      return;
    }
    if (entry.when !== undefined && typeof entry.when !== "string") {
      warnings.push({
        code: "invalid-when",
        message: "when must be a string",
        entryIndex,
      });
      return;
    }

    entries.push({
      key: entry.key as string | undefined,
      command,
      when: entry.when as string | undefined,
      args: entry.args,
    });
  });

  return {
    entries,
    warnings,
    file: { version: 1, bindings: entries },
  };
}

export function serializeKeybindingsFile(file: KeybindingsFile): string {
  return `${JSON.stringify({ version: 1, bindings: file.bindings }, null, 2)}\n`;
}

/** Strip // comments and trailing commas for JSONC-ish user files. */
export function parseKeybindingsJson(text: string): unknown {
  const stripped = text
    .replace(/^\uFEFF/, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/,\s*([\]}])/g, "$1");
  return JSON.parse(stripped);
}
