export const PAGE_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>gigpull</title>
<style>
  :root {
    --bg: #0f1115; --panel: #171a21; --panel-2: #1e222b; --line: #272c37;
    --ink: #e6e9ef; --dim: #8b93a7; --accent: #6ea8fe; --good: #4ade80;
    --warn: #fbbf24; --dead: #64748b; --bar: #3b82f6;
  }
  @media (prefers-color-scheme: light) {
    :root {
      --bg: #f6f7f9; --panel: #fff; --panel-2: #f0f2f5; --line: #dde1e8;
      --ink: #16181d; --dim: #5c6478; --accent: #2563eb;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  header {
    display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap;
    padding: 14px 20px; border-bottom: 1px solid var(--line); background: var(--panel);
    position: sticky; top: 0; z-index: 5;
  }
  h1 { font-size: 15px; margin: 0; letter-spacing: .02em; }
  h1 span { color: var(--dim); font-weight: 400; }
  .filters { display: flex; gap: 8px; margin-left: auto; flex-wrap: wrap; }
  .filters label { color: var(--dim); display: flex; gap: 5px; align-items: center; cursor: pointer; }
  main { display: grid; grid-template-columns: 1fr 380px; gap: 0; align-items: start; }
  @media (max-width: 900px) { main { grid-template-columns: 1fr; } }
  .board { display: flex; gap: 12px; padding: 16px; overflow-x: auto; }
  .col { flex: 0 0 240px; min-width: 240px; }
  .col h2 {
    font-size: 11px; text-transform: uppercase; letter-spacing: .09em;
    color: var(--dim); margin: 0 0 8px 2px; font-weight: 600;
  }
  .col h2 b { color: var(--ink); font-weight: 600; }
  .card {
    background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
    padding: 9px 11px; margin-bottom: 8px; cursor: pointer;
  }
  .card:hover { border-color: var(--accent); }
  .card.sel { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .card .nm { font-weight: 600; margin-bottom: 3px; }
  .card .meta { color: var(--dim); font-size: 12px; display: flex; gap: 6px; flex-wrap: wrap; }
  .score { float: right; color: var(--accent); font-variant-numeric: tabular-nums; font-weight: 600; }
  aside {
    border-left: 1px solid var(--line); background: var(--panel); padding: 18px;
    position: sticky; top: 49px; max-height: calc(100vh - 49px); overflow-y: auto;
  }
  aside h3 { margin: 0 0 2px; font-size: 17px; }
  .sub { color: var(--dim); margin-bottom: 14px; font-size: 13px; }
  .sec { margin: 16px 0; }
  .sec > b {
    display: block; font-size: 11px; text-transform: uppercase;
    letter-spacing: .09em; color: var(--dim); margin-bottom: 6px;
  }
  .brief {
    background: var(--panel-2); border: 1px solid var(--line); border-radius: 6px;
    padding: 10px 12px; white-space: pre-wrap; font-size: 13px;
  }
  .contact {
    display: flex; justify-content: space-between; gap: 8px; align-items: center;
    background: var(--panel-2); border: 1px solid var(--line); border-radius: 6px;
    padding: 7px 10px; margin-bottom: 6px; font-size: 13px;
  }
  .contact .t { color: var(--dim); font-size: 11px; text-transform: uppercase; }
  button {
    background: var(--panel-2); color: var(--ink); border: 1px solid var(--line);
    border-radius: 6px; padding: 5px 10px; cursor: pointer; font: inherit; font-size: 12px;
  }
  button:hover { border-color: var(--accent); }
  button.on { background: var(--accent); color: #08101f; border-color: var(--accent); }
  .row { display: flex; gap: 6px; flex-wrap: wrap; }
  .axis { margin-bottom: 7px; }
  .axis .lbl { display: flex; justify-content: space-between; font-size: 12px; color: var(--dim); }
  .track { height: 5px; background: var(--panel-2); border-radius: 3px; overflow: hidden; margin-top: 3px; }
  .fill { height: 100%; background: var(--bar); }
  .empty { color: var(--dim); padding: 40px 20px; text-align: center; }
  textarea {
    width: 100%; min-height: 70px; background: var(--panel-2); color: var(--ink);
    border: 1px solid var(--line); border-radius: 6px; padding: 8px; font: inherit;
    font-size: 13px; resize: vertical;
  }
  a { color: var(--accent); }
  .toast {
    position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%);
    background: var(--accent); color: #08101f; padding: 7px 14px; border-radius: 6px;
    font-size: 13px; font-weight: 600; opacity: 0; transition: opacity .18s; pointer-events: none;
  }
  .toast.show { opacity: 1; }
</style>
</head>
<body>
<header>
  <h1>gigpull <span id="count"></span></h1>
  <div class="filters">
    <label><input type="checkbox" id="f-contact"> has contact</label>
    <label><input type="checkbox" id="f-nosite"> no website</label>
    <label><input type="checkbox" id="f-dead"> show dead</label>
  </div>
</header>
<main>
  <div class="board" id="board"></div>
  <aside id="detail"><div class="empty">Select a lead</div></aside>
</main>
<div class="toast" id="toast"></div>

<script>
const STATUSES = ["new", "shortlisted", "contacted", "replied", "dead"];
let leads = [];
let selected = null;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1200);
}

async function load() {
  leads = await (await fetch("/api/leads")).json();
  render();
}

function visible() {
  return leads.filter((l) => {
    if (!$("f-dead").checked && l.status === "dead") return false;
    if ($("f-contact").checked && l.contacts.length === 0) return false;
    if ($("f-nosite").checked && l.website) return false;
    return true;
  });
}

function render() {
  const list = visible();
  $("count").textContent =
    list.length + " of " + leads.length + " leads";

  $("board").innerHTML = STATUSES.map((st) => {
    const inCol = list.filter((l) => l.status === st);
    return '<div class="col"><h2>' + st + " <b>" + inCol.length + "</b></h2>" +
      inCol.map((l) =>
        '<div class="card' + (selected === l.companyId ? " sel" : "") +
        '" data-id="' + l.companyId + '">' +
        '<span class="score">' + Math.round(l.total) + "</span>" +
        '<div class="nm">' + esc(l.name) + "</div>" +
        '<div class="meta">' +
          (l.city ? "<span>" + esc(l.city) + "</span>" : "") +
          (l.contacts.length ? "<span>&#9742;</span>" : "") +
          (l.website ? "" : "<span>no site</span>") +
        "</div></div>").join("") +
      "</div>";
  }).join("");

  document.querySelectorAll(".card").forEach((el) => {
    el.onclick = () => { selected = Number(el.dataset.id); render(); };
  });

  renderDetail();
}

function renderDetail() {
  const l = leads.find((x) => x.companyId === selected);
  if (!l) { $("detail").innerHTML = '<div class="empty">Select a lead</div>'; return; }

  const axes = Object.entries(l.breakdown);
  const max = Math.max(1, ...axes.map(([, v]) => v));

  $("detail").innerHTML =
    "<h3>" + esc(l.name) + "</h3>" +
    '<div class="sub">' + [l.category, l.city, l.mode].filter(Boolean).map(esc).join(" &middot; ") + "</div>" +

    '<div class="sec"><b>Status</b><div class="row">' +
      STATUSES.map((s) =>
        '<button class="st' + (l.status === s ? " on" : "") + '" data-s="' + s + '">' + s + "</button>"
      ).join("") + "</div></div>" +

    (l.brief ? '<div class="sec"><b>Brief</b><div class="brief">' + esc(l.brief) + "</div></div>" : "") +

    (l.contacts.length
      ? '<div class="sec"><b>Contacts</b>' + l.contacts.map((c) =>
          '<div class="contact"><span><span class="t">' + esc(c.type) + "</span> " +
          esc(c.value) + '</span><button class="cp" data-v="' + esc(c.value) + '">copy</button></div>'
        ).join("") + "</div>"
      : '<div class="sec"><b>Contacts</b><div class="sub">None found — this lead is not reachable yet.</div></div>') +

    (axes.length
      ? '<div class="sec"><b>Why it ranks here</b>' + axes.map(([k, v]) =>
          '<div class="axis"><div class="lbl"><span>' + esc(k.replace(/_/g, " ")) +
          "</span><span>" + Math.round(v) + '</span></div><div class="track"><div class="fill" style="width:' +
          (v / max * 100) + '%"></div></div></div>'
        ).join("") + "</div>"
      : "") +

    (l.rerankReason ? '<div class="sec"><b>Screen</b><div class="sub">' + esc(l.rerankReason) + "</div></div>" : "") +
    (l.fit ? '<div class="sec"><b>Fit</b><div class="sub">' + esc(l.fit) + "</div></div>" : "") +

    '<div class="sec"><b>Worth pursuing?</b><div class="row">' +
      '<button class="rt' + (l.rating === 1 ? " on" : "") + '" data-r="1">good lead</button>' +
      '<button class="rt' + (l.rating === -1 ? " on" : "") + '" data-r="-1">bad lead</button>' +
      '</div><div class="sub" style="margin-top:6px">Tunes the weights once ~50 leads are rated.</div></div>' +

    '<div class="sec"><b>Notes</b><textarea id="notes">' + esc(l.notes ?? "") + "</textarea>" +
      '<div class="row" style="margin-top:6px"><button id="save-notes">save</button></div></div>' +

    (l.website ? '<div class="sec"><a href="' + esc(l.website) + '" target="_blank" rel="noreferrer">' + esc(l.website) + "</a></div>" : "");

  document.querySelectorAll(".st").forEach((b) => {
    b.onclick = () => post(l.companyId, "status", { status: b.dataset.s });
  });
  document.querySelectorAll(".rt").forEach((b) => {
    b.onclick = () => post(l.companyId, "rate", { rating: Number(b.dataset.r) });
  });
  document.querySelectorAll(".cp").forEach((b) => {
    b.onclick = async () => {
      await navigator.clipboard.writeText(b.dataset.v);
      toast("copied");
    };
  });
  $("save-notes").onclick = () =>
    post(l.companyId, "notes", { notes: $("notes").value });
}

async function post(id, what, body) {
  const res = await fetch("/api/leads/" + id + "/" + what, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) { toast("failed"); return; }
  toast("saved");
  await load();
}

["f-contact", "f-nosite", "f-dead"].forEach((id) => { $(id).onchange = render; });
load();
</script>
</body>
</html>`;
