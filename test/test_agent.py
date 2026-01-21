"""
Tests for the main Agent class.
"""

from unittest.mock import Mock, MagicMock, patch
import pytest
from agent import Agent
from planner import Planner
from mcp_client import MCPClient
from sub_agent import SubAgent
import sys
import os

# Add src to path BEFORE importing
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))


class TestAgent:
    """Test cases for Agent class."""

    @patch('planner.OpenAI')
    def test_init_with_api_key(self, mock_openai_class, mock_api_key):
        """Test agent initialization with API key."""
        mock_openai_class.return_value = MagicMock()
        agent = Agent(api_key=mock_api_key)
        assert agent.api_key == mock_api_key
        assert agent.model == "gpt-4o-mini"
        assert agent.planner is not None
        assert agent.mcp_clients == {}
        assert agent.sub_agents == []

    @patch('planner.OpenAI')
    @patch.dict(os.environ, {'OPENAI_API_KEY': 'env-api-key'})
    def test_init_from_env(self, mock_openai_class):
        """Test agent initialization from environment variable."""
        mock_openai_class.return_value = MagicMock()
        agent = Agent()
        assert agent.api_key == 'env-api-key'

    def test_init_no_api_key(self):
        """Test agent initialization fails without API key."""
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(ValueError, match="OpenAI API key required"):
                Agent()

    @patch('planner.OpenAI')
    @patch('agent.MCPClient')
    def test_connect_mcp(self, mock_mcp_client_class, mock_openai_class, mock_api_key):
        """Test connecting to MCP server."""
        mock_openai_class.return_value = MagicMock()
        mock_client = MagicMock()
        mock_mcp_client_class.return_value = mock_client

        agent = Agent(api_key=mock_api_key)
        agent.connect_mcp("test_server", "/path/to/server", ["arg1"])

        assert "test_server" in agent.mcp_clients
        assert agent.mcp_clients["test_server"] == mock_client
        mock_mcp_client_class.assert_called_once_with(
            "/path/to/server", ["arg1"])
        mock_client.connect.assert_called_once()

    @patch('planner.OpenAI')
    @patch('agent.MCPClient')
    def test_connect_mcp_no_args(self, mock_mcp_client_class, mock_openai_class, mock_api_key):
        """Test connecting to MCP server without args."""
        mock_openai_class.return_value = MagicMock()
        mock_client = MagicMock()
        mock_mcp_client_class.return_value = mock_client

        agent = Agent(api_key=mock_api_key)
        agent.connect_mcp("test_server", "/path/to/server")

        mock_mcp_client_class.assert_called_once_with("/path/to/server", [])

    @patch('planner.OpenAI')
    def test_get_available_tools_empty(self, mock_openai_class, mock_api_key):
        """Test getting tools when no MCP servers connected."""
        mock_openai_class.return_value = MagicMock()
        agent = Agent(api_key=mock_api_key)
        tools = agent.get_available_tools()
        assert tools == []

    @patch('planner.OpenAI')
    def test_get_available_tools(self, mock_openai_class, mock_api_key):
        """Test getting tools from connected MCP servers."""
        mock_openai_class.return_value = MagicMock()
        mock_client1 = MagicMock()
        mock_client1.list_tools.return_value = [
            {"name": "tool1", "description": "Tool 1"},
            {"name": "tool2", "description": "Tool 2"}
        ]

        mock_client2 = MagicMock()
        mock_client2.list_tools.return_value = [
            {"name": "tool3", "description": "Tool 3"}
        ]

        agent = Agent(api_key=mock_api_key)
        agent.mcp_clients["server1"] = mock_client1
        agent.mcp_clients["server2"] = mock_client2

        tools = agent.get_available_tools()

        assert len(tools) == 3
        assert tools[0]["name"] == "tool1"
        assert tools[0]["mcp_server"] == "server1"
        assert tools[2]["name"] == "tool3"
        assert tools[2]["mcp_server"] == "server2"

    @patch('planner.OpenAI')
    def test_get_available_tools_with_error(self, mock_openai_class, mock_api_key):
        """Test getting tools when one server fails."""
        mock_openai_class.return_value = MagicMock()
        mock_client1 = MagicMock()
        mock_client1.list_tools.return_value = [{"name": "tool1"}]

        mock_client2 = MagicMock()
        mock_client2.list_tools.side_effect = Exception("Connection error")

        agent = Agent(api_key=mock_api_key)
        agent.mcp_clients["server1"] = mock_client1
        agent.mcp_clients["server2"] = mock_client2

        tools = agent.get_available_tools()

        # Should still get tools from server1
        assert len(tools) == 1
        assert tools[0]["name"] == "tool1"

    @patch('agent.Planner')
    def test_execute_plan_direct_action(self, mock_planner_class, mock_api_key):
        """Test executing plan with direct action."""
        agent = Agent(api_key=mock_api_key)

        plan = {
            "goal": "Test goal",
            "steps": [
                {
                    "type": "direct",
                    "action": "test_action",
                    "description": "Test step"
                }
            ]
        }

        result = agent.execute_plan(plan)

        assert result["success"] is True
        assert len(result["results"]) == 1
        assert result["results"][0]["status"] == "success"
        assert result["results"][0]["action"] == "test_action"

    @patch('agent.Planner')
    def test_execute_plan_mcp_tool(self, mock_planner_class, mock_api_key):
        """Test executing plan with MCP tool."""
        mock_client = MagicMock()
        mock_client.call_tool.return_value = {"output": "success"}

        agent = Agent(api_key=mock_api_key)
        agent.mcp_clients["test_server"] = mock_client

        plan = {
            "goal": "Test goal",
            "steps": [
                {
                    "type": "mcp_tool",
                    "action": "test_tool",
                    "mcp_server": "test_server",
                    "parameters": {"param1": "value1"}
                }
            ]
        }

        result = agent.execute_plan(plan)

        assert result["success"] is True
        assert len(result["results"]) == 1
        assert result["results"][0]["status"] == "success"
        mock_client.call_tool.assert_called_once_with(
            "test_tool", {"param1": "value1"})

    @patch('agent.Planner')
    @patch('agent.SubAgent')
    def test_execute_plan_sub_agent(self, mock_sub_agent_class, mock_planner_class, mock_api_key):
        """Test executing plan with sub-agent."""
        mock_sub_agent = MagicMock()
        mock_sub_agent.execute_task.return_value = {
            "task": "subtask",
            "result": "completed",
            "status": "completed"
        }
        mock_sub_agent_class.return_value = mock_sub_agent

        agent = Agent(api_key=mock_api_key)

        plan = {
            "goal": "Test goal",
            "steps": [
                {
                    "type": "sub_agent",
                    "action": "delegate",
                    "task_description": "Complete subtask"
                }
            ]
        }

        result = agent.execute_plan(plan)

        assert result["success"] is True
        assert len(result["results"]) == 1
        assert result["results"][0]["status"] == "success"
        assert len(agent.sub_agents) == 1
        mock_sub_agent.execute_task.assert_called_once_with("Complete subtask")

    @patch('agent.Planner')
    def test_execute_plan_mcp_server_not_connected(self, mock_planner_class, mock_api_key):
        """Test executing plan with MCP tool but server not connected."""
        agent = Agent(api_key=mock_api_key)

        plan = {
            "goal": "Test goal",
            "steps": [
                {
                    "type": "mcp_tool",
                    "action": "test_tool",
                    "mcp_server": "nonexistent_server",
                    "parameters": {}
                }
            ]
        }

        result = agent.execute_plan(plan)

        assert result["success"] is False
        assert result["results"][0]["status"] == "error"
        assert "not connected" in result["results"][0]["error"]

    @patch('agent.Planner')
    def test_execute_plan_unknown_action_type(self, mock_planner_class, mock_api_key):
        """Test executing plan with unknown action type."""
        agent = Agent(api_key=mock_api_key)

        plan = {
            "goal": "Test goal",
            "steps": [
                {
                    "type": "unknown_type",
                    "action": "test_action"
                }
            ]
        }

        result = agent.execute_plan(plan)

        assert result["success"] is False
        assert result["results"][0]["status"] == "error"
        assert "Unknown action type" in result["results"][0]["error"]

    @patch('agent.Planner')
    def test_execute_plan_multiple_steps(self, mock_planner_class, mock_api_key):
        """Test executing plan with multiple steps."""
        agent = Agent(api_key=mock_api_key)

        plan = {
            "goal": "Test goal",
            "steps": [
                {"type": "direct", "action": "step1"},
                {"type": "direct", "action": "step2"},
                {"type": "direct", "action": "step3"}
            ]
        }

        result = agent.execute_plan(plan)

        assert result["success"] is True
        assert len(result["results"]) == 3
        assert all(r["status"] == "success" for r in result["results"])

    @patch('agent.Planner')
    def test_execute_plan_with_error(self, mock_planner_class, mock_api_key):
        """Test executing plan where one step fails."""
        agent = Agent(api_key=mock_api_key)

        plan = {
            "goal": "Test goal",
            "steps": [
                {"type": "direct", "action": "step1"},
                {"type": "unknown_type", "action": "step2"},  # This will fail
                {"type": "direct", "action": "step3"}
            ]
        }

        result = agent.execute_plan(plan)

        assert result["success"] is False
        assert len(result["results"]) == 3
        assert result["results"][0]["status"] == "success"
        assert result["results"][1]["status"] == "error"
        assert result["results"][2]["status"] == "success"

    @patch('agent.Planner')
    def test_run_full_workflow(self, mock_planner_class, mock_api_key):
        """Test full run workflow."""
        mock_planner = MagicMock()
        mock_planner.create_plan.return_value = {
            "goal": "Test goal",
            "steps": [
                {"type": "direct", "action": "test_action"}
            ]
        }
        mock_planner_class.return_value = mock_planner

        agent = Agent(api_key=mock_api_key)

        result = agent.run("Test prompt")

        assert result["success"] is True
        mock_planner.create_plan.assert_called_once()
        # Should be called with prompt and available tools
        call_args = mock_planner.create_plan.call_args
        assert call_args[0][0] == "Test prompt"

    @patch('agent.Planner')
    def test_cleanup(self, mock_planner_class, mock_api_key):
        """Test cleanup of resources."""
        mock_client1 = MagicMock()
        mock_client2 = MagicMock()

        agent = Agent(api_key=mock_api_key)
        agent.mcp_clients["server1"] = mock_client1
        agent.mcp_clients["server2"] = mock_client2

        agent.cleanup()

        mock_client1.disconnect.assert_called_once()
        mock_client2.disconnect.assert_called_once()

    @patch('agent.Planner')
    def test_cleanup_with_error(self, mock_planner_class, mock_api_key):
        """Test cleanup handles errors gracefully."""
        mock_client1 = MagicMock()
        mock_client1.disconnect.side_effect = Exception("Disconnect error")
        mock_client2 = MagicMock()

        agent = Agent(api_key=mock_api_key)
        agent.mcp_clients["server1"] = mock_client1
        agent.mcp_clients["server2"] = mock_client2

        # Should not raise exception
        agent.cleanup()

        mock_client2.disconnect.assert_called_once()
