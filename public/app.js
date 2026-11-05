const decisionsNode = document.querySelector('#decisions-list');
const leadNode = document.querySelector('#lead-case');
const emptyNode = document.querySelector('#empty');
const countNode = document.querySelector('#decision-count');
const updatedNode = document.querySelector('#last-updated');
const connectionNode = document.querySelector('#connection');
const detailNode = document.querySelector('#detail');
const detailTitle = document.querySelector('#detail-title');
const graphNode = document.querySelector('#evidence-graph');
const auditNode = document.querySelector('#audit-trail');
const counterfactualNode = document.querySelector('#counterfactual');

const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const shortSha = (sha) => `${sha.slice(0, 10)}…${sha.slice(-8)}`;
const label = (status) => ({ PENDING_EVIDENCE: 'Gathering', BLOCKED: 'Blocked', READY_FOR_APPROVAL: 'Ready', AUTHORIZED: 'Authorized', EXECUTED: 'Executed', SUPERSEDED: 'Superseded' }[status] ?? status);
const stateClass = (state) => state === 'VERIFIED_PASS' ? 'pass' : state === 'VERIFIED_FAIL' || state === 'CONFLICTED' ? 'fail' : state === 'DISCOVERED_UNVERIFIED' ? 'discovered' : '';

function render(data) {
  const decisions = data.decisions ?? [];
  const switchStatus = data.metadata?.switch ?? 'not connected';
  const localHarness = data.metadata?.boardSource === 'local-protocol-harness';
  document.querySelector('#demo-note').hidden = !localHarness;
  const connected = !localHarness && switchStatus === 'connected' && data.metadata?.switchEvidence === 'live-switch';
  const switchLabel = localHarness ? 'Local harness' : connected ? 'Switch live' : switchStatus === 'reconnecting' || switchStatus === 'connect-error' ? 'Switch reconnecting' : switchStatus === 'gap' ? 'Switch recovering' : 'Switch not connected';
  connectionNode.innerHTML = `<span class="pulse ${connected ? 'live' : ''}"></span><span>${switchLabel}</span>`;
  countNode.textContent = decisions.length === 0 ? 'No release recorded' : `${decisions.length} release decision${decisions.length === 1 ? '' : 's'}`;
  emptyNode.hidden = decisions.length !== 0;
  // The editorial case study must reflect real persisted gate state. No
  // simulated status, receipt, or agent message is displayed by default.
  const latest = decisions.length ? decisions.at(-1) : null;
  leadNode.hidden = !latest;
  if (latest) {
    const headline = ({
      EXECUTED: ['PREVIEW', 'AUTHORIZED'], AUTHORIZED: ['AWAITING', 'RECEIPT'],
      BLOCKED: ['RELEASE', 'BLOCKED'], READY_FOR_APPROVAL: ['READY FOR', 'APPROVAL'],
      PENDING_EVIDENCE: ['GATHERING', 'EVIDENCE'], SUPERSEDED: ['REVIEW', 'SUPERSEDED'],
      EXECUTION_FAILED: ['EXECUTION', 'FAILED']
    })[latest.status] ?? ['RELEASE', 'IN REVIEW'];
    const requirement = (id) => latest.requirements.find((item) => item.id === id)?.state ?? 'MISSING';
    const showState = (id) => esc(requirement(id).replaceAll('_', ' ').toLowerCase());
    const receipt = latest.receipt?.receiptId
      ? `Receipt · ${esc(latest.receipt.receiptId)}` : `Decision · ${esc(latest.id)}`;
    leadNode.innerHTML = `
      <div class="lead-main">
        <div class="lead-top"><span>CURRENT GATE DECISION</span><span class="lead-star" aria-hidden="true">✳</span></div>
        <div class="lead-status ${latest.status === 'BLOCKED' ? 'blocked' : ''}">${headline.map(esc).join('<br>')}<span class="period">.</span></div>
        <div class="lead-bottom"><span>${receipt}</span><span>01 / EVIDENCE-BOUND</span></div>
      </div>
      <div class="lead-side">
        <div class="lead-facts">
          <div class="lead-fact"><span class="lead-label">EXACT COMMIT</span><span class="lead-value mono">${esc(shortSha(latest.sha))}</span></div>
          <div class="lead-fact"><span class="lead-label">ENGINEERING</span><span class="lead-value">${showState('engineering')}</span></div>
          <div class="lead-fact"><span class="lead-label">SUPPORT</span><span class="lead-value">${showState('support')}</span></div>
        </div>
        <button class="lead-action" type="button" aria-label="Inspect current release decision">
          <span>Inspect evidence & audit</span><span aria-hidden="true">↗</span>
        </button>
      </div>`;
    leadNode.querySelector('button').addEventListener('click', () => openDetail(latest.id));
  }
  updatedNode.textContent = decisions.length === 0 ? 'Waiting for evidence' : `CHECKED ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · READ ONLY`;
  decisionsNode.innerHTML = decisions.map((decision) => `
    <article class="decision" tabindex="0" data-decision-id="${esc(decision.id)}" aria-label="Open replay for ${esc(decision.id)}">
      <div class="decision-main"><div class="decision-id">${esc(decision.id)}</div><p class="sha"><strong>${esc(shortSha(decision.sha))}</strong> · policy ${esc(decision.policyVersion)}</p></div>
      <div class="requirements">${decision.requirements.map((requirement) => `<div class="requirement ${stateClass(requirement.state)}"><span class="mark"></span><span>${esc(requirement.id)}</span><small>${esc(requirement.state.replaceAll('_', ' ').toLowerCase())}</small></div>`).join('')}</div>
      <div class="status ${decision.status.toLowerCase().replaceAll('_', '-')}" title="${esc(decision.status)}">${esc(label(decision.status))}</div>
    </article>`).join('');
  decisionsNode.querySelectorAll('.decision').forEach((node) => {
    node.addEventListener('click', () => openDetail(node.dataset.decisionId));
    node.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDetail(node.dataset.decisionId); } });
  });
}

async function openDetail(id) {
  const [decision, audit, counterfactual] = await Promise.all([
    fetch(`/api/decisions/${encodeURIComponent(id)}`, { cache: 'no-store' }).then((response) => response.json()),
    fetch(`/api/decisions/${encodeURIComponent(id)}/audit`, { cache: 'no-store' }).then((response) => response.json()),
    fetch(`/api/decisions/${encodeURIComponent(id)}/counterfactual`, { cache: 'no-store' }).then((response) => response.json())
  ]);
  detailTitle.textContent = `${id} · ${label(decision.status)}`;
  const nodes = decision.requirements.map((requirement) => `<div class="graph-node ${stateClass(requirement.state)}"><small>${esc(requirement.source?.room ?? 'awaiting room')}</small><strong>${esc(requirement.id)}</strong><small>${esc(requirement.state.replaceAll('_', ' ').toLowerCase())}</small></div>`);
  graphNode.innerHTML = `<div class="graph-node pass"><small>artifact</small><strong>${esc(shortSha(decision.sha))}</strong><small>exact commit</small></div><div class="graph-link"></div>${nodes.map((node, index) => `${node}${index < nodes.length - 1 ? '<div class="graph-link"></div>' : ''}`).join('')}`;
  auditNode.innerHTML = audit.map((entry) => `<div class="audit-item"><time>${esc(new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</time><span><strong>${esc(entry.type.replaceAll('_', ' ').toLowerCase())}</strong></span></div>`).join('') || '<span class="board-note">No transitions yet.</span>';
  counterfactualNode.textContent = counterfactual.explanation ?? 'No replay available.';
  detailNode.hidden = false;
  detailNode.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

document.querySelector('#detail-close').addEventListener('click', () => { detailNode.hidden = true; });

async function refresh() {
  try { render(await (await fetch('/api/state', { cache: 'no-store' })).json()); }
  catch { updatedNode.textContent = 'Board unavailable'; }
}

refresh();
setInterval(refresh, 2500);
