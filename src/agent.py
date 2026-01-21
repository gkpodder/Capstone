"""
Simple General Purpose Agent
A proof-of-concept agent that takes prompts, creates plans, and executes them
using sub-agents and MCP connections.
"""

import json
import os
from typing import List, Dict, Any, Optional
from planner import Planner
from mcp_client import MCPClient
from sub_agent import SubAgent


class Agent:
    """Main agent that coordinates planning and execution."""
    
    def __init__(self, api_key: Optional[str] = None, model: str = "gpt-4o-mini"):
        """
        Initialize the agent.
        
        Args:
            api_key: OpenAI API key (or set OPENAI_API_KEY env var)
            model: LLM model to use for planning and execution
        """
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OpenAI API key required. Set OPENAI_API_KEY env var or pass api_key parameter.")
        
        self.model = model
        self.planner = Planner(self.api_key, self.model)
        self.mcp_clients: Dict[str, MCPClient] = {}
        self.sub_agents: List[SubAgent] = []
        
    def connect_mcp(self, name: str, server_path: str, args: List[str] = None):
        """
        Connect to an MCP server.
        
        Args:
            name: Name identifier for this MCP connection
            server_path: Path to the MCP server executable
            args: Optional arguments for the MCP server
        """
        client = MCPClient(server_path, args or [])
        client.connect()
        self.mcp_clients[name] = client
        print(f"✓ Connected to MCP server: {name}")
        
    def get_available_tools(self) -> List[Dict[str, Any]]:
        """Get all available tools from connected MCP servers."""
        tools = []
        for name, client in self.mcp_clients.items():
            try:
                mcp_tools = client.list_tools()
                for tool in mcp_tools:
                    tool["mcp_server"] = name
                    tools.append(tool)
            except Exception as e:
                print(f"Warning: Could not get tools from {name}: {e}")
        return tools
    
    def execute_plan(self, plan: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a plan step by step.
        
        Args:
            plan: Plan dictionary with steps and actions
            
        Returns:
            Execution results
        """
        results = []
        plan_steps = plan.get("steps", [])
        
        print(f"\n📋 Executing plan with {len(plan_steps)} steps...\n")
        
        for i, step in enumerate(plan_steps, 1):
            print(f"Step {i}/{len(plan_steps)}: {step.get('action', 'Unknown')}")
            
            action_type = step.get("type", "")
            action = step.get("action", "")
            parameters = step.get("parameters", {})
            
            try:
                if action_type == "mcp_tool":
                    # Execute MCP tool
                    mcp_server = step.get("mcp_server")
                    if mcp_server in self.mcp_clients:
                        result = self.mcp_clients[mcp_server].call_tool(
                            action, parameters
                        )
                        results.append({
                            "step": i,
                            "action": action,
                            "status": "success",
                            "result": result
                        })
                        print(f"  ✓ {action} completed")
                    else:
                        raise ValueError(f"MCP server '{mcp_server}' not connected")
                        
                elif action_type == "sub_agent":
                    # Launch sub-agent
                    sub_agent = SubAgent(self.api_key, self.model)
                    sub_result = sub_agent.execute_task(
                        step.get("task_description", "")
                    )
                    results.append({
                        "step": i,
                        "action": action,
                        "status": "success",
                        "result": sub_result
                    })
                    self.sub_agents.append(sub_agent)
                    print(f"  ✓ Sub-agent task completed")
                    
                elif action_type == "direct":
                    # Direct action (can be extended)
                    results.append({
                        "step": i,
                        "action": action,
                        "status": "success",
                        "result": f"Direct action: {action}"
                    })
                    print(f"  ✓ {action} completed")
                    
                else:
                    raise ValueError(f"Unknown action type: {action_type}")
                    
            except Exception as e:
                results.append({
                    "step": i,
                    "action": action,
                    "status": "error",
                    "error": str(e)
                })
                print(f"  ✗ Error: {e}")
                
        return {
            "plan": plan,
            "results": results,
            "success": all(r.get("status") == "success" for r in results)
        }
    
    def run(self, prompt: str) -> Dict[str, Any]:
        """
        Main entry point: take a prompt, create a plan, and execute it.
        
        Args:
            prompt: User's task prompt
            
        Returns:
            Complete execution results
        """
        print(f"\n🎯 Task: {prompt}\n")
        
        # Get available tools
        available_tools = self.get_available_tools()
        
        # Create plan
        print("🧠 Creating plan...")
        plan = self.planner.create_plan(prompt, available_tools)
        
        print(f"\n📝 Plan created:\n{json.dumps(plan, indent=2)}\n")
        
        # Execute plan
        execution_results = self.execute_plan(plan)
        
        return execution_results
    
    def cleanup(self):
        """Clean up resources and close connections."""
        for client in self.mcp_clients.values():
            try:
                client.disconnect()
            except:
                pass
        print("✓ Cleaned up connections")


if __name__ == "__main__":
    import sys
    
    # Example usage
    if len(sys.argv) < 2:
        print("Usage: python agent.py '<your prompt>'")
        sys.exit(1)
    
    prompt = " ".join(sys.argv[1:])
    
    agent = Agent()
    
    # Example: Connect to an MCP server (uncomment and configure as needed)
    # agent.connect_mcp("word", "/path/to/mcp-word/server.js", ["node"])
    
    try:
        results = agent.run(prompt)
        print(f"\n{'='*60}")
        print(f"Execution {'succeeded' if results['success'] else 'completed with errors'}")
        print(f"{'='*60}\n")
    finally:
        agent.cleanup()
