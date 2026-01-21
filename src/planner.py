"""
Planning module for creating execution plans from user prompts.
"""

import json
from typing import List, Dict, Any
from openai import OpenAI


class Planner:
    """Creates structured plans from user prompts using LLM."""

    def __init__(self, api_key: str, model: str = "gpt-4o-mini"):
        """
        Initialize the planner.

        Args:
            api_key: OpenAI API key
            model: LLM model to use
        """
        self.client = OpenAI(api_key=api_key)
        self.model = model

    def create_plan(self, prompt: str, available_tools: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Create an execution plan from a user prompt.

        Args:
            prompt: User's task description
            available_tools: List of available MCP tools

        Returns:
            Structured plan dictionary
        """
        tools_description = self._format_tools(available_tools)

        system_prompt = """You are a planning agent that creates structured execution plans.
Given a user's task and available tools, create a step-by-step plan.

Available action types:
1. "mcp_tool" - Use an MCP tool (specify mcp_server, action, and parameters)
2. "sub_agent" - Delegate to a sub-agent (specify task_description)
3. "direct" - Direct action that doesn't require tools

Return a JSON plan with this structure:
{
  "goal": "brief description of the overall goal",
  "steps": [
    {
      "step_number": 1,
      "type": "mcp_tool" | "sub_agent" | "direct",
      "action": "action name or description",
      "mcp_server": "server name (if type is mcp_tool)",
      "parameters": {...} (if type is mcp_tool),
      "task_description": "description (if type is sub_agent)",
      "description": "what this step accomplishes"
    }
  ]
}

Be specific and break down complex tasks into clear steps."""

        user_prompt = f"""Task: {prompt}

Available Tools:
{tools_description if tools_description else "No tools currently available. You may need to use sub-agents or direct actions."}

Create a plan to complete this task."""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.3
            )

            plan_json = response.choices[0].message.content
            plan = json.loads(plan_json)

            # Validate and normalize plan structure
            if "steps" not in plan:
                plan["steps"] = []
            if "goal" not in plan:
                plan["goal"] = prompt

            return plan

        except json.JSONDecodeError as e:
            print(f"Warning: Failed to parse plan JSON: {e}")
            # Return a simple fallback plan
            return {
                "goal": prompt,
                "steps": [
                    {
                        "step_number": 1,
                        "type": "direct",
                        "action": "process_task",
                        "description": f"Process the task: {prompt}"
                    }
                ]
            }
        except Exception as e:
            print(f"Error creating plan: {e}")
            raise

    def _format_tools(self, tools: List[Dict[str, Any]]) -> str:
        """Format available tools into a readable string."""
        if not tools:
            return "No tools available."

        formatted = []
        for tool in tools:
            tool_info = f"- {tool.get('name', 'unknown')}"
            if tool.get('description'):
                tool_info += f": {tool['description']}"
            if tool.get('mcp_server'):
                tool_info += f" (from {tool['mcp_server']})"
            formatted.append(tool_info)

        return "\n".join(formatted)
