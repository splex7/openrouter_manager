const $ = (s) => document.querySelector(s);
const state = { me: null, students: [], teams: [], credentials: [], dashboard: null, dataLoaded: false, accounts: [], audits: [], auditOffset: 0, view: "dashboard", activeStudent: null, activeStudentQuota: null, activeTeam: null, portalCredentials: [], portalQuota: null, modelPolicy: null, availableModels: [], modelPricing: {}, portalModelProvider: "", portalModelSearch: "", selectedPortalModel: "", accessPolicy: null, portalRevealSubjectType: null, portalLanguage: localStorage.getItem("student-portal-language") === "en" ? "en" : "ko", bulkResults: [], bulkSubjectType: "student", bulkCredentialBusy: false, selectedCredentialIds: new Set(), hardDeleteStudent: null };
const VIEW_PATHS = Object.freeze({ dashboard: "/dashboard", students: "/students", teams: "/teams", credentials: "/keys", modelPolicy: "/models", accessPolicy: "/access", audits: "/audits", accounts: "/accounts", personalKeys: "/my-keys" });
const esc = (v) => String(v ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[c]));
const MODEL_PROVIDERS = Object.freeze({
  "openai": ["OpenAI", "openai.com", "https://openrouter.ai/images/icons/OpenAI.svg"], "anthropic": ["Anthropic", "anthropic.com", "https://openrouter.ai/images/icons/Anthropic.svg"], "google": ["Google", "google.com"], "meta-llama": ["Meta", "meta.com"], "mistralai": ["Mistral AI", "mistral.ai"], "qwen": ["Qwen", "qwen.ai", "https://openrouter.ai/images/icons/Qwen.png"], "deepseek": ["DeepSeek", "deepseek.com"], "z-ai": ["Z.ai", "z.ai"], "zai": ["Z.ai", "z.ai"], "nex-agi": ["Nex AGI", "nex-agi.com", "https://nex-agi.com/favicon.svg"], "x-ai": ["xAI", "x.ai"], "cohere": ["Cohere", "cohere.com"], "perplexity": ["Perplexity", "perplexity.ai"], "moonshotai": ["Moonshot AI", "moonshot.cn"], "minimax": ["MiniMax", "minimaxi.com"], "nvidia": ["NVIDIA", "nvidia.com"], "microsoft": ["Microsoft", "microsoft.com"], "amazon": ["Amazon", "aws.amazon.com"], "ibm": ["IBM", "ibm.com"], "ibm-granite": ["IBM Granite", "ibm.com"], "groq": ["Groq", "groq.com"], "togethercomputer": ["Together AI", "together.ai"], "together": ["Together AI", "together.ai"], "fireworks-ai": ["Fireworks AI", "fireworks.ai"], "replicate": ["Replicate", "replicate.com"], "huggingface": ["Hugging Face", "huggingface.co"], "liquid": ["Liquid AI", "liquid.ai"], "arcee-ai": ["Arcee AI", "arcee.ai"], "allenai": ["Ai2", "allenai.org"], "nousresearch": ["Nous Research", "nousresearch.com"], "fish-audio": ["Fish Audio", "fish.audio", "https://fish.audio/favicon.ico"], "poolside": ["Poolside", "poolside.ai", "https://openrouter.ai/images/icons/poolside-logomark-solid-color.svg"], "thinkingmachines": ["Thinking Machines", "thinkingmachines.ai", "https://thinkingmachines.ai/images/favicon-32x32.png"]
});
function modelProvider(model) {
  const prefix = String(model || "").replace(/^~/, "").split("/")[0].toLowerCase();
  const [name, domain, iconUrl] = MODEL_PROVIDERS[prefix] || [prefix || "Unknown", ""];
  return { name, domain, iconUrl: iconUrl || (domain ? `https://${domain}/favicon.ico` : ""), initial: name.slice(0, 1).toUpperCase() || "?" };
}
function modelCard(model, compact = false) {
  const provider = modelProvider(model);
  const icon = provider.iconUrl ? `<img src="${esc(provider.iconUrl)}" alt="" loading="lazy">` : "";
  return `<span class="model-card${compact ? " compact" : ""}"><span class="model-logo" role="img" aria-label="${esc(provider.name)} 로고">${icon}<span>${esc(provider.initial)}</span></span><span class="model-card-copy"><strong>${esc(provider.name)}</strong><code>${esc(model)}</code></span></span>`;
}
const money = (v) => v === null || v === undefined || !Number.isFinite(Number(v)) ? "—" : `$${Number(v).toFixed(2)}`;
const resetLabel = (reset) => reset === "daily" ? "일별" : reset === "weekly" ? "주별" : "월별";
const resetTooltip = (reset) => reset === "daily" ? "KST 09:00~익일 08:59" : reset === "weekly" ? "월요일 09:00~다음 월요일 08:59 (KST)" : "매월 1일 09:00~다음 달 1일 08:59 (KST)";
function periodUsage(credential) { return credential.limitReset === "daily" ? credential.usageDailyUsd : credential.limitReset === "weekly" ? credential.usageWeeklyUsd : credential.usageMonthlyUsd; }
function usageCell(credential) {
  if (!credential.usageAvailable) return "<strong>—</strong><small>OpenRouter 조회 불가</small>";
  return `<strong>${money(credential.usageUsd)}</strong><small>누적 사용</small>`;
}
function limitCell(credential) {
  const remaining = credential.limitRemainingUsd === null ? "" : ` · ${money(credential.limitRemainingUsd)} 남음`;
  const used = credential.usageAvailable ? money(periodUsage(credential)) : "—";
  return `<strong>${used} / ${money(credential.limitUsd)}</strong><small><span title="${resetTooltip(credential.limitReset)}">${resetLabel(credential.limitReset)}</span>${remaining}</small>`;
}
function portalText(ko, en) { return state.portalLanguage === "en" ? en : ko; }
function portalResetLabel(reset) { return reset === "daily" ? portalText("일별", "Daily") : reset === "weekly" ? portalText("주별", "Weekly") : portalText("월별", "Monthly"); }
function portalKeyRow(credential) {
  const personal = credential.subjectType === "student";
  const status = credential.status === "active" ? portalText("사용 가능", "Active") : portalText("폐기됨", "Revoked");
  const quota = credential.usageAvailable ? `${money(periodUsage(credential))} / ${money(credential.limitUsd)}` : `— / ${money(credential.limitUsd)}`;
  return `<article class="portal-key-row"><div class="portal-key-label"><strong>${personal ? portalText("개인 API 키", "Personal API key") : esc(credential.subjectName || portalText("조 공용 키", "Team key"))}</strong><small class="portal-key-status ${credential.status === "active" ? "active" : "revoked"}">${status}</small></div><div class="portal-key-label"><strong>${esc(credential.keyLabel)}</strong><small><code class="masked-key">${esc(credential.keyPreview)}</code></small></div><div class="portal-key-meta"><div><strong>${credential.usageAvailable ? money(credential.usageUsd) : "—"}</strong><small>${portalText("누적 사용", "Total usage")}</small></div><div><strong>${quota}</strong><small>${portalResetLabel(credential.limitReset)}</small></div></div><button class="table-button" data-portal-key="${credential.id}">${portalText("키 보기", "View key")}</button></article>`;
}
function renderPortalKeyList(id, credentials, emptyText) { $(id).innerHTML = credentials.length ? credentials.map(portalKeyRow).join("") : `<p class="portal-empty">${emptyText}</p>`; }
function modelPrice(value) {
  const perMillion = Number(value) * 1000000;
  return Number.isFinite(perMillion) ? `$${perMillion.toLocaleString("en-US", { maximumFractionDigits: 4 })} / 1M tokens` : portalText("가격 정보 없음", "Price unavailable");
}
function renderPortalModelList() {
  const query = state.portalModelSearch.trim().toLowerCase();
  const models = state.availableModels.filter((model) => (!query && state.portalModelProvider && modelProvider(model).name !== state.portalModelProvider ? false : !query || model.toLowerCase().includes(query)));
  const visible = models.slice(0, 100);
  const pricing = state.modelPricing[state.selectedPortalModel];
  $("#portalModelSelected").textContent = state.selectedPortalModel ? portalText(`선택한 모델: ${state.selectedPortalModel} · 입력 ${modelPrice(pricing?.input)} · 출력 ${modelPrice(pricing?.output)}`, `Selected model: ${state.selectedPortalModel} · Input ${modelPrice(pricing?.input)} · Output ${modelPrice(pricing?.output)}`) : "";
  $("#portalAllowedModels").innerHTML = visible.length
    ? visible.map((model) => `<button class="portal-model-option${model === state.selectedPortalModel ? " selected" : ""}" type="button" data-portal-model="${esc(model)}">${modelCard(model)}</button>`).join("")
    : `<p class="portal-empty">${portalText("검색 결과가 없습니다.", "No matching models.")}</p>`;
}
function renderPortalProviderList() {
  const providers = [...new Set(state.availableModels.map((model) => modelProvider(model).name))].sort();
  if (state.portalModelProvider && !providers.includes(state.portalModelProvider)) state.portalModelProvider = providers[0] || "";
  if (!state.portalModelProvider && !state.portalModelSearch) state.portalModelProvider = providers[0] || "";
  const counts = new Map(providers.map((provider) => [provider, state.availableModels.filter((model) => modelProvider(model).name === provider).length]));
  const options = [...providers.map((provider) => [provider, provider, counts.get(provider)]), ["", portalText("전체 프로바이더", "All providers"), state.availableModels.length]];
  $("#portalModelProviders").innerHTML = options.map(([provider, label, count]) => `<button class="portal-provider-option${provider === state.portalModelProvider ? " selected" : ""}" type="button" data-portal-provider="${esc(provider)}">${esc(label)} <small>(${count})</small></button>`).join("");
}
function renderStudentPortal() {
  const isStudent = state.me?.role === "student";
  const name = state.me?.student?.name || state.me?.loginId || "";
  const english = state.portalLanguage === "en";
  $("#portalTitle").textContent = english ? `API keys for ${name}` : `${name}님의 API 키`;
  $("#portalIntro").textContent = isStudent ? portalText("수업에서 사용할 개인 키와 소속 조의 공용 키를 확인하세요.", "Review your personal key and the shared keys for your current team.") : portalText("개인 API 키와 현재 주기 한도를 확인하세요.", "Review your personal API keys and current-period limit.");
  $("#portalPeriod").textContent = portalText("한도 주기: KST 경계 시각", "Limit periods use KST boundaries");
  $("#portalLogoutButton").textContent = portalText("로그아웃", "Sign out"); $("#portalLanguageToggle").textContent = english ? "🇰🇷 한국어" : "🇺🇸 English"; $("#portalLanguageToggle").setAttribute("aria-pressed", String(english));
  const quota = state.portalQuota;
  $("#portalBudgetTitle").textContent = portalText("이번 기간 개인 한도", "Personal limit this period");
  $("#portalQuota").textContent = quota ? portalText(`폐기·재발급 키의 사용액도 함께 계산합니다.`, `Usage from revoked and reissued keys is included.`) : portalText("아직 개인 한도 정책이 없습니다.", "No personal quota policy has been set yet.");
  $("#portalBudgetUsed").textContent = quota ? money(quota.usedUsd) : "—";
  $("#portalBudgetTotal").textContent = quota ? portalText(`/ 총 ${money(quota.limitUsd)}`, `/ ${money(quota.limitUsd)} total`) : "";
  $("#portalBudgetProgress").style.width = quota && quota.limitUsd > 0 ? `${Math.min(100, Math.max(0, quota.usedUsd / quota.limitUsd * 100))}%` : "0%";
  $("#portalBudgetNote").textContent = quota ? portalText(`${money(quota.remainingUsd)} 남음 · ${portalResetLabel(quota.period)}`, `${money(quota.remainingUsd)} remaining · ${portalResetLabel(quota.period)}`) : portalText("담당 운영자에게 한도 설정을 요청하세요.", "Ask an administrator to set a limit.");
  $("#portalConnectionTitle").textContent = portalText("연결 정보", "Connection details");
  $("#portalConnectionDescription").textContent = portalText("개발 도구의 OpenAI Compatible Base URL에 아래 주소를 입력하세요.", "Use this address as the OpenAI Compatible Base URL in your development tool.");
  $("#copyPortalBaseUrlButton").textContent = portalText("복사", "Copy");
  $("#portalConnectionNote").textContent = portalText("키를 선택하면 API 키와 연결 JSON을 함께 확인할 수 있습니다.", "Select a key to view its API key and connection JSON.");
  const personal = state.portalCredentials.filter((credential) => credential.subjectType === "student");
  const team = state.portalCredentials.filter((credential) => credential.subjectType === "team");
  $("#portalPersonalTitle").textContent = portalText("개인 키 이력", "Personal key history"); $("#portalPersonalNote").textContent = portalText("폐기된 키를 포함한 발급 이력입니다.", "Includes revoked keys and their issuance history.");
  $("#portalTeamTitle").textContent = portalText("조 공용 키", "Team shared keys"); $("#portalTeamNote").textContent = portalText("현재 소속 조에서 사용할 수 있는 공용 키입니다.", "Shared keys available to your current team.");
  renderPortalKeyList("#portalPersonalKeys", personal, portalText("발급된 개인 키가 없습니다.", "No personal keys have been issued."));
  renderPortalKeyList("#portalTeamKeys", team, portalText("현재 소속 조의 공용 키가 없습니다.", "No shared team keys are available."));
  $("#portalTeamKeys").closest(".portal-key-section").hidden = !isStudent;
  $("#portalModelTitle").textContent = portalText("사용 가능한 모델", "Available models");
  $("#portalModelNote").textContent = state.availableModels.length
    ? portalText(`${state.availableModels.length}개 모델이 현재 Guardrail에서 허용됩니다. 검색 후 선택하면 키 테스트에 사용됩니다.`, `${state.availableModels.length} models are allowed by the current guardrail. Search and select one to use for key testing.`)
    : portalText("사용 가능한 모델 정보를 불러오지 못했습니다. 운영자에게 문의하세요.", "Available-model information is unavailable. Contact an administrator.");
  $("#portalModelSearchLabel").textContent = portalText("모델 검색", "Search models");
  $("#portalModelSearch").placeholder = portalText("예: gemini, qwen, :free", "e.g. gemini, qwen, :free");
  $("#portalModelSearch").value = state.portalModelSearch;
  renderPortalProviderList();
  renderPortalModelList();
  $("#portalGeminiTitle").textContent = portalText("Google Gemini 학생 1년 무료", "Google Gemini: one year free for students");
  $("#portalGeminiDescription").textContent = portalText("학생 인증 후 Gemini 혜택을 확인하세요. 대상·국가·약관은 Google 기준입니다.", "Verify your student status to check Gemini benefits. Eligibility, availability and terms are set by Google.");
  $("#portalGeminiLink").textContent = portalText("Gemini 혜택 확인 ↗", "View Gemini offer ↗");
  $("#portalZedTitle").textContent = portalText("Zed Education · Pro 1년 무료", "Zed Education: Pro free for one year");
  $("#portalZedDescription").textContent = portalText("인증된 대학생에게 Pro 기능과 매월 $10 AI 크레딧을 제공합니다. 자격·약관은 Zed 기준입니다.", "Verified university students receive Pro features and $10/month in AI credits. Eligibility and terms are set by Zed.");
  $("#portalZedLink").textContent = portalText("Zed Education 신청 ↗", "Apply for Zed Education ↗");
  $("#portalStudentOffers").hidden = !isStudent;
  $("#portalBackButton").hidden = isStudent;
}

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `요청에 실패했습니다. (${response.status})`);
  return body;
}
function error(id, message = "") { $(id).textContent = message; }
function notice(message) { $("#notice").textContent = message; $("#notice").hidden = false; setTimeout(() => { $("#notice").hidden = true; }, 3500); }
function dialog(id) { $(`#${id}`).showModal(); }
function close(id) { $(`#${id}`).close(); }
function openPasswordDialog(required = false) {
  $("#passwordDialogTitle").textContent = required ? "초기 비밀번호 변경 필요" : "비밀번호 변경";
  $("#passwordDialogNote").hidden = !required;
  document.querySelectorAll("#passwordDialog [data-close]").forEach((button) => { button.hidden = required; });
  dialog("passwordDialog");
}
function activeStudents() { return state.students.filter((student) => student.is_active && student.owner_type === "student"); }
function activeOwners() { return state.students.filter((student) => student.is_active); }

async function loadData() {
  const requests = [api("/api/students"), api("/api/teams")];
  if (state.me?.canViewCredentials) requests.push(api("/api/credentials"));
  const [students, teams, credentials = { data: [] }] = await Promise.all(requests);
  state.students = students.data; state.teams = teams.data; state.credentials = credentials.data; state.dataLoaded = true; state.selectedCredentialIds.clear(); render();
}
async function loadDashboard() { const response = await api("/api/dashboard"); state.dashboard = response.data; render(); }
async function ensureData() { if (state.dataLoaded) { render(); return; } await loadData(); }
async function loadAccounts() { const response = await api("/api/accounts"); state.accounts = response.data; render(); }
async function loadAudits(reset = true) { const offset = reset ? 0 : state.auditOffset; const response = await api(`/api/audit-events?offset=${offset}`); state.audits = reset ? response.data : [...state.audits, ...response.data]; state.auditOffset = response.nextOffset; state.auditHasMore = response.hasMore; render(); }
async function loadModelPolicy() { const response = await api("/api/model-policy"); state.modelPolicy = response.data; render(); }
async function loadAccessPolicy() { const response = await api("/api/access-policy"); state.accessPolicy = response.data; render(); }
function viewFromPath() { return Object.entries(VIEW_PATHS).find(([, path]) => path === window.location.pathname)?.[0] || "dashboard"; }
function setViewPath(view, replace = false) { const path = VIEW_PATHS[view] || VIEW_PATHS.dashboard; if (window.location.pathname !== path) history[replace ? "replaceState" : "pushState"]({}, "", path); }
async function navigateView(view, { replace = false, updateUrl = true } = {}) {
  if (view === "personalKeys" && state.me?.role === "master") view = "dashboard";
  if (!VIEW_PATHS[view]) view = "dashboard";
  if (updateUrl) setViewPath(view, replace);
  if (view === "personalKeys") { state.view = view; document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("selected", button.dataset.view === view)); await openPersonalPortal(); return; }
  $("#studentPortal").hidden = true; $("#managerApp").hidden = false; state.view = view; $("#searchInput").value = "";
  if (view === "dashboard") await loadDashboard(); else if (view === "audits") await loadAudits(); else if (view === "accounts") await loadAccounts(); else if (view === "modelPolicy") await loadModelPolicy(); else if (view === "accessPolicy") await loadAccessPolicy(); else await ensureData();
}
function renderFilters() {
  const filter = $("#classFilter");
  $("#searchInput").placeholder = state.view === "modelPolicy" ? "모델 슬러그 검색" : "이름, 학번, 반, 조, 지도교수로 검색";
  $("#auditActionFilter").hidden = state.view !== "audits"; filter.hidden = ["dashboard", "audits", "accounts", "modelPolicy", "accessPolicy"].includes(state.view);
  if (["dashboard", "audits", "accounts", "modelPolicy", "accessPolicy"].includes(state.view)) return;
  const before = filter.value;
  const classes = [...new Set(activeStudents().map((student) => student.class_name))].sort();
  filter.innerHTML = `<option value="">전체 반</option>${classes.map((v) => `<option value="${esc(v)}">${esc(v)}반</option>`).join("")}`;
  filter.value = classes.includes(before) ? before : "";
}
function renderSummary() {
  const data = state.dashboard || { activeStudents: activeStudents().length, activeTeams: state.teams.filter((team) => team.is_active).length, unassignedStudents: activeStudents().filter((student) => !student.team_id).length, activeCredentials: state.credentials.filter((credential) => credential.status === "active").length };
  $("#studentCount").textContent = data.activeStudents; $("#teamCount").textContent = data.activeTeams; $("#unassignedCount").textContent = data.unassignedStudents; $("#credentialCount").textContent = data.activeCredentials ?? "—";
}
function query() { return $("#searchInput").value.trim().toLowerCase(); }
function relativeTime(value) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) return "사용 기록 없음";
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}
function renderStudents() {
  $("#tableHead").innerHTML = "<tr><th>연번</th><th>구분</th><th>이름</th><th>학번 / Login ID</th><th>소속</th><th>조</th><th>지도교수</th><th>대표 키 [수]</th><th>키 마지막 사용</th><th>키 누적 사용</th><th></th></tr>";
  const className = $("#classFilter").value; const q = query();
  const rows = state.students.filter((s) => (!q || [s.name, s.student_number, s.class_name, s.team_name, s.advisor_name].join(" ").toLowerCase().includes(q)) && (!className || s.class_name === className));
  $("#tableBody").innerHTML = rows.length ? rows.map((s) => {
    const isAdmin = s.owner_type === "admin";
    const type = isAdmin ? "관리자" : "학생";
    const affiliation = isAdmin ? "—" : `${esc(s.class_name)}반`;
    const teamName = isAdmin ? "—" : esc(s.team_name || "—");
    const advisor = isAdmin ? "—" : esc(s.advisor_name);
    if (!state.me?.canViewCredentials) return `<tr><td>${s.roster_number}</td><td>${type}</td><td><strong>${esc(s.name)}</strong></td><td><code>${esc(s.student_number)}</code></td><td>${affiliation}</td><td>${teamName}</td><td>${advisor}</td><td><strong>비공개</strong><small>키 조회 권한 필요</small></td><td>—</td><td>—</td><td class="actions"><button class="table-button" data-view-student="${s.id}">상세 보기</button></td></tr>`;
    const personal = state.credentials.filter((c) => c.subjectType === "student" && c.subjectId === s.id && c.status === "active");
    const team = isAdmin ? [] : state.credentials.filter((c) => c.subjectType === "team" && c.subjectId === s.team_id && c.status === "active");
    const accessible = [...personal, ...team]; const representative = personal[0] || team[0];
    const usage = accessible.filter((c) => c.usageAvailable).reduce((total, c) => total + (c.usageUsd || 0), 0);
    const usageKnown = accessible.some((c) => c.usageAvailable);
    return `<tr><td>${s.roster_number}</td><td>${type}</td><td><strong>${esc(s.name)}</strong></td><td><code>${esc(s.student_number)}</code></td><td>${affiliation}</td><td>${teamName}</td><td>${advisor}</td><td><strong>${esc(representative?.keyLabel || "—")} [${accessible.length}]</strong><small><code>${esc(representative?.keyPreview || "활성 키 없음")}</code></small></td><td><strong>${relativeTime(representative?.lastUsedAt)}</strong></td><td class="usage-cell"><strong>${usageKnown ? money(usage) : "—"}</strong><small>${isAdmin ? "개인 키 합계" : "개인·조 접근 키 합계"}</small></td><td class="actions"><button class="table-button" data-view-student="${s.id}">상세 보기</button></td></tr>`;
  }).join("") : "<tr><td class=\"empty\" colspan=\"11\">조건에 맞는 계정 소유자가 없습니다.</td></tr>";
}
function renderTeams() {
  $("#tableHead").innerHTML = "<tr><th>조 이름</th><th>반</th><th>지도교수</th><th>조원</th><th>상태</th><th></th></tr>";
  const className = $("#classFilter").value; const q = query();
  const rows = state.teams.filter((t) => (!q || [t.name, t.class_name, t.advisor_name].join(" ").toLowerCase().includes(q)) && (!className || t.class_name === className));
  $("#tableBody").innerHTML = rows.length ? rows.map((t) => `<tr><td><strong>${esc(t.name)}</strong></td><td>${esc(t.class_name)}</td><td>${esc(t.advisor_name)}</td><td>${t.member_count}명</td><td><span class="status ${t.is_active ? "active" : "inactive"}">${t.is_active ? "활성" : "비활성"}</span></td><td class="actions"><button class="table-button" data-manage-team="${t.id}">상세 보기</button></td></tr>`).join("") : "<tr><td class=\"empty\" colspan=\"6\">조건에 맞는 조가 없습니다.</td></tr>";
}
function credentialCreatedAt(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "발급 시각 없음" : `발급 ${date.toLocaleString("ko-KR", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })} UTC`; }
function renderCredentials() {
  const canManage = Boolean(state.me?.canManageCredentials);
  $("#tableHead").innerHTML = `<tr><th>${canManage ? "<input id=\"selectAllCredentials\" type=\"checkbox\" aria-label=\"표시된 활성 키 전체 선택\">" : ""}</th><th>키 이름</th><th>키 실제</th><th>키 타입</th><th>이름</th><th>학번</th><th>누적 사용</th><th>현재 주기 한도</th><th>작업</th></tr>`;
  const q = query(); const className = $("#classFilter").value; const hideRevoked = $("#hideRevokedKeys").checked; const rows = state.credentials.filter((c) => (!hideRevoked || c.status === "active") && (!q || [c.subjectName, c.subjectNumber, c.keyLabel, c.keyPreview, c.subjectType].join(" ").toLowerCase().includes(q)) && (!className || c.className === className));
  $("#tableBody").innerHTML = rows.length ? rows.map((c) => `<tr><td>${canManage && c.status === "active" ? `<input type="checkbox" data-select-credential="${c.id}" aria-label="${esc(c.keyLabel)} 선택"${state.selectedCredentialIds.has(c.id) ? " checked" : ""}>` : ""}</td><td><strong>${esc(c.keyLabel)}</strong><small>${credentialCreatedAt(c.createdAt)}${c.status === "revoked" && c.revokedAt ? ` · 폐기 ${new Date(c.revokedAt).toLocaleString("ko-KR", { timeZone: "UTC", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })} UTC` : ""}</small></td><td><code class="masked-key${c.status === "active" ? "" : " revoked"}">${esc(c.keyPreview || "—")}</code><small>${c.status === "active" ? "사용 가능" : "폐기됨"}</small></td><td>${c.subjectType === "student" ? "개인" : "조"}</td><td><strong>${esc(c.subjectName || "—")}</strong></td><td><code>${esc(c.subjectNumber || "—")}</code></td><td class="usage-cell">${usageCell(c)}</td><td class="usage-cell">${limitCell(c)}</td><td class="actions">${canManage && c.status === "active" ? `<button class="table-button" data-reveal-key="${c.id}">보기</button> <button class="table-button" data-reissue-key="${c.id}">재발급</button> <button class="table-button danger" data-revoke-key="${c.id}">폐기</button>` : "—"}</td></tr>`).join("") : `<tr><td class="empty" colspan="9">${hideRevoked ? "표시할 활성 키가 없습니다. 폐기된 키도 보려면 필터를 해제하세요." : "아직 발급한 키가 없습니다."}</td></tr>`;
  const activeIds = rows.filter((c) => c.status === "active").map((c) => c.id);
  const selectAll = $("#selectAllCredentials"); if (selectAll) selectAll.checked = activeIds.length > 0 && activeIds.every((id) => state.selectedCredentialIds.has(id));
  updateBulkRevokeButton();
}
function accountRoleLabel(role) { return role === "master" ? "Master" : role === "admin" ? "관리자" : "학생"; }
function renderAccounts() {
  const canManageAccounts = state.me?.role === "master";
  $("#tableHead").innerHTML = "<tr><th>계정 소유자</th><th>Login ID</th><th>구분</th><th>메모</th><th>상태</th><th>마지막 로그인 (UTC)</th><th></th></tr>";
  const q = query(); const rows = state.accounts.filter((account) => !q || [account.ownerName, account.loginId, account.studentNumber, account.memo, accountRoleLabel(account.role)].join(" ").toLowerCase().includes(q));
  $("#tableBody").innerHTML = rows.length ? rows.map((account) => `<tr><td><strong>${esc(account.ownerName)}</strong>${account.studentNumber ? `<small>개인 소유자 연결 · ${esc(account.studentNumber)}</small>` : "<small>개인 소유자 미연결</small>"}</td><td><code>${esc(account.loginId)}</code></td><td>${esc(accountRoleLabel(account.role))}</td><td><small>${esc(account.memo || "—")}</small></td><td><span class="status ${account.isActive ? "active" : "inactive"}">${account.isActive ? "활성" : "비활성"}</span><small>${account.mustChangePassword ? "초기 비밀번호 변경 필요" : "비밀번호 변경 완료"}</small></td><td><small>${account.lastLoginAt ? auditTime(account.lastLoginAt) : "로그인 기록 없음"}</small></td><td class="actions">${canManageAccounts ? `<button class="table-button" data-edit-account="${account.id}">수정</button>${account.role !== "master" ? ` <button class="table-button" data-reset-account="${account.id}">비밀번호 초기화</button> <button class="table-button ${account.isActive ? "danger" : ""}" data-toggle-account="${account.id}">${account.isActive ? "비활성화" : "활성화"}</button>` : ""}` : account.role !== "master" ? `<button class="table-button" data-reset-account="${account.id}">비밀번호 초기화</button>` : "—"}</td></tr>`).join("") : "<tr><td class=\"empty\" colspan=\"7\">등록된 계정이 없습니다.</td></tr>";
}
function auditLabel(action) {
  const labels = { "account.bootstrap": "Master 계정 생성", "account.create": "계정 생성", "account.create_auto": "학생 계정 자동 생성", "account.create_bulk": "학생 계정 일괄 생성", "account.update": "계정 정보 수정", "account.password_reset": "초기 비밀번호 재설정", "account.status_update": "계정 상태 변경", "access_policy.update": "관리자 키 권한 변경", "auth.login": "로그인", "auth.login_failed": "로그인 실패", "auth.logout": "로그아웃", "auth.password_change": "비밀번호 변경", "student.create": "학생 생성", "student.update": "학생 수정", "student.deactivate": "학생 비활성화", "student.hard_delete": "학생 완전 삭제", "team.create": "조 생성", "team.update": "조 수정", "team.deactivate": "조 비활성화", "team_member.assign": "조원 배정", "team_member.remove": "조원 해제", "quota.update": "개인 한도 정책 변경", "model_policy.update": "허용 모델 정책 변경", "credential.issue": "키 발급", "credential.issue_bulk": "키 일괄 발급", "credential.reissue": "키 재발급", "credential.reveal": "키 조회", "credential.test": "키 연결 테스트", "credential.revoke": "키 폐기", "credential.revoke_bulk": "키 일괄 폐기", "credential.normalize_personal_labels": "기존 개인 키 이름 정리" };
  return labels[action] || action;
}
function auditTime(value) { const date = new Date(`${value.replace(" ", "T")}Z`); return Number.isNaN(date.valueOf()) ? value : `${date.toLocaleString("ko-KR", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} UTC`; }
function auditDetail(event) { const meta = event.metadata || {}; if (meta.after) return "수정 전·후 기록"; if (meta.keyLabel) return meta.keyLabel; if (meta.studentId) return `학생 ID ${meta.studentId}`; if (meta.name) return meta.name; if (meta.loginId) return meta.loginId; return "—"; }
function renderAudits() {
  $("#tableHead").innerHTML = "<tr><th>시각 (UTC)</th><th>작업</th><th>수행자</th><th>대상</th><th>요약</th><th></th></tr>";
  const q = query(); const category = $("#auditActionFilter").value;
  const rows = state.audits.filter((event) => (!category || event.action.startsWith(`${category}.`)) && (!q || [event.action, auditLabel(event.action), event.actorName, event.actorLoginId, event.subjectName, auditDetail(event)].join(" ").toLowerCase().includes(q)));
  $("#tableBody").innerHTML = rows.length ? rows.map((event) => `<tr><td><small>${auditTime(event.createdAt)}</small></td><td><strong>${esc(auditLabel(event.action))}</strong><small>${esc(event.action)}</small></td><td><strong>${esc(event.actorName || "알 수 없음")}</strong><small>${esc(event.actorLoginId || "—")}</small></td><td>${esc(event.subjectName || event.subjectType || "—")}</td><td>${esc(auditDetail(event))}</td><td class="actions"><button class="table-button" data-audit-details="${event.id}">상세</button></td></tr>`).join("") : "<tr><td class=\"empty\" colspan=\"6\">표시할 로그가 없습니다.</td></tr>";
  $("#auditMoreButton").hidden = !state.auditHasMore;
}
function renderModelPolicy() {
  const policy = state.modelPolicy;
  const blocked = policy?.restrictionMode === "blocklist";
  const models = blocked ? policy.blockedModels : policy?.models || [];
  $("#tableHead").innerHTML = `<tr><th>${blocked ? "차단 모델" : "허용 모델"}</th><th>적용 상태</th></tr>`;
  if (!policy) { $("#tableBody").innerHTML = "<tr><td class=\"empty\" colspan=\"2\">허용 모델 정책을 불러오는 중입니다.</td></tr>"; return; }
  if (!models.length) { $("#tableBody").innerHTML = "<tr><td class=\"empty\" colspan=\"2\">모델 제한이 설정되지 않았습니다. 현재 모든 모델 요청이 허용될 수 있습니다.</td></tr>"; return; }
  const rows = models.filter((model) => model.toLowerCase().includes(query()));
  $("#tableBody").innerHTML = rows.length ? rows.map((model) => `<tr><td>${modelCard(model, true)}</td><td><span class=\"status ${blocked ? "inactive" : "active"}\">${blocked ? "차단됨" : "적용 중"}</span></td></tr>`).join("") : `<tr><td class="empty" colspan="2">검색 조건에 맞는 ${blocked ? "차단" : "허용"} 모델이 없습니다.</td></tr>`;
}
function renderAccessPolicy() {
  const allowed = Boolean(state.accessPolicy?.allowAdminCredentialManagement);
  $("#tableHead").innerHTML = "<tr><th>권한</th><th>현재 상태</th><th></th></tr>";
  $("#tableBody").innerHTML = `<tr><td><strong>관리자 전체 키 관리</strong><small>키 목록 조회, 발급, 재발급, 폐기 및 키 원문 조회</small></td><td><span class="status ${allowed ? "active" : "inactive"}">${allowed ? "허용" : "차단"}</span></td><td class="actions"><button id="saveAccessPolicyButton" class="table-button ${allowed ? "danger" : ""}" type="button">${allowed ? "관리자 권한 차단" : "관리자 권한 허용"}</button></td></tr>`;
}
function renderNavigation() {
  document.querySelector('[data-view="credentials"]').hidden = !state.me?.canViewCredentials; $("#accountsNav").hidden = !["admin", "master"].includes(state.me?.role); $("#auditsNav").hidden = state.me?.role !== "master"; $("#modelPolicyNav").hidden = state.me?.role !== "master"; $("#accessPolicyNav").hidden = true;
  $("#personalKeysNav").hidden = state.me?.role === "master";
}
function render() {
  renderFilters(); renderSummary();
  const views = { dashboard: ["대시보드", "수업 운영의 기본 현황을 빠르게 확인합니다.", ""], students: ["계정 소유자", "학생과 관리자의 개인 키·한도 및 수강생 조 편성을 관리합니다.", "학생 추가"], teams: ["조 편성", "조를 만들고 조원을 배정하거나 이동할 수 있습니다.", "조 추가"], credentials: ["키 관리", "개인·조 키를 발급하고 재발급 또는 폐기합니다.", "키 발급"], modelPolicy: ["허용 모델", "OpenRouter 워크스페이스 기본 Guardrail에 적용됩니다.", "허용 모델 수정"], accessPolicy: ["권한 설정", "관리자의 전체 키 관리 권한을 제어합니다.", ""], audits: ["감사 로그", "생성·수정·비활성화·키 작업·인증 이벤트를 UTC 기준으로 기록합니다.", ""], accounts: ["계정 관리", "Master는 계정을 관리하고, 관리자는 Master를 제외한 계정의 비밀번호를 초기화할 수 있습니다.", "계정 추가"] };
  const copy = views[state.view]; $("#pageTitle").textContent = copy[0]; $("#pageDescription").textContent = state.view === "modelPolicy" && state.modelPolicy?.restrictionMode === "blocklist" ? "OpenRouter의 차단 목록이 적용 중입니다. 차단 목록은 OpenRouter에서 관리합니다." : state.view === "modelPolicy" && state.modelPolicy?.assignmentRequired ? "워크스페이스 기본 Guardrail이 없어 ClassKeys의 기존·새 키에 직접 적용됩니다." : copy[1]; $("#primaryAction").textContent = copy[2];
  const canManage = Boolean(state.me?.canManageCredentials);
  const canManageAccounts = state.me?.role === "master";
  $("#primaryAction").hidden = ["dashboard", "audits", "accessPolicy"].includes(state.view) || (state.view === "credentials" && !canManage) || (state.view === "accounts" && !canManageAccounts) || (state.view === "modelPolicy" && state.modelPolicy?.restrictionMode === "blocklist"); $("#summary").hidden = state.view !== "dashboard"; $("#managerOffers").hidden = state.view !== "dashboard"; $("#dataPanel").hidden = state.view === "dashboard"; if (state.view !== "audits") $("#auditMoreButton").hidden = true;
  $("#bulkCredentialButton").hidden = state.view !== "credentials" || !canManage; $("#bulkTeamCredentialButton").hidden = state.view !== "credentials" || !canManage; $("#bulkRevokeButton").hidden = state.view !== "credentials" || !canManage; $("#hideRevokedFilter").hidden = state.view !== "credentials";
  renderNavigation();
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("selected", button.dataset.view === state.view));
  if (state.view === "students") renderStudents(); else if (state.view === "teams") renderTeams(); else if (state.view === "credentials") renderCredentials(); else if (state.view === "modelPolicy") renderModelPolicy(); else if (state.view === "accessPolicy") renderAccessPolicy(); else if (state.view === "accounts") renderAccounts(); else if (state.view === "audits") renderAudits();
}
function teamOptions(student = null) { const teams = state.teams.filter((team) => team.is_active && (!student || (team.class_name === student.class_name && team.advisor_name === student.advisor_name))); return `<option value="">미편성</option>${teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}`; }
function openStudent(student = null) {
  error("#studentFormError"); $("#studentForm").reset(); $("#studentDialogTitle").textContent = student ? "학생 수정" : "학생 추가"; $("#studentId").value = student?.id || ""; $("#rosterNumber").value = student?.roster_number || Math.max(0, ...state.students.map((item) => item.roster_number)) + 1; $("#studentNumber").value = student?.student_number || ""; $("#studentName").value = student?.name || ""; $("#studentClass").value = student?.class_name || ""; $("#studentAdvisor").value = student?.advisor_name || ""; $("#studentTeam").innerHTML = teamOptions(student); $("#studentTeam").value = student?.team_id || ""; $("#studentActiveWrap").hidden = !student; $("#studentActive").value = student?.is_active ? "true" : "false"; $("#hardDeleteStudentButton").hidden = !(student && state.me.role === "master"); dialog("studentDialog");
}
async function openAccount() {
  $("#accountForm").reset(); $("#accountRole").value = "admin"; error("#accountFormError"); dialog("accountDialog");
}
function openAccountEdit(account) { $("#accountEditId").value = account.id; $("#accountEditDisplayName").value = account.ownerName || ""; $("#accountEditMemo").value = account.memo || ""; error("#accountEditError"); dialog("accountEditDialog"); }
function openModelPolicy() {
  $("#modelPolicyModels").value = (state.modelPolicy?.models || []).join("\n");
  error("#modelPolicyFormError"); dialog("modelPolicyDialog");
}
function detailKeyRows(credentials) {
  return credentials.length ? credentials.map((credential) => {
    const used = credential.usageAvailable ? money(periodUsage(credential)) : "—";
    const usage = credential.usageAvailable ? money(credential.usageUsd) : "—";
    const revoked = credential.status !== "active";
    return `<div class="member-row key-history-row${revoked ? " revoked" : ""}"><span><strong>${esc(credential.keyLabel)}</strong><small><code class="masked-key">${esc(credential.keyPreview || "—")}</code> · ${revoked ? "폐기됨" : "사용 가능"} · 누적 ${usage} · <span title="${resetTooltip(credential.limitReset)}">${resetLabel(credential.limitReset)}</span> ${used} / ${money(credential.limitUsd)}</small></span>${!revoked ? `<button class="table-button danger" data-revoke-key="${credential.id}">폐기</button>` : ""}</div>`;
  }).join("") : "<p class=\"empty-list\">발급된 키가 없습니다.</p>";
}
function renderStudentQuota(quota) {
  state.activeStudentQuota = quota;
  $("#studentQuotaLimit").value = quota?.limitUsd ?? "5";
  $("#studentQuotaPeriod").value = quota?.period ?? "weekly";
  $("#studentQuotaSummary").textContent = quota
    ? `현재 ${resetLabel(quota.period)}: ${money(quota.usedUsd)} / ${money(quota.limitUsd)} 사용 · ${money(quota.remainingUsd)} 남음 · 키 이력 ${quota.credentialCount}개`
    : "아직 개인 한도 정책이 없습니다. 첫 개인 키 발급 시 이 화면의 값으로 정책이 만들어집니다.";
}
async function loadStudentQuota(studentId) {
  const { data } = await api(`/api/students/${studentId}/quota`);
  if (state.activeStudent?.id === Number(studentId)) renderStudentQuota(data);
}
async function openStudentDetail(studentId) {
  const student = state.students.find((item) => item.id === Number(studentId)); if (!student) return;
  const isAdmin = student.owner_type === "admin";
  state.activeStudent = student; $("#studentDetailTitle").textContent = `${student.name} ${isAdmin ? "관리자" : "학생"} 상세`; $("#studentDetailMeta").textContent = isAdmin ? `${student.student_number} · 관리자 · 반·조 미배정` : `${student.student_number} · ${student.class_name}반 · ${student.team_name || "미편성"} · ${student.advisor_name}`;
  $("#studentEditButton").hidden = isAdmin;
  $("#studentCredentialSections").hidden = !state.me?.canManageCredentials;
  if (!state.me?.canManageCredentials) { if (!$("#studentDetailDialog").open) dialog("studentDetailDialog"); return; }
  const personalKeys = state.credentials.filter((credential) => credential.subjectType === "student" && credential.subjectId === student.id);
  $("#studentPersonalKeysTitle").textContent = `개인 키 이력 (${personalKeys.filter((credential) => credential.status === "active").length} 활성 / ${personalKeys.length} 전체)`;
  $("#studentPersonalKeys").innerHTML = detailKeyRows(personalKeys);
  const hasTeam = !isAdmin && Boolean(student.team_id); $("#studentTeamKeySection").hidden = !hasTeam;
  if (hasTeam) { const teamKeys = state.credentials.filter((credential) => credential.subjectType === "team" && credential.subjectId === student.team_id); $("#studentTeamKeysTitle").textContent = `${student.team_name} 조 공용 키 (${teamKeys.filter((credential) => credential.status === "active").length} 활성 / ${teamKeys.length} 전체)`; $("#studentTeamKeys").innerHTML = detailKeyRows(teamKeys); }
  if (!$("#studentDetailDialog").open) dialog("studentDetailDialog");
  try { await loadStudentQuota(student.id); } catch (e) { $("#studentQuotaSummary").textContent = e.message; }
}
function renderCredentialSubjects() {
  const type = $("#credentialSubjectType").value;
  const choices = type === "student" ? activeOwners().map((s) => [s.id, `${s.name} · ${s.student_number}${s.owner_type === "admin" ? " (관리자)" : ""}`]) : state.teams.filter((t) => t.is_active).map((t) => [t.id, `${t.name} · ${t.class_name}반`]);
  $("#credentialSubjectId").innerHTML = `<option value="">선택</option>${choices.map(([id, label]) => `<option value="${id}">${esc(label)}</option>`).join("")}`;
}
async function syncCredentialQuota() {
  const isPersonal = $("#credentialSubjectType").value === "student";
  const studentId = Number($("#credentialSubjectId").value);
  $("#credentialLabel").placeholder = isPersonal ? "비우면 학번-발급차수로 자동 생성" : "비우면 조이름-발급차수로 자동 생성";
  $("#credentialQuotaNote").hidden = !isPersonal;
  $("#credentialLimit").disabled = false; $("#credentialReset").disabled = false;
  if (!isPersonal || !studentId) return;
  try {
    const { data: quota } = await api(`/api/students/${studentId}/quota`);
    if (!quota) return;
    $("#credentialLimit").value = quota.limitUsd; $("#credentialReset").value = quota.period;
    $("#credentialLimit").disabled = true; $("#credentialReset").disabled = true;
    const owner = state.students.find((student) => student.id === studentId);
    $("#credentialQuotaNote").textContent = `이 ${owner?.owner_type === "admin" ? "관리자" : "학생"}의 ${resetLabel(quota.period)} 정책은 ${money(quota.limitUsd)}이며, 현재 ${money(quota.usedUsd)} 사용 · ${money(quota.remainingUsd)} 남음입니다. 새 키에는 남은 금액만 적용됩니다.`;
  } catch (e) { error("#credentialFormError", e.message); }
}
function openCredential(subjectType = "student", subjectId = "") { $("#credentialForm").reset(); $("#credentialSubjectType").value = subjectType; $("#credentialLimit").value = "5"; $("#credentialReset").value = "weekly"; error("#credentialFormError"); renderCredentialSubjects(); $("#credentialSubjectId").value = String(subjectId); $("#credentialQuotaNote").textContent = "개인 키는 계정 소유자의 주기 한도를 공유합니다. 새 키는 남은 예산만 받으며, 기존 활성 개인 키는 폐기됩니다."; syncCredentialQuota(); dialog("credentialDialog"); }
function bulkSubjects() { return state.bulkSubjectType === "student" ? activeOwners() : state.teams.filter((team) => team.is_active); }
function refreshBulkCount() {
  const className = $("#bulkCredentialClass").value;
  const count = bulkSubjects().filter((subject) => !className || subject.class_name === className).length;
  $("#bulkCredentialCount").textContent = `${count}${state.bulkSubjectType === "student" ? "명 계정 소유자" : "개 조"}에 키 1개씩을 발급합니다.`;
}
function setBulkCredentialBusy(busy, count = 0) {
  state.bulkCredentialBusy = busy;
  $("#bulkCredentialForm").querySelectorAll("input, select, button").forEach((element) => { element.disabled = busy; });
  $("#bulkCredentialProgress").hidden = !busy;
  $("#bulkCredentialProgress").textContent = busy ? `${count}개 키를 OpenRouter에 발급 중입니다. 완료될 때까지 창을 닫거나 새로고침하지 마세요.` : "";
  $("#bulkCredentialSubmit").textContent = busy ? "발급 중…" : "일괄 발급";
}
function openBulkCredential(subjectType = "student") {
  state.bulkSubjectType = subjectType;
  const classes = [...new Set(bulkSubjects().map((subject) => subject.class_name).filter(Boolean))].sort();
  $("#bulkCredentialForm").reset(); $("#bulkCredentialLimit").value = "5"; $("#bulkCredentialReset").value = "weekly";
  $("#bulkCredentialTitle").textContent = subjectType === "student" ? "개인 키 일괄 발급" : "조 키 일괄 발급";
  $("#bulkCredentialPrefixWrap").hidden = false;
  $("#bulkCredentialClass").innerHTML = `<option value="">전체 활성 계정 소유자</option>${classes.map((value) => `<option value="${esc(value)}">${esc(value)}반</option>`).join("")}`;
  $("#bulkCredentialClass").firstElementChild.textContent = subjectType === "student" ? "전체 활성 계정 소유자" : "전체 활성 조";
  $("#bulkCredentialNote").textContent = subjectType === "student" ? "활성 개인 키가 있는 학생·관리자는 건너뜁니다. 새 키가 필요하면 상세 보기에서 재발급하세요." : "활성 조 키가 이미 2개인 조는 건너뜁니다.";
  error("#bulkCredentialError"); setBulkCredentialBusy(false); refreshBulkCount(); dialog("bulkCredentialDialog");
}
function updateBulkRevokeButton() { $("#bulkRevokeButton").disabled = state.selectedCredentialIds.size === 0; $("#bulkRevokeButton").textContent = state.selectedCredentialIds.size ? `선택 키 폐기 (${state.selectedCredentialIds.size})` : "선택 키 폐기"; }
function portalKeyRevealText(ko, en) { return state.me?.role === "student" ? portalText(ko, en) : ko; }
function renderPortalKeyReveal(subjectType) {
  if (state.me?.role !== "student") return;
  const personal = subjectType === "student";
  $("#keyRevealTitle").textContent = personal ? portalText("개인 API 키", "Personal API key") : portalText("조 공용 API 키", "Team shared API key");
  $("#keyRevealBaseUrlLabel").firstChild.textContent = "Base URL";
  $("#keyRevealChatEndpointLabel").firstChild.textContent = portalText("Chat Completions Endpoint (옵션)", "Chat Completions Endpoint (optional)");
  $("#keyRevealApiKeyLabelText").textContent = portalText("🔑 API 키", "🔑 API key");
  $("#keyRevealJsonLabel").firstChild.textContent = portalText("연결 설정 JSON", "Connection JSON");
  $("#keyRevealWarning").textContent = portalText("IDE 또는 SDK에는 Base URL과 API 키를 함께 입력하세요. 이 키와 JSON에는 비밀값이 들어 있으므로 외부에 공유하지 마세요.", "Enter both values in your IDE or SDK. This key and JSON contain secrets; do not share them.");
  $("#keyTestModelLabel").textContent = portalText("테스트 모델", "Test model"); $("#curlTestSnippetLabel").textContent = portalText("curl 테스트 스니펫", "curl test snippet"); $("#copyKeyButton").textContent = portalText("API 키 복사", "Copy API key"); $("#copyConnectionJsonButton").textContent = portalText("연결 JSON 복사", "Copy connection JSON"); $("#copyCurlSnippetButton").textContent = portalText("curl 복사", "Copy curl"); $("#copyKeyInlineButton").setAttribute("aria-label", portalText("API 키 복사", "Copy API key")); $("#copyKeyInlineButton").title = portalText("API 키 복사", "Copy API key"); $("#keyRevealCloseButton").textContent = portalText("닫기", "Close"); $("#keyRevealCloseIcon").setAttribute("aria-label", portalText("닫기", "Close"));
}
function testModels() { return state.availableModels.length ? state.availableModels : state.modelPolicy?.models || []; }
function updateCurlSnippet() { const key = $("#revealedKey").value; const model = $("#keyTestModel").value; $("#curlTestSnippet").value = key && model ? `curl https://openrouter.ai/api/v1/chat/completions \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify({ model, messages: [{ role: "user", content: "ping" }] }, null, 2)}'` : "허용 모델 정보를 불러오지 못했습니다."; }
function renderKeyTestTools() { const models = testModels(); const current = $("#keyTestModel").value; const preferred = models.includes(current) ? current : models.includes(state.selectedPortalModel) ? state.selectedPortalModel : models.find((model) => model.endsWith(":free")) || models[0] || ""; $("#keyTestModelOptions").innerHTML = models.map((model) => `<option value="${esc(model)}"></option>`).join(""); $("#keyTestModel").value = preferred; $("#keyTestModel").disabled = !models.length; $("#testModelVisual").innerHTML = preferred ? modelCard(preferred, true) : ""; updateCurlSnippet(); }
function setKeyTab(tab) { document.querySelectorAll("[data-key-tab]").forEach((button) => button.classList.toggle("selected", button.dataset.keyTab === tab)); $("#keyConnectionPanel").hidden = tab !== "connection"; $("#keyTestPanel").hidden = tab !== "test"; }
async function showKey(key, title, subjectType = null) { if (!state.modelPolicy && state.me?.role === "master") { try { state.modelPolicy = (await api("/api/model-policy")).data; } catch {} } if (state.me?.role === "student") { state.portalRevealSubjectType = subjectType; renderPortalKeyReveal(subjectType); } else { $("#keyRevealTitle").textContent = title; } $("#revealedKey").value = key; $("#connectionJson").value = JSON.stringify({ base_url: $("#openRouterBaseUrl").value, api_key: key }, null, 2); renderKeyTestTools(); setKeyTab("connection"); dialog("keyRevealDialog"); }
async function openTeam(teamId) {
  const { data: team } = await api(`/api/teams/${teamId}`); state.activeTeam = team; $("#teamMembersTitle").textContent = `${team.name} 조 상세`; $("#teamMembersMeta").textContent = `${team.class_name}반 · ${team.advisor_name}`;
  const candidates = activeStudents().filter((s) => s.class_name === team.class_name && s.advisor_name === team.advisor_name && s.team_id !== team.id);
  $("#assignStudent").innerHTML = `<option value="">학생 선택</option>${candidates.map((s) => `<option value="${s.id}">${esc(s.name)} · ${esc(s.student_number)}${s.team_name ? ` (${esc(s.team_name)})` : ""}</option>`).join("")}`;
  $("#teamMembersList").innerHTML = team.members.length ? team.members.map((s) => `<div class="member-row"><span><strong>${esc(s.name)}</strong><small>${esc(s.student_number)}</small></span><button class="table-button danger" data-remove-member="${s.id}">제거</button></div>`).join("") : "<p class=\"empty-list\">배정된 학생이 없습니다.</p>";
  $("#teamCredentialSection").hidden = !state.me?.canManageCredentials;
  if (state.me?.canManageCredentials) $("#teamCredentialList").innerHTML = detailKeyRows(state.credentials.filter((credential) => credential.subjectType === "team" && credential.subjectId === team.id));
  if (!$("#teamMembersDialog").open) dialog("teamMembersDialog");
}
async function refreshOpenDetails() {
  if ($("#studentDetailDialog").open && state.activeStudent) await openStudentDetail(state.activeStudent.id);
  if ($("#teamMembersDialog").open && state.activeTeam) await openTeam(state.activeTeam.id);
}
async function logout() { await api("/api/auth/logout", { method: "POST" }); window.location.replace("/"); }
async function openPersonalPortal() {
  const { data, personalQuota, modelPolicy, availableModels, modelPricing } = await api("/api/credentials/mine");
  state.portalCredentials = data; state.portalQuota = personalQuota; state.modelPolicy = modelPolicy; state.availableModels = availableModels || []; state.modelPricing = modelPricing || {};
  $("#managerApp").hidden = true; renderStudentPortal(); $("#studentPortal").hidden = false;
}
async function initialize() {
  const setup = new URLSearchParams(window.location.search).get("setup") === "1"; $("#setupForm").hidden = !setup; $("#loginForm").hidden = setup;
  try {
    const { data: me } = await api("/api/auth/me"); state.me = me; if (!me) { $("#loginScreen").hidden = false; return; }
    $("#loginScreen").hidden = true; $("#accountName").textContent = me.displayName || me.student?.name || me.loginId; $("#currentAccountRole").textContent = accountRoleLabel(me.role); renderNavigation();
    if (me.mustChangePassword) { $("#appScreen").hidden = false; openPasswordDialog(true); return; }
    if (me.role === "student") { $("#appScreen").classList.add("student-mode"); $("#managerApp").hidden = true; $("#studentPortal").hidden = true; setViewPath("personalKeys", true); await openPersonalPortal(); $("#appScreen").hidden = false; return; }
    $("#appScreen").hidden = false;
    await navigateView(viewFromPath(), { replace: window.location.pathname === "/" });
  } catch { $("#loginScreen").hidden = false; }
}

$("#loginForm").addEventListener("submit", async (event) => { event.preventDefault(); error("#loginError"); try { await api("/api/auth/login", { method: "POST", body: JSON.stringify({ loginId: $("#loginId").value.trim(), password: $("#loginPassword").value }) }); await initialize(); } catch (e) { error("#loginError", e.message); } });
$("#setupForm").addEventListener("submit", async (event) => { event.preventDefault(); error("#setupError"); try { await api("/api/auth/bootstrap", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); history.replaceState({}, "", "/"); await initialize(); } catch (e) { error("#setupError", e.message); } });
$("#passwordForm").addEventListener("submit", async (event) => { event.preventDefault(); error("#passwordFormError"); if ($("#newPassword").value !== $("#newPasswordConfirm").value) { error("#passwordFormError", "새 비밀번호가 일치하지 않습니다."); return; } try { await api("/api/auth/password", { method: "POST", body: JSON.stringify({ currentPassword: $("#currentPassword").value, newPassword: $("#newPassword").value }) }); close("passwordDialog"); await initialize(); notice("비밀번호를 변경했습니다."); } catch (e) { error("#passwordFormError", e.message); } });
$("#accountForm").addEventListener("submit", async (event) => { event.preventDefault(); error("#accountFormError"); try { await api("/api/accounts", { method: "POST", body: JSON.stringify({ role: $("#accountRole").value, displayName: $("#accountDisplayName").value.trim(), loginId: $("#accountLoginId").value.trim(), memo: $("#accountMemo").value.trim() }) }); close("accountDialog"); await Promise.all([loadAccounts(), loadData()]); notice("관리자 계정을 생성했습니다. 개인 키·한도 소유자로도 등록되었습니다. 첫 로그인 시 비밀번호 변경이 필요합니다."); } catch (e) { error("#accountFormError", e.message); } });
$("#accountEditForm").addEventListener("submit", async (event) => { event.preventDefault(); error("#accountEditError"); try { const id = $("#accountEditId").value; const data = await api(`/api/accounts/${id}`, { method: "PATCH", body: JSON.stringify({ displayName: $("#accountEditDisplayName").value.trim(), memo: $("#accountEditMemo").value.trim() }) }); if (state.me?.id === id) { state.me.displayName = data.data.displayName; $("#accountName").textContent = data.data.displayName; } close("accountEditDialog"); await loadAccounts(); notice("계정 정보를 수정했습니다."); } catch (e) { error("#accountEditError", e.message); } });
$("#studentForm").addEventListener("submit", async (event) => { event.preventDefault(); error("#studentFormError"); const id = $("#studentId").value; const existing = state.students.find((s) => String(s.id) === id); const payload = { rosterNumber: Number($("#rosterNumber").value), studentNumber: $("#studentNumber").value.trim(), name: $("#studentName").value.trim(), className: $("#studentClass").value.trim(), advisorName: $("#studentAdvisor").value.trim(), isActive: $("#studentActive").value === "true" }; try { const response = id ? await api(`/api/students/${id}`, { method: "PATCH", body: JSON.stringify(payload) }) : await api("/api/students", { method: "POST", body: JSON.stringify(payload) }); const studentId = id || response.data.id; const teamId = $("#studentTeam").value; if (teamId && Number(teamId) !== Number(existing?.team_id)) await api(`/api/teams/${teamId}/members`, { method: "POST", body: JSON.stringify({ studentId }) }); if (!teamId && existing?.team_id) await api(`/api/teams/${existing.team_id}/members/${studentId}`, { method: "DELETE" }); close("studentDialog"); await loadData(); notice(id ? "학생 정보를 수정했습니다." : "학생을 추가했습니다."); } catch (e) { error("#studentFormError", e.message); } });
$("#hardDeleteStudentButton").addEventListener("click", () => { const student = state.students.find((item) => String(item.id) === $("#studentId").value); if (!student) return; state.hardDeleteStudent = student; $("#hardDeleteStudentName").textContent = student.name; $("#hardDeleteConfirmName").value = ""; error("#hardDeleteStudentError"); dialog("hardDeleteStudentDialog"); });
$("#hardDeleteStudentForm").addEventListener("submit", async (event) => { event.preventDefault(); const student = state.hardDeleteStudent; if (!student) return; error("#hardDeleteStudentError"); try { await api(`/api/students/${student.id}/hard-delete`, { method: "POST", body: JSON.stringify({ confirmName: $("#hardDeleteConfirmName").value }) }); close("hardDeleteStudentDialog"); close("studentDialog"); state.hardDeleteStudent = null; await loadData(); notice("학생을 완전 삭제했습니다."); } catch (e) { error("#hardDeleteStudentError", e.message); } });
$("#teamForm").addEventListener("submit", async (event) => { event.preventDefault(); error("#teamFormError"); try { await api("/api/teams", { method: "POST", body: JSON.stringify({ name: $("#teamName").value.trim(), className: $("#teamClass").value.trim(), advisorName: $("#teamAdvisor").value.trim() }) }); close("teamDialog"); await loadData(); notice("조를 만들었습니다."); } catch (e) { error("#teamFormError", e.message); } });
$("#modelPolicyForm").addEventListener("submit", async (event) => { event.preventDefault(); error("#modelPolicyFormError"); const models = [...new Set($("#modelPolicyModels").value.split(/[\n,]/).map((model) => model.trim()).filter(Boolean))]; if (!models.length) { error("#modelPolicyFormError", "허용 모델을 한 개 이상 입력하세요."); return; } if (!confirm(`${models.length}개 모델만 이 워크스페이스 키에서 허용합니다. 저장할까요?`)) return; try { const response = await api("/api/model-policy", { method: "PUT", body: JSON.stringify({ models }) }); state.modelPolicy = response.data; close("modelPolicyDialog"); render(); notice("허용 모델 정책을 OpenRouter에 적용했습니다."); } catch (e) { error("#modelPolicyFormError", e.message); } });
$("#credentialSubjectType").addEventListener("change", async () => { renderCredentialSubjects(); await syncCredentialQuota(); });
$("#credentialSubjectId").addEventListener("change", syncCredentialQuota);
$("#saveStudentQuotaButton").addEventListener("click", async () => {
  const student = state.activeStudent; if (!student) return;
  if (!confirm("개인 한도를 저장하면 현재 개인 키가 폐기됩니다. 계속할까요?")) return;
  try {
    const { data } = await api(`/api/students/${student.id}/quota`, { method: "PUT", body: JSON.stringify({ limitUsd: Number($("#studentQuotaLimit").value), period: $("#studentQuotaPeriod").value }) });
    await loadData(); renderStudentQuota(data); await openStudentDetail(student.id); notice("개인 한도 정책을 저장했고 활성 개인 키를 폐기했습니다.");
  } catch (e) { $("#studentQuotaSummary").textContent = e.message; }
});
$("#credentialForm").addEventListener("submit", async (event) => { event.preventDefault(); error("#credentialFormError"); try { const response = await api("/api/credentials", { method: "POST", body: JSON.stringify({ subjectType: $("#credentialSubjectType").value, subjectId: Number($("#credentialSubjectId").value), label: $("#credentialLabel").value.trim(), limitUsd: Number($("#credentialLimit").value), limitReset: $("#credentialReset").value }) }); close("credentialDialog"); await loadData(); await refreshOpenDetails(); await showKey(response.data.key, "발급된 키", null, response.data.id); } catch (e) { error("#credentialFormError", e.message); } });
$("#bulkCredentialClass").addEventListener("change", refreshBulkCount);
$("#bulkCredentialForm").addEventListener("submit", async (event) => { event.preventDefault(); if (state.bulkCredentialBusy) return; error("#bulkCredentialError"); const className = $("#bulkCredentialClass").value; const subjects = bulkSubjects().filter((subject) => !className || subject.class_name === className); const subjectLabel = state.bulkSubjectType === "student" ? "학생" : "조"; if (!confirm(`${subjects.length}${state.bulkSubjectType === "student" ? "명" : "개"} ${subjectLabel}에 키를 발급할까요?`)) return; setBulkCredentialBusy(true, subjects.length); try { const { data } = await api("/api/credentials/bulk", { method: "POST", body: JSON.stringify({ subjectType: state.bulkSubjectType, subjectIds: subjects.map((subject) => subject.id), limitUsd: Number($("#bulkCredentialLimit").value), limitReset: $("#bulkCredentialReset").value, labelPrefix: $("#bulkCredentialPrefix").value.trim() }) }); state.bulkResults = data; await loadData(); close("bulkCredentialDialog"); const issued = data.filter((item) => item.status === "issued").length; $("#bulkResultSummary").textContent = `${issued}개 발급, ${data.length - issued}개 건너뜀`; dialog("bulkResultDialog"); } catch (e) { error("#bulkCredentialError", e.message); } finally { setBulkCredentialBusy(false); } });
$("#assignStudentButton").addEventListener("click", async () => { const studentId = $("#assignStudent").value; if (!studentId || !state.activeTeam) return; try { await api(`/api/teams/${state.activeTeam.id}/members`, { method: "POST", body: JSON.stringify({ studentId: Number(studentId) }) }); await loadData(); await openTeam(state.activeTeam.id); notice("학생을 배정했습니다."); } catch (e) { notice(e.message); } });
$("#primaryAction").addEventListener("click", async () => { if (state.view === "students") openStudent(); else if (state.view === "teams") dialog("teamDialog"); else if (state.view === "accounts") await openAccount(); else if (state.view === "credentials") openCredential(); else if (state.view === "modelPolicy") openModelPolicy(); });
$("#bulkCredentialButton").addEventListener("click", () => openBulkCredential("student"));
$("#hideRevokedKeys").addEventListener("change", render);
$("#bulkTeamCredentialButton").addEventListener("click", () => openBulkCredential("team"));
$("#bulkRevokeButton").addEventListener("click", async () => { const credentialIds = [...state.selectedCredentialIds]; if (!credentialIds.length || !confirm(`${credentialIds.length}개 키를 폐기할까요? 이 작업은 되돌릴 수 없습니다.`)) return; try { const { data } = await api("/api/credentials/revoke", { method: "POST", body: JSON.stringify({ credentialIds }) }); await loadData(); const revoked = data.filter((item) => item.status === "revoked").length; notice(`${revoked}개 키를 폐기했습니다.${data.length > revoked ? ` ${data.length - revoked}개는 건너뛰었습니다.` : ""}`); } catch (e) { notice(e.message); } });
$("#auditMoreButton").addEventListener("click", () => loadAudits(false));
$("#searchInput").addEventListener("input", render); $("#classFilter").addEventListener("change", render); $("#auditActionFilter").addEventListener("change", render); $("#portalModelSearch").addEventListener("input", (event) => { state.portalModelSearch = event.target.value; renderPortalModelList(); }); $("#logoutButton").addEventListener("click", logout); $("#portalLogoutButton").addEventListener("click", logout); $("#portalBackButton").addEventListener("click", () => navigateView("dashboard")); $("#portalLanguageToggle").addEventListener("click", () => { state.portalLanguage = state.portalLanguage === "en" ? "ko" : "en"; localStorage.setItem("student-portal-language", state.portalLanguage); renderStudentPortal(); if ($("#keyRevealDialog").open) { renderPortalKeyReveal(state.portalRevealSubjectType); renderKeyTestTools(); } }); $("#copyPortalBaseUrlButton").addEventListener("click", async () => { await navigator.clipboard.writeText($("#portalBaseUrl").textContent); $("#copyPortalBaseUrlButton").textContent = portalText("복사됨", "Copied"); setTimeout(() => { $("#copyPortalBaseUrlButton").textContent = portalText("복사", "Copy"); }, 1500); }); $("#passwordButton").addEventListener("click", () => openPasswordDialog());
$("#passwordDialog").addEventListener("cancel", (event) => { if (state.me?.mustChangePassword) event.preventDefault(); });
document.addEventListener("error", (event) => { if (event.target instanceof HTMLImageElement && event.target.closest(".model-logo")) event.target.remove(); }, true);
$("#bulkCredentialDialog").addEventListener("cancel", (event) => { if (state.bulkCredentialBusy) event.preventDefault(); });
$("#copyKeyButton").addEventListener("click", async () => { await navigator.clipboard.writeText($("#revealedKey").value); $("#copyKeyButton").textContent = portalKeyRevealText("복사됨", "Copied"); setTimeout(() => { $("#copyKeyButton").textContent = portalKeyRevealText("키만 복사", "Copy key"); }, 1500); });
$("#copyKeyInlineButton").addEventListener("click", () => $("#copyKeyButton").click());
$("#copyConnectionJsonButton").addEventListener("click", async () => { await navigator.clipboard.writeText($("#connectionJson").value); $("#copyConnectionJsonButton").textContent = portalKeyRevealText("복사됨", "Copied"); setTimeout(() => { $("#copyConnectionJsonButton").textContent = portalKeyRevealText("연결 JSON 복사", "Copy connection JSON"); }, 1500); });
$("#copyCurlSnippetButton").addEventListener("click", async () => { await navigator.clipboard.writeText($("#curlTestSnippet").value); $("#copyCurlSnippetButton").textContent = portalKeyRevealText("복사됨", "Copied"); setTimeout(() => { $("#copyCurlSnippetButton").textContent = portalKeyRevealText("curl 복사", "Copy curl"); }, 1500); });
$("#keyTestModel").addEventListener("input", () => { const model = $("#keyTestModel").value; if (!testModels().includes(model)) { $("#testModelVisual").innerHTML = ""; $("#curlTestSnippet").value = "목록에서 허용 모델을 선택하세요."; return; } $("#testModelVisual").innerHTML = modelCard(model, true); updateCurlSnippet(); });
$("#downloadBulkCsv").addEventListener("click", () => { const rows = [["subject_type", "subject_id", "target", "openrouter_key", "result"], ...state.bulkResults.map((result) => [result.subjectType, result.subjectId, result.subjectName || "", result.key || "", result.status])]; const csv = "\uFEFF" + rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); link.download = `classkeys-bulk-keys-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href); });
document.addEventListener("change", (event) => { if (event.target.id === "selectAllCredentials") { const q = query(); const className = $("#classFilter").value; const activeIds = state.credentials.filter((c) => c.status === "active" && (!q || [c.subjectName, c.keyLabel, c.subjectType].join(" ").toLowerCase().includes(q)) && (!className || c.className === className)).map((c) => c.id); for (const id of activeIds) event.target.checked ? state.selectedCredentialIds.add(id) : state.selectedCredentialIds.delete(id); renderCredentials(); return; } const id = event.target.dataset.selectCredential; if (id) { event.target.checked ? state.selectedCredentialIds.add(id) : state.selectedCredentialIds.delete(id); updateBulkRevokeButton(); } });
document.addEventListener("click", async (event) => {
  const keyTab = event.target.closest("[data-key-tab]"); if (keyTab) { setKeyTab(keyTab.dataset.keyTab); return; }
  const view = event.target.closest("[data-view]"); if (view) { if (view.dataset.view === "credentials" && !state.me?.canViewCredentials) return; await navigateView(view.dataset.view); return; }
  const closer = event.target.closest("[data-close]"); if (closer) { if (closer.dataset.close === "bulkCredentialDialog" && state.bulkCredentialBusy) return; close(closer.dataset.close); return; }
  const student = event.target.closest("[data-view-student]"); if (student) { await openStudentDetail(student.dataset.viewStudent); return; }
  const edit = event.target.closest("[data-open-student-edit]"); if (edit && state.activeStudent) { close("studentDetailDialog"); openStudent(state.activeStudent); return; }
  const team = event.target.closest("[data-manage-team]"); if (team) { await openTeam(team.dataset.manageTeam); return; }
  const detailIssue = event.target.closest("[data-detail-issue]"); if (detailIssue) { const subjectType = detailIssue.dataset.detailIssue; const subjectId = subjectType === "student" ? state.activeStudent?.id : $("#teamMembersDialog").open ? state.activeTeam?.id : state.activeStudent?.team_id; if (subjectId) openCredential(subjectType, subjectId); return; }
  const editAccount = event.target.closest("[data-edit-account]"); if (editAccount) { const account = state.accounts.find((item) => item.id === editAccount.dataset.editAccount); if (account) openAccountEdit(account); return; }
  const resetAccount = event.target.closest("[data-reset-account]"); if (resetAccount) { if (!confirm("초기 비밀번호로 재설정하고 모든 로그인 세션을 종료할까요?")) return; try { await api(`/api/accounts/${resetAccount.dataset.resetAccount}/reset-password`, { method: "POST" }); await loadAccounts(); notice("초기 비밀번호로 재설정했습니다."); } catch (e) { notice(e.message); } return; }
  const toggleAccount = event.target.closest("[data-toggle-account]"); if (toggleAccount) { const account = state.accounts.find((item) => item.id === toggleAccount.dataset.toggleAccount); if (!account || !confirm(account.isActive ? "비활성화하면 모든 로그인 세션이 종료됩니다." : "계정을 다시 활성화할까요?")) return; try { await api(`/api/accounts/${account.id}/status`, { method: "POST", body: JSON.stringify({ isActive: !account.isActive }) }); await loadAccounts(); notice(account.isActive ? "계정을 비활성화했습니다." : "계정을 활성화했습니다."); } catch (e) { notice(e.message); } return; }
  const remove = event.target.closest("[data-remove-member]"); if (remove && state.activeTeam) { try { await api(`/api/teams/${state.activeTeam.id}/members/${remove.dataset.removeMember}`, { method: "DELETE" }); await loadData(); await openTeam(state.activeTeam.id); notice("조원 편성을 해제했습니다."); } catch (e) { notice(e.message); } return; }
  const audit = event.target.closest("[data-audit-details]"); if (audit) { const record = state.audits.find((item) => item.id === audit.dataset.auditDetails); if (record) { $("#auditDialogTitle").textContent = auditLabel(record.action); $("#auditDetails").value = JSON.stringify({ action: record.action, actor: { name: record.actorName, loginId: record.actorLoginId }, subjectType: record.subjectType, subjectId: record.subjectId, subjectName: record.subjectName, createdAtUtc: record.createdAt, metadata: record.metadata }, null, 2); dialog("auditDialog"); } return; }
  const saveAccessPolicy = event.target.closest("#saveAccessPolicyButton"); if (saveAccessPolicy) { const next = !state.accessPolicy?.allowAdminCredentialManagement; if (!confirm(`관리자의 전체 키 관리를 ${next ? "허용" : "차단"}할까요?`)) return; try { const { data } = await api("/api/access-policy", { method: "PUT", body: JSON.stringify({ allowAdminCredentialManagement: next }) }); state.accessPolicy = data; render(); notice(`관리자 전체 키 관리를 ${next ? "허용" : "차단"}했습니다.`); } catch (e) { notice(e.message); } return; }
  const reveal = event.target.closest("[data-reveal-key]"); if (reveal) { try { const { data } = await api(`/api/credentials/${reveal.dataset.revealKey}/reveal`); await showKey(data.key, "저장된 키"); } catch (e) { notice(e.message); } return; }
  const reissue = event.target.closest("[data-reissue-key]"); if (reissue) { if (!confirm("기존 키를 폐기하고 새 키를 발급할까요?")) return; try { const { data } = await api(`/api/credentials/${reissue.dataset.reissueKey}/reissue`, { method: "POST" }); await loadData(); await showKey(data.key, "재발급된 키"); } catch (e) { notice(e.message); } return; }
  const revoke = event.target.closest("[data-revoke-key]"); if (revoke) { if (!confirm("이 키를 폐기하면 다시 사용할 수 없습니다.")) return; try { await api(`/api/credentials/${revoke.dataset.revokeKey}/revoke`, { method: "POST" }); await loadData(); await refreshOpenDetails(); notice("키를 폐기했습니다."); } catch (e) { notice(e.message); } return; }
  const provider = event.target.closest("[data-portal-provider]"); if (provider) { state.portalModelProvider = provider.dataset.portalProvider; renderPortalProviderList(); renderPortalModelList(); return; }
  const model = event.target.closest("[data-portal-model]"); if (model) { state.selectedPortalModel = model.dataset.portalModel; renderPortalModelList(); return; }
  const portal = event.target.closest("[data-portal-key]"); if (portal) { const credential = state.portalCredentials.find((c) => c.id === portal.dataset.portalKey); if (credential) { try { const { data } = await api(`/api/credentials/${credential.id}/reveal`); await showKey(data.key, "", credential.subjectType); } catch (e) { notice(e.message); } } }
});
window.addEventListener("popstate", () => { if (!state.me || state.me.role === "student") return; navigateView(viewFromPath(), { updateUrl: false }); });
initialize();
