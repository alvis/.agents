import type { StateDashboardDocumentV1 } from "./state-codec.ts";

type StateRecord = Record<string, unknown>;

export function renderStateDashboardHtml(
  document: StateDashboardDocumentV1,
): string {
  const project =
    document.kind === "project" ? record(document.project) : undefined;
  const streams =
    document.kind === "project"
      ? records(document.streams)
      : records([document.stream]);
  const title =
    text(project?.title) || text(streams[0]?.workId) || "State dashboard";
  const knowledge =
    document.kind === "project"
      ? renderKnowledge(records(document.environment), records(document.traps))
      : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escapeHtml(title)} — State</title><style>${DASHBOARD_CSS}</style></head><body><a class="skip-link" href="#main-content">Skip to content</a><main id="main-content" class="state-page"><header class="state-hero"><p class="eyebrow">Essential state</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(project ? text(project.goal) : "Stream dashboard")}</p>${project ? renderProject(project) : ""}</header><nav aria-label="Dashboard sections"><a href="#streams">Streams</a>${knowledge ? '<a href="#knowledge">Project knowledge</a>' : ""}</nav><section id="streams" aria-labelledby="streams-heading"><div class="section-heading"><p class="eyebrow">Execution</p><h2 id="streams-heading">Streams</h2></div>${streams.length ? streams.map(renderStream).join("") : '<p class="empty">No streams recorded.</p>'}</section>${knowledge}</main></body></html>`;
}

function renderProject(project: StateRecord): string {
  return `<dl class="metrics"><div><dt>Project</dt><dd>${escapeHtml(text(project.slug))}</dd></div><div><dt>Updated</dt><dd>${renderTime(project.updatedAt)}</dd></div></dl>${renderStatements("Requirements", records(project.requirements))}${renderSpecification(record(project.specification))}`;
}

function renderStream(stream: StateRecord): string {
  const id = slug(text(stream.workId) || "stream");
  return `<article class="stream" aria-labelledby="stream-${id}"><header class="stream-header"><div><span class="badge status-${slug(text(stream.phase))}">${escapeHtml(text(stream.phase))}</span><h3 id="stream-${id}">${escapeHtml(text(stream.workId))}</h3><p>${escapeHtml(text(stream.blockedOn) || "Unblocked")}</p></div>${renderStreamMetrics(stream)}</header>${renderCharter(record(stream.charter), text(stream.charterStatus))}${renderTasks(records(stream.tasks))}${renderReview(record(stream.review))}<div class="columns">${renderRecords(records(stream.records))}${renderQuestions(records(stream.questions))}${renderEvents(records(stream.events))}${renderRevisions(records(stream.revisions))}</div>${renderContinuation(record(stream.continuation))}${renderSubmission(record(stream.submission))}${renderCompletion(record(stream.completion))}${renderDocumentations(records(stream.documentations))}${stream.location ? `<section><h4>Location</h4>${renderLocator(record(stream.location))}</section>` : ""}</article>`;
}

function renderStreamMetrics(stream: StateRecord): string {
  const values = [
    ["Plan revision", stream.planRevision],
    ["State revision", stream.stateRevision],
    ["Charter revision", stream.charterRevision],
    ["Sync", stream.syncState],
    ["Review", stream.reviewState],
    ["Updated", renderTime(stream.updatedAt, true)],
  ];
  return `<dl class="metrics">${values.map(([label, value]) => `<div><dt>${label}</dt><dd>${typeof value === "string" && value.startsWith("<time") ? value : escapeHtml(text(value))}</dd></div>`).join("")}</dl>`;
}

function renderCharter(
  charter: StateRecord | undefined,
  status: string,
): string {
  if (!charter)
    return `<section><h4>Charter</h4><p class="empty">${escapeHtml(status || "absent")}</p></section>`;
  const boundary = record(charter.boundary);
  return `<section><div class="section-heading compact"><h4>Charter</h4><span class="badge">revision ${escapeHtml(text(charter.revision))}</span></div><p>${escapeHtml(text(charter.goal))}</p>${renderStatements("Requirements", records(charter.requirements))}${renderStatements("In scope", records(boundary?.in))}${renderStatements("Out of scope", records(boundary?.out))}${renderCriteria(records(charter.successCriteria))}${renderSpecification(record(charter.specification))}${renderAnchors(records(charter.anchors))}</section>`;
}

function renderCriteria(criteria: StateRecord[]): string {
  if (!criteria.length) return "";
  return `<div><h5>Success criteria</h5><ul class="detail-list">${criteria.map((criterion) => `<li><strong>${escapeHtml(text(criterion.id))}</strong> ${escapeHtml(text(criterion.text))}<small>Expected: ${escapeHtml(text(criterion.expectedEvidence))}</small></li>`).join("")}</ul></div>`;
}

function renderTasks(tasks: StateRecord[]): string {
  if (!tasks.length)
    return `<section><h4>Tasks</h4><p class="empty">No tasks recorded.</p></section>`;
  return `<section><h4>Task graph</h4><div class="table-wrap"><table aria-label="Tasks"><thead><tr><th scope="col">Task</th><th scope="col">Status</th><th scope="col">Dependencies</th><th scope="col">Owner</th><th scope="col">Evidence and validity</th></tr></thead><tbody>${tasks.map((task) => `<tr><th scope="row"><strong>${escapeHtml(text(task.id))}</strong><span>${escapeHtml(text(task.summary))}</span>${renderTags(strings(task.targets))}<small>Acceptance: ${strings(task.acceptanceRefs).map(escapeHtml).join(", ") || "None"}</small></th><td><span class="badge status-${slug(text(task.status))}">${escapeHtml(text(task.status))}</span>${task.required === false ? "<small>optional</small>" : ""}${renderAttempt(record(task.attempt))}</td><td>${renderRefs(strings(task.dependsOn))}${task.parentRef ? `<small>Parent: ${escapeHtml(text(task.parentRef))}</small>` : ""}</td><td>${escapeHtml(text(task.owner) || "Unassigned")}</td><td>${renderEvidence(records(task.evidence))}${renderValidity(record(task.validity))}${task.retry ? `<small>Retry: ${escapeHtml(text(task.retry))}</small>` : ""}${task.unblock ? `<small>Unblock: ${escapeHtml(text(task.unblock))}</small>` : ""}${task.disposition ? `<small>Disposition: ${escapeHtml(text(task.disposition))}</small>` : ""}</td></tr>`).join("")}</tbody></table></div></section>`;
}

function renderReview(review: StateRecord | undefined): string {
  if (!review) return "";
  const areas = records(review.areas);
  return `<section><h4>Review</h4><div class="card-grid">${areas.map((area) => `<article class="card"><header><h5>${escapeHtml(text(area.area))}</h5>${renderValidity(record(area.validity))}</header><p><small>Revision ${escapeHtml(text(area.reviewedRevision))} · ${renderTime(area.reviewedAt, true)}</small></p>${renderFindings(records(area.findings))}</article>`).join("") || '<p class="empty">No review areas.</p>'}</div></section>`;
}

function renderFindings(findings: StateRecord[]): string {
  if (!findings.length) return '<p class="empty">No findings.</p>';
  return `<ul class="detail-list">${findings.map((finding) => `<li><div><span class="badge severity-${slug(text(finding.severity) || "info")}">${escapeHtml(text(finding.severity) || "info")}</span> <strong>${escapeHtml(text(finding.summary))}</strong></div><small>${escapeHtml(text(finding.status))}${finding.owner ? ` · ${escapeHtml(text(finding.owner))}` : ""}</small>${finding.rationale ? `<p>${escapeHtml(text(finding.rationale))}</p>` : ""}${finding.recheckCondition ? `<small>Recheck: ${escapeHtml(text(finding.recheckCondition))}</small>` : ""}${renderEvidence(records(finding.evidence))}${finding.riskAcceptance ? `<small>Risk acceptance: ${renderLocator(record(finding.riskAcceptance))}</small>` : ""}</li>`).join("")}</ul>`;
}

function renderRecords(items: StateRecord[]): string {
  return renderCollection(
    "Records and decisions",
    items,
    (item) =>
      `<strong>${escapeHtml(text(item.headline))}</strong><small>${escapeHtml(text(item.kind))} · ${escapeHtml(text(item.status))} · ${escapeHtml(text(item.owner))}</small>${renderLocator(record(item.locator))}${renderRelationship("Supersedes", strings(item.supersedes))}${renderRelationship("Affects", strings(item.affects))}${renderRelationship("Invalidates", strings(item.invalidates))}${renderRelationship("Preserves", strings(item.preserves))}${renderRelationshipStatements(records(item.relationshipStatements))}${renderLocatorList(records(item.provenance))}`,
  );
}

function renderRelationshipStatements(items: StateRecord[]): string {
  if (!items.length) return "";
  return `<ul class="relationship-statements">${items
    .map(
      (item) =>
        `<li><strong>${escapeHtml(text(item.relation))}</strong>: ${escapeHtml(text(item.text))}</li>`,
    )
    .join("")}</ul>`;
}

function renderQuestions(items: StateRecord[]): string {
  return renderCollection(
    "Questions",
    items,
    (item) =>
      `<strong>${escapeHtml(text(item.text))}</strong><small>${escapeHtml(text(item.owner))} · ${item.resolvedAt ? "resolved" : item.awaitingUser ? "awaiting user" : "open"}</small>${item.answer ? `<p>${escapeHtml(text(item.answer))}</p>` : ""}`,
  );
}

function renderEvents(items: StateRecord[]): string {
  return renderCollection(
    "Journal",
    items,
    (item) =>
      `<strong>${escapeHtml(text(item.summary))}</strong><small>${escapeHtml(text(item.eventType))} · revision ${escapeHtml(text(item.stateRevision))} · ${renderTime(item.timestamp, true)}</small><small>${escapeHtml(text(item.actor))} / ${escapeHtml(text(item.capabilityId))}</small>`,
  );
}

function renderRevisions(items: StateRecord[]): string {
  return renderCollection(
    "Plan revisions",
    items,
    (item) =>
      `<strong>${escapeHtml(text(item.what))}</strong><small>${escapeHtml(text(item.kind))} ${escapeHtml(text(item.number))} · ${escapeHtml(text(item.approver))}</small><p>${escapeHtml(text(item.why))}</p>`,
  );
}

function renderCollection(
  title: string,
  items: StateRecord[],
  render: (item: StateRecord) => string,
): string {
  if (!items.length) return "";
  return `<section class="card"><h4>${title}</h4><ul class="detail-list">${items.map((item) => `<li>${render(item)}</li>`).join("")}</ul></section>`;
}

function renderContinuation(value: StateRecord | undefined): string {
  if (!value) return "";
  return `<section><h4>Continuation</h4><div class="callout"><strong>${escapeHtml(text(value.focus))}</strong><p>${escapeHtml(text(value.handback))}</p><small>Next: ${escapeHtml(text(value.nextAction))}</small>${renderLocatorList(records(value.fastPaths))}</div></section>`;
}

function renderSubmission(value: StateRecord | undefined): string {
  if (!value) return "";
  return `<section><h4>Submission</h4><p><span class="badge">${escapeHtml(text(value.kind))}</span>${value.accepter ? ` Accepted by ${escapeHtml(text(value.accepter))}` : ""}</p><ul class="detail-list">${records(
    value.pullRequests,
  )
    .map(
      (pullRequest) =>
        `<li><strong>${renderUrl(text(pullRequest.url), `Pull request #${text(pullRequest.number)}`)}</strong><small>${escapeHtml(text(pullRequest.repository))} · ${escapeHtml(text(pullRequest.status))} · ${escapeHtml(text(pullRequest.headRevision))}</small></li>`,
    )
    .join("")}${records(value.deliverables)
    .map(
      (deliverable) =>
        `<li><strong>${escapeHtml(text(deliverable.title))}</strong><small>${deliverable.reviewed ? "reviewed" : "not reviewed"}</small>${renderLocator(record(deliverable.locator))}</li>`,
    )
    .join("")}</ul></section>`;
}

function renderCompletion(value: StateRecord | undefined): string {
  if (!value) return "";
  const promotion = record(value.promotion);
  return `<section><h4>Completion</h4><p>${renderTime(value.completedAt)} · promotion ${escapeHtml(text(promotion?.mode))}</p>${renderEvidence(records(value.landing))}${renderLocatorList(records(promotion?.paths))}${renderCollection("Durable carriers", records(value.outlives), (item) => `<strong>${escapeHtml(text(item.summary))}</strong><small>${escapeHtml(text(item.owner))}</small>${renderLocator(record(item.carrier))}`)}${renderCollection("Decision dispositions", records(value.decisionDispositions), (item) => `<strong>${escapeHtml(text(item.kind))}</strong><small>${escapeHtml(text(item.decisionRef))}</small>${renderLocator(record(item.carrier))}`)}</section>`;
}

function renderDocumentations(items: StateRecord[]): string {
  return renderCollection(
    "Documentation",
    items,
    (item) =>
      `<strong>${escapeHtml(text(item.title))}</strong>${item.capabilityRef ? `<small>${escapeHtml(text(item.capabilityRef))}</small>` : ""}${renderLocator(record(item.locator))}`,
  );
}

function renderKnowledge(
  environment: StateRecord[],
  traps: StateRecord[],
): string {
  if (!environment.length && !traps.length) return "";
  return `<section id="knowledge" aria-labelledby="knowledge-heading"><div class="section-heading"><p class="eyebrow">Evidence base</p><h2 id="knowledge-heading">Project knowledge</h2></div><div class="columns">${renderCollection("Environment", environment, (item) => `<strong>${escapeHtml(text(item.statement))}</strong><small>${renderTime(item.observedAt, true)}</small>${renderValidity(record(item.validity))}${renderEvidence(records(item.evidence))}`)}${renderCollection("Traps", traps, (item) => `<strong>${escapeHtml(text(item.symptom))}</strong><p>Cause: ${escapeHtml(text(item.cause))}</p><p>Action: ${escapeHtml(text(item.action))}</p>${renderValidity(record(item.validity))}${renderEvidence(records(item.evidence))}`)}</div></section>`;
}

function renderEvidence(items: StateRecord[]): string {
  if (!items.length) return "";
  return `<ul class="evidence">${items.map((item) => `<li><strong>${escapeHtml(text(item.summary))}</strong>${item.observedAt ? `<small>${renderTime(item.observedAt, true)}</small>` : ""}${renderLocator(record(item.locator))}${renderLocatorList(records(item.inputs))}${item.disposition ? `<small>${escapeHtml(text(item.disposition))}</small>` : ""}</li>`).join("")}</ul>`;
}

function renderAnchors(items: StateRecord[]): string {
  if (!items.length) return "";
  return `<div><h5>Workspace anchors</h5><ul class="detail-list">${items.map((item) => `<li><strong>${escapeHtml(text(item.kind))}</strong>${renderLocator(record(item.locator))}<small>${escapeHtml(text(item.revisionSemantics))}</small></li>`).join("")}</ul></div>`;
}

function renderAttempt(value: StateRecord | undefined): string {
  return value
    ? `<small>Attempt: ${escapeHtml(text(value.outcome))} · ${renderTime(value.at, true)}</small>`
    : "";
}

function renderRelationship(label: string, refs: string[]): string {
  return refs.length
    ? `<small>${label}: ${refs.map(escapeHtml).join(", ")}</small>`
    : "";
}

function renderSpecification(value: StateRecord | undefined): string {
  if (!value) return "";
  return `<div><h5>Specification</h5><p><span class="badge">${escapeHtml(text(value.state))}</span></p>${renderLocatorList(records(value.entries))}</div>`;
}

function renderStatements(title: string, items: StateRecord[]): string {
  if (!items.length) return "";
  return `<div><h5>${title}</h5><ul>${items.map((item) => `<li>${escapeHtml(text(item.text))}</li>`).join("")}</ul></div>`;
}

function renderValidity(value: StateRecord | undefined): string {
  return value
    ? `<p class="validity"><strong>${escapeHtml(text(value.state))}</strong>: ${escapeHtml(text(value.reason))}</p>`
    : "";
}

function renderLocatorList(items: StateRecord[]): string {
  return items.length
    ? `<ul class="locators">${items.map((item) => `<li>${renderLocator(item)}</li>`).join("")}</ul>`
    : "";
}

function renderLocator(value: StateRecord | undefined): string {
  if (!value) return "";
  const uri = text(value.uri);
  const label = `${uri}${value.revision ? ` @ ${text(value.revision)}` : ""}${value.hash ? ` # ${text(value.hash)}` : ""}`;
  return `<span class="locator">${renderUrl(uri, label)}</span>`;
}

function renderUrl(uri: string, label: string): string {
  return isSafeUrl(uri)
    ? `<a href="${escapeHtml(uri)}">${escapeHtml(label)}</a>`
    : escapeHtml(label);
}

function isSafeUrl(uri: string): boolean {
  if (
    !uri ||
    uri.startsWith("//") ||
    uri.includes("\\") ||
    /[\u0000-\u001f\u007f]/u.test(uri)
  )
    return false;
  const scheme = /^([a-z][a-z0-9+.-]*):/iu.exec(uri)?.[1]?.toLowerCase();
  return (
    scheme === undefined ||
    scheme === "http" ||
    scheme === "https" ||
    scheme === "mailto"
  );
}

function renderRefs(items: string[]): string {
  return items.length
    ? `<ul class="refs">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : '<span class="muted">None</span>';
}

function renderTags(items: string[]): string {
  return items.length
    ? `<span class="tags">${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</span>`
    : "";
}

function renderTime(value: unknown, inline = false): string {
  const iso = text(value);
  const output = iso
    ? `<time datetime="${escapeHtml(iso)}">${escapeHtml(iso)}</time>`
    : "—";
  return inline ? output : `<span>${output}</span>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "") || "unknown"
  );
}

function text(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text) : [];
}

function record(value: unknown): StateRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as StateRecord)
    : undefined;
}

function records(value: unknown): StateRecord[] {
  return Array.isArray(value)
    ? value
        .map(record)
        .filter((item): item is StateRecord => item !== undefined)
    : [];
}

const DASHBOARD_CSS = `:root{color-scheme:light dark;--canvas:#f5f3ed;--surface:#fffdfa;--ink:#171612;--muted:#68645b;--border:#d9d4c8;--accent:#c65f40;--good:#38714c;--warn:#a25137;font-family:"Avenir Next",Avenir,"Segoe UI",sans-serif}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--canvas);color:var(--ink)}a{color:inherit;text-decoration-color:var(--accent);text-underline-offset:.2em}.skip-link{position:absolute;left:-9999px}.skip-link:focus{left:1rem;top:1rem;background:var(--surface);padding:.75rem;z-index:2}.state-page{width:min(82rem,calc(100% - 2rem));margin:auto;padding:3rem 0 6rem}.state-hero{border-bottom:1px solid var(--border);padding-bottom:2rem}.eyebrow,.badge{text-transform:uppercase;letter-spacing:.08em;font-size:.72rem;font-weight:750;color:var(--accent)}h1,h2,h3{font-family:"Iowan Old Style",Georgia,serif}h1{font-size:clamp(2.5rem,7vw,5rem);line-height:1;margin:.25rem 0 1rem}h2{font-size:2.2rem}h3{font-size:1.8rem;margin:.35rem 0}h4{font-size:1.1rem}h5{font-size:.9rem;margin-bottom:.4rem}nav{display:flex;gap:1rem;padding:1rem 0;position:sticky;top:0;background:color-mix(in srgb,var(--canvas) 92%,transparent);backdrop-filter:blur(10px);z-index:1}.section-heading{margin:3rem 0 1rem}.section-heading.compact{display:flex;align-items:center;justify-content:space-between;margin:0}.stream{background:var(--surface);border:1px solid var(--border);border-radius:1.25rem;padding:clamp(1rem,3vw,2rem);margin-bottom:1.5rem}.stream-header{display:flex;gap:2rem;justify-content:space-between;border-bottom:1px solid var(--border);padding-bottom:1rem}.metrics{display:flex;flex-wrap:wrap;gap:.7rem 1.5rem;margin:0}.metrics div{min-width:6rem}.metrics dt,small,.muted{color:var(--muted);font-size:.78rem}.metrics dd{margin:0;font-weight:700}.badge{display:inline-block;border:1px solid currentColor;border-radius:999px;padding:.22rem .48rem}.status-done,.status-completed,.status-merged{color:var(--good)}.status-blocked,.status-failed,.severity-critical,.severity-high{color:var(--warn)}.columns,.card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr));gap:1rem}.card,.callout{border:1px solid var(--border);border-radius:.8rem;padding:1rem}.card header{display:flex;justify-content:space-between;gap:.5rem}.detail-list,.evidence,.locators,.refs{padding-left:1.2rem}.detail-list li,.evidence li{margin:.65rem 0}.detail-list small,.detail-list p{display:block;margin:.25rem 0}.validity{border-left:.25rem solid var(--warn);padding:.45rem .7rem;background:color-mix(in srgb,var(--warn) 8%,transparent)}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:.9rem}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--border);padding:.75rem}tbody th span{display:block;font-weight:400}.tags{display:flex;gap:.3rem;flex-wrap:wrap;margin-top:.3rem}.tags span{background:var(--canvas);border-radius:.3rem;padding:.15rem .35rem;font-size:.72rem}.locator{overflow-wrap:anywhere}.empty{color:var(--muted);font-style:italic}@media(max-width:48rem){.state-page{width:min(100% - 1rem,82rem);padding-top:2rem}.stream-header{display:block}.metrics{margin-top:1rem}nav{overflow-x:auto}.stream{border-radius:.8rem;padding:.9rem}}@media(prefers-color-scheme:dark){:root{--canvas:#1e1d1a;--surface:#292722;--ink:#f3efe5;--muted:#c0b9aa;--border:#4b473e;--accent:#ea8968;--good:#7bc28e;--warn:#f19a78}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}`;
