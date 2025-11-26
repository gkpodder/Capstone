// agent_cli.js — interactive CLI (uses .env OPENAI_API_KEY) with Browser Planner tools
import dotenv from "dotenv";
import OpenAI from "openai";
import readline from "readline";
import fetch from "node-fetch"; // remove if Node >= 18

dotenv.config();
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY in .env");
  process.exit(1);
}
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

// ---- Tool schemas ----
const tools = [
  // ===== Word =====
  { type: "function", function: { name: "word_open", description: "Open Microsoft Word (optionally with a file path).", parameters: { type: "object", properties: { path: { type: "string" } } } } },
  { type: "function", function: { name: "word_insert_text", description: "Insert text at current selection (creates doc if none).", parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } } },
  { type: "function", function: { name: "word_get_selection", description: "Return selected text in Word.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "word_save_as", description: "Save active document to path (.docx).", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: { name: "word_find_replace", description: "Find and replace all in document.", parameters: { type: "object", properties: { find: { type: "string" }, replace: { type: "string" } }, required: ["find","replace"] } } },
  { type: "function", function: { name: "word_export_pdf", description: "Export active document to PDF path.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },

  // ===== Firefox (Playwright) basic tools =====
  { type: "function", function: { name: "fx_open_url", description: "Open a URL in Firefox.", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
  { type: "function", function: { name: "fx_google_search", description: "Google search in Firefox.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
  { type: "function", function: { name: "fx_click", description: "Click a CSS selector.", parameters: { type: "object", properties: { selector: { type: "string" } }, required: ["selector"] } } },
  { type: "function", function: {
      name: "fx_click_text",
      description: "Click something by its visible label (e.g., 'About', 'Pricing'). Tries role-based and fuzzy match.",
      parameters: { type: "object", properties: {
        text: { type: "string" },
        role: { type: "string", enum: ["link","button"], description: "Optional hint" },
        exact: { type: "boolean", description: "Require exact label match" }
      }, required: ["text"] }
  } },
  { type: "function", function: {
      name: "fx_scroll",
      description: "Scroll the page.",
      parameters: { type: "object", properties: { to: { type: "string", enum: ["top","bottom"] }, px: { type: "number" } } }
  } },
  { type: "function", function: { name: "fx_type", description: "Type into a selector (optional clear).", parameters: { type: "object", properties: { selector: { type: "string" }, text: { type: "string" }, clear: { type: "boolean" } }, required: ["selector","text"] } } },
  { type: "function", function: { name: "fx_wait_for_selector", description: "Wait for a selector to appear.", parameters: { type: "object", properties: { selector: { type: "string" }, timeoutMs: { type: "number" } }, required: ["selector"] } } },
  { type: "function", function: { name: "fx_eval", description: "Evaluate JS in page; return a value.", parameters: { type: "object", properties: { code: { type: "string" } }, required: ["code"] } } },
  { type: "function", function: { name: "fx_get_html", description: "Return current page HTML.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "fx_screenshot", description: "Screenshot full page to a path.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },

  // ===== Browser Planner tools (server-side LLM planning) =====
  { type: "function", function: {
      name: "fx_understand_and_act",
      description: "Give one natural-language instruction; server plans & executes (click/type/scroll/extract).",
      parameters: { type: "object", properties: { instruction: { type: "string" } }, required: ["instruction"] }
  } },
  { type: "function", function: {
      name: "fx_extract",
      description: "Answer a question using the visible page text.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
  } },

  // ===== OS-level Vision & Click =====
  { type: "function", function: {
      name: "os_screenshot",
      description: "Capture full screen to a file (or temp).",
      parameters: { type: "object", properties: { path: { type: "string", description: "Optional output path" } } }
  } },
  { type: "function", function: {
      name: "os_click_xy",
      description: "Click absolute screen coordinates.",
      parameters: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x","y"] }
  } },
  { type: "function", function: {
      name: "os_find_and_click",
      description: "Use vision to locate an on-screen UI element by instruction (e.g., 'Click the About button') and click it.",
      parameters: { type: "object", properties: { query: { type: "string" }, notes: { type: "string" } }, required: ["query"] }
  } },
];

// ---- Local dispatcher ----
const BASE = "http://localhost:3001";

async function callLocalTool(name, args) {
  switch (name) {
    // Word
    case "word_open": return post("/word/open", { path: args?.path });
    case "word_insert_text": return post("/word/insert", { text: args?.text || "" });
    case "word_get_selection": return get("/word/selection");
    case "word_save_as": return post("/word/save", { path: args?.path });
    case "word_find_replace": return post("/word/find_replace", { find: args?.find || "", replace: args?.replace || "" });
    case "word_export_pdf": return post("/word/export_pdf", { path: args?.path });

    // Firefox (basic)
    case "fx_open_url": return post("/fx/open_url", { url: args?.url });
    case "fx_google_search": return post("/fx/google_search", { query: args?.query });
    case "fx_click": return post("/fx/click", { selector: args?.selector });
    case "fx_click_text": return post("/fx/click_text", { text: args?.text, role: args?.role, exact: !!args?.exact });
    case "fx_scroll": return post("/fx/scroll", { to: args?.to, px: args?.px });
    case "fx_type": return post("/fx/type", { selector: args?.selector, text: args?.text, clear: !!args?.clear });
    case "fx_wait_for_selector": return post("/fx/wait_for_selector", { selector: args?.selector, timeoutMs: args?.timeoutMs });
    case "fx_eval": return post("/fx/eval", { code: args?.code });
    case "fx_get_html": return get("/fx/html");
    case "fx_screenshot": return post("/fx/screenshot", { path: args?.path });

    // Browser planner
    case "fx_understand_and_act": return post("/fx/understand_and_act", { instruction: args?.instruction });
    case "fx_extract": return post("/fx/extract", { query: args?.query });

    // OS-level
    case "os_screenshot": return post("/os/screenshot", { path: args?.path });
    case "os_click_xy": return post("/os/click_xy", { x: args?.x, y: args?.y });
    case "os_find_and_click": return post("/os/find_and_click", { query: args?.query, notes: args?.notes });

    default: throw new Error(`Unknown tool: ${name}`);
  }
}

async function get(path) {
  const r = await fetch(`${BASE}${path}`);
  return await r.json();
}
async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  return await r.json();
}

// ---- Conversation loop ----
const messages = [
  {
    role: "system",
    content:
      "You control Microsoft Word, a Playwright-driven Firefox, and OS-level screen vision. " +
      "Default to 'fx_understand_and_act' for browser instructions (e.g., 'open pricing', 'click about', 'fill search for gravel bikes'). " +
      "If it's outside the browser or DOM is tricky, use 'os_find_and_click'. Keep outputs brief."
  }
];

async function runOneTurn(userText) {
  messages.push({ role: "user", content: userText });

  let chat = await openai.chat.completions.create({
    model: MODEL,
    messages,
    tools,
    tool_choice: "auto",
    temperature: 0.2
  });

  while (true) {
    const msg = chat.choices?.[0]?.message;

    if (msg?.tool_calls?.length) {
      const toolResponses = [];
      for (const tc of msg.tool_calls) {
        const name = tc.function.name;
        const args = JSON.parse(tc.function.arguments || "{}");
        console.log(`⚙️ Tool requested: ${name}`, args);
        const result = await callLocalTool(name, args);
        toolResponses.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result)
        });
      }

      messages.push(msg, ...toolResponses);
      chat = await openai.chat.completions.create({
        model: MODEL,
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.2
      });
    } else {
      const final = msg?.content || "";
      messages.push({ role: "assistant", content: final });
      console.log(`\n🧠 Assistant:\n${final}\n`);
      break;
    }
  }
}

// ---- CLI ----
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log("💬 Examples:");
console.log("  go to https://stripe.com and open pricing");
console.log("  search google for 'best chrome extensions for tab management', open the first result");
console.log("  extract the hero headline from this page");
console.log("  open word and paste a short intro about gravel bikes, then save to ~/Desktop/gravel.docx");
console.log("Type 'exit' to quit.\n");

function ask() {
  rl.question("> ", async (text) => {
    if (!text || text.trim().toLowerCase() === "exit") {
      rl.close();
      return;
    }
    try {
      await runOneTurn(text);
    } catch (e) {
      console.error("Error:", e?.message || e);
    }
    ask();
  });
}
ask();
