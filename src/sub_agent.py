"""
Sub-agent module for delegating tasks to specialized agents.
"""

import json
from typing import Dict, Any
from openai import OpenAI


class SubAgent:
    """A sub-agent that can handle delegated tasks."""

    def __init__(self, api_key: str, model: str = "gpt-4o-mini"):
        """
        Initialize sub-agent.

        Args:
            api_key: OpenAI API key
            model: LLM model to use
        """
        self.client = OpenAI(api_key=api_key)
        self.model = model

    def execute_task(self, task_description: str) -> Dict[str, Any]:
        """
        Execute a delegated task.

        Args:
            task_description: Description of the task to perform

        Returns:
            Task execution results
        """
        system_prompt = """You are a helpful sub-agent that executes specific tasks.
Analyze the task, break it down if needed, and provide a clear result.
If the task requires actions you cannot perform directly, explain what would be needed."""

        user_prompt = f"""Task: {task_description}

Please execute this task and provide a clear result or explanation."""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3
            )

            result_text = response.choices[0].message.content

            return {
                "task": task_description,
                "result": result_text,
                "status": "completed"
            }

        except Exception as e:
            return {
                "task": task_description,
                "result": None,
                "status": "error",
                "error": str(e)
            }
