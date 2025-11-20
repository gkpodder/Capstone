// server.js (ESM) — Word (AppleScript) + Firefox via Playwright
// + OS Vision Click + Browser "Understand & Act" planner
import express from "express";
import bodyParser from "body-parser";
import { execFile, exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { firefox } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

const execFileAsync = promisify(execFile);
const execAsync = promisify(execCb);
const app = express();
app.use(bodyParser.json({ limit: "25mb" }));

// ===================== Helpers (Word) =====================
function escQuotes(s = "") {
  return String(s).replace(/"/g, '\\"');
}

async function osa(script) {
  const { stdout } = await execFileAsync("/usr/bin/osascript", ["-e", script]);
  return String(stdout).trim();
}

// ===================== Helpers (Playwright / Firefox) =====================
let fxBrowser = null;
let fxContext = null;
let fxPage = null;

async function ensureFirefox() {
  if (!fxBrowser) {
    fxBrowser = await firefox.launch({ headless: false }); // visible window
    fxContext = await fxBrowser.newContext();
    fxPage = await fxContext.newPage();
  } else if (!fxPage) {
    fxPage = await fxContext.newPage();
  }
  return { fxBrowser, fxContext, fxPage };
}

async function closeFirefox() {
  try { if (fxBrowser) await fxBrowser.close(); } catch {}
  fxBrowser = null; fxContext = null; fxPage = null;
}
process.on("SIGINT", async () => { await closeFirefox(); process.exit(0); });
process.on("SIGTERM", async () => { await closeFirefox(); process.exit(0); });

// --------- small utils for fuzzy matching (browser text) ---------
function norm(s = "") { return String(s).replace(/\s+/g, " ").trim().toLowerCase(); }
function simpleScore(target, candidate) {
  target = norm(target); candidate = norm(candidate);
  if (!candidate) return 0;
  if (candidate === target) return 100;
  if (candidate.startsWith(target)) return 90;
  if (candidate.includes(target)) return 80;
  const tks = new Set(target.split(" "));
  const cks = new Set(candidate.split(" "));
  let hit = 0; for (const t of tks) if (cks.has(t)) hit++;
  return hit ? 60 + Math.min(20, hit * 5) : 0;
}

// ===================== Helpers (Screen Click) =====================
// Try common Homebrew paths for 'cliclick'
async function findCliClick() {
  const candidates = [
    "/opt/homebrew/bin/cliclick",
    "/usr/local/bin/cliclick",
    "/usr/bin/cliclick",
  ];
  for (const p of candidates) {
    try { await fs.access(p); return p; } catch {}
  }
  return null;
}

// Click at screen coordinates (absolute)
async function clickAt(x, y) {
  const cliclick = await findCliClick();
  if (!cliclick) throw new Error("cliclick not found. Install with: brew install cliclick");
  await execAsync(`${cliclick} m:${Math.round(x)},${Math.round(y)} c:${Math.round(x)},${Math.round(y)}`);
}

// Take a full-screen screenshot to a temp file; return path
async function takeScreenshotTmp() {
  const tmpDir = path.join(process.cwd(), "tmp");
  try { await fs.mkdir(tmpDir, { recursive: true }); } catch {}
  const file = path.join(tmpDir, `screen-${Date.now()}.png`);
  await execAsync(`/usr/sbin/screencapture -x "${file}"`);
  return file;
}

async function fileToBase64(fp) {
  const buf = await fs.readFile(fp);
  return buf.toString("base64");
}

// ===================== Health & Discovery =====================
app.get("/", (_req, res) => {
  res.json({
    service: "mcp-word+firefox+screen",
    status: "ok",
    word_endpoints: [
      "POST /word/open { path? }",
      "POST /word/insert { text }",
      "GET  /word/selection",
      "POST /word/save { path }",
      "POST /word/find_replace { find, replace }",
      "POST /word/export_pdf { path }"
    ],
    firefox_endpoints: [
      "POST /fx/open_url { url }",
      "POST /fx/google_search { query }",
      "POST /fx/click { selector }",
      "POST /fx/click_text { text, role?, exact? }",
      "POST /fx/scroll { to?: 'top'|'bottom', px?: number }",
      "POST /fx/type { selector, text, clear? }",
      "POST /fx/wait_for_selector { selector, timeoutMs? }",
      "POST /fx/eval { code }",
      "GET  /fx/html",
      "POST /fx/screenshot { path }",
      "GET  /fx/visible_clickables",
      "POST /fx/understand_and_act { instruction }",
      "POST /fx/extract { query }"
    ],
    os_endpoints: [
      "POST /os/screenshot { path? }",
      "POST /os/click_xy { x, y }",
      "POST /os/find_and_click { query, notes? }"
    ]
  });
});

// ===================== WORD ENDPOINTS =====================
app.post("/word/open", async (req, res) => {
  const filePath = req.body?.path;
  try {
    const script = filePath
      ? `tell application "Microsoft Word" to open POSIX file "${escQuotes(filePath)}"`
      : `tell application "Microsoft Word" to activate`;
    await osa(script);
    res.json({ success: true, opened: filePath || true });
  } catch (err) { res.status(500).json({ error: String(err?.message || err) }); }
});

app.post("/word/insert", async (req, res) => {
  const text = req.body?.text ?? "";
  try {
    const script = `
      tell application "Microsoft Word"
        if not (exists active document) then make new document
        set theSel to selection
        set content of text object of theSel to "${escQuotes(text)}"
      end tell
    `;
    await osa(script);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: String(err?.message || err) }); }
});

app.get("/word/selection", async (_req, res) => {
  try {
    const script = `
      tell application "Microsoft Word"
        if not (exists active document) then return ""
        set theSel to selection
        return content of text object of theSel
      end tell
    `;
    const result = await osa(script);
    res.json({ selection: result });
  } catch (err) { res.status(500).json({ error: String(err?.message || err) }); }
});

app.post("/word/save", async (req, res) => {
  const filePath = req.body?.path;
  if (!filePath) return res.status(400).json({ error: "path is required" });
  try {
    const script = `
      tell application "Microsoft Word"
        if not (exists active document) then error "No active document"
        set doc to active document
        save as doc file name (POSIX file "${escQuotes(filePath)}")
      end tell
    `;
    await osa(script);
    res.json({ saved: filePath });
  } catch (err) { res.status(500).json({ error: String(err?.message || err) }); }
});

app.post("/word/find_replace", async (req, res) => {
  const findText = req.body?.find ?? "";
  const replaceText = req.body?.replace ?? "";
  try {
    const script = `
      tell application "Microsoft Word"
        if not (exists active document) then error "No active document"
        set myFind to find object of selection
        clear formatting myFind
        clear formatting replacement of myFind
        set doc to active document
        set startRange to create range start 0 end 0 of doc
        set range of selection to startRange
        set find text of myFind to "${escQuotes(findText)}"
        set replace with of myFind to "${escQuotes(replaceText)}"
        set wrap of myFind to find continue
        set forward of myFind to true
        execute find myFind replace replace all
      end tell
    `;
    await osa(script);
    res.json({ replaced: true, find: findText, replace: replaceText });
  } catch (err) { res.status(500).json({ error: String(err?.message || err) }); }
});

app.post("/word/export_pdf", async (req, res) => {
  const pdfPath = req.body?.path;
  if (!pdfPath) return res.status(400).json({ error: "path is required" });
  try {
    const script = `
      tell application "Microsoft Word"
        if not (exists active document) then error "No active document"
        set doc to active document
        save as doc file name (POSIX file "${escQuotes(pdfPath)}") file format format PDF
      end tell
    `;
    await osa(script);
    res.json({ pdf: pdfPath });
  } catch (err) { res.status(500).json({ error: String(err?.message || err) }); }
});

// ===================== FIREFOX (Playwright) ENDPOINTS =====================
app.post("/fx/open_url", async (req, res) => {
  const url = req.body?.url;
  if (!url) return res.status(400).json({ error: "url is required" });
  try {
    const { fxPage } = await ensureFirefox();
    await fxPage.goto(url, { waitUntil: "domcontentloaded" });
    res.json({ opened: url, url: fxPage.url() });
  } catch (e) { res.status(500).json({ error: String(e?.message || e) }); }
});

app.post("/fx/google_search", async (req, res) => {
  const query = req.body?.query ?? "";
  try {
    const { fxPage } = await ensureFirefox();
    await fxPage.goto("https://www.google.com", { waitUntil: "domcontentloaded" });
    const loc = fxPage.locator("textarea[name=q], input[name=q]");
    await loc.first().waitFor({ timeout: 15000 });
    if (await fxPage.locator("textarea[name=q]").count()) await fxPage.fill("textarea[name=q]", query);
    else await fxPage.fill("input[name=q]", query);
    await Promise.all([ fxPage.keyboard.press("Enter"), fxPage.waitForLoadState("domcontentloaded") ]);
    res.json({ searched: query, url: fxPage.url() });
  } catch (e) { res.status(500).json({ error: String(e?.message || e) }); }
});

app.post("/fx/click", async (req, res) => {
  const selector = req.body?.selector;
  if (!selector) return res.status(400).json({ error: "selector is required" });
  try {
    const { fxPage } = await ensureFirefox();
    await fxPage.waitForSelector(selector, { timeout: 15000 });
    await fxPage.click(selector);
    res.json({ clicked: selector });
  } catch (e) { res.status(500).json({ error: String(e?.message || e) }); }
});

// Semantic click by text/role with fuzzy fallback
app.post("/fx/click_text", async (req, res) => {
  const rawText = req.body?.text ?? "";
  const role = (req.body?.role || "").toLowerCase(); // 'link' | 'button' | ''
  const exact = !!req.body?.exact;
  if (!rawText) return res.status(400).json({ error: "text is required" });

  try {
    const { fxPage } = await ensureFirefox();
    const name = new RegExp(`^${exact ? "" : ".*"}${rawText.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}${exact ? "" : ".*"}$`, "i");
    try { if (role === "link" || !role) { await fxPage.getByRole("link", { name }).first().click({ timeout: 1500 }); return res.json({ clickedBy: "role:link", text: rawText }); } } catch {}
    try { if (role === "button" || !role) { await fxPage.getByRole("button", { name }).first().click({ timeout: 1500 }); return res.json({ clickedBy: "role:button", text: rawText }); } } catch {}
    try { await fxPage.getByText(name, { exact }).first().click({ timeout: 1500 }); return res.json({ clickedBy: "getByText", text: rawText }); } catch {}

    // Fallback: visible clickables, fuzzy
    const candidates = await fxPage.$$('a,button,[role="button"],input[type="button"],input[type="submit"],[onclick]');
    let best = null, bestScore = 0;
    for (const el of candidates) {
      const visible = await el.isVisible().catch(() => false);
      if (!visible) continue;
      const label = await el.evaluate((node) => {
        const txt = node.innerText || node.textContent || "";
        const aria = node.getAttribute("aria-label") || "";
        const title = node.getAttribute("title") || "";
        return [txt, aria, title].map(s => (s || "").trim()).filter(Boolean).join(" ");
      });
      const score = simpleScore(rawText, label);
      if (score > bestScore) { bestScore = score; best = el; }
    }
    if (best && bestScore >= 70) {
      await best.scrollIntoViewIfNeeded().catch(()=>{});
      await best.click();
      return res.json({ clickedBy: "fuzzy", text: rawText, score: bestScore });
    }
    for (let i = 0; i < 3; i++) {
      await fxPage.mouse.wheel(0, 800);
      try { await fxPage.getByRole("link", { name }).first().click({ timeout: 800 }); return res.json({ clickedBy: "role:link+scroll", text: rawText }); } catch {}
      try { await fxPage.getByRole("button", { name }).first().click({ timeout: 800 }); return res.json({ clickedBy: "role:button+scroll", text: rawText }); } catch {}
      try { await fxPage.getByText(name, { exact }).first().click({ timeout: 800 }); return res.json({ clickedBy: "getByText+scroll", text: rawText }); } catch {}
    }
    res.status(404).json({ error: `Could not find a visible element matching "${rawText}"` });
  } catch (e) { res.status(500).json({ error: String(e?.message || e) }); }
});

// Scroll
app.post("/fx/scroll", async (req, res) => {
  const to = (req.body?.to || "").toLowerCase(); // 'top' | 'bottom'
  const px = Number(req.body?.px || 0);
  try {
    const { fxPage } = await ensureFirefox();
    if (to === "top") await fxPage.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    else if (to === "bottom") await fxPage.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
    else if (px) await fxPage.mouse.wheel(0, px);
    else return res.status(400).json({ error: "Provide { to: 'top'|'bottom' } or { px: number }" });
    res.json({ scrolled: to || `${px}px` });
  } catch (e) { res.status(500).json({ error: String(e?.message || e) }); }
});

app.post("/fx/type", async (req, res) => {
  const selector = req.body?.selector;
  const text = req.body?.text ?? "";
  const clear = !!req.body?.clear;
  if (!selector) return res.status(400).json({ error: "selector is required" });
  try {
    const { fxPage } = await ensureFirefox();
    await fxPage.waitForSelector(selector, { timeout: 15000 });
    if (clear) { await fxPage.click(selector, { clickCount: 3 }); await fxPage.keyboard.press("Backspace"); }
    await fxPage.type(selector, text);
    res.json({ typed: text, selector, cleared: clear });
  } catch (e) { res.status(500).json({ error: String(e?.message || e) }); }
});

app.post("/fx/wait_for_selector", async (req, res) => {
  const selector = req.body?.selector;
  const timeoutMs = Number(req.body?.timeoutMs || 15000);
  if (!selector) return res.status(400).json({ error: "selector is required" });
  try {
    const { fxPage } = await ensureFirefox();
    await fxPage.waitForSelector(selector, { timeout: timeoutMs });
    res.json({ ready: selector });
  } catch (e) { res.status(500).json({ error: String(e?.message || e) }); }
});

app.post("/fx/eval", async (req, res) => {
  const code = req.body?.code ?? "return document.title;";
  try {
    const { fxPage } = await ensureFirefox();
    const result = await fxPage.evaluate(new Function(code));
    res.json({ result });
  } catch (e) { res.status(500).json({ error: String(e?.message || e) }); }
});

app.get("/fx/html", async (_req, res) => {
  try {
    const { fxPage } = await ensureFirefox();
    const html = await fxPage.content();
    res.json({ html });
  } catch (e) { res.status(500).json({ error: String(e?.message || e) }); }
});

app.post("/fx/screenshot", async (req, res) => {
  const outPath = req.body?.path;
  if (!outPath) return res.status(400).json({ error: "path is required" });
  try {
    const { fxPage } = await ensureFirefox();
    await fxPage.screenshot({ path: outPath, fullPage: true });
    res.json({ screenshot: outPath });
  } catch (e) { res.status(500).json({ error: String(e?.message || e) }); }
});

app.get("/fx/visible_clickables", async (_req, res) => {
  try {
    const { fxPage } = await ensureFirefox();
    const data = await fxPage.evaluate(() => {
      function visible(el) {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return cs && cs.visibility !== "hidden" && cs.display !== "none" && r.width > 1 && r.height > 1;
      }
      const nodes = Array.from(document.querySelectorAll('a,button,[role="button"],input[type="button"],input[type="submit"],[onclick]'));
      return nodes.filter(visible).slice(0, 400).map((el) => {
        const txt = (el.innerText || el.textContent || "").trim();
        const aria = (el.getAttribute("aria-label") || "").trim();
        const title = (el.getAttribute("title") || "").trim();
        const rect = el.getBoundingClientRect();
        const href = (el.tagName === "A" && el.getAttribute("href")) || "";
        return { tag: el.tagName, txt, aria, title, href, rect };
      });
    });
    res.json({ count: data.length, items: data });
  } catch (e) { res.status(500).json({ error: String(e?.message || e) }); }
});

// =============== Browser Planner: Understand & Act + Extract ===============
app.post("/fx/understand_and_act", async (req, res) => {
  const instruction = String(req.body?.instruction || "").trim();
  if (!instruction) return res.status(400).json({ error: "instruction is required" });

  try {
    const { fxPage } = await ensureFirefox();
    const meta = {
      url: await fxPage.url(),
      title: await fxPage.title(),
      viewport: await fxPage.viewportSize()
    };

    // Collect candidates (handles kept in memory for this request)
    const handles = await fxPage.$$('a,button,[role="button"],input,textarea,select,[onclick]');
    const maxScan = Math.min(handles.length, 220);
    const candidates = [];
    for (let i = 0; i < maxScan; i++) {
      const el = handles[i];
      try {
        const info = await el.evaluate((node) => {
          function visible(n) {
            const cs = getComputedStyle(n);
            const r = n.getBoundingClientRect();
            return cs && cs.visibility !== "hidden" && cs.display !== "none" && r.width > 1 && r.height > 1;
          }
          const r = node.getBoundingClientRect();
          const role = node.getAttribute("role") || "";
          const tag = node.tagName;
          const type = (node.getAttribute("type") || "").toLowerCase();
          const txt = (node.innerText || node.textContent || "").trim();
          const aria = (node.getAttribute("aria-label") || "").trim();
          const title = (node.getAttribute("title") || "").trim();
          const placeholder = (node.getAttribute("placeholder") || "").trim();
          const nameAttr = (node.getAttribute("name") || "").trim();
          const href = (tag === "A" && node.getAttribute("href")) || "";
          return {
            role, tag, type, txt, aria, title, placeholder, nameAttr, href,
            rect: { x: r.x, y: r.y, w: r.width, h: r.height },
            visible: visible(node)
          };
        });
        if (!info.visible) continue;
        candidates.push({ i, ...info });
      } catch {}
    }

    // Also grab headings/nav cues
    const headings = await fxPage.evaluate(() => {
      const grab = (sel) =>
        Array.from(document.querySelectorAll(sel))
          .map(n => (n.innerText || n.textContent || "").trim())
          .filter(Boolean).slice(0, 20);
      return {
        h1: grab("h1"),
        h2: grab("h2"),
        nav: grab("header a, nav a, [role='navigation'] a")
      };
    });

    // Pre-filter: boost likely matches by fuzzy score to keep token size sane
    const scored = candidates.map(c => {
      const label = [c.txt, c.aria, c.title, c.placeholder, c.nameAttr].filter(Boolean).join(" ");
      return { ...c, _score: simpleScore(instruction, label) + (c.rect.y < 700 ? 10 : 0) };
    }).sort((a,b)=>b._score-a._score);

    const top = scored.slice(0, 120).map(({_score, ...rest}) => rest);

    // Ask the model to choose a plan
    const plannerPrompt = `
You are a web automation planner. Given a user's instruction and page context, choose ONE concise action:
- "click" a candidate index
- "type" text into a candidate index (input/textarea/search boxes)
- "scroll" up/down/top/bottom by a reasonable amount
- "extract" short text that answers user's request (if no action is needed)

Prefer items near the top of the viewport and with matching role/label. Be decisive.

Return ONLY JSON:
{
  "intent": "click" | "type" | "scroll" | "extract",
  "target_index": number | null,
  "text_to_type": string | null,
  "scroll": "top" | "bottom" | "down" | "up" | null,
  "why": "short rationale"
}
`.trim();

    const completion = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      temperature: 0.1,
      messages: [
        { role: "system", content: plannerPrompt },
        { role: "user", content: [
          { type: "text", text:
            `INSTRUCTION: ${instruction}\n` +
            `URL: ${meta.url}\nTITLE: ${meta.title}\n` +
            `HEADINGS.h1: ${headings.h1.join(" | ")}\n` +
            `HEADINGS.h2: ${headings.h2.join(" | ")}\n` +
            `NAV: ${headings.nav.join(" | ")}\n` +
            `CANDIDATES (index -> summary):\n` +
            top.map(c => `[${c.i}] role=${c.role||c.tag} y=${Math.round(c.rect.y)} label="${[c.txt,c.aria,c.title,c.placeholder].filter(Boolean).join(" ").slice(0,140)}" href="${c.href||""}"`).join("\n")
          }
        ] }
      ]
    });

    let plan;
    try { plan = JSON.parse(completion.choices[0].message.content || "{}"); }
    catch { return res.status(500).json({ error: "Planner returned invalid JSON." }); }

    // Execute the plan
    const execResult = { plan, meta, acted: false };

    if (plan.intent === "click" && Number.isInteger(plan.target_index)) {
      const target = candidates.find(c => c.i === plan.target_index);
      if (!target) return res.status(404).json({ error: "Planner chose a non-existent target", plan });

      const handle = handles[target.i];
      if (!handle) return res.status(404).json({ error: "Element handle not available", plan });

      await handle.scrollIntoViewIfNeeded().catch(()=>{});
      try {
        await handle.click({ timeout: 5000 });
      } catch {
        // click center via page mouse if element click fails
        const centerX = target.rect.x + target.rect.w / 2;
        const centerY = target.rect.y + target.rect.h / 2;
        await fxPage.mouse.click(centerX, centerY);
      }
      execResult.acted = true;
      execResult.action = { type: "click", target };
    }

    else if (plan.intent === "type" && Number.isInteger(plan.target_index)) {
      const target = candidates.find(c => c.i === plan.target_index);
      const text = String(plan.text_to_type ?? "").trim();
      if (!target) return res.status(404).json({ error: "Planner chose a non-existent target", plan });
      if (!text) return res.status(400).json({ error: "Planner did not provide text_to_type", plan });

      const handle = handles[target.i];
      await handle.scrollIntoViewIfNeeded().catch(()=>{});
      await handle.click().catch(()=>{});
      await fxPage.keyboard.type(text, { delay: 20 });
      execResult.acted = true;
      execResult.action = { type: "type", target, text };
    }

    else if (plan.intent === "scroll") {
      const dir = (plan.scroll || "down").toLowerCase();
      if (dir === "top") await fxPage.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      else if (dir === "bottom") await fxPage.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
      else if (dir === "up") await fxPage.mouse.wheel(0, -800);
      else await fxPage.mouse.wheel(0, 800);
      execResult.acted = true;
      execResult.action = { type: "scroll", dir };
    }

    else if (plan.intent === "extract") {
      const text = await fxPage.evaluate(() => (document.body.innerText || "").slice(0, 60000));
      const qa = await openai.chat.completions.create({
        model: MODEL,
        temperature: 0.0,
        messages: [
          { role: "system", content: "Answer using only the provided page text. If unsure, say so." },
          { role: "user", content: `Query: ${instruction}\n\nPAGE_TEXT:\n${text}` }
        ]
      });
      execResult.acted = true;
      execResult.action = { type: "extract", answer: qa.choices[0].message.content };
    }

    res.json(execResult);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/fx/extract", async (req, res) => {
  const query = String(req.body?.query || "").trim();
  if (!query) return res.status(400).json({ error: "query is required" });
  try {
    const { fxPage } = await ensureFirefox();
    const text = await fxPage.evaluate(() => (document.body.innerText || "").slice(0, 60000));
    const qa = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.0,
      messages: [
        { role: "system", content: "Extract the smallest accurate snippet that answers the user's query from PAGE_TEXT. If not present, say 'Not found'." },
        { role: "user", content: `Query: ${query}\n\nPAGE_TEXT:\n${text}` }
      ]
    });
    res.json({ answer: qa.choices[0].message.content });
  } catch (e) { res.status(500).json({ error: String(e?.message || e) }); }
});

// ===================== OS-LEVEL VISION & CLICK =====================
app.post("/os/screenshot", async (req, res) => {
  const outPath = req.body?.path;
  try {
    const shotPath = await takeScreenshotTmp();
    if (outPath) await fs.copyFile(shotPath, outPath);
    res.json({ screenshot: outPath || shotPath });
  } catch (e) { res.status(500).json({ error: String(e?.message || e) }); }
});

app.post("/os/click_xy", async (req, res) => {
  const x = Number(req.body?.x);
  const y = Number(req.body?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return res.status(400).json({ error: "x and y are required numbers" });
  try {
    await clickAt(x, y);
    res.json({ clicked: { x, y } });
  } catch (e) { res.status(500).json({ error: String(e?.message || e) }); }
});

app.post("/os/find_and_click", async (req, res) => {
  const query = req.body?.query;
  const notes = req.body?.notes || "";
  if (!query) return res.status(400).json({ error: "query is required" });

  try {
    const shotPath = await takeScreenshotTmp();
    const b64 = await fileToBase64(shotPath);

    const prompt = `
You are a UI vision agent. Given a macOS full-screen screenshot, find the UI element that best satisfies the user's instruction.
Return ONLY a JSON object with fields:
- x: integer (screen pixel x of the element's center)
- y: integer (screen pixel y of the element's center)
- w: integer (element width in pixels)
- h: integer (element height in pixels)
- label: short string naming the matched element

User instruction: "${query}"
Additional notes: "${notes}"

If nothing matches, return {"x":-1,"y":-1,"w":0,"h":0,"label":"not found"}.
    `.trim();

    const completion = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      temperature: 0.1,
      messages: [
        { role: "system", content: "You locate on-screen UI elements from images and return precise pixel coordinates." },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } }
          ]
        }
      ]
    });

    let box;
    try { box = JSON.parse(completion.choices[0].message.content || "{}"); }
    catch { return res.status(500).json({ error: "Vision response was not valid JSON." }); }

    if (!box || box.x < 0 || box.y < 0) return res.status(404).json({ error: "Target not found", box });

    await clickAt(box.x, box.y);
    res.json({ clicked: box, screenshot: shotPath, query });
  } catch (e) { res.status(500).json({ error: String(e?.message || e) }); }
});

// ===================== Start server =====================
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`MCP Word + Firefox + Screen server on http://localhost:${PORT}`);
  console.log(`Try: curl -X POST http://localhost:${PORT}/fx/understand_and_act -H 'Content-Type: application/json' -d '{"instruction":"Open the pricing page"}'`);
});
