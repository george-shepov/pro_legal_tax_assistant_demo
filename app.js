const EVENT_TYPES = new Set([
  "user_message", "agent_message", "status", "agent_route", "tool_start",
  "tool_complete", "document_upload", "document_parsed", "citation",
  "generated_file", "metric", "warning", "call_to_action"
]);

const SCENARIO_FILES = [
  "scenarios/grounded-research.json",
  "scenarios/document-intake.json",
  "scenarios/docket-review.json",
  "scenarios/tax-notice.json"
];

const state = {
  scenarios: [],
  scenarioIndex: 0,
  eventIndex: 0,
  timer: null,
  playing: false,
  complete: false,
  speed: 1,
  generation: 0,
  reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  evidenceCount: 0,
  config: null
};

const elements = {
  tabs: document.querySelector("#scenario-tabs"),
  feed: document.querySelector("#event-feed"),
  evidence: document.querySelector("#evidence-list"),
  evidenceCount: document.querySelector("#evidence-count"),
  metrics: document.querySelector("#metric-grid"),
  agentList: document.querySelector("#agent-list"),
  title: document.querySelector("#scenario-title"),
  subtitle: document.querySelector("#scenario-subtitle"),
  matter: document.querySelector("#matter-label"),
  runState: document.querySelector("#run-state"),
  progress: document.querySelector("#progress-bar"),
  play: document.querySelector("#play-button"),
  restart: document.querySelector("#restart-button"),
  speed: document.querySelector("#speed-select"),
  dialog: document.querySelector("#artifact-dialog"),
  dialogTitle: document.querySelector("#artifact-title"),
  dialogPreview: document.querySelector("#artifact-preview"),
  dialogClose: document.querySelector("#dialog-close"),
  dialogCancel: document.querySelector("#dialog-cancel"),
  artifactDownload: document.querySelector("#artifact-download"),
  leadForm: document.querySelector("#lead-form"),
  formMode: document.querySelector("#form-mode"),
  formStatus: document.querySelector("#form-status"),
  submit: document.querySelector("#submit-button"),
  repositoryLink: document.querySelector("#repository-link"),
  deploymentLink: document.querySelector("#deployment-link")
};

function createElement(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  for (const [name, value] of Object.entries(options.attributes || {})) {
    node.setAttribute(name, String(value));
  }
  return node;
}

function validateScenario(scenario, source) {
  if (!scenario || typeof scenario !== "object") throw new Error(`${source}: expected object`);
  for (const key of ["id", "title", "shortTitle", "description", "matter", "events"]) {
    if (!(key in scenario)) throw new Error(`${source}: missing ${key}`);
  }
  if (!Array.isArray(scenario.events) || scenario.events.length === 0) {
    throw new Error(`${source}: events must be a non-empty array`);
  }
  scenario.events.forEach((event, index) => {
    if (!EVENT_TYPES.has(event.type)) {
      throw new Error(`${source}: unsupported event type at ${index}: ${event.type}`);
    }
    if (!Number.isFinite(event.delay) || event.delay < 0) {
      throw new Error(`${source}: invalid delay at ${index}`);
    }
  });
  return scenario;
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

async function initialize() {
  try {
    const [config, ...scenarios] = await Promise.all([
      fetchJson("config.json"),
      ...SCENARIO_FILES.map(async (path) => validateScenario(await fetchJson(path), path))
    ]);
    state.config = config;
    state.scenarios = scenarios;
    configureLinks();
    configureLeadForm();
    buildTabs();
    selectScenario(0);
    bindEvents();
  } catch (error) {
    showFatalError(error);
  }
}

function showFatalError(error) {
  elements.feed.replaceChildren();
  const wrap = createElement("div", { className: "feed-empty" });
  wrap.append(
    createElement("span", { text: "!" }),
    createElement("strong", { text: "The static scenario files could not be loaded." }),
    createElement("p", { text: "Serve this directory over HTTP instead of opening index.html directly." })
  );
  elements.feed.append(wrap);
  elements.play.disabled = true;
  console.error("Demo initialization failed", error);
}

function configureLinks() {
  if (isSafeWebUrl(state.config.repositoryUrl)) {
    elements.repositoryLink.href = state.config.repositoryUrl;
  }
  if (isSafeRelativeOrWebUrl(state.config.deploymentGuide)) {
    elements.deploymentLink.href = state.config.deploymentGuide;
  }
}

function buildTabs() {
  elements.tabs.replaceChildren();
  state.scenarios.forEach((scenario, index) => {
    const button = createElement("button", {
      className: "scenario-tab",
      attributes: {
        type: "button",
        role: "tab",
        id: `scenario-tab-${index}`,
        "aria-controls": "event-feed",
        "aria-selected": index === 0 ? "true" : "false",
        tabindex: index === 0 ? "0" : "-1"
      }
    });
    button.append(
      createElement("span", { className: "scenario-number", text: String(index + 1).padStart(2, "0") })
    );
    const text = createElement("span");
    text.append(
      createElement("strong", { text: scenario.shortTitle }),
      createElement("small", { text: scenario.benefit })
    );
    button.append(text);
    button.addEventListener("click", () => selectScenario(index));
    button.addEventListener("keydown", (event) => handleTabKey(event, index));
    elements.tabs.append(button);
  });
}

function handleTabKey(event, index) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  let next = index;
  if (event.key === "ArrowLeft") next = (index - 1 + state.scenarios.length) % state.scenarios.length;
  if (event.key === "ArrowRight") next = (index + 1) % state.scenarios.length;
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = state.scenarios.length - 1;
  selectScenario(next);
  elements.tabs.children[next].focus();
}

function selectScenario(index) {
  if (!state.scenarios[index]) return;
  stopPlayback();
  state.scenarioIndex = index;
  state.eventIndex = 0;
  state.complete = false;
  state.evidenceCount = 0;
  state.generation += 1;

  const scenario = state.scenarios[index];
  elements.title.textContent = scenario.title;
  elements.subtitle.textContent = scenario.description;
  elements.matter.textContent = scenario.matter;
  elements.feed.replaceChildren();
  elements.evidence.replaceChildren(createElement("p", {
    className: "evidence-empty",
    text: "Sources, artifacts, and docket changes will appear here as the scenario runs."
  }));
  elements.metrics.replaceChildren();
  elements.evidenceCount.textContent = "0 items";
  buildAgentList(scenario.agents || []);
  showEmptyFeed(scenario);
  updateProgress();
  updatePlaybackUi();

  [...elements.tabs.children].forEach((tab, tabIndex) => {
    tab.setAttribute("aria-selected", tabIndex === index ? "true" : "false");
    tab.tabIndex = tabIndex === index ? 0 : -1;
  });
}

function buildAgentList(agents) {
  elements.agentList.replaceChildren();
  agents.forEach((agent, index) => {
    const item = createElement("div", {
      className: `agent-chip${index === 0 ? " active" : ""}`,
      attributes: { "data-agent": agent.name }
    });
    item.append(
      createElement("span", { className: "agent-avatar", text: agent.avatar || "◉" }),
      createElement("span", { text: agent.name })
    );
    elements.agentList.append(item);
  });
}

function showEmptyFeed(scenario) {
  const empty = createElement("div", { className: "feed-empty" });
  const content = createElement("div");
  content.append(
    createElement("span", { text: scenario.icon || "◎" }),
    createElement("strong", { text: scenario.prompt }),
    createElement("p", { text: "Start the demo to replay this fixed, fictional workflow." })
  );
  empty.append(content);
  elements.feed.append(empty);
}

function bindEvents() {
  elements.play.addEventListener("click", togglePlayback);
  elements.restart.addEventListener("click", restartScenario);
  elements.speed.addEventListener("change", () => {
    state.speed = Number(elements.speed.value) || 1;
    if (state.playing) scheduleNext(0);
  });
  elements.dialogClose.addEventListener("click", closeDialog);
  elements.dialogCancel.addEventListener("click", closeDialog);
  elements.leadForm.addEventListener("submit", submitLead);
  document.addEventListener("keydown", handleGlobalKey);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.playing) pausePlayback();
  });
}

function handleGlobalKey(event) {
  const target = event.target;
  const editing = target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target?.isContentEditable;
  if (editing || elements.dialog.open) return;
  if (event.code === "Space") {
    event.preventDefault();
    togglePlayback();
  } else if (event.key.toLowerCase() === "r") {
    restartScenario();
  } else if (/^[1-4]$/.test(event.key)) {
    selectScenario(Number(event.key) - 1);
  }
}

function togglePlayback() {
  if (state.complete) {
    restartScenario();
    startPlayback();
  } else if (state.playing) {
    pausePlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  if (!state.scenarios.length || state.complete) return;
  state.playing = true;
  clearTimeout(state.timer);
  updatePlaybackUi();
  scheduleNext(state.eventIndex === 0 ? 150 : 0);
}

function pausePlayback() {
  state.playing = false;
  clearTimeout(state.timer);
  state.timer = null;
  state.generation += 1;
  updatePlaybackUi();
}

function stopPlayback() {
  state.playing = false;
  clearTimeout(state.timer);
  state.timer = null;
}

function restartScenario() {
  const wasPlaying = state.playing;
  selectScenario(state.scenarioIndex);
  if (wasPlaying) startPlayback();
}

function scheduleNext(overrideDelay) {
  clearTimeout(state.timer);
  if (!state.playing) return;
  const scenario = state.scenarios[state.scenarioIndex];
  const event = scenario.events[state.eventIndex];
  if (!event) {
    finishScenario();
    return;
  }
  const delay = overrideDelay ?? (state.reducedMotion ? 40 : event.delay / state.speed);
  const generation = state.generation;
  state.timer = setTimeout(async () => {
    if (!state.playing || generation !== state.generation) return;
    await renderEvent(event, generation);
    if (generation !== state.generation) return;
    state.eventIndex += 1;
    updateProgress();
    scheduleNext();
  }, Math.max(0, delay));
}

async function renderEvent(event, generation) {
  if (elements.feed.querySelector(".feed-empty")) elements.feed.replaceChildren();
  if (event.type === "citation" || event.type === "generated_file" || event.type === "document_parsed") {
    addEvidence(event);
  }
  if (event.type === "metric") {
    addMetric(event);
  }
  if (event.type === "agent_route" && event.agent) {
    highlightAgent(event.agent);
  }
  const row = buildFeedEvent(event);
  elements.feed.append(row);
  elements.feed.scrollTop = elements.feed.scrollHeight;

  if (event.type === "agent_message" && event.stream !== false && !state.reducedMotion) {
    const paragraph = row.querySelector("p");
    paragraph.textContent = "";
    paragraph.classList.add("typing-cursor");
    await streamText(paragraph, event.text || "", generation);
    paragraph.classList.remove("typing-cursor");
  }
}

function buildFeedEvent(event) {
  const role = event.type === "user_message"
    ? "user"
    : event.type === "agent_message"
      ? "assistant"
      : event.type === "warning"
        ? "system warning"
        : event.type === "call_to_action"
          ? "system cta"
          : "system";
  const row = createElement("article", { className: `event ${role}` });
  const card = createElement("div", { className: "event-card" });

  if (role === "user" || role === "assistant") {
    const meta = createElement("div", { className: "event-meta" });
    meta.append(
      createElement("span", { className: "event-icon", text: role === "user" ? "YOU" : (event.avatar || "◎") }),
      createElement("span", { text: event.agent || (role === "user" ? "Professional" : "Assistant") })
    );
    card.append(meta, createElement("p", { text: event.text || "" }));
  } else {
    card.append(
      createElement("span", { className: "event-icon", text: eventIcon(event.type) }),
      createElement("p", { text: event.text || event.label || event.title || event.type })
    );
  }
  row.append(card);
  return row;
}

function eventIcon(type) {
  return {
    status: "●", agent_route: "↳", tool_start: "⌁", tool_complete: "✓",
    document_upload: "⇧", document_parsed: "▤", citation: "⌕",
    generated_file: "⬒", metric: "↗", warning: "!", call_to_action: "→"
  }[type] || "·";
}

async function streamText(node, text, generation) {
  const words = text.split(/(\s+)/);
  for (const word of words) {
    if (!state.playing || generation !== state.generation) return;
    node.textContent += word;
    elements.feed.scrollTop = elements.feed.scrollHeight;
    await wait(Math.max(8, 32 / state.speed));
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function addEvidence(event) {
  if (elements.evidence.querySelector(".evidence-empty")) elements.evidence.replaceChildren();
  const card = createElement("article", { className: "evidence-card" });
  const header = createElement("header");
  header.append(createElement("strong", { text: event.title || event.filename || "Source" }));
  if (Number.isFinite(event.relevanceScore)) {
    header.append(createElement("span", {
      className: "score",
      text: `${Math.round(event.relevanceScore * 100)}% match`
    }));
  } else if (event.status) {
    header.append(createElement("span", { className: "score", text: event.status }));
  }
  card.append(header);
  if (event.snippet || event.text) {
    card.append(createElement("p", { text: event.snippet || event.text }));
  }
  const meta = createElement("div", { className: "evidence-meta" });
  [event.sourceType, event.page && `Page ${event.page}`, event.court, event.jurisdiction, event.date]
    .filter(Boolean)
    .forEach((value) => meta.append(createElement("span", { text: value })));
  card.append(meta);

  if (event.type === "generated_file" && isSafeRelativeOrWebUrl(event.path)) {
    const button = createElement("button", {
      className: "artifact-button",
      text: "Preview fictional artifact",
      attributes: { type: "button" }
    });
    button.addEventListener("click", () => openArtifact(event));
    card.append(button);
  }
  elements.evidence.append(card);
  state.evidenceCount += 1;
  elements.evidenceCount.textContent = `${state.evidenceCount} ${state.evidenceCount === 1 ? "item" : "items"}`;
}

function addMetric(event) {
  const metric = createElement("div", { className: "metric" });
  metric.append(
    createElement("small", { text: event.label }),
    createElement("strong", { text: event.value })
  );
  elements.metrics.append(metric);
}

function highlightAgent(agentName) {
  elements.agentList.querySelectorAll(".agent-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.getAttribute("data-agent") === agentName);
  });
}

function finishScenario() {
  state.playing = false;
  state.complete = true;
  state.timer = null;
  updateProgress();
  updatePlaybackUi();
}

function updateProgress() {
  const total = state.scenarios[state.scenarioIndex]?.events.length || 1;
  const percent = state.complete ? 100 : (state.eventIndex / total) * 100;
  elements.progress.style.width = `${Math.min(100, percent)}%`;
}

function updatePlaybackUi() {
  elements.runState.className = `run-state${state.playing ? " running" : state.complete ? " complete" : ""}`;
  elements.runState.lastChild.textContent = state.playing ? " Running" : state.complete ? " Complete" : state.eventIndex ? " Paused" : " Ready";
  elements.play.textContent = state.playing ? "Pause" : state.complete ? "Replay" : state.eventIndex ? "Resume" : "Start demo";
  elements.play.setAttribute("aria-label", state.playing ? "Pause scenario" : state.complete ? "Replay scenario" : "Start or resume scenario");
}

async function openArtifact(event) {
  elements.dialogTitle.textContent = event.title || event.filename || "Artifact preview";
  elements.dialogPreview.replaceChildren(createElement("p", { text: "Loading preview…" }));
  elements.artifactDownload.href = event.path;
  elements.artifactDownload.download = event.filename || "";
  elements.dialog.showModal();
  try {
    const response = await fetch(event.path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    elements.dialogPreview.replaceChildren(createElement("pre", { text }));
  } catch (error) {
    elements.dialogPreview.replaceChildren(createElement("p", {
      text: "Preview unavailable. The artifact link remains available for this fictional sample."
    }));
    console.error("Artifact preview failed", error);
  }
}

function closeDialog() {
  elements.dialog.close();
}

function configureLeadForm() {
  const endpoint = state.config.formEndpoint?.trim();
  const email = state.config.contactEmail?.trim();
  if (isSafeWebUrl(endpoint)) {
    elements.formMode.textContent = "Submitting sends these business-contact fields to the configured external form provider.";
    elements.submit.textContent = "Submit consultation request";
    elements.submit.disabled = false;
  } else if (isUsableEmail(email)) {
    elements.formMode.textContent = `Submitting opens your email application with a draft addressed to ${email}. Nothing is sent automatically.`;
    elements.submit.textContent = "Prepare email request";
    elements.submit.disabled = false;
  } else {
    elements.formMode.textContent = "Contact delivery is not configured. Set a public contact email or form endpoint in config.json.";
    elements.submit.textContent = "Contact not configured";
    elements.submit.disabled = true;
  }
}

async function submitLead(event) {
  event.preventDefault();
  setFormStatus("", "");
  if (!elements.leadForm.reportValidity()) return;
  const data = Object.fromEntries(new FormData(elements.leadForm).entries());
  const endpoint = state.config.formEndpoint?.trim();
  const email = state.config.contactEmail?.trim();

  if (isSafeWebUrl(endpoint)) {
    elements.submit.disabled = true;
    elements.submit.textContent = "Submitting…";
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error(`Submission returned HTTP ${response.status}`);
      setFormStatus("Request submitted. The configured form provider accepted it.", "success");
      elements.leadForm.reset();
    } catch (error) {
      setFormStatus("The request was not submitted. Please try again or use the repository contact route.", "error");
      console.error("Lead submission failed", error);
    } finally {
      elements.submit.disabled = false;
      elements.submit.textContent = "Submit consultation request";
    }
    return;
  }

  if (isUsableEmail(email)) {
    const subject = encodeURIComponent(`Professional Legal & Tax Assistant — ${data.deployment}`);
    const body = encodeURIComponent([
      `Name: ${data.name}`,
      `Email: ${data.email}`,
      `Organization: ${data.organization || "Not provided"}`,
      `Role: ${data.role}`,
      `Primary use case: ${data.useCase}`,
      `Preferred deployment: ${data.deployment}`,
      "",
      "No confidential legal or tax information is included."
    ].join("\n"));
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    setFormStatus("Your email application should open with a draft. The request has not been sent yet.", "success");
    return;
  }

  setFormStatus("Contact delivery is not configured; no information was sent.", "error");
}

function setFormStatus(message, className) {
  elements.formStatus.textContent = message;
  elements.formStatus.className = `form-status${className ? ` ${className}` : ""}`;
}

function isUsableEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || "") && !/example\.(com|org|net)$/i.test(value);
}

function isSafeWebUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
  } catch {
    return false;
  }
}

function isSafeRelativeOrWebUrl(value) {
  if (!value) return false;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return !value.startsWith("//");
  return isSafeWebUrl(value);
}

initialize();
