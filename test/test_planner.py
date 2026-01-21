"""
Tests for the Planner module.
"""

from planner import Planner
import pytest
import json
from unittest.mock import Mock, MagicMock, patch
import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))


class TestPlanner:
    """Test cases for Planner class."""

    def test_init(self, mock_api_key):
        """Test planner initialization."""
        planner = Planner(mock_api_key, "gpt-4o-mini")
        assert planner.api_key == mock_api_key
        assert planner.model == "gpt-4o-mini"
        assert planner.client is not None

    @patch('planner.OpenAI')
    def test_create_plan_success(self, mock_openai_class, mock_api_key, mock_openai_response):
        """Test successful plan creation."""
        # Setup mock
        mock_client = MagicMock()
        mock_openai_class.return_value = mock_client

        plan_json = json.dumps({
            "goal": "Test goal",
            "steps": [
                {
                    "step_number": 1,
                    "type": "direct",
                    "action": "test_action",
                    "description": "Test step"
                }
            ]
        })

        mock_response = mock_openai_response(plan_json)
        mock_client.chat.completions.create.return_value = mock_response

        # Test
        planner = Planner(mock_api_key)
        available_tools = []
        plan = planner.create_plan("Test task", available_tools)

        # Verify
        assert plan["goal"] == "Test goal"
        assert len(plan["steps"]) == 1
        assert plan["steps"][0]["type"] == "direct"
        mock_client.chat.completions.create.assert_called_once()

    @patch('planner.OpenAI')
    def test_create_plan_with_tools(self, mock_openai_class, mock_api_key, mock_openai_response, sample_tools):
        """Test plan creation with available tools."""
        mock_client = MagicMock()
        mock_openai_class.return_value = mock_client

        plan_json = json.dumps({
            "goal": "Use tools",
            "steps": [
                {
                    "step_number": 1,
                    "type": "mcp_tool",
                    "action": "test_tool",
                    "mcp_server": "test_server",
                    "parameters": {"param1": "value1"},
                    "description": "Use test tool"
                }
            ]
        })

        mock_response = mock_openai_response(plan_json)
        mock_client.chat.completions.create.return_value = mock_response

        planner = Planner(mock_api_key)
        plan = planner.create_plan("Use a tool", sample_tools)

        assert plan["goal"] == "Use tools"
        assert plan["steps"][0]["type"] == "mcp_tool"
        assert plan["steps"][0]["mcp_server"] == "test_server"

    @patch('planner.OpenAI')
    def test_create_plan_json_decode_error(self, mock_openai_class, mock_api_key, mock_openai_response):
        """Test plan creation with invalid JSON response."""
        mock_client = MagicMock()
        mock_openai_class.return_value = mock_client

        # Return invalid JSON
        mock_response = mock_openai_response("not valid json")
        mock_client.chat.completions.create.return_value = mock_response

        planner = Planner(mock_api_key)
        plan = planner.create_plan("Test task", [])

        # Should return fallback plan
        assert plan["goal"] == "Test task"
        assert len(plan["steps"]) == 1
        assert plan["steps"][0]["type"] == "direct"

    @patch('planner.OpenAI')
    def test_create_plan_missing_fields(self, mock_openai_class, mock_api_key, mock_openai_response):
        """Test plan creation with missing fields in response."""
        mock_client = MagicMock()
        mock_openai_class.return_value = mock_client

        # Plan missing "steps" field
        plan_json = json.dumps({"goal": "Test goal"})
        mock_response = mock_openai_response(plan_json)
        mock_client.chat.completions.create.return_value = mock_response

        planner = Planner(mock_api_key)
        plan = planner.create_plan("Test task", [])

        # Should normalize with empty steps
        assert plan["goal"] == "Test goal"
        assert "steps" in plan
        assert plan["steps"] == []

    @patch('planner.OpenAI')
    def test_create_plan_api_error(self, mock_openai_class, mock_api_key):
        """Test plan creation when API call fails."""
        mock_client = MagicMock()
        mock_openai_class.return_value = mock_client
        mock_client.chat.completions.create.side_effect = Exception(
            "API Error")

        planner = Planner(mock_api_key)

        with pytest.raises(Exception, match="API Error"):
            planner.create_plan("Test task", [])

    def test_format_tools_empty(self, mock_api_key):
        """Test formatting empty tools list."""
        planner = Planner(mock_api_key)
        result = planner._format_tools([])
        assert result == "No tools available."

    def test_format_tools_single(self, mock_api_key):
        """Test formatting single tool."""
        planner = Planner(mock_api_key)
        tools = [
            {
                "name": "test_tool",
                "description": "A test tool",
                "mcp_server": "test_server"
            }
        ]
        result = planner._format_tools(tools)
        assert "test_tool" in result
        assert "A test tool" in result
        assert "test_server" in result

    def test_format_tools_multiple(self, mock_api_key):
        """Test formatting multiple tools."""
        planner = Planner(mock_api_key)
        tools = [
            {"name": "tool1", "description": "First tool"},
            {"name": "tool2", "description": "Second tool", "mcp_server": "server1"}
        ]
        result = planner._format_tools(tools)
        assert "tool1" in result
        assert "tool2" in result
        assert "First tool" in result
        assert "Second tool" in result

    def test_format_tools_no_description(self, mock_api_key):
        """Test formatting tools without description."""
        planner = Planner(mock_api_key)
        tools = [{"name": "tool1"}]
        result = planner._format_tools(tools)
        assert "tool1" in result
        assert "- tool1" in result or "tool1" in result
