// agent.js
import dotenv from "dotenv";
dotenv.config();
import OpenAI from "openai";
import fetch from "node-fetch"; // Only needed if Node <18, otherwise remove this line

// Load environment variables from .env file

if (!process.env.OPENAI_API_KEY) {
    console.log(process.env.OPENAI_API_KEY);
  console.error("❌ ERROR: OPENAI_API_KEY is missing. Add it to your .env file.");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Define tools for controlling Microsoft Word ---
const tools = [
  {
    type: "function",
    function: {
      name: "word_insert_text",
      description: "Insert plain text into the active Microsoft Word document at the current selection.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "The text to insert." }
        },
        required: ["text"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "word_get_selection",
      description: "Get the currently selected text in Microsoft Word.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "word_open",
      description: "Open Microsoft Word (optionally with a file path).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute POSIX path to open (optional)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "word_save_as",
      description: "Save the active document to a path.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute POSIX path for the .docx file" }
        },
        required: ["path"]
      }
    }
  }
];

// --- Helper: call local MCP-like Word server endpoints ---
async function callLocalTool(name, args) {
  const base = "http://localhost:3001";

  if (name === "word_insert_text") {
    const r = await fetch(`${base}/word/insert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: args.text || "" })
    });
    return await r.json();
  }
  if (name === "word_get_selection") {
    const r = await fetch(`${base}/word/selection`);
    return await r.json();
  }
  if (name === "word_open") {
    const r = await fetch(`${base}/word/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: args.path })
    });
    return await r.json();
  }
  if (name === "word_save_as") {
    const r = await fetch(`${base}/word/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: args.path })
    });
    return await r.json();
  }

  throw new Error(`Unknown tool: ${name}`);
}

async function main() {
  const userMessage = "Open Word, insert 'Hello from GPT via MCP-like server!', then tell me what the selection is.";

  // Prepare chat history
  const messages = [
    { role: "system", content: "You can use tools to control Microsoft Word on the user's Mac." },
    { role: "user", content: userMessage }
  ];

  let chat = await openai.chat.completions.create({
    model: "gpt-4o-mini", // Or another tool-capable model
    messages,
    tools,
    tool_choice: "auto"
  });

  while (true) {
    const choice = chat.choices?.[0];
    const msg = choice?.message;

    if (msg?.tool_calls && msg.tool_calls.length > 0) {
      // Execute each tool call
      const toolResults = [];
      for (const tc of msg.tool_calls) {
        const name = tc.function.name;
        const args = JSON.parse(tc.function.arguments || "{}");
        console.log(`🤖 Model requested tool: ${name}`, args);

        const result = await callLocalTool(name, args);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result)
        });
      }

      // Send results back to model
      messages.push(msg, ...toolResults);

      chat = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        tools,
        tool_choice: "auto"
      });
      continue;
    }

    console.log("\n=== Final Model Response ===\n", msg?.content || "(no content)");
    break;
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
