import React, { useState, useRef, useEffect } from "react";

const AGENT_API_BASE = "http://localhost:3002";

function PermissionModal({ request, onSubmit, onCancel }) {
  if (!request || !request.required) return null;

  const [values, setValues] = useState({});

  const handleChange = (id, value) => {
    setValues((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = () => {
    onSubmit(values);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>Agent Needs Permission</h2>
        <p className="modal-reason">{request.reason}</p>
        <div className="modal-fields">
          {(request.fields || []).map((f) => (
            <div key={f.id} className="field">
              <label>
                {f.label}
                {!f.optional && <span className="required">*</span>}
              </label>
              <input
                type={f.type || "text"}
                placeholder={f.placeholder || ""}
                onChange={(e) => handleChange(f.id, e.target.value)}
              />
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button onClick={handleSubmit} className="btn-primary">
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Ongoing Updates panel
 * Auto-scrolls to bottom whenever stepLog changes.
 */
function StepLog({ stepLog }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // jump to bottom whenever new steps come in
    el.scrollTop = el.scrollHeight;
  }, [stepLog]);

  if (!stepLog || !stepLog.length) {
    return (
      <div ref={containerRef} className="step-log">
        <div className="empty-log">
          No activity yet. Ask the agent to do something.
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="step-log">
      {stepLog.map((step, idx) => {
        if (step.type === "tool_call") {
          return (
            <div key={idx} className="log-item">
              <div className="log-label">Tool call</div>
              {step.calls.map((c) => (
                <div key={c.id} className="log-detail">
                  <span className="log-tool-name">{c.name}</span>
                  <code className="log-args">{JSON.stringify(c.args)}</code>
                </div>
              ))}
            </div>
          );
        }
        if (step.type === "tool_result") {
          const resultStr = JSON.stringify(step.result);
          return (
            <div key={idx} className="log-item">
              <div className="log-label">Tool result</div>
              <div className="log-detail">
                <span className="log-tool-name">{step.name}</span>
                <code className="log-args">
                  {resultStr.slice(0, 300)}
                  {resultStr.length > 300 ? "…" : ""}
                </code>
              </div>
            </div>
          );
        }
        if (step.type === "assistant_final") {
          return (
            <div key={idx} className="log-item log-final">
              <div className="log-label">Agent final message</div>
              <code className="log-args">
                {step.content.length > 400
                  ? step.content.slice(0, 400) + "…"
                  : step.content}
              </code>
            </div>
          );
        }
        return (
          <div key={idx} className="log-item">
            <div className="log-label">{step.type}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const [sessionId, setSessionId] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const [messages, setMessages] = useState([]);
  const [stepLog, setStepLog] = useState([]);
  const [showThoughts, setShowThoughts] = useState(false);
  const [permissionRequest, setPermissionRequest] = useState(null);

  const pollingRef = useRef(null);

  const startPollingSteps = (sid) => {
    if (!sid) return;

    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    const id = setInterval(async () => {
      try {
        const res = await fetch(
          `${AGENT_API_BASE}/agent/steps?sessionId=${encodeURIComponent(sid)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        setStepLog(data.stepLog || []);
      } catch {
        // ignore errors during polling
      }
    }, 800);

    pollingRef.current = id;
  };

  const stopPollingSteps = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const sendPrompt = async (text) => {
    if (!text.trim()) return;
    setIsRunning(true);

    // ensure a session id exists before we hit the API
    let sid = sessionId;
    if (!sid) {
      sid =
        "web_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2, 8);
      setSessionId(sid);
    }

    setMessages((prev) => [...prev, { role: "user", content: text }]);

    startPollingSteps(sid);

    try {
      const res = await fetch(`${AGENT_API_BASE}/agent/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, sessionId: sid }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Agent error:", data);
        setMessages((prev) => [
          ...prev,
          {
            role: "agent",
            content: `Error: ${data.error || "Unknown error"}`,
          },
        ]);
      } else {
        if (data.sessionId) {
          setSessionId(data.sessionId);
        }

        setStepLog(data.stepLog || []);

        const agentMsg = {
          role: "agent",
          visibleResponse: data.visibleResponse || "",
          thoughtProcess: data.thoughtProcess || "",
          nextStep: data.nextStep || "",
          toolsUsed: data.toolsUsed || [],
        };

        setMessages((prev) => [...prev, agentMsg]);

        if (data.permissionRequest && data.permissionRequest.required) {
          setPermissionRequest(data.permissionRequest);
        } else {
          setPermissionRequest(null);
        }
      }
    } catch (e) {
      console.error(e);
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: `Network error: ${e.message}` },
      ]);
    } finally {
      stopPollingSteps();
      setIsRunning(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = prompt;
    setPrompt("");
    sendPrompt(text);
  };

  const handlePermissionSubmit = async (values) => {
    setPermissionRequest(null);
    const payload = {
      __permissionResponse: true,
      values,
    };
    const text = JSON.stringify(payload);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: "(Permission response submitted)" },
    ]);

    await sendPrompt(text);
  };

  const handlePermissionCancel = () => {
    setPermissionRequest(null);
  };

  return (
    <div className="app-root">
      <header className="app-header">
        <div>
          <h1>Desktop Agent Control</h1>
          <p className="app-subtitle">
            Control Word, Firefox, and your screen with natural language.
          </p>
        </div>
        <div className="session-indicator">
          <span className="dot" data-active={!!sessionId} />
          <span>{sessionId ? `Session: ${sessionId}` : "New session"}</span>
        </div>
      </header>

      <main className="app-main">
        {/* Left: Conversation + Input */}
        <section className="column conversation">
          <div className="panel">
            <div className="panel-header">
              <h2>Conversation</h2>
            </div>
            <div className="conversation-body">
              {messages.length === 0 && (
                <div className="empty-convo">
                  Try something like:
                  <code>go to https://stripe.com and open pricing</code>
                </div>
              )}
              {messages.map((m, idx) => {
                if (m.role === "user") {
                  return (
                    <div key={idx} className="msg msg-user">
                      <div className="msg-role">You</div>
                      <div className="msg-content">{m.content}</div>
                    </div>
                  );
                }
                if (m.role === "agent" && m.visibleResponse !== undefined) {
                  return (
                    <div key={idx} className="msg msg-agent">
                      <div className="msg-role">Agent</div>
                      <div className="msg-content">
                        <p>{m.visibleResponse}</p>

                        {m.toolsUsed && m.toolsUsed.length > 0 && (
                          <div className="msg-tools">
                            <span className="msg-tools-label">Tools used:</span>
                            {m.toolsUsed.map((t) => (
                              <span key={t} className="msg-tool-pill">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}

                        {m.nextStep && (
                          <div className="msg-nextstep">
                            <strong>Next step:</strong> {m.nextStep}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={idx} className="msg msg-agent">
                    <div className="msg-role">Agent</div>
                    <div className="msg-content">{m.content}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <form className="input-bar" onSubmit={handleSubmit}>
            <textarea
              rows={3}
              placeholder="Describe what you want the agent to do…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <div className="input-actions">
              <button
                type="submit"
                className="btn-primary"
                disabled={!prompt.trim() || isRunning}
              >
                {isRunning ? "Running…" : "Send"}
              </button>
            </div>
          </form>
        </section>

        {/* Right: Status + Thought process */}
        <section className="column status">
          <div className="panel">
            <div className="panel-header">
              <h2>Ongoing Updates</h2>
              {isRunning && (
                <span className="pill pill-running">Agent is working…</span>
              )}
            </div>
            <StepLog stepLog={stepLog} />
          </div>

          <div className="panel thoughts-panel">
            <div className="panel-header">
              <h2>Agent Thought Process</h2>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowThoughts((v) => !v)}
              >
                {showThoughts ? "Hide" : "Show"}
              </button>
            </div>
            {showThoughts ? (
              <div className="thoughts-body">
                {messages
                  .filter((m) => m.role === "agent" && m.thoughtProcess)
                  .slice(-1)
                  .map((m, idx) => (
                    <p key={idx} className="thought-text">
                      {m.thoughtProcess}
                    </p>
                  ))}
                {(!messages.some((m) => m.thoughtProcess) ||
                  messages.length === 0) && (
                  <div className="empty-thoughts">
                    No thought process yet. Send a request to see how the agent
                    reasons.
                  </div>
                )}
              </div>
            ) : (
              <div className="thoughts-body thoughts-body-muted">
                Thought process is hidden. Click “Show” to view the agent’s
                reasoning.
              </div>
            )}
          </div>
        </section>
      </main>

      <PermissionModal
        request={permissionRequest}
        onSubmit={handlePermissionSubmit}
        onCancel={handlePermissionCancel}
      />
    </div>
  );
}
