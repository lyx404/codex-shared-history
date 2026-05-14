#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const home = process.env.HOME;
const codexHome = process.env.CODEX_HOME || path.join(home, ".codex");
const configPath = process.env.CODEX_CONFIG || path.join(codexHome, "config.toml");
const authPath = process.env.CODEX_AUTH || path.join(codexHome, "auth.json");
const stateDb = process.env.CODEX_STATE_DB || path.join(codexHome, "state_5.sqlite");
const globalStatePath = process.env.CODEX_GLOBAL_STATE || path.join(codexHome, ".codex-global-state.json");
const sessionIndexPath = path.join(codexHome, "session_index.jsonl");
const backupRootBase = path.join(codexHome, "history-share-backups");

const explicitProvider = readArgValue("--provider") || process.env.CODEX_HISTORY_PROVIDER || "";
const dryRun = process.argv.includes("--dry-run");
const listProviders = process.argv.includes("--list-providers");

function readArgValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? "" : process.argv[index + 1] || "";
}

function sqliteJson(sql) {
  const output = execFileSync("sqlite3", ["-json", stateDb, sql], {
    encoding: "utf8",
    timeout: 10_000,
  });
  return JSON.parse(output || "[]");
}

function sqlite(sql) {
  return execFileSync("sqlite3", [stateDb, sql], {
    encoding: "utf8",
    timeout: 10_000,
  });
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function readConfig() {
  return fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "";
}

function configuredProvider() {
  const match = readConfig().match(/^\s*model_provider\s*=\s*"([^"]+)"/m);
  return match ? match[1] : "openai";
}

function readJson(file) {
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function providerReason(provider, reason) {
  return { provider, reason };
}

function inferredProvider() {
  const configProvider = configuredProvider();
  const config = readConfig();
  const auth = readJson(authPath);
  const normalizedConfigProvider = configProvider.toLowerCase();

  if (normalizedConfigProvider === "openai") {
    return providerReason(configProvider, "config-model-provider-openai");
  }

  if (configProvider) {
    return providerReason(configProvider, "config-model-provider-non-openai");
  }

  if (/^\s*\[model_providers\.(openai|"openai")\]/im.test(config)) {
    const openAiProviderSection = config.match(/^\s*\[model_providers\.(openai|"openai")\][\s\S]*?(?=^\s*\[|\s*$)/im);
    if (openAiProviderSection && /base_url\s*=\s*"https:\/\/api\.openai\.com/i.test(openAiProviderSection[0])) {
      return providerReason("openai", "configured-openai-provider");
    }
  }

  const authKeys = Object.keys(auth);
  const hasApiKey = typeof auth.OPENAI_API_KEY === "string" && auth.OPENAI_API_KEY.trim() !== "";
  const hasOAuthLikeAuth = authKeys.some((key) => /token|account|session|refresh|id_token/i.test(key));

  if (hasApiKey && !hasOAuthLikeAuth) {
    return providerReason("openai", "auth-json-openai-api-key");
  }

  if (hasOAuthLikeAuth && !hasApiKey) {
    return providerReason("openai", "auth-json-openai-account");
  }

  return providerReason(configProvider, "config-model-provider");
}

function configuredProviders() {
  const config = readConfig();
  const providers = new Set();
  const envProviders = (process.env.CODEX_HISTORY_PROVIDERS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  for (const provider of envProviders) providers.add(provider);

  providers.add(configuredProvider());
  for (const match of config.matchAll(/^\s*\[model_providers\.([^\]\s]+)\]/gm)) {
    providers.add(match[1].replace(/^"|"$/g, ""));
  }

  providers.add("openai");
  return Array.from(providers).filter(Boolean);
}

function currentProvider() {
  if (explicitProvider) return providerReason(explicitProvider, "explicit");
  return inferredProvider();
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function copyIfExists(src, destDir, destName = path.basename(src)) {
  if (!fs.existsSync(src)) return null;
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, destName);
  fs.copyFileSync(src, dest);
  return dest;
}

function readFirstLineBuffer(file) {
  const fd = fs.openSync(file, "r");
  try {
    const chunks = [];
    const chunkSize = 64 * 1024;
    let offset = 0;

    while (true) {
      const buffer = Buffer.alloc(chunkSize);
      const bytesRead = fs.readSync(fd, buffer, 0, chunkSize, offset);
      if (bytesRead === 0) return Buffer.concat(chunks);

      const chunk = buffer.subarray(0, bytesRead);
      const newlineIndex = chunk.indexOf(0x0a);
      if (newlineIndex !== -1) {
        chunks.push(chunk.subarray(0, newlineIndex));
        return Buffer.concat(chunks);
      }

      chunks.push(Buffer.from(chunk));
      offset += bytesRead;
    }
  } finally {
    fs.closeSync(fd);
  }
}

function rewriteFirstLine(file, nextLine, firstLineByteLength) {
  const nextLineBuffer = Buffer.from(nextLine, "utf8");
  const fd = fs.openSync(file, "r+");
  try {
    fs.writeSync(fd, nextLineBuffer, 0, nextLineBuffer.length, 0);
    if (nextLineBuffer.length < firstLineByteLength) {
      fs.writeSync(fd, Buffer.alloc(firstLineByteLength - nextLineBuffer.length, 0x20), 0, firstLineByteLength - nextLineBuffer.length, nextLineBuffer.length);
    }
  } finally {
    fs.closeSync(fd);
  }
}

function syncRolloutProvider(file, provider, backupRoot) {
  if (!file || !fs.existsSync(file)) return "missing";

  const firstLineBuffer = readFirstLineBuffer(file);
  const firstLine = firstLineBuffer.toString("utf8");
  let record;
  try {
    record = JSON.parse(firstLine);
  } catch {
    return "invalid-json";
  }

  const current = record && record.type === "session_meta" && record.payload
    ? record.payload.model_provider
    : null;
  if (!current) return "no-session-meta";
  if (current === provider) return "unchanged";

  const match = /("model_provider"\s*:\s*)"([^"]*)"(\s*,)/.exec(firstLine);
  if (!match) return "missing-provider-field";

  const originalSegment = match[0];
  const replacementValue = JSON.stringify(provider);
  const minReplacement = `${match[1]}${replacementValue},`;
  const originalLength = Buffer.byteLength(originalSegment);
  const minLength = Buffer.byteLength(minReplacement);

  if (minLength > originalLength) return "provider-name-too-long";

  const paddingLength = originalLength - minLength;
  const replacementSegment = `${match[1]}${replacementValue}${" ".repeat(paddingLength)},`;
  const nextLine = firstLine.slice(0, match.index) + replacementSegment + firstLine.slice(match.index + originalSegment.length);

  const relative = path.relative(codexHome, file);
  const backupPath = path.join(backupRoot, "rollout-first-lines", `${relative}.first-line.json`);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(backupPath, firstLine + "\n");

  rewriteFirstLine(file, nextLine, firstLineBuffer.length);
  return "updated";
}

function isUnder(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function readGlobalState() {
  if (!fs.existsSync(globalStatePath)) return {};
  return JSON.parse(fs.readFileSync(globalStatePath, "utf8"));
}

function inferWorkspaceRoots(rows, state) {
  const existing = [
    ...(state["electron-saved-workspace-roots"] || []),
    ...(state["active-workspace-roots"] || []),
    ...(state["project-order"] || []),
  ].filter(Boolean);

  const roots = new Set(existing);
  for (const row of rows) {
    if (!row.cwd) continue;
    const root = existing
      .filter((candidate) => isUnder(row.cwd, candidate))
      .sort((a, b) => b.length - a.length)[0] || row.cwd;
    roots.add(root);
  }
  return Array.from(roots);
}

function syncGlobalState(rows, backupRoot) {
  const state = readGlobalState();
  const roots = inferWorkspaceRoots(rows, state);

  const hints = {};
  for (const row of rows) {
    const root = roots
      .filter((candidate) => row.cwd && isUnder(row.cwd, candidate))
      .sort((a, b) => b.length - a.length)[0] || row.cwd;
    if (root) hints[row.id] = root;
  }

  state["electron-saved-workspace-roots"] = roots;
  state["active-workspace-roots"] = roots;
  state["project-order"] = roots;
  state["thread-workspace-root-hints"] = {
    ...(state["thread-workspace-root-hints"] || {}),
    ...hints,
  };
  state["projectless-thread-ids"] = [];

  const atomState = state["electron-persisted-atom-state"] || {};
  const collapsedGroups = { ...(atomState["sidebar-collapsed-groups"] || {}) };
  for (const root of roots) collapsedGroups[root] = false;
  atomState["sidebar-collapsed-groups"] = collapsedGroups;
  atomState["sidebar-collapsed-sections-v1"] = {
    ...(atomState["sidebar-collapsed-sections-v1"] || {}),
    chats: false,
    pinned: false,
    threads: false,
  };
  atomState["sidebar-organize-mode-v1"] = "recent";
  atomState["sidebar-keep-projects-in-recent-v1"] = true;
  state["electron-persisted-atom-state"] = atomState;

  if (!dryRun) {
    copyIfExists(globalStatePath, backupRoot, ".codex-global-state.json");
    fs.writeFileSync(globalStatePath, JSON.stringify(state, null, 2) + "\n");
  }

  return { rootCount: roots.length, hintCount: Object.keys(hints).length };
}

function main() {
  if (listProviders) {
    console.log(JSON.stringify(configuredProviders()));
    return;
  }

  const detected = currentProvider();
  const provider = detected.provider;
  if (!provider || provider.includes("\n") || provider.includes("\0")) {
    throw new Error(`Invalid provider: ${JSON.stringify(provider)}`);
  }

  const rows = sqliteJson(
    `select id, cwd, model_provider, rollout_path
       from threads
      where coalesce(first_user_message, '') != ''
      order by updated_at_ms desc;`,
  );
  const providerCountsBefore = sqliteJson(
    `select model_provider, count(*) as count
       from threads
      where coalesce(first_user_message, '') != ''
      group by model_provider
      order by count desc;`,
  );
  const dbRowsToUpdate = rows.filter((row) => row.model_provider !== provider).length;
  let rolloutRowsToUpdate = 0;
  for (const row of rows) {
    if (!row.rollout_path || !fs.existsSync(row.rollout_path)) continue;
    const line = readFirstLineBuffer(row.rollout_path).toString("utf8");
    const match = /"model_provider"\s*:\s*"([^"]*)"/.exec(line);
    if (match && match[1] !== provider) rolloutRowsToUpdate++;
  }

  if (dryRun) {
    console.log(JSON.stringify({
      codexHome,
      provider,
      providerReason: detected.reason,
      totalThreads: rows.length,
      providerCountsBefore,
      dbRowsToUpdate,
      rolloutRowsToUpdate,
      dryRun: true,
    }, null, 2));
    return;
  }

  const backupRoot = path.join(backupRootBase, `backup-${timestamp()}`);
  fs.mkdirSync(backupRoot, { recursive: true });
  copyIfExists(stateDb, backupRoot, "state_5.sqlite");
  copyIfExists(`${stateDb}-wal`, backupRoot, "state_5.sqlite-wal");
  copyIfExists(`${stateDb}-shm`, backupRoot, "state_5.sqlite-shm");
  copyIfExists(sessionIndexPath, backupRoot, "session_index.jsonl");

  sqlite(
    `update threads
        set model_provider = ${sqlString(provider)},
            archived = 0,
            archived_at = null,
            has_user_event = 1
      where coalesce(first_user_message, '') != '';
     pragma wal_checkpoint(TRUNCATE);`,
  );

  const rolloutStatusCounts = {};
  for (const row of rows) {
    const status = syncRolloutProvider(row.rollout_path, provider, backupRoot);
    rolloutStatusCounts[status] = (rolloutStatusCounts[status] || 0) + 1;
  }

  const globalState = syncGlobalState(rows, backupRoot);
  sqlite("pragma wal_checkpoint(TRUNCATE);");
  const providerCountsAfter = sqliteJson(
    `select model_provider, count(*) as count
       from threads
      where coalesce(first_user_message, '') != ''
      group by model_provider
      order by count desc;`,
  );

  console.log(JSON.stringify({
    codexHome,
    provider,
    providerReason: detected.reason,
    totalThreads: rows.length,
    dbRowsUpdated: dbRowsToUpdate,
    rolloutStatusCounts,
    globalState,
    backupRoot,
    providerCountsBefore,
    providerCountsAfter,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
