// agent_server.js — HTTP API wrapper around your tool-using agent (replaces agent_cli.js)

import dotenv from "dotenv";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import OpenAI from "openai";
import fetch from "node-fetch"; // if Node >= 18 you can remove this and use global fetch

dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY in .env");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

// Base URL of your tools server (server.js)
const TOOLS_BASE = process.env.TOOLS_BASE_URL || "http://localhost:3001";

// ---------- Tool schemas ----------
const tools = [
  // ===== Word =====
  {
    type: "function",
    function: {
      name: "word_open",
      description: "Open Microsoft Word (optionally with a file path).",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "word_insert_text",
      description: "Insert text at current selection (creates doc if none).",
      parameters: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "word_get_selection",
      description: "Return selected text in Word.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "word_save_as",
      description: "Save active document to path (.docx).",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "word_find_replace",
      description: "Find and replace all in document.",
      parameters: {
        type: "object",
        properties: { find: { type: "string" }, replace: { type: "string" } },
        required: ["find", "replace"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "word_export_pdf",
      description: "Export active document to PDF path.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },

  // ===== Firefox (Playwright) basic tools =====
  {
    type: "function",
    function: {
      name: "fx_open_url",
      description: "Open a URL in Firefox.",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fx_google_search",
      description: "Search in Firefox (backed by DuckDuckGo).",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fx_click",
      description: "Click a CSS selector.",
      parameters: {
        type: "object",
        properties: { selector: { type: "string" } },
        required: ["selector"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fx_click_text",
      description:
        "Click something by its visible label (e.g., 'About', 'Pricing'). Tries role-based and fuzzy match.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" },
          role: {
            type: "string",
            enum: ["link", "button"],
            description: "Optional hint",
          },
          exact: {
            type: "boolean",
            description: "Require exact label match",
          },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fx_scroll",
      description: "Scroll the page.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", enum: ["top", "bottom"] },
          px: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fx_type",
      description: "Type into a selector (optional clear).",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string" },
          text: { type: "string" },
          clear: { type: "boolean" },
        },
        required: ["selector", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fx_wait_for_selector",
      description: "Wait for a selector to appear.",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string" },
          timeoutMs: { type: "number" },
        },
        required: ["selector"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fx_eval",
      description: "Evaluate JS in page; return a value.",
      parameters: {
        type: "object",
        properties: { code: { type: "string" } },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fx_get_html",
      description: "Return current page HTML.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "fx_screenshot",
      description: "Screenshot full page to a path.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },

  // ===== Browser Planner tools (server-side LLM planning) =====
  {
    type: "function",
    function: {
      name: "fx_understand_and_act",
      description:
        "Give one natural-language instruction; server plans & executes (click/type/scroll/extract).",
      parameters: {
        type: "object",
        properties: { instruction: { type: "string" } },
        required: ["instruction"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fx_extract",
      description: "Answer a question using the visible page text.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },

  // ===== OS-level Vision & Click =====
  {
    type: "function",
    function: {
      name: "os_screenshot",
      description: "Capture full screen to a file (or temp).",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Optional output path",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "os_click_xy",
      description: "Click absolute screen coordinates.",
      parameters: {
        type: "object",
        properties: {
          x: { type: "number" },
          y: { type: "number" },
        },
        required: ["x", "y"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "os_find_and_click",
      description:
        "Use vision to locate an on-screen UI element by instruction (e.g., 'Click the About button') and click it.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          notes: { type: "string" },
        },
        required: ["query"],
      },
    },
  },
];

// ---------- Tool HTTP helpers ----------
async function get(path) {
  const r = await fetch(`${TOOLS_BASE}${path}`);
  return await r.json();
}
async function post(path, body) {
  const r = await fetch(`${TOOLS_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return await r.json();
}

async function callLocalTool(name, args) {
  switch (name) {
    // Word
    case "word_open":
      return post("/word/open", { path: args?.path });
    case "word_insert_text":
      return post("/word/insert", { text: args?.text || "" });
    case "word_get_selection":
      return get("/word/selection");
    case "word_save_as":
      return post("/word/save", { path: args?.path });
    case "word_find_replace":
      return post("/word/find_replace", {
        find: args?.find || "",
        replace: args?.replace || "",
      });
    case "word_export_pdf":
      return post("/word/export_pdf", { path: args?.path });

    // Firefox (basic)
    case "fx_open_url":
      return post("/fx/open_url", { url: args?.url });
    case "fx_google_search":
      return post("/fx/google_search", { query: args?.query });
    case "fx_click":
      return post("/fx/click", { selector: args?.selector });
    case "fx_click_text":
      return post("/fx/click_text", {
        text: args?.text,
        role: args?.role,
        exact: !!args?.exact,
      });
    case "fx_scroll":
      return post("/fx/scroll", { to: args?.to, px: args?.px });
    case "fx_type":
      return post("/fx/type", {
        selector: args?.selector,
        text: args?.text,
        clear: !!args?.clear,
      });
    case "fx_wait_for_selector":
      return post("/fx/wait_for_selector", {
        selector: args?.selector,
        timeoutMs: args?.timeoutMs,
      });
    case "fx_eval":
      return post("/fx/eval", { code: args?.code });
    case "fx_get_html":
      return get("/fx/html");
    case "fx_screenshot":
      return post("/fx/screenshot", { path: args?.path });

    // Browser planner
    case "fx_understand_and_act":
      return post("/fx/understand_and_act", {
        instruction: args?.instruction,
      });
    case "fx_extract":
      return post("/fx/extract", { query: args?.query });

    // OS-level
    case "os_screenshot":
      return post("/os/screenshot", { path: args?.path });
    case "os_click_xy":
      return post("/os/click_xy", { x: args?.x, y: args?.y });
    case "os_find_and_click":
      return post("/os/find_and_click", {
        query: args?.query,
        notes: args?.notes,
      });

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------- Session management ----------
const sessions = new Map();

function createSessionId() {
  return `s_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function baseSystemMessage() {
  return {
    role: "system",
    content: `
You control Microsoft Word, a Playwright-driven Firefox, and OS-level screen vision.
Default to 'fx_understand_and_act' for browser-style instructions (e.g., "open pricing", "search for gravel bikes").
If DOM-based tools struggle, use 'os_find_and_click' as a fallback.

IMPORTANT RESPONSE FORMAT FOR THE UI:

After you have finished using tools for a given user message and are ready to respond, you MUST reply with valid JSON only (no markdown fences), with this shape:

{
  "visibleResponse": "short, user-facing summary of what you did or found (1–4 sentences)",
  "thoughtProcess": "slightly more detailed explanation of why you chose those tools and steps (up to ~8 sentences)",
  "nextStep": "what you or the user should do next (1–2 sentences)",
  "permissionRequest": {
    "required": false,
    "reason": "",
    "fields": []
  }
}

If you need explicit permission or extra data from the user (e.g. to log into an account, accept terms, type passwords, etc.):
- Set permissionRequest.required = true
- Explain why in permissionRequest.reason
- For each required field, add an object like:
  { "id": "email", "label": "Email", "type": "email", "placeholder": "name@example.com", "optional": false }

The frontend will show a popup and then send you a follow-up user message whose entire content is a JSON string like:
{"__permissionResponse": true, "values": { "<fieldId>": "<value>", ... }}

When you receive such a JSON permission response, treat those values as the user's explicit input and continue the task.

Keep tool usage efficient; don't over-click or over-scroll. Summarize long outputs instead of dumping them verbatim.
`.trim(),
  };
}

function getSession(sessionId) {
  if (sessionId && sessions.has(sessionId)) return sessions.get(sessionId);
  const id = sessionId || createSessionId();
  const session = {
    id,
    messages: [baseSystemMessage()],
    stepLog: [],
  };
  sessions.set(id, session);
  return session;
}

// ---------- Helper: robust JSON parsing (handles ```json fences) ----------
function parseAgentJson(content) {
  if (!content) return null;
  let raw = content.trim();

  const fenced =
    raw.match(/```json([\s\S]*?)```/i) || raw.match(/```([\s\S]*?)```/i);
  if (fenced) {
    raw = fenced[1].trim();
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ---------- Core agent turn ----------
async function runAgentTurn(session, userText) {
  const messages = session.messages;

  messages.push({ role: "user", content: userText });

  const stepLog = (session.stepLog = []);
  const toolsUsed = new Set();

  let chat = await openai.chat.completions.create({
    model: MODEL,
    messages,
    tools,
    tool_choice: "auto",
    temperature: 0.2,
  });

  while (true) {
    const msg = chat.choices?.[0]?.message;

    if (msg?.tool_calls?.length) {
      // Log the tool calls
      const thisToolCalls = msg.tool_calls.map((tc) => {
        let parsedArgs = {};
        try {
          parsedArgs = tc.function.arguments
            ? JSON.parse(tc.function.arguments)
            : {};
        } catch {
          parsedArgs = { _raw: tc.function.arguments };
        }
        return {
          id: tc.id,
          name: tc.function.name,
          args: parsedArgs,
        };
      });

      stepLog.push({
        type: "tool_call",
        at: new Date().toISOString(),
        calls: thisToolCalls,
      });

      messages.push({
        role: "assistant",
        tool_calls: msg.tool_calls,
      });

      // Execute tools and feed results back
      const toolResponses = [];
      for (const tc of msg.tool_calls) {
        const name = tc.function.name;
        const args = tc.function.arguments
          ? JSON.parse(tc.function.arguments)
          : {};
        toolsUsed.add(name);

        let result;
        try {
          result = await callLocalTool(name, args);
        } catch (e) {
          result = { error: String(e?.message || e) };
        }

        stepLog.push({
          type: "tool_result",
          at: new Date().toISOString(),
          name,
          args,
          result,
        });

        toolResponses.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }

      messages.push(...toolResponses);

      chat = await openai.chat.completions.create({
        model: MODEL,
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.2,
      });
    } else {
      const finalContent = msg?.content || "";
      messages.push({ role: "assistant", content: finalContent });
      stepLog.push({
        type: "assistant_final",
        at: new Date().toISOString(),
        content: finalContent,
      });

      const parsed = parseAgentJson(finalContent);

      const visibleResponse =
        parsed && typeof parsed.visibleResponse === "string"
          ? parsed.visibleResponse
          : finalContent;

      const thoughtProcess =
        parsed && typeof parsed.thoughtProcess === "string"
          ? parsed.thoughtProcess
          : "";

      const nextStep =
        parsed && typeof parsed.nextStep === "string" ? parsed.nextStep : "";

      const permissionRequest =
        parsed && typeof parsed.permissionRequest === "object"
          ? parsed.permissionRequest
          : { required: false, reason: "", fields: [] };

      return {
        sessionId: session.id,
        visibleResponse,
        thoughtProcess,
        nextStep,
        permissionRequest,
        toolsUsed: Array.from(toolsUsed),
        stepLog,
        rawAssistantMessage: finalContent,
      };
    }
  }
}

// ---------- HTTP server ----------
const app = express();
app.use(bodyParser.json({ limit: "5mb" }));
app.use(cors()); // allow all origins locally

app.get("/agent/health", (_req, res) => {
  res.json({ service: "desktop-agent-orchestrator", status: "ok" });
});

app.get("/agent/steps", (req, res) => {
  const { sessionId } = req.query || {};
  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(404).json({ error: "unknown sessionId" });
  }
  const session = sessions.get(sessionId);
  res.json({ stepLog: session.stepLog || [] });
});

/**
 * POST /agent/message
 * body: { prompt: string, sessionId?: string }
 */
app.post("/agent/message", async (req, res) => {
  const { prompt, sessionId } = req.body || {};
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "prompt (string) is required" });
  }

  try {
    const session = getSession(sessionId);
    const result = await runAgentTurn(session, prompt);
    res.json(result);
  } catch (e) {
    console.error("Agent error:", e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

const PORT = process.env.AGENT_PORT || 3002;
app.listen(PORT, () => {
  console.log(`🤖 Agent orchestrator on http://localhost:${PORT}`);
  console.log(
    `POST /agent/message {"prompt":"go to https://stripe.com and open pricing"}`
  );
});
