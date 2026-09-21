const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const PASSWORD_ITERATIONS = 100_000;
const DEFAULT_INITIAL_PASSWORD = "wosmdeogkrry1!";
const ASSET_VERSION = "2026-09-21.7";
const STATIC_ASSET_PATHS = new Set(["/app.js", "/styles.css", "/logo.css", "/jeiu_logo.svg"]);
const APP_PATHS = new Set(["/dashboard", "/students", "/teams", "/keys", "/models", "/access", "/audits", "/accounts", "/my-keys"]);

function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function parseCookies(request) {
  return Object.fromEntries(
    (request.headers.get("Cookie") || "")
      .split(";")
      .map((item) => item.trim().split(/=(.*)/s, 2))
      .filter(([name]) => name),
  );
}

function bytesToBase64Url(bytes) {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function equalSecret(left, right) {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(left)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(right)),
  ]);
  return equalBytes(new Uint8Array(leftHash), new Uint8Array(rightHash));
}

async function hashPassword(password) {
  const salt = randomToken(16);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: base64UrlToBytes(salt), iterations: PASSWORD_ITERATIONS },
    key,
    256,
  );
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${salt}$${bytesToBase64Url(new Uint8Array(bits))}`;
}

function equalBytes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function verifyPassword(password, stored) {
  const [algorithm, iterations, salt, expected] = String(stored).split("$");
  if (algorithm !== "pbkdf2-sha256" || !/^\d+$/.test(iterations) || !salt || !expected) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: base64UrlToBytes(salt), iterations: Number(iterations) },
    key,
    256,
  );
  return equalBytes(new Uint8Array(bits), base64UrlToBytes(expected));
}

function validLoginId(value) {
  return /^[A-Za-z0-9._-]{3,64}$/.test(value);
}

function validPassword(value) {
  return typeof value === "string" && value.length >= 10 && value.length <= 256;
}

function requiredText(value, label, maxLength = 100) {
  const text = String(value || "").trim();
  if (!text || text.length > maxLength) throw new Error(`${label}은(는) 1~${maxLength}자여야 합니다.`);
  return text;
}

function optionalText(value, label, maxLength = 1000) {
  const text = String(value ?? "").trim();
  if (text.length > maxLength) throw new Error(`${label}은(는) ${maxLength}자 이하여야 합니다.`);
  return text;
}

function integerId(value, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error(`${label}이(가) 올바르지 않습니다.`);
  return id;
}

function optionalBoolean(value, label) {
  if (typeof value !== "boolean") throw new Error(`${label}은(는) true 또는 false여야 합니다.`);
  return value ? 1 : 0;
}

function keyLimit(value) {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit < 0 || limit > 100000) throw new Error("키 한도는 0~100,000 USD여야 합니다.");
  return limit;
}

function keyLimitReset(value) {
  if (!["daily", "weekly", "monthly"].includes(value)) throw new Error("한도 주기는 일별, 주별, 월별 중 하나여야 합니다.");
  return value;
}

function modelAllowlist(value) {
  if (!Array.isArray(value)) throw new Error("허용 모델 목록이 올바르지 않습니다.");
  const models = [...new Set(value.map((model) => String(model || "").trim()).filter(Boolean))];
  if (!models.length || models.length > 50) throw new Error("허용 모델은 1~50개여야 합니다.");
  for (const model of models) {
    if (!/^[a-z0-9][a-z0-9._:+-]*\/[a-z0-9][a-z0-9._:+-]*$/i.test(model) || model === "openrouter/auto") {
      throw new Error(`올바른 OpenRouter 모델 슬러그가 아닙니다: ${model}`);
    }
  }
  return models;
}

async function credentialEncryptionKey(env) {
  if (!env.CREDENTIAL_ENCRYPTION_KEY) throw new Error("키 암호화 비밀값이 설정되지 않았습니다.");
  const material = base64UrlToBytes(String(env.CREDENTIAL_ENCRYPTION_KEY).trim());
  if (material.byteLength !== 32) throw new Error("키 암호화 비밀값은 32바이트 Base64 값이어야 합니다.");
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptCredentialKey(env, plaintext) {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await credentialEncryptionKey(env),
    new TextEncoder().encode(plaintext),
  );
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`;
}

async function decryptCredentialKey(env, encrypted) {
  const [version, ivText, ciphertextText] = String(encrypted || "").split(".");
  if (version !== "v1" || !ivText || !ciphertextText) throw new Error("저장된 키를 읽을 수 없습니다.");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(ivText) },
    await credentialEncryptionKey(env),
    base64UrlToBytes(ciphertextText),
  );
  return new TextDecoder().decode(plaintext);
}

async function openRouter(env, path, options = {}) {
  if (!env.OPENROUTER_MANAGEMENT_KEY) throw new Error("OpenRouter 관리 비밀값이 설정되지 않았습니다.");
  const response = await fetch(`https://openrouter.ai/api/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_MANAGEMENT_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.error || payload?.message || `OpenRouter 요청에 실패했습니다. (${response.status})`;
    throw new Error(String(message));
  }
  return payload;
}

async function workspaceGuardrails(env) {
  const workspaceId = String(env.OPENROUTER_WORKSPACE_ID || "").trim();
  if (!workspaceId) throw new Error("OpenRouter 워크스페이스가 설정되지 않았습니다.");
  const response = await openRouter(env, `/guardrails?workspace_id=${encodeURIComponent(workspaceId)}`);
  return { workspaceId, guardrails: Array.isArray(response?.data) ? response.data : [] };
}

async function workspaceModelPolicy(env) {
  const { workspaceId, guardrails } = await workspaceGuardrails(env);
  const defaultName = `Workspace ${workspaceId} Default`;
  const guardrail = guardrails.find((item) => item?.name === defaultName || item?.is_default || item?.is_workspace_default)
    || guardrails.find((item) => item?.name === "ClassKeys Workspace Model Policy");
  if (!guardrail?.id) return { guardrailId: null, models: [], blockedModels: [], restrictionMode: "unrestricted", enforced: false, updatedAt: null, assignmentRequired: true };
  const models = Array.isArray(guardrail.allowed_models) ? guardrail.allowed_models.filter((model) => typeof model === "string") : [];
  const blockedModels = Array.isArray(guardrail.ignored_models) ? guardrail.ignored_models.filter((model) => typeof model === "string") : [];
  return {
    guardrailId: guardrail.id,
    models,
    blockedModels,
    restrictionMode: models.length ? "allowlist" : blockedModels.length ? "blocklist" : "unrestricted",
    enforced: models.length > 0 || blockedModels.length > 0,
    updatedAt: guardrail.updated_at || null,
    assignmentRequired: guardrail.name !== defaultName && !guardrail.is_default && !guardrail.is_workspace_default,
  };
}

function normalizedModelSlug(value) {
  return String(value || "").replace(/^~/, "");
}

async function workspaceAllowedModels(env, policy) {
  const cacheKey = new Request("https://key.jeiu.cc/__cache/openrouter-models");
  const cache = caches.default;
  let models;
  const cached = await cache.match(cacheKey);
  if (cached) {
    models = await cached.json();
  } else {
    const response = await openRouter(env, "/models");
    models = Array.isArray(response?.data) ? response.data : [];
    await cache.put(cacheKey, new Response(JSON.stringify(models), { headers: { "Cache-Control": "public, s-maxage=600", "Content-Type": "application/json" } }));
  }
  const allowed = new Set(policy.models.map(normalizedModelSlug));
  const blocked = new Set(policy.blockedModels.map(normalizedModelSlug));
  const available = models
    .filter((model) => typeof model?.id === "string")
    .filter((model) => {
      const slugs = [model.id, model.canonical_slug].filter((slug) => typeof slug === "string").map(normalizedModelSlug);
      return (!allowed.size || slugs.some((slug) => allowed.has(slug))) && !slugs.some((slug) => blocked.has(slug));
    })
    .reduce((result, model) => result.set(model.id, { input: model.pricing?.prompt ?? null, output: model.pricing?.completion ?? null }), new Map());
  return { models: [...available.keys()].sort(), pricing: Object.fromEntries(available) };
}

async function assignGuardrailKeys(env, guardrailId, keyHashes) {
  for (let index = 0; index < keyHashes.length; index += 100) {
    await openRouter(env, `/guardrails/${guardrailId}/assignments/keys`, {
      method: "POST",
      body: JSON.stringify({ key_hashes: keyHashes.slice(index, index + 100) }),
    });
  }
}

async function activeClassKeys(env) {
  const { results } = await env.DB.prepare("SELECT upstream_key_ref FROM api_credentials WHERE status = 'active' AND provider = 'openrouter'").all();
  return results.map((credential) => credential.upstream_key_ref).filter(Boolean);
}

async function credentialSubject(env, subjectType, subjectId) {
  if (subjectType === "student") {
    const student = await env.DB.prepare("SELECT id, name, student_number, owner_type, is_active FROM students WHERE id = ?").bind(subjectId).first();
    if (!student || !student.is_active) throw new Error("활성 계정 소유자를 찾을 수 없습니다.");
    return { label: `${student.name} (${student.student_number})`, keyIdentifier: student.student_number, issuedToStudentId: student.id, ownerType: student.owner_type };
  }
  if (subjectType === "team") {
    const team = await env.DB.prepare("SELECT id, name, class_name, is_active FROM teams WHERE id = ?").bind(subjectId).first();
    if (!team || !team.is_active) throw new Error("활성 조를 찾을 수 없습니다.");
    return { label: `${team.name} (${team.class_name}반)`, keyIdentifier: String(team.id), keyName: team.name, issuedToStudentId: null };
  }
  throw new Error("키 대상은 개인 또는 조여야 합니다.");
}

function monetaryValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function credentialRecord(row, upstream = null, snapshot = null) {
  const snapshotUsd = (field) => snapshot ? Number(snapshot[field] || 0) / 1000000 : null;
  return {
    id: row.id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    className: row.class_name,
    subjectNumber: row.subject_number || null,
    provider: row.provider,
    subjectName: row.subject_name,
    keyLabel: row.key_label,
    status: row.status,
    limitUsd: row.limit_microusd === null ? null : Number(row.limit_microusd) / 1000000,
    limitReset: row.limit_reset,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    usageUsd: monetaryValue(upstream?.usage) ?? snapshotUsd("usage_microusd"),
    usageDailyUsd: monetaryValue(upstream?.usage_daily) ?? snapshotUsd("usage_daily_microusd"),
    usageWeeklyUsd: monetaryValue(upstream?.usage_weekly) ?? snapshotUsd("usage_weekly_microusd"),
    usageMonthlyUsd: monetaryValue(upstream?.usage_monthly) ?? snapshotUsd("usage_monthly_microusd"),
    limitRemainingUsd: monetaryValue(upstream?.limit_remaining),
    lastUsedAt: typeof upstream?.last_used_at === "string" ? upstream.last_used_at : null,
    usageAvailable: Boolean(upstream || snapshot),
  };
}

async function latestCredentialSnapshots(env, credentialIds) {
  if (!credentialIds.length) return new Map();
  const placeholders = credentialIds.map(() => "?").join(", ");
  const { results } = await env.DB.prepare(`
    SELECT * FROM key_usage_snapshots
    WHERE id IN (
      SELECT MAX(id) FROM key_usage_snapshots
      WHERE credential_id IN (${placeholders})
      GROUP BY credential_id
    )
  `).bind(...credentialIds).all();
  return new Map(results.map((row) => [row.credential_id, row]));
}

async function openRouterKeyUsage(env, fresh = false) {
  if (!env.OPENROUTER_MANAGEMENT_KEY) return new Map();
  const cacheKey = new Request(`https://key.jeiu.cc/__cache/openrouter-keys?workspace=${encodeURIComponent(env.OPENROUTER_WORKSPACE_ID || "")}`);
  const cache = caches.default;
  if (!fresh) {
    const cached = await cache.match(cacheKey);
    if (cached) return new Map(await cached.json());
  }
  const keys = new Map();
  for (let offset = 0; offset < 1000; offset += 100) {
    const query = new URLSearchParams({ include_disabled: "true", offset: String(offset) });
    if (env.OPENROUTER_WORKSPACE_ID) query.set("workspace_id", env.OPENROUTER_WORKSPACE_ID);
    let response;
    try {
      response = await openRouter(env, `/keys?${query}`);
    } catch {
      return keys;
    }
    const page = Array.isArray(response?.data) ? response.data : [];
    for (const key of page) if (typeof key?.hash === "string") keys.set(key.hash, key);
    if (page.length < 100) break;
  }
  if (!fresh) await cache.put(cacheKey, new Response(JSON.stringify([...keys]), { headers: { "Cache-Control": "public, s-maxage=60", "Content-Type": "application/json" } }));
  return keys;
}

function usageForPeriod(upstream, period) {
  const field = period === "daily" ? "usage_daily" : period === "weekly" ? "usage_weekly" : "usage_monthly";
  const usage = monetaryValue(upstream?.[field]);
  return usage === null ? null : Math.max(0, Math.round(usage * 1000000));
}

function periodStartUtc(period) {
  const start = new Date();
  start.setUTCSeconds(0, 0);
  if (period === "daily") { start.setUTCHours(0, 0, 0, 0); return start.toISOString(); }
  if (period === "weekly") {
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    return start.toISOString();
  }
  start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  return start.toISOString();
}

async function latestSnapshotUsage(env, credentialIds, period) {
  if (!credentialIds.length) return new Map();
  const column = period === "daily" ? "usage_daily_microusd" : period === "weekly" ? "usage_weekly_microusd" : "usage_monthly_microusd";
  const placeholders = credentialIds.map(() => "?").join(", ");
  const { results } = await env.DB.prepare(`
    SELECT credential_id, ${column} AS usage_microusd
    FROM key_usage_snapshots
    WHERE id IN (
      SELECT MAX(id) FROM key_usage_snapshots
      WHERE credential_id IN (${placeholders})
        AND datetime(observed_at) >= datetime(?)
      GROUP BY credential_id
    )
  `).bind(...credentialIds, periodStartUtc(period)).all();
  return new Map(results.map((row) => [row.credential_id, Number(row.usage_microusd) || 0]));
}

async function snapshotCredentialUsage(env, credential, upstream) {
  if (!upstream) return;
  await env.DB.prepare(`
    INSERT INTO key_usage_snapshots (
      credential_id, observed_at, usage_microusd, usage_daily_microusd, usage_weekly_microusd, usage_monthly_microusd
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    credential.id,
    new Date().toISOString(),
    Math.max(0, Math.round((monetaryValue(upstream.usage) || 0) * 1000000)),
    Math.max(0, Math.round((monetaryValue(upstream.usage_daily) || 0) * 1000000)),
    Math.max(0, Math.round((monetaryValue(upstream.usage_weekly) || 0) * 1000000)),
    Math.max(0, Math.round((monetaryValue(upstream.usage_monthly) || 0) * 1000000)),
  ).run();
}

async function studentQuotaPolicy(env, studentId) {
  return env.DB.prepare(`
    SELECT * FROM quota_policies
    WHERE subject_type = 'student' AND subject_id = ? AND is_active = 1
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `).bind(studentId).first();
}

async function ensureStudentQuotaPolicy(env, studentId, limitUsd, period) {
  const existing = await studentQuotaPolicy(env, studentId);
  if (existing) return existing;
  const policy = { id: crypto.randomUUID(), limitMicrousd: Math.round(limitUsd * 1000000), period };
  await env.DB.prepare(`
    INSERT INTO quota_policies (id, subject_type, subject_id, period, limit_microusd)
    VALUES (?, 'student', ?, ?, ?)
  `).bind(policy.id, studentId, policy.period, policy.limitMicrousd).run();
  return { id: policy.id, subject_type: "student", subject_id: studentId, period: policy.period, limit_microusd: policy.limitMicrousd };
}

async function studentQuota(env, studentId, usage = null) {
  const policy = await studentQuotaPolicy(env, studentId);
  if (!policy) return null;
  const { results: credentials } = await env.DB.prepare(`
    SELECT id, upstream_key_ref FROM api_credentials
    WHERE subject_type = 'student' AND subject_id = ?
    ORDER BY created_at
  `).bind(studentId).all();
  const usageByKey = usage || await openRouterKeyUsage(env);
  const missingIds = credentials.filter((credential) => !usageByKey.has(credential.upstream_key_ref)).map((credential) => credential.id);
  const snapshots = await latestSnapshotUsage(env, missingIds, policy.period);
  const usedMicrousd = credentials.reduce((total, credential) => {
    const current = usageForPeriod(usageByKey.get(credential.upstream_key_ref), policy.period);
    return total + (current === null ? (snapshots.get(credential.id) || 0) : current);
  }, 0);
  const limitMicrousd = Number(policy.limit_microusd);
  return {
    period: policy.period,
    limitUsd: limitMicrousd / 1000000,
    usedUsd: usedMicrousd / 1000000,
    remainingUsd: Math.max(0, limitMicrousd - usedMicrousd) / 1000000,
    credentialCount: credentials.length,
  };
}

async function usageAnalytics(env, subjectType = null, subjectId = null, days = 30) {
  const safeDays = Math.max(1, Math.min(30, Math.floor(Number(days) || 30)));
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - (safeDays - 1));
  const fromDate = from.toISOString().slice(0, 10);
  const conditions = ["usage_date_utc >= ?"];
  const binds = [fromDate];
  if (subjectType) { conditions.push("subject_type = ?"); binds.push(subjectType); }
  if (subjectId !== null && subjectId !== undefined) { conditions.push("subject_id = ?"); binds.push(subjectId); }
  const where = conditions.join(" AND ");
  const [summary, daily, models] = await env.DB.batch([
    env.DB.prepare(`
      SELECT COALESCE(SUM(cost_microusd), 0) AS cost_microusd,
             COALESCE(SUM(request_count), 0) AS request_count,
             COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
             COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens
      FROM usage_daily WHERE ${where}
    `).bind(...binds),
    env.DB.prepare(`
      SELECT usage_date_utc AS date, COALESCE(SUM(cost_microusd), 0) AS cost_microusd,
             COALESCE(SUM(request_count), 0) AS request_count
      FROM usage_daily WHERE ${where}
      GROUP BY usage_date_utc ORDER BY usage_date_utc
    `).bind(...binds),
    env.DB.prepare(`
      SELECT model, provider_name, COALESCE(SUM(cost_microusd), 0) AS cost_microusd,
             COALESCE(SUM(request_count), 0) AS request_count
      FROM usage_daily WHERE ${where}
      GROUP BY model, provider_name ORDER BY cost_microusd DESC, request_count DESC LIMIT 10
    `).bind(...binds),
  ]);
  const toUsd = (value) => Number(value || 0) / 1000000;
  const row = summary.results[0] || {};
  let liveCostUsd = 0;
  if (!Number(row.cost_microusd || 0)) {
    const credentialConditions = [];
    const credentialBinds = [];
    if (subjectType) { credentialConditions.push("subject_type = ?"); credentialBinds.push(subjectType); }
    if (subjectId !== null && subjectId !== undefined) { credentialConditions.push("subject_id = ?"); credentialBinds.push(subjectId); }
    const credentialWhere = credentialConditions.length ? `WHERE ${credentialConditions.join(" AND ")}` : "";
    const { results: credentials } = await env.DB.prepare(`SELECT upstream_key_ref FROM api_credentials ${credentialWhere}`).bind(...credentialBinds).all();
    const liveUsage = await openRouterKeyUsage(env);
    liveCostUsd = credentials.reduce((total, credential) => total + (monetaryValue(liveUsage.get(credential.upstream_key_ref)?.usage) || 0), 0);
  }
  const costUsd = toUsd(row.cost_microusd) || liveCostUsd;
  return {
    range: { from: fromDate, to: new Date().toISOString().slice(0, 10), days: safeDays },
    summary: {
      costUsd, requestCount: Number(row.request_count || 0),
      promptTokens: Number(row.prompt_tokens || 0), completionTokens: Number(row.completion_tokens || 0), reasoningTokens: Number(row.reasoning_tokens || 0),
    },
    daily: daily.results.map((item) => ({ date: item.date, costUsd: toUsd(item.cost_microusd), requestCount: Number(item.request_count || 0) })),
    topModels: models.results.map((item) => ({ model: item.model, providerName: item.provider_name, costUsd: toUsd(item.cost_microusd), requestCount: Number(item.request_count || 0) })),
  };
}

function analyticsTimeRange(days = 30) {
  const safeDays = Math.max(1, Math.min(30, Math.floor(Number(days) || 30)));
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (safeDays - 1));
  start.setUTCHours(0, 0, 0, 0);
  return { safeDays, start: start.toISOString(), end: end.toISOString() };
}

async function syncUsageAnalytics(env, days = 30) {
  const range = analyticsTimeRange(days);
  const requestBody = {
    metrics: ["request_count", "total_usage", "tokens_prompt", "tokens_completion", "reasoning_tokens"],
    dimensions: ["model", "api_key_id"],
    granularity: "day",
    time_range: { start: range.start, end: range.end },
    limit: 10000,
  };
  if (env.OPENROUTER_WORKSPACE_ID) requestBody.workspace_id = env.OPENROUTER_WORKSPACE_ID;
  const response = await openRouter(env, "/analytics/query", { method: "POST", body: JSON.stringify(requestBody) });
  const rows = Array.isArray(response?.data?.data) ? response.data.data : [];
  const { results: credentials } = await env.DB.prepare("SELECT subject_type, subject_id, key_label, upstream_key_ref FROM api_credentials").all();
  const credentialsByLabel = new Map(credentials.map((credential) => [String(credential.key_label), credential]));
  const credentialsByHash = new Map(credentials.map((credential) => [String(credential.upstream_key_ref || ""), credential]));
  const upstreamKeys = await openRouterKeyUsage(env);
  const credentialsByUpstreamName = new Map();
  for (const [hash, key] of upstreamKeys) {
    const credential = credentialsByHash.get(String(hash));
    if (credential && key?.name) credentialsByUpstreamName.set(String(key.name), credential);
  }
  const aggregates = new Map();
  let skipped = 0;
  for (const row of rows) {
    const apiKeyId = String(row.api_key_id || "");
    const credential = credentialsByLabel.get(apiKeyId) || credentialsByUpstreamName.get(apiKeyId);
    const date = String(row.date__day || row.date || "").slice(0, 10);
    const model = String(row.model || "unknown");
    if (!credential || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { skipped += 1; continue; }
    const provider = model.includes("/") ? model.split("/", 1)[0] : "";
    const key = [date, credential.subject_type, credential.subject_id, model, provider].join("\u001f");
    const current = aggregates.get(key) || { date, subjectType: credential.subject_type, subjectId: credential.subject_id, model, provider, cost: 0, requests: 0, prompt: 0, completion: 0, reasoning: 0 };
    current.cost += Math.max(0, Math.round(Number(row.total_usage || 0) * 1000000));
    current.requests += Math.max(0, Math.round(Number(row.request_count || 0)));
    current.prompt += Math.max(0, Math.round(Number(row.tokens_prompt || 0)));
    current.completion += Math.max(0, Math.round(Number(row.tokens_completion || 0)));
    current.reasoning += Math.max(0, Math.round(Number(row.reasoning_tokens || 0)));
    aggregates.set(key, current);
  }
  const values = [...aggregates.values()];
  for (let offset = 0; offset < values.length; offset += 50) {
    const statements = values.slice(offset, offset + 50).map((item) => env.DB.prepare(`
      INSERT INTO usage_daily (usage_date_utc, subject_type, subject_id, model, provider_name, cost_microusd, request_count, prompt_tokens, completion_tokens, reasoning_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (usage_date_utc, subject_type, subject_id, model, provider_name) DO UPDATE SET
        cost_microusd = excluded.cost_microusd,
        request_count = excluded.request_count,
        prompt_tokens = excluded.prompt_tokens,
        completion_tokens = excluded.completion_tokens,
        reasoning_tokens = excluded.reasoning_tokens,
        updated_at = CURRENT_TIMESTAMP
    `).bind(item.date, item.subjectType, item.subjectId, item.model, item.provider, item.cost, item.requests, item.prompt, item.completion, item.reasoning));
    if (statements.length) await env.DB.batch(statements);
  }
  return { range: { from: range.start.slice(0, 10), to: range.end.slice(0, 10), days: range.safeDays }, fetched: rows.length, synced: values.length, skipped };
}

async function listCredentials(env, where = "", bindings = []) {
  const { results } = await env.DB.prepare(`
    SELECT api_credentials.*,
      CASE api_credentials.subject_type
        WHEN 'student' THEN students.name
        WHEN 'team' THEN teams.name
      END AS subject_name,
      CASE api_credentials.subject_type
        WHEN 'student' THEN students.student_number
      END AS subject_number,
      CASE api_credentials.subject_type
        WHEN 'student' THEN students.class_name
        WHEN 'team' THEN teams.class_name
      END AS class_name
    FROM api_credentials
    LEFT JOIN students ON api_credentials.subject_type = 'student' AND students.id = api_credentials.subject_id
    LEFT JOIN teams ON api_credentials.subject_type = 'team' AND teams.id = api_credentials.subject_id
    ${where}
    ORDER BY api_credentials.created_at DESC
  `).bind(...bindings).all();
  let usage = new Map();
  try { usage = await openRouterKeyUsage(env); } catch {}
  const snapshots = await latestCredentialSnapshots(env, results.map((row) => row.id));
  return Promise.all(results.map(async (row) => {
    const key = row.encrypted_key ? await decryptCredentialKey(env, row.encrypted_key) : "";
    const keyPreview = key.length > 16 ? `${key.slice(0, 10)}…${key.slice(-4)}` : key;
    return { ...credentialRecord(row, usage.get(row.upstream_key_ref), snapshots.get(row.id)), keyPreview };
  }));
}

async function normalizeInitialPersonalKeyLabels(env, actorAccountId) {
  const { results } = await env.DB.prepare(`
    SELECT api_credentials.id, api_credentials.upstream_key_ref, students.student_number
    FROM api_credentials
    JOIN students ON students.id = api_credentials.subject_id
    WHERE api_credentials.subject_type = 'student'
      AND api_credentials.status = 'active'
      AND api_credentials.issue_sequence = 1
      AND api_credentials.key_label != (students.student_number || '-01')
  `).all();
  let renamed = 0;
  let failed = 0;
  for (const credential of results) {
    const keyLabel = `${credential.student_number}-01`;
    try {
      await openRouter(env, `/keys/${credential.upstream_key_ref}`, { method: "PATCH", body: JSON.stringify({ name: keyLabel }) });
      await env.DB.prepare("UPDATE api_credentials SET key_label = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(keyLabel, credential.id).run();
      renamed += 1;
    } catch {
      failed += 1;
    }
  }
  if (renamed || failed) await audit(env, actorAccountId, "credential.normalize_personal_labels", "credential", null, { renamed, failed });
  return { renamed, failed };
}

async function findCredential(env, credentialId) {
  const row = await env.DB.prepare("SELECT * FROM api_credentials WHERE id = ?").bind(credentialId).first();
  if (!row) throw new Error("키 기록을 찾을 수 없습니다.");
  return row;
}

async function revokeCredential(env, credential, upstream = null) {
  if (credential.status !== "active") throw new Error("이미 폐기된 키입니다.");
  if (credential.provider !== "openrouter") throw new Error("이 upstream의 키 폐기는 아직 지원되지 않습니다.");
  if (!upstream) {
    const usage = await openRouterKeyUsage(env, true);
    upstream = usage.get(credential.upstream_key_ref);
  }
  await snapshotCredentialUsage(env, credential, upstream);
  await openRouter(env, `/keys/${credential.upstream_key_ref}`, { method: "PATCH", body: JSON.stringify({ disabled: true }) });
  await env.DB.prepare("UPDATE api_credentials SET status = 'disabled', revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(credential.id).run();
}

async function activeCredentialCount(env, subjectType, subjectId) {
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM api_credentials WHERE subject_type = ? AND subject_id = ? AND status = 'active'",
  ).bind(subjectType, subjectId).first("count");
  return Number(count || 0);
}

async function nextPersonalKeySequence(env, studentId) {
  const counter = await env.DB.prepare(`
    INSERT INTO personal_key_counters (student_id, last_sequence)
    VALUES (?, 1)
    ON CONFLICT(student_id) DO UPDATE SET last_sequence = last_sequence + 1
    RETURNING last_sequence
  `).bind(studentId).first();
  return Number(counter?.last_sequence || 1);
}

async function nextTeamKeySequence(env, teamId) {
  const counter = await env.DB.prepare(`
    INSERT INTO team_key_counters (team_id, last_sequence)
    VALUES (?, 1)
    ON CONFLICT(team_id) DO UPDATE SET last_sequence = last_sequence + 1
    RETURNING last_sequence
  `).bind(teamId).first();
  return Number(counter?.last_sequence || 1);
}

async function adminCredentialManagementEnabled(env) {
  const value = await env.DB.prepare(
    "SELECT value FROM app_settings WHERE key = 'allow_admin_credential_management'",
  ).first("value");
  return value === "true";
}

async function canManageCredentials(env, account) {
  return account.role === "master" || account.role === "admin";
}

function canViewCredentials(account) { return account.role === "master" || account.role === "admin"; }

async function requireCredentialManager(request, env) {
  const auth = await requireRole(request, env, ["admin", "master"]);
  if (auth.error) return auth;
  if (!await canManageCredentials(env, auth.account)) return { error: json({ error: "키 발급·조회·재발급·폐기는 관리자 또는 Master만 할 수 있습니다." }, 403) };
  return auth;
}

async function requireCredentialViewer(request, env) {
  const auth = await requireRole(request, env, ["admin", "master"]);
  if (auth.error) return auth;
  return auth;
}

async function canReadCredential(env, account, credential) {
  if (await canManageCredentials(env, account)) return true;
  if (!account.student_id) return false;
  if (credential.subject_type === "student") return Number(credential.subject_id) === Number(account.student_id);
  if (account.role !== "student") return false;
  const membership = await env.DB.prepare(
    "SELECT 1 FROM team_memberships WHERE team_id = ? AND student_id = ? AND ended_at IS NULL",
  ).bind(credential.subject_id, account.student_id).first();
  return Boolean(membership);
}

async function revokeActivePersonalCredentials(env, studentId, usage) {
  const { results } = await env.DB.prepare(`
    SELECT * FROM api_credentials
    WHERE subject_type = 'student' AND subject_id = ? AND status = 'active'
    ORDER BY created_at
  `).bind(studentId).all();
  for (const credential of results) await revokeCredential(env, credential, usage.get(credential.upstream_key_ref));
}

async function issueCredential(env, { subjectType, subjectId, label, limitUsd, limitReset, rotateExisting = true }) {
  const subject = await credentialSubject(env, subjectType, subjectId);
  const requestedLimit = keyLimit(limitUsd);
  const requestedReset = keyLimitReset(limitReset);
  let limit = requestedLimit;
  let reset = requestedReset;
  let quota = null;
  if (subjectType === "student") {
    const policy = await ensureStudentQuotaPolicy(env, subjectId, requestedLimit, requestedReset);
    reset = policy.period;
    const usage = await openRouterKeyUsage(env, true);
    quota = await studentQuota(env, subjectId, usage);
    if (!quota || quota.remainingUsd <= 0) throw new Error("학생의 현재 주기 개인 한도가 모두 사용되었습니다.");
    limit = quota.remainingUsd;
    if (await activeCredentialCount(env, subjectType, subjectId) && !rotateExisting) {
      throw new Error("활성 개인 키가 이미 있습니다. 새 키가 필요하면 재발급을 사용하세요.");
    }
    if (rotateExisting) await revokeActivePersonalCredentials(env, subjectId, usage);
  } else if (await activeCredentialCount(env, subjectType, subjectId) >= 2) {
    throw new Error("조마다 활성 키는 최대 2개입니다.");
  }
  const issueSequence = subjectType === "student" ? await nextPersonalKeySequence(env, subjectId) : await nextTeamKeySequence(env, subjectId);
  const defaultName = subjectType === "student" ? `${subject.keyIdentifier}-${String(issueSequence).padStart(2, "0")}` : `${subject.keyName}-${String(issueSequence).padStart(2, "0")}`;
  const name = requiredText(label || defaultName, "키 이름", 100);
  const request = { name, limit, limit_reset: reset };
  if (env.OPENROUTER_WORKSPACE_ID) request.workspace_id = env.OPENROUTER_WORKSPACE_ID;
  const created = await openRouter(env, "/keys", { method: "POST", body: JSON.stringify(request) });
  const key = created?.key;
  const hash = created?.data?.hash;
  if (typeof key !== "string" || typeof hash !== "string") throw new Error("OpenRouter가 발급한 키 정보를 확인할 수 없습니다.");
  const id = crypto.randomUUID();
  try {
    const modelPolicy = await workspaceModelPolicy(env);
    if (modelPolicy.assignmentRequired && modelPolicy.models.length) await assignGuardrailKeys(env, modelPolicy.guardrailId, [hash]);
    await env.DB.prepare(`
      INSERT INTO api_credentials (id, subject_type, subject_id, issued_to_student_id, upstream_key_ref, key_label, status, limit_microusd, limit_reset, encrypted_key, provider, issue_sequence)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, 'openrouter', ?)
    `).bind(id, subjectType, subjectId, subject.issuedToStudentId, hash, name, Math.round(limit * 1000000), reset, await encryptCredentialKey(env, key), issueSequence).run();
  } catch (error) {
    await openRouter(env, `/keys/${hash}`, { method: "DELETE", body: "{}" }).catch(() => {});
    throw error;
  }
  return { id, key, upstreamKeyRef: hash, quota, record: { id, subjectType, subjectId, provider: "openrouter", subjectName: subject.label, keyLabel: name, status: "active", limitUsd: limit, limitReset: reset } };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function sessionCookie(request, token, maxAge = SESSION_MAX_AGE_SECONDS) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `classkeys_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

async function createSession(env, accountId) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (id, token_hash, account_id, expires_at) VALUES (?, ?, ?, ?)",
  ).bind(crypto.randomUUID(), await sha256(token), accountId, expiresAt).run();
  return token;
}

async function currentAccount(request, env) {
  const token = parseCookies(request).classkeys_session;
  if (!token) return null;

  return env.DB.prepare(`
    SELECT accounts.id, accounts.login_id, accounts.role, accounts.student_id, accounts.display_name, accounts.must_change_password,
           students.name AS student_name, students.student_number, students.class_name
    FROM sessions
    JOIN accounts ON accounts.id = sessions.account_id
    LEFT JOIN students ON students.id = accounts.student_id
    WHERE sessions.token_hash = ?
      AND sessions.expires_at > CURRENT_TIMESTAMP
      AND accounts.is_active = 1
  `).bind(await sha256(token)).first();
}

async function requireRole(request, env, roles) {
  const account = await currentAccount(request, env);
  if (!account) return { error: json({ error: "로그인이 필요합니다." }, 401) };
  if (account.must_change_password) return { error: json({ error: "초기 비밀번호를 먼저 변경해야 합니다." }, 403) };
  if (!roles.includes(account.role)) return { error: json({ error: "권한이 없습니다." }, 403) };
  return { account };
}

async function audit(env, accountId, action, subjectType = null, subjectId = null, metadata = {}) {
  await env.DB.prepare(`
    INSERT INTO audit_events (id, actor_account_id, action, subject_type, subject_id, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), accountId, action, subjectType, subjectId, JSON.stringify(metadata)).run();
}

export default {
  async scheduled(controller, env, ctx) {
    if (!env.OPENROUTER_MANAGEMENT_KEY) return;
    ctx.waitUntil(syncUsageAnalytics(env).catch((error) => console.error("analytics_sync_failed", error instanceof Error ? error.message : error)));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/health") {
      const members = await env.DB.prepare("SELECT COUNT(*) AS count FROM students WHERE is_active = 1 AND owner_type = 'student'")
        .first("count");
      return json({ status: "ok", members: Number(members ?? 0) });
    }

    if (request.method === "GET" && url.pathname === "/api/dashboard") {
      const auth = await requireRole(request, env, ["master", "admin"]);
      if (auth.error) return auth.error;
      const canManage = await canManageCredentials(env, auth.account);
      const results = await env.DB.batch([
        env.DB.prepare("SELECT COUNT(*) AS count FROM students WHERE is_active = 1 AND owner_type = 'student'"),
        env.DB.prepare("SELECT COUNT(*) AS count FROM teams WHERE is_active = 1"),
        env.DB.prepare(`
          SELECT COUNT(*) AS count
          FROM students
          WHERE is_active = 1 AND owner_type = 'student'
            AND NOT EXISTS (
              SELECT 1 FROM team_memberships
              WHERE team_memberships.student_id = students.id
                AND team_memberships.ended_at IS NULL
            )
        `),
        env.DB.prepare("SELECT COUNT(*) AS count FROM api_credentials WHERE status = 'active'"),
      ]);
      return json({
        data: {
          activeStudents: Number(results[0].results[0]?.count ?? 0),
          activeTeams: Number(results[1].results[0]?.count ?? 0),
          unassignedStudents: Number(results[2].results[0]?.count ?? 0),
          activeCredentials: canManage ? Number(results[3].results[0]?.count ?? 0) : null,
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/api/analytics/dashboard") {
      const auth = await requireRole(request, env, ["master", "admin"]);
      if (auth.error) return auth.error;
      try {
        return json({ data: await usageAnalytics(env, null, null, url.searchParams.get("days")) });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "사용량 분석을 불러오지 못했습니다." }, 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/analytics/sync") {
      const auth = await requireRole(request, env, ["master", "admin"]);
      if (auth.error) return auth.error;
      try {
        const result = await syncUsageAnalytics(env, url.searchParams.get("days"));
        await audit(env, auth.account.id, "analytics.sync", "workspace", null, result);
        return json({ data: result });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "사용량 동기화에 실패했습니다." }, 502);
      }
    }

    if (request.method === "GET" && url.pathname === "/api/analytics/mine") {
      const account = await currentAccount(request, env);
      if (!account) return json({ error: "로그인이 필요합니다." }, 401);
      if (account.must_change_password) return json({ error: "초기 비밀번호를 먼저 변경해야 합니다." }, 403);
      if (account.role !== "student" || !account.student_id) return json({ error: "학생 개인 대시보드만 사용할 수 있습니다." }, 403);
      try {
        return json({ data: await usageAnalytics(env, "student", account.student_id, url.searchParams.get("days")) });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "개인 사용량 분석을 불러오지 못했습니다." }, 500);
      }
    }

    if (url.pathname === "/api/model-policy") {
      const auth = await requireRole(request, env, ["student", "admin", "master"]);
      if (auth.error) return auth.error;
      try {
        if (request.method === "GET") return json({ data: await workspaceModelPolicy(env) });
        if (request.method === "PUT") {
          if (auth.account.role !== "master") return json({ error: "권한이 없습니다." }, 403);
          const body = await readJson(request);
          const models = modelAllowlist(body?.models);
          const before = await workspaceModelPolicy(env);
          const response = before.guardrailId
            ? await openRouter(env, `/guardrails/${before.guardrailId}`, { method: "PATCH", body: JSON.stringify({ allowed_models: models }) })
            : await openRouter(env, "/guardrails", {
              method: "POST",
              body: JSON.stringify({ name: "ClassKeys Workspace Model Policy", workspace_id: env.OPENROUTER_WORKSPACE_ID, allowed_models: models }),
            });
          const updated = response?.data || {};
          const blockedModels = Array.isArray(updated.ignored_models) ? updated.ignored_models : before.blockedModels;
          const data = {
            guardrailId: updated.id || before.guardrailId,
            models: Array.isArray(updated.allowed_models) ? updated.allowed_models : models,
            blockedModels,
            restrictionMode: models.length ? "allowlist" : blockedModels.length ? "blocklist" : "unrestricted",
            enforced: true,
            updatedAt: updated.updated_at || null,
            assignmentRequired: before.assignmentRequired || !before.guardrailId,
          };
          if (data.assignmentRequired) await assignGuardrailKeys(env, data.guardrailId, await activeClassKeys(env));
          await audit(env, auth.account.id, "model_policy.update", "workspace", null, { before: before.models, after: data.models, guardrailId: data.guardrailId, assignmentRequired: data.assignmentRequired });
          return json({ data });
        }
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "허용 모델 정책을 변경하지 못했습니다." }, 400);
      }
    }

    if (request.method === "GET" && url.pathname === "/api/audit-events") {
      const auth = await requireRole(request, env, ["master"]);
      if (auth.error) return auth.error;
      const offset = Math.max(0, Math.min(Math.floor(Number(url.searchParams.get("offset")) || 0), 1000000));
      const { results } = await env.DB.prepare(`
        SELECT audit_events.id, audit_events.action, audit_events.subject_type, audit_events.subject_id,
               audit_events.metadata_json, audit_events.created_at, accounts.login_id AS actor_login_id,
               COALESCE(NULLIF(accounts.display_name, ''), actor_students.name, accounts.login_id) AS actor_name,
               CASE audit_events.subject_type
                 WHEN 'student' THEN students.name || ' · ' || students.student_number
                 WHEN 'team' THEN teams.name || ' · ' || teams.class_name || '반'
                 WHEN 'account' THEN COALESCE(NULLIF(subject_accounts.display_name, ''), subject_account_students.name, subject_accounts.login_id) || ' · ' || subject_accounts.login_id
               END AS subject_name
        FROM audit_events
        LEFT JOIN accounts ON accounts.id = audit_events.actor_account_id
        LEFT JOIN students AS actor_students ON actor_students.id = accounts.student_id
        LEFT JOIN students ON audit_events.subject_type = 'student' AND students.id = audit_events.subject_id
        LEFT JOIN teams ON audit_events.subject_type = 'team' AND teams.id = audit_events.subject_id
        LEFT JOIN accounts AS subject_accounts ON audit_events.subject_type = 'account' AND subject_accounts.id = audit_events.subject_id
        LEFT JOIN students AS subject_account_students ON subject_account_students.id = subject_accounts.student_id
        ORDER BY audit_events.created_at DESC, audit_events.rowid DESC
        LIMIT 100 OFFSET ?
      `).bind(offset).all();
      const data = results.map((event) => {
        let metadata = {};
        try { metadata = JSON.parse(event.metadata_json); } catch { metadata = {}; }
        return { id: event.id, action: event.action, subjectType: event.subject_type, subjectId: event.subject_id, subjectName: event.subject_name, actorName: event.actor_name, actorLoginId: event.actor_login_id, metadata, createdAt: event.created_at };
      });
      return json({ data, hasMore: data.length === 100, nextOffset: offset + data.length });
    }

    if (request.method === "POST" && url.pathname === "/api/auth/bootstrap") {
      const body = await readJson(request);
      const loginId = String(body?.loginId || "").trim();
      const password = body?.password;
      const setupToken = String(body?.setupToken || "");
      const masterCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM accounts WHERE role = 'master'").first("count");

      if (Number(masterCount) > 0) return json({ error: "초기 Master 계정이 이미 생성되었습니다." }, 409);
      if (!env.SETUP_TOKEN || !await equalSecret(setupToken, env.SETUP_TOKEN)) {
        return json({ error: "초기 설정을 사용할 수 없습니다." }, 404);
      }
      if (!validLoginId(loginId) || !validPassword(password)) {
        return json({ error: "ID는 영문·숫자·.-_ 3~64자, 비밀번호는 10~256자여야 합니다." }, 400);
      }

      const accountId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO accounts (id, login_id, password_hash, role, must_change_password)
        VALUES (?, ?, ?, 'master', 0)
      `).bind(accountId, loginId, await hashPassword(password)).run();
      await audit(env, accountId, "account.bootstrap", "account", null, { loginId, role: "master" });
      const session = await createSession(env, accountId);
      return json({ data: { id: accountId, loginId, role: "master" } }, 201, { "Set-Cookie": sessionCookie(request, session) });
    }

    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readJson(request);
      const loginId = String(body?.loginId || "").trim();
      const password = body?.password;
      const account = await env.DB.prepare(`
        SELECT id, login_id, password_hash, role, student_id, must_change_password
        FROM accounts
        WHERE login_id = ? AND is_active = 1
      `).bind(loginId).first();

      if (!account || !await verifyPassword(password, account.password_hash)) {
        await audit(env, null, "auth.login_failed", "account", null, { loginId });
        return json({ error: "ID 또는 비밀번호가 올바르지 않습니다." }, 401);
      }
      await audit(env, account.id, "auth.login");
      const session = await createSession(env, account.id);
      return json({ data: { id: account.id, loginId: account.login_id, role: account.role, mustChangePassword: Boolean(account.must_change_password) } }, 200, { "Set-Cookie": sessionCookie(request, session) });
    }

    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      const account = await currentAccount(request, env);
      const token = parseCookies(request).classkeys_session;
      if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
      if (account) await audit(env, account.id, "auth.logout");
      return json({ data: { loggedOut: true } }, 200, { "Set-Cookie": sessionCookie(request, "", 0) });
    }

    if (request.method === "GET" && url.pathname === "/api/auth/me") {
      const account = await currentAccount(request, env);
      if (!account) return json({ data: null });
      return json({
        data: {
          id: account.id,
          loginId: account.login_id,
          role: account.role,
          displayName: account.display_name,
          canManageCredentials: await canManageCredentials(env, account),
          canViewCredentials: canViewCredentials(account),
          mustChangePassword: Boolean(account.must_change_password),
          student: account.student_id ? {
            id: account.student_id,
            name: account.student_name,
            studentNumber: account.student_number,
            className: account.class_name,
          } : null,
        },
      });
    }

    if (url.pathname === "/api/access-policy") {
      const auth = await requireRole(request, env, ["master"]);
      if (auth.error) return auth.error;
      const allowAdminCredentialManagement = await adminCredentialManagementEnabled(env);
      if (request.method === "GET") return json({ data: { allowAdminCredentialManagement } });
      if (request.method === "PUT") {
        const body = await readJson(request);
        if (typeof body?.allowAdminCredentialManagement !== "boolean") {
          return json({ error: "관리자 전체 키 관리 허용 여부를 선택하세요." }, 400);
        }
        await env.DB.prepare(`
          UPDATE app_settings SET value = ?, updated_at = CURRENT_TIMESTAMP
          WHERE key = 'allow_admin_credential_management'
        `).bind(String(body.allowAdminCredentialManagement)).run();
        await audit(env, auth.account.id, "access_policy.update", "workspace", null, {
          before: { allowAdminCredentialManagement },
          after: { allowAdminCredentialManagement: body.allowAdminCredentialManagement },
        });
        return json({ data: { allowAdminCredentialManagement: body.allowAdminCredentialManagement } });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/auth/password") {
      const account = await currentAccount(request, env);
      if (!account) return json({ error: "로그인이 필요합니다." }, 401);
      const body = await readJson(request);
      const currentPassword = body?.currentPassword;
      const newPassword = body?.newPassword;
      if (!validPassword(newPassword)) return json({ error: "새 비밀번호는 10~256자여야 합니다." }, 400);
      const credential = await env.DB.prepare("SELECT password_hash FROM accounts WHERE id = ?").bind(account.id).first();
      if (!credential || !await verifyPassword(currentPassword, credential.password_hash)) {
        return json({ error: "현재 비밀번호가 올바르지 않습니다." }, 401);
      }
      await env.DB.prepare(`
        UPDATE accounts SET password_hash = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(await hashPassword(newPassword), account.id).run();
      await audit(env, account.id, "auth.password_change");
      return json({ data: { changed: true } });
    }

    if (request.method === "GET" && url.pathname === "/api/accounts") {
      const auth = await requireRole(request, env, ["admin", "master"]);
      if (auth.error) return auth.error;
      const { results } = await env.DB.prepare(`
        SELECT accounts.id, accounts.login_id, accounts.role, accounts.student_id, accounts.display_name, accounts.memo,
               accounts.is_active, accounts.must_change_password, accounts.created_at,
               COALESCE(NULLIF(accounts.display_name, ''), students.name, accounts.login_id) AS owner_name,
               students.student_number,
               (SELECT MAX(created_at) FROM audit_events
                WHERE actor_account_id = accounts.id AND action = 'auth.login') AS last_login_at
        FROM accounts
        LEFT JOIN students ON students.id = accounts.student_id
        ORDER BY CASE accounts.role WHEN 'master' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, owner_name
      `).all();
      return json({ data: results.map((account) => ({
        id: account.id, loginId: account.login_id, role: account.role, studentId: account.student_id,
        displayName: account.display_name, ownerName: account.owner_name, memo: account.memo, studentNumber: account.student_number,
        isActive: Boolean(account.is_active), mustChangePassword: Boolean(account.must_change_password),
        createdAt: account.created_at, lastLoginAt: account.last_login_at,
      })) });
    }

    if (request.method === "POST" && url.pathname === "/api/accounts") {
      const auth = await requireRole(request, env, ["master"]);
      if (auth.error) return auth.error;
      const body = await readJson(request);
      try {
        const role = body?.role === "student" ? "student" : body?.role === "admin" ? "admin" : null;
        if (!role) throw new Error("생성할 계정 역할을 선택하세요.");
        let loginId; let studentId = null; let displayName;
        const memo = optionalText(body?.memo, "메모");
        if (role === "student") {
          studentId = integerId(body?.studentId, "학생");
          const student = await env.DB.prepare("SELECT name, student_number, is_active FROM students WHERE id = ?").bind(studentId).first();
          if (!student || !student.is_active) throw new Error("활성 학생을 찾을 수 없습니다.");
          loginId = student.student_number; displayName = student.name;
        } else {
          loginId = requiredText(body?.loginId, "학번 ID", 64);
          displayName = requiredText(body?.displayName, "이름");
        }
        if (!validLoginId(loginId)) throw new Error("학번 ID는 영문·숫자·.-_ 3~64자여야 합니다.");
        const accountId = crypto.randomUUID();
        const passwordHash = await hashPassword(DEFAULT_INITIAL_PASSWORD);
        if (role === "admin") {
          const next = await env.DB.prepare("SELECT COALESCE(MAX(id), 0) + 1 AS id, COALESCE(MAX(roster_number), 0) + 1 AS roster_number FROM students").first();
          studentId = Number(next.id);
          await env.DB.batch([
            env.DB.prepare("INSERT INTO students (id, roster_number, student_number, name, class_name, advisor_name, owner_type) VALUES (?, ?, ?, ?, '', '', 'admin')").bind(studentId, Number(next.roster_number), loginId, displayName),
            env.DB.prepare(`INSERT INTO accounts (id, login_id, password_hash, role, student_id, display_name, memo, must_change_password)
              VALUES (?, ?, ?, ?, ?, ?, ?, 1)`).bind(accountId, loginId, passwordHash, role, studentId, displayName, memo),
          ]);
        } else {
          await env.DB.prepare(`INSERT INTO accounts (id, login_id, password_hash, role, student_id, display_name, memo, must_change_password)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)`).bind(accountId, loginId, passwordHash, role, studentId, displayName, memo).run();
        }
        await audit(env, auth.account.id, "account.create", "account", accountId, { loginId, role, studentId, displayName, memo });
        return json({ data: { id: accountId, loginId, role, studentId, displayName, memo, mustChangePassword: true } }, 201);
      } catch (error) {
        return json({ error: error instanceof Error && error.message.includes("UNIQUE") ? "이미 등록된 학번 또는 학생입니다." : error instanceof Error ? error.message : "계정 생성에 실패했습니다." }, 400);
      }
    }

    const accountEditMatch = url.pathname.match(/^\/api\/accounts\/([\w-]+)$/);
    if (accountEditMatch && request.method === "PATCH") {
      const auth = await requireRole(request, env, ["master"]);
      if (auth.error) return auth.error;
      const body = await readJson(request);
      try {
        const accountId = accountEditMatch[1];
        const account = await env.DB.prepare("SELECT id, student_id, display_name, memo FROM accounts WHERE id = ?").bind(accountId).first();
        if (!account) return json({ error: "계정을 찾을 수 없습니다." }, 404);
        const displayName = requiredText(body?.displayName, "계정 소유자");
        const memo = optionalText(body?.memo, "메모");
        await env.DB.batch([
          env.DB.prepare("UPDATE accounts SET display_name = ?, memo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(displayName, memo, accountId),
          ...(account.student_id ? [env.DB.prepare("UPDATE students SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(displayName, account.student_id)] : []),
        ]);
        await audit(env, auth.account.id, "account.update", "account", accountId, { before: { displayName: account.display_name, memo: account.memo }, after: { displayName, memo } });
        return json({ data: { id: accountId, displayName, memo } });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "계정 정보를 수정하지 못했습니다." }, 400);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/accounts/students/bulk") {
      const auth = await requireRole(request, env, ["master"]);
      if (auth.error) return auth.error;
      const { results: conflicts } = await env.DB.prepare(`
        SELECT students.id, students.name, students.student_number
        FROM students
        WHERE students.is_active = 1
          AND NOT EXISTS (SELECT 1 FROM accounts WHERE accounts.student_id = students.id)
          AND EXISTS (SELECT 1 FROM accounts WHERE accounts.login_id = students.student_number)
        ORDER BY students.roster_number
      `).all();
      const { results: students } = await env.DB.prepare(`
        SELECT students.id, students.name, students.student_number
        FROM students
        WHERE students.is_active = 1
          AND NOT EXISTS (SELECT 1 FROM accounts WHERE accounts.student_id = students.id)
          AND NOT EXISTS (SELECT 1 FROM accounts WHERE accounts.login_id = students.student_number)
        ORDER BY students.roster_number
      `).all();
      try {
        const accounts = [];
        for (const student of students) accounts.push({ id: crypto.randomUUID(), student, passwordHash: await hashPassword(DEFAULT_INITIAL_PASSWORD) });
        const statements = accounts.flatMap(({ id, student, passwordHash }) => [
          env.DB.prepare(`INSERT INTO accounts (id, login_id, password_hash, role, student_id, display_name, must_change_password)
            VALUES (?, ?, ?, 'student', ?, ?, 1)`).bind(id, student.student_number, passwordHash, student.id, student.name),
          env.DB.prepare(`INSERT INTO audit_events (id, actor_account_id, action, subject_type, subject_id, metadata_json)
            VALUES (?, ?, 'account.create_bulk', 'account', ?, ?)`)
            .bind(crypto.randomUUID(), auth.account.id, id, JSON.stringify({ loginId: student.student_number, role: "student", studentId: student.id })),
        ]);
        if (statements.length) await env.DB.batch(statements);
        return json({ data: { created: accounts.length, conflicts } }, 201);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "학생 계정 일괄 생성에 실패했습니다." }, 400);
      }
    }

    const accountMatch = url.pathname.match(/^\/api\/accounts\/([\w-]+)\/(reset-password|status)$/);
    if (accountMatch && request.method === "POST") {
      const auth = await requireRole(request, env, ["admin", "master"]);
      if (auth.error) return auth.error;
      const accountId = accountMatch[1]; const action = accountMatch[2]; const body = await readJson(request);
      try {
        const account = await env.DB.prepare("SELECT id, login_id, role, is_active FROM accounts WHERE id = ?").bind(accountId).first();
        if (!account) return json({ error: "계정을 찾을 수 없습니다." }, 404);
        if (action === "reset-password") {
          if (auth.account.role !== "master" && account.role === "master") return json({ error: "Master 계정의 비밀번호는 초기화할 수 없습니다." }, 403);
          await env.DB.batch([
            env.DB.prepare("UPDATE accounts SET password_hash = ?, must_change_password = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(await hashPassword(DEFAULT_INITIAL_PASSWORD), accountId),
            env.DB.prepare("DELETE FROM sessions WHERE account_id = ?").bind(accountId),
          ]);
          await audit(env, auth.account.id, "account.password_reset", "account", accountId, { loginId: account.login_id });
          return json({ data: { reset: true } });
        }
        if (auth.account.role !== "master") return json({ error: "계정 상태 변경은 Master만 할 수 있습니다." }, 403);
        const isActive = optionalBoolean(body?.isActive, "상태");
        if (account.role === "master" && !isActive) return json({ error: "Master 계정은 비활성화할 수 없습니다." }, 409);
        await env.DB.batch([
          env.DB.prepare("UPDATE accounts SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(isActive, accountId),
          ...(isActive ? [] : [env.DB.prepare("DELETE FROM sessions WHERE account_id = ?").bind(accountId)]),
        ]);
        await audit(env, auth.account.id, "account.status_update", "account", accountId, { loginId: account.login_id, isActive: Boolean(isActive) });
        return json({ data: { isActive: Boolean(isActive) } });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "계정 변경에 실패했습니다." }, 400);
      }
    }

    if (request.method === "GET" && url.pathname === "/api/students") {
      const auth = await requireRole(request, env, ["admin", "master"]);
      if (auth.error) return auth.error;
      const { results } = await env.DB.prepare(`
        SELECT students.id, students.roster_number, students.student_number, students.name, students.class_name,
               students.advisor_name, students.owner_type, students.is_active, teams.id AS team_id, teams.name AS team_name
        FROM students
        LEFT JOIN team_memberships ON students.owner_type = 'student' AND team_memberships.student_id = students.id AND team_memberships.ended_at IS NULL
        LEFT JOIN teams ON teams.id = team_memberships.team_id
        ORDER BY students.roster_number
      `).all();
      return json({ data: results });
    }

    if (request.method === "GET" && url.pathname === "/api/teams") {
      const auth = await requireRole(request, env, ["admin", "master"]);
      if (auth.error) return auth.error;
      const { results } = await env.DB.prepare(`
        SELECT teams.id, teams.name, teams.class_name, teams.advisor_name, teams.is_active,
               COUNT(team_memberships.id) AS member_count
        FROM teams
        LEFT JOIN team_memberships ON team_memberships.team_id = teams.id AND team_memberships.ended_at IS NULL
        GROUP BY teams.id
        ORDER BY teams.class_name, teams.name
      `).all();
      return json({ data: results });
    }

    if (request.method === "POST" && url.pathname === "/api/students") {
      const auth = await requireRole(request, env, ["admin", "master"]);
      if (auth.error) return auth.error;
      const body = await readJson(request);
      try {
        const rosterNumber = integerId(body?.rosterNumber, "연번");
        const studentNumber = requiredText(body?.studentNumber, "학번", 32);
        if (!validLoginId(studentNumber)) throw new Error("학번은 Login ID 형식(영문·숫자·.-_ 3~64자)이어야 합니다.");
        const name = requiredText(body?.name, "이름");
        const className = requiredText(body?.className, "반", 32);
        const advisorName = requiredText(body?.advisorName, "지도교수");
        const existingAccount = await env.DB.prepare("SELECT 1 FROM accounts WHERE login_id = ?").bind(studentNumber).first();
        if (existingAccount) throw new Error("동일한 Login ID를 사용하는 계정이 이미 있습니다.");
        const result = await env.DB.prepare(`
          INSERT INTO students (roster_number, student_number, name, class_name, advisor_name)
          VALUES (?, ?, ?, ?, ?)
        `).bind(rosterNumber, studentNumber, name, className, advisorName).run();
        const studentId = Number(result.meta.last_row_id);
        const accountId = crypto.randomUUID();
        await env.DB.batch([
          env.DB.prepare(`INSERT INTO accounts (id, login_id, password_hash, role, student_id, display_name, memo, must_change_password)
            VALUES (?, ?, ?, 'student', ?, ?, '', 1)`).bind(accountId, studentNumber, await hashPassword(DEFAULT_INITIAL_PASSWORD), studentId, name),
          env.DB.prepare(`INSERT INTO audit_events (id, actor_account_id, action, subject_type, subject_id, metadata_json)
            VALUES (?, ?, 'student.create', 'student', ?, ?)`)
            .bind(crypto.randomUUID(), auth.account.id, studentId, JSON.stringify({ studentNumber, name, accountId })),
          env.DB.prepare(`INSERT INTO audit_events (id, actor_account_id, action, subject_type, subject_id, metadata_json)
            VALUES (?, ?, 'account.create_auto', 'account', ?, ?)`)
            .bind(crypto.randomUUID(), auth.account.id, accountId, JSON.stringify({ loginId: studentNumber, role: "student", studentId, displayName: name })),
        ]);
        return json({ data: { id: studentId, rosterNumber, studentNumber, name, className, advisorName } }, 201);
      } catch (error) {
        return json({ error: error.message.includes("UNIQUE") ? "연번 또는 학번이 이미 존재합니다." : error.message }, 400);
      }
    }

    const studentQuotaMatch = url.pathname.match(/^\/api\/students\/(\d+)\/quota$/);
    if (studentQuotaMatch) {
      const auth = await requireRole(request, env, ["admin", "master"]);
      if (auth.error) return auth.error;
      const studentId = Number(studentQuotaMatch[1]);
      try {
        const student = await env.DB.prepare("SELECT id, name, student_number FROM students WHERE id = ?").bind(studentId).first();
        if (!student) return json({ error: "학생을 찾을 수 없습니다." }, 404);
        if (request.method === "GET") return json({ data: await studentQuota(env, studentId) });
        if (request.method === "PUT") {
          const body = await readJson(request);
          const limitUsd = keyLimit(body?.limitUsd);
          const period = keyLimitReset(body?.period);
          const before = await studentQuotaPolicy(env, studentId);
          const usage = await openRouterKeyUsage(env, true);
          await revokeActivePersonalCredentials(env, studentId, usage);
          await env.DB.batch([
            env.DB.prepare("DELETE FROM quota_policies WHERE subject_type = 'student' AND subject_id = ?").bind(studentId),
            env.DB.prepare(`
              INSERT INTO quota_policies (id, subject_type, subject_id, period, limit_microusd)
              VALUES (?, 'student', ?, ?, ?)
            `).bind(crypto.randomUUID(), studentId, period, Math.round(limitUsd * 1000000)),
          ]);
          const data = await studentQuota(env, studentId, usage);
          await audit(env, auth.account.id, "quota.update", "student", studentId, {
            before: before ? { limitUsd: Number(before.limit_microusd) / 1000000, period: before.period } : null,
            after: { limitUsd, period },
            activeKeysRevoked: true,
          });
          return json({ data });
        }
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "개인 한도 정책을 변경하지 못했습니다." }, 400);
      }
    }

    const studentMatch = url.pathname.match(/^\/api\/students\/(\d+)$/);
    const hardDeleteStudentMatch = url.pathname.match(/^\/api\/students\/(\d+)\/hard-delete$/);
    if (hardDeleteStudentMatch && request.method === "POST") {
      const auth = await requireRole(request, env, ["master"]);
      if (auth.error) return auth.error;
      const studentId = Number(hardDeleteStudentMatch[1]);
      const body = await readJson(request);
      try {
        const student = await env.DB.prepare("SELECT id, name FROM students WHERE id = ?").bind(studentId).first();
        if (!student) return json({ error: "학생을 찾을 수 없습니다." }, 404);
        if (String(body?.confirmName || "").trim() !== student.name) return json({ error: "학생 이름이 일치하지 않습니다." }, 400);
        const { results: credentials } = await env.DB.prepare("SELECT * FROM api_credentials WHERE subject_type = 'student' AND subject_id = ? AND status = 'active'").bind(studentId).all();
        for (const credential of credentials) {
          if (credential.provider !== "openrouter") return json({ error: "지원되지 않는 upstream 키가 있어 완전 삭제할 수 없습니다." }, 409);
          await openRouter(env, `/keys/${credential.upstream_key_ref}`, { method: "PATCH", body: JSON.stringify({ disabled: true }) });
        }
        await env.DB.batch([
          env.DB.prepare("DELETE FROM sessions WHERE account_id IN (SELECT id FROM accounts WHERE student_id = ?)").bind(studentId),
          env.DB.prepare("DELETE FROM audit_events WHERE subject_type = 'student' AND subject_id = ?").bind(studentId),
          env.DB.prepare("UPDATE audit_events SET actor_account_id = NULL WHERE actor_account_id IN (SELECT id FROM accounts WHERE student_id = ?)").bind(studentId),
          env.DB.prepare("DELETE FROM key_usage_snapshots WHERE credential_id IN (SELECT id FROM api_credentials WHERE subject_type = 'student' AND subject_id = ?)").bind(studentId),
          env.DB.prepare("DELETE FROM api_credentials WHERE subject_type = 'student' AND subject_id = ?").bind(studentId),
          env.DB.prepare("DELETE FROM usage_daily WHERE subject_type = 'student' AND subject_id = ?").bind(studentId),
          env.DB.prepare("DELETE FROM quota_policies WHERE subject_type = 'student' AND subject_id = ?").bind(studentId),
          env.DB.prepare("DELETE FROM team_memberships WHERE student_id = ?").bind(studentId),
          env.DB.prepare("DELETE FROM accounts WHERE student_id = ?").bind(studentId),
          env.DB.prepare("DELETE FROM students WHERE id = ?").bind(studentId),
        ]);
        await audit(env, auth.account.id, "student.hard_delete", "deleted_student", null, { hardDeleted: true });
        return json({ data: { deleted: true } });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "학생 완전 삭제에 실패했습니다." }, 400);
      }
    }
    if (studentMatch && request.method === "PATCH") {
      const auth = await requireRole(request, env, ["admin", "master"]);
      if (auth.error) return auth.error;
      const studentId = Number(studentMatch[1]);
      const body = await readJson(request);
      try {
        const existing = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(studentId).first();
        if (!existing) return json({ error: "학생을 찾을 수 없습니다." }, 404);
        const rosterNumber = body?.rosterNumber === undefined ? existing.roster_number : integerId(body.rosterNumber, "연번");
        const studentNumber = body?.studentNumber === undefined ? existing.student_number : requiredText(body.studentNumber, "학번", 32);
        const name = body?.name === undefined ? existing.name : requiredText(body.name, "이름");
        const className = body?.className === undefined ? existing.class_name : requiredText(body.className, "반", 32);
        const advisorName = body?.advisorName === undefined ? existing.advisor_name : requiredText(body.advisorName, "지도교수");
        const isActive = body?.isActive === undefined ? existing.is_active : optionalBoolean(body.isActive, "상태");
        if (!validLoginId(studentNumber)) throw new Error("학번은 Login ID 형식(영문·숫자·.-_ 3~64자)이어야 합니다.");
        if (studentNumber !== existing.student_number) {
          const conflict = await env.DB.prepare("SELECT 1 FROM accounts WHERE login_id = ? AND student_id != ?").bind(studentNumber, studentId).first();
          if (conflict) throw new Error("동일한 Login ID를 사용하는 계정이 이미 있습니다.");
        }
        if (className !== existing.class_name || advisorName !== existing.advisor_name) {
          const membership = await env.DB.prepare("SELECT 1 FROM team_memberships WHERE student_id = ? AND ended_at IS NULL").bind(studentId).first();
          if (membership) return json({ error: "편성된 학생의 반·지도교수 변경 전에는 조원 편성을 해제해야 합니다." }, 409);
        }
        await env.DB.batch([
          env.DB.prepare(`
            UPDATE students
            SET roster_number = ?, student_number = ?, name = ?, class_name = ?, advisor_name = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(rosterNumber, studentNumber, name, className, advisorName, isActive, studentId),
          ...(studentNumber === existing.student_number ? [] : [env.DB.prepare("UPDATE accounts SET login_id = ?, updated_at = CURRENT_TIMESTAMP WHERE student_id = ?").bind(studentNumber, studentId)]),
        ]);
        if (!isActive) {
          await env.DB.prepare("UPDATE team_memberships SET ended_at = CURRENT_TIMESTAMP WHERE student_id = ? AND ended_at IS NULL").bind(studentId).run();
          await env.DB.prepare("UPDATE accounts SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE student_id = ?").bind(studentId).run();
        }
        await audit(env, auth.account.id, isActive ? "student.update" : "student.deactivate", "student", studentId, {
          before: { rosterNumber: existing.roster_number, studentNumber: existing.student_number, name: existing.name, className: existing.class_name, advisorName: existing.advisor_name, isActive: Boolean(existing.is_active) },
          after: { rosterNumber, studentNumber, name, className, advisorName, isActive: Boolean(isActive) },
        });
        return json({ data: { id: studentId, rosterNumber, studentNumber, name, className, advisorName, isActive: Boolean(isActive) } });
      } catch (error) {
        return json({ error: error.message.includes("UNIQUE") ? "연번 또는 학번이 이미 존재합니다." : error.message }, 400);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/teams") {
      const auth = await requireRole(request, env, ["admin", "master"]);
      if (auth.error) return auth.error;
      const body = await readJson(request);
      try {
        const name = requiredText(body?.name, "조 이름");
        const className = requiredText(body?.className, "반", 32);
        const advisorName = requiredText(body?.advisorName, "지도교수");
        const result = await env.DB.prepare(`
          INSERT INTO teams (name, class_name, advisor_name) VALUES (?, ?, ?)
        `).bind(name, className, advisorName).run();
        const teamId = Number(result.meta.last_row_id);
        await audit(env, auth.account.id, "team.create", "team", teamId, { name, className, advisorName });
        return json({ data: { id: teamId, name, className, advisorName, isActive: true } }, 201);
      } catch (error) {
        return json({ error: error.message.includes("UNIQUE") ? "같은 반·지도교수 조합에 같은 조 이름이 이미 있습니다." : error.message }, 400);
      }
    }

    const teamMatch = url.pathname.match(/^\/api\/teams\/(\d+)$/);
    if (teamMatch && request.method === "GET") {
      const auth = await requireRole(request, env, ["admin", "master"]);
      if (auth.error) return auth.error;
      const teamId = Number(teamMatch[1]);
      const team = await env.DB.prepare(`
        SELECT id, name, class_name, advisor_name, is_active FROM teams WHERE id = ?
      `).bind(teamId).first();
      if (!team) return json({ error: "조를 찾을 수 없습니다." }, 404);
      const { results: members } = await env.DB.prepare(`
        SELECT students.id, students.roster_number, students.student_number, students.name, students.is_active
        FROM team_memberships
        JOIN students ON students.id = team_memberships.student_id
        WHERE team_memberships.team_id = ? AND team_memberships.ended_at IS NULL AND students.owner_type = 'student'
        ORDER BY students.roster_number
      `).bind(teamId).all();
      return json({ data: { ...team, members } });
    }
    if (teamMatch && request.method === "PATCH") {
      const auth = await requireRole(request, env, ["admin", "master"]);
      if (auth.error) return auth.error;
      const teamId = Number(teamMatch[1]);
      const body = await readJson(request);
      try {
        const existing = await env.DB.prepare("SELECT * FROM teams WHERE id = ?").bind(teamId).first();
        if (!existing) return json({ error: "조를 찾을 수 없습니다." }, 404);
        const name = body?.name === undefined ? existing.name : requiredText(body.name, "조 이름");
        const className = body?.className === undefined ? existing.class_name : requiredText(body.className, "반", 32);
        const advisorName = body?.advisorName === undefined ? existing.advisor_name : requiredText(body.advisorName, "지도교수");
        const isActive = body?.isActive === undefined ? existing.is_active : optionalBoolean(body.isActive, "상태");
        if (className !== existing.class_name || advisorName !== existing.advisor_name) {
          const membership = await env.DB.prepare("SELECT 1 FROM team_memberships WHERE team_id = ? AND ended_at IS NULL").bind(teamId).first();
          if (membership) return json({ error: "조원이 있는 조의 반·지도교수 변경 전에는 조원 편성을 해제해야 합니다." }, 409);
        }
        await env.DB.prepare(`
          UPDATE teams
          SET name = ?, class_name = ?, advisor_name = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(name, className, advisorName, isActive, teamId).run();
        if (!isActive) {
          await env.DB.prepare("UPDATE team_memberships SET ended_at = CURRENT_TIMESTAMP WHERE team_id = ? AND ended_at IS NULL").bind(teamId).run();
        }
        await audit(env, auth.account.id, isActive ? "team.update" : "team.deactivate", "team", teamId, {
          before: { name: existing.name, className: existing.class_name, advisorName: existing.advisor_name, isActive: Boolean(existing.is_active) },
          after: { name, className, advisorName, isActive: Boolean(isActive) },
        });
        return json({ data: { id: teamId, name, className, advisorName, isActive: Boolean(isActive) } });
      } catch (error) {
        return json({ error: error.message.includes("UNIQUE") ? "같은 반·지도교수 조합에 같은 조 이름이 이미 있습니다." : error.message }, 400);
      }
    }

    const teamMemberMatch = url.pathname.match(/^\/api\/teams\/(\d+)\/members\/(\d+)$/);
    if (teamMemberMatch && request.method === "DELETE") {
      const auth = await requireRole(request, env, ["admin", "master"]);
      if (auth.error) return auth.error;
      const teamId = Number(teamMemberMatch[1]);
      const studentId = Number(teamMemberMatch[2]);
      const result = await env.DB.prepare(`
        UPDATE team_memberships SET ended_at = CURRENT_TIMESTAMP
        WHERE team_id = ? AND student_id = ? AND ended_at IS NULL
      `).bind(teamId, studentId).run();
      if (!result.meta.changes) return json({ error: "활성 조원 편성을 찾을 수 없습니다." }, 404);
      await audit(env, auth.account.id, "team_member.remove", "team", teamId, { studentId });
      return json({ data: { teamId, studentId, removed: true } });
    }

    const teamMembersMatch = url.pathname.match(/^\/api\/teams\/(\d+)\/members$/);
    if (teamMembersMatch && request.method === "POST") {
      const auth = await requireRole(request, env, ["admin", "master"]);
      if (auth.error) return auth.error;
      const teamId = Number(teamMembersMatch[1]);
      const body = await readJson(request);
      try {
        const studentId = integerId(body?.studentId, "학생");
        const [student, team] = await env.DB.batch([
          env.DB.prepare("SELECT id, class_name, advisor_name, owner_type, is_active FROM students WHERE id = ?").bind(studentId),
          env.DB.prepare("SELECT id, class_name, advisor_name, is_active FROM teams WHERE id = ?").bind(teamId),
        ]);
        if (!student.results[0] || !team.results[0]) return json({ error: "학생 또는 조를 찾을 수 없습니다." }, 404);
        const activeStudent = student.results[0];
        const activeTeam = team.results[0];
        if (!activeStudent.is_active || !activeTeam.is_active) return json({ error: "비활성 학생 또는 조에는 편성할 수 없습니다." }, 409);
        if (activeStudent.owner_type !== "student") return json({ error: "관리자는 조에 편성할 수 없습니다." }, 400);
        if (activeStudent.class_name !== activeTeam.class_name || activeStudent.advisor_name !== activeTeam.advisor_name) {
          return json({ error: "학생과 같은 반·지도교수의 조에만 편성할 수 있습니다." }, 400);
        }
        await env.DB.batch([
          env.DB.prepare("UPDATE team_memberships SET ended_at = CURRENT_TIMESTAMP WHERE student_id = ? AND ended_at IS NULL").bind(studentId),
          env.DB.prepare("INSERT INTO team_memberships (student_id, team_id) VALUES (?, ?)").bind(studentId, teamId),
        ]);
        await audit(env, auth.account.id, "team_member.assign", "team", teamId, { studentId });
        return json({ data: { teamId, studentId, assigned: true } }, 201);
      } catch (error) {
        return json({ error: error.message }, 400);
      }
    }

    if (request.method === "GET" && url.pathname === "/api/credentials") {
      const auth = await requireCredentialViewer(request, env);
      if (auth.error) return auth.error;
      if (auth.account.role === "master") await normalizeInitialPersonalKeyLabels(env, auth.account.id);
      return json({ data: await listCredentials(env) });
    }

    if (request.method === "GET" && url.pathname === "/api/credentials/mine") {
      const account = await currentAccount(request, env);
      if (!account) return json({ error: "로그인이 필요합니다." }, 401);
      if (account.must_change_password) return json({ error: "초기 비밀번호를 먼저 변경해야 합니다." }, 403);
      if (account.role === "master" || !account.student_id) return json({ data: [] });
      const credentials = await env.DB.prepare(`
        SELECT DISTINCT api_credentials.*,
          CASE api_credentials.subject_type
            WHEN 'student' THEN students.name || ' · ' || students.student_number
            WHEN 'team' THEN teams.name || ' · ' || teams.class_name || '반'
          END AS subject_name
        FROM api_credentials
        LEFT JOIN students ON api_credentials.subject_type = 'student' AND students.id = api_credentials.subject_id
        LEFT JOIN teams ON api_credentials.subject_type = 'team' AND teams.id = api_credentials.subject_id
        LEFT JOIN team_memberships ON api_credentials.subject_type = 'team'
          AND team_memberships.team_id = api_credentials.subject_id
          AND team_memberships.ended_at IS NULL
        WHERE (api_credentials.subject_type = 'student' AND api_credentials.subject_id = ?)
          OR (api_credentials.subject_type = 'team' AND team_memberships.student_id = ? AND ? = 'student')
        ORDER BY api_credentials.created_at DESC
      `).bind(account.student_id, account.student_id, account.role).all();
      const usage = await openRouterKeyUsage(env);
      const snapshots = await latestCredentialSnapshots(env, credentials.results.map((credential) => credential.id));
      const data = await Promise.all(credentials.results
        .filter((credential) => credential.encrypted_key)
        .map(async (credential) => {
          const key = await decryptCredentialKey(env, credential.encrypted_key);
          return { ...credentialRecord(credential, usage.get(credential.upstream_key_ref), snapshots.get(credential.id)), keyPreview: key.length > 16 ? `${key.slice(0, 10)}…${key.slice(-4)}` : key };
        }));
      let modelPolicy = null;
      try { modelPolicy = await workspaceModelPolicy(env); } catch {}
      let availableModels = [];
      let modelPricing = {};
      try { if (modelPolicy) ({ models: availableModels, pricing: modelPricing } = await workspaceAllowedModels(env, modelPolicy)); } catch {}
      return json({ data, personalQuota: await studentQuota(env, account.student_id, usage), modelPolicy, availableModels, modelPricing });
    }

    if (request.method === "POST" && url.pathname === "/api/credentials") {
      const auth = await requireCredentialManager(request, env);
      if (auth.error) return auth.error;
      const body = await readJson(request);
      try {
        const subjectType = body?.subjectType;
        const subjectId = integerId(body?.subjectId, "키 대상");
        const issued = await issueCredential(env, {
          subjectType,
          subjectId,
          label: body?.label,
          limitUsd: body?.limitUsd,
          limitReset: body?.limitReset,
        });
        await audit(env, auth.account.id, "credential.issue", subjectType, subjectId, { credentialId: issued.id, keyLabel: issued.record.keyLabel, limitUsd: issued.record.limitUsd, limitReset: issued.record.limitReset });
        return json({ data: issued }, 201);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "키 발급에 실패했습니다." }, 400);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/credentials/bulk") {
      const auth = await requireCredentialManager(request, env);
      if (auth.error) return auth.error;
      const body = await readJson(request);
      try {
        const subjectType = body?.subjectType === "team" ? "team" : "student";
        const rawIds = body?.subjectIds ?? (subjectType === "student" ? body?.studentIds : []);
        const subjectIds = Array.isArray(rawIds) ? [...new Set(rawIds.map((id) => integerId(id, subjectType === "student" ? "학생" : "조")))] : [];
        if (!subjectIds.length || subjectIds.length > 100) throw new Error("일괄 발급 대상은 1~100개여야 합니다.");
        const limitUsd = keyLimit(body?.limitUsd);
        const limitReset = keyLimitReset(body?.limitReset);
        const labelPrefix = String(body?.labelPrefix || "").trim();
        if (labelPrefix.length > 60) throw new Error("키 이름 접두어는 60자 이하여야 합니다.");
        const results = [];
        for (const subjectId of subjectIds) {
          try {
            const target = subjectType === "student"
              ? await env.DB.prepare("SELECT name, student_number FROM students WHERE id = ?").bind(subjectId).first()
              : await env.DB.prepare("SELECT name, class_name FROM teams WHERE id = ?").bind(subjectId).first();
            const targetName = subjectType === "student" ? `${target?.name || ""} · ${target?.student_number || ""}` : `${target?.name || ""} · ${target?.class_name || ""}반`;
            const issued = await issueCredential(env, {
              subjectType,
              subjectId,
            label: labelPrefix && target ? `${labelPrefix} - ${subjectType === "student" ? target.student_number : `Team-${subjectId}`}` : "",
              limitUsd,
              limitReset,
              rotateExisting: subjectType !== "student",
            });
            results.push({ subjectType, subjectId, subjectName: targetName, status: "issued", key: issued.key, credentialId: issued.id });
            await audit(env, auth.account.id, "credential.issue_bulk", subjectType, subjectId, { credentialId: issued.id, keyLabel: issued.record.keyLabel });
          } catch (error) {
            results.push({ subjectType, subjectId, status: "skipped", error: error instanceof Error ? error.message : "발급에 실패했습니다." });
          }
        }
        return json({ data: results }, 201);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "일괄 발급에 실패했습니다." }, 400);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/credentials/revoke") {
      const auth = await requireCredentialManager(request, env);
      if (auth.error) return auth.error;
      const body = await readJson(request);
      try {
        const credentialIds = Array.isArray(body?.credentialIds) ? [...new Set(body.credentialIds.map((id) => requiredText(id, "키 ID", 64)))] : [];
        if (!credentialIds.length || credentialIds.length > 100) throw new Error("폐기할 키는 1~100개여야 합니다.");
        const results = [];
        for (const credentialId of credentialIds) {
          try {
            const credential = await findCredential(env, credentialId);
            await revokeCredential(env, credential);
            await audit(env, auth.account.id, "credential.revoke_bulk", credential.subject_type, credential.subject_id, { credentialId });
            results.push({ credentialId, status: "revoked" });
          } catch (error) {
            results.push({ credentialId, status: "skipped", error: error instanceof Error ? error.message : "폐기에 실패했습니다." });
          }
        }
        return json({ data: results });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "일괄 폐기에 실패했습니다." }, 400);
      }
    }

    const credentialMatch = url.pathname.match(/^\/api\/credentials\/([\w-]+)\/(reveal|reissue|revoke)$/);
    if (credentialMatch) {
      const credentialId = credentialMatch[1];
      const action = credentialMatch[2];
      const account = await currentAccount(request, env);
      if (!account) return json({ error: "로그인이 필요합니다." }, 401);
      if (account.must_change_password) return json({ error: "초기 비밀번호를 먼저 변경해야 합니다." }, 403);
      try {
        const credential = await findCredential(env, credentialId);
        if (action === "reveal" && request.method === "GET") {
          if (!await canReadCredential(env, account, credential)) return json({ error: "권한이 없습니다." }, 403);
          if (!credential.encrypted_key) return json({ error: "이전 키는 평문 저장 없이 발급되어 재발급이 필요합니다." }, 409);
          await audit(env, account.id, "credential.reveal", credential.subject_type, credential.subject_id, { credentialId: credential.id });
          return json({ data: { id: credential.id, key: await decryptCredentialKey(env, credential.encrypted_key) } });
        }
        if (!await canManageCredentials(env, account)) return json({ error: "키 발급·조회·재발급·폐기는 관리자 또는 Master만 할 수 있습니다." }, 403);
        if (action === "revoke" && request.method === "POST") {
          await revokeCredential(env, credential);
          await audit(env, account.id, "credential.revoke", credential.subject_type, credential.subject_id, { credentialId: credential.id });
          return json({ data: { revoked: true } });
        }
        if (action === "reissue" && request.method === "POST") {
          if (credential.status !== "active") return json({ error: "활성 키만 재발급할 수 있습니다." }, 409);
          if (credential.provider !== "openrouter") return json({ error: "이 upstream의 키 재발급은 아직 지원되지 않습니다." }, 409);
          await revokeCredential(env, credential);
          const issued = await issueCredential(env, {
            subjectType: credential.subject_type,
            subjectId: credential.subject_id,
            label: /^[\x20-\x7E]+$/.test(credential.key_label) ? credential.key_label : "",
            limitUsd: Number(credential.limit_microusd) / 1000000,
            limitReset: credential.limit_reset,
          });
          await audit(env, account.id, "credential.reissue", credential.subject_type, credential.subject_id, {
            before: { credentialId: credential.id, keyLabel: credential.key_label, limitUsd: Number(credential.limit_microusd) / 1000000, limitReset: credential.limit_reset, status: credential.status },
            after: { credentialId: issued.id, keyLabel: issued.record.keyLabel, limitUsd: issued.record.limitUsd, limitReset: issued.record.limitReset, status: issued.record.status },
          });
          return json({ data: issued }, 201);
        }
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "키 작업에 실패했습니다." }, 400);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "API route not found" }, 404);
    }

    const assetUrl = new URL(request.url);
    if (request.method === "GET" && APP_PATHS.has(url.pathname)) assetUrl.pathname = "/";
    assetUrl.searchParams.set("__classkeys_asset", ASSET_VERSION);
    const asset = await env.ASSETS.fetch(new Request(assetUrl, request));
    const headers = new Headers(asset.headers);
    headers.set("Cache-Control", STATIC_ASSET_PATHS.has(url.pathname) && url.searchParams.get("v") === ASSET_VERSION ? "public, max-age=31536000, immutable" : "no-store");
    return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
  },
};
