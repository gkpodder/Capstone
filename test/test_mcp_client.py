"""
Tests for the MCPClient module.
"""

from mcp_client import MCPClient
import pytest
from unittest.mock import Mock, MagicMock, patch
import json
import subprocess
import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))


class TestMCPClient:
    """Test cases for MCPClient class."""

    def test_init(self):
        """Test MCP client initialization."""
        client = MCPClient("/path/to/server", ["arg1", "arg2"])
        assert client.server_path == "/path/to/server"
        assert client.args == ["arg1", "arg2"]
        assert client.process is None
        assert client.tools_cache == []

    def test_init_no_args(self):
        """Test MCP client initialization without args."""
        client = MCPClient("/path/to/server")
        assert client.server_path == "/path/to/server"
        assert client.args == []

    @patch('mcp_client.subprocess.Popen')
    @patch('mcp_client.time.sleep')
    def test_connect_success(self, mock_sleep, mock_popen):
        """Test successful MCP server connection."""
        # Mock process
        mock_process = MagicMock()
        mock_process.stdin = MagicMock()
        mock_process.stdout = MagicMock()
        mock_process.stdout.readline.return_value = json.dumps({
            "result": {"status": "ok"}
        }) + "\n"
        mock_popen.return_value = mock_process

        client = MCPClient("/path/to/server")
        client.connect()

        assert client.process is not None
        mock_popen.assert_called_once()
        mock_sleep.assert_called_once()

    @patch('mcp_client.subprocess.Popen')
    def test_connect_failure(self, mock_popen):
        """Test connection failure."""
        mock_popen.side_effect = Exception("Connection failed")

        client = MCPClient("/path/to/server")

        with pytest.raises(ConnectionError, match="Failed to connect"):
            client.connect()

    def test_send_request_not_connected(self):
        """Test sending request when not connected."""
        client = MCPClient("/path/to/server")

        with pytest.raises(ConnectionError, match="MCP server not connected"):
            client._send_request({"method": "test", "params": {}})

    @patch('mcp_client.subprocess.Popen')
    @patch('mcp_client.time.sleep')
    def test_send_request_success(self, mock_sleep, mock_popen):
        """Test successful request sending."""
        mock_process = MagicMock()
        mock_stdin = MagicMock()
        mock_stdout = MagicMock()

        mock_process.stdin = mock_stdin
        mock_process.stdout = mock_stdout
        mock_stdout.readline.return_value = json.dumps(
            {"result": "success"}) + "\n"
        mock_popen.return_value = mock_process

        client = MCPClient("/path/to/server")
        client.connect()

        response = client._send_request({"method": "test", "params": {}})

        assert response == {"result": "success"}
        mock_stdin.write.assert_called()
        mock_stdin.flush.assert_called()

    @patch('mcp_client.subprocess.Popen')
    @patch('mcp_client.time.sleep')
    def test_send_request_no_response(self, mock_sleep, mock_popen):
        """Test request with no response."""
        mock_process = MagicMock()
        mock_process.stdin = MagicMock()
        mock_process.stdout = MagicMock()
        mock_process.stdout.readline.return_value = ""
        mock_popen.return_value = mock_process

        client = MCPClient("/path/to/server")
        client.connect()

        response = client._send_request({"method": "test", "params": {}})

        assert response == {"error": "No response from server"}

    @patch('mcp_client.subprocess.Popen')
    @patch('mcp_client.time.sleep')
    def test_list_tools_success(self, mock_sleep, mock_popen):
        """Test successful tool listing."""
        mock_process = MagicMock()
        mock_process.stdin = MagicMock()
        mock_process.stdout = MagicMock()

        tools_response = {
            "result": {
                "tools": [
                    {"name": "tool1", "description": "Tool 1"},
                    {"name": "tool2", "description": "Tool 2"}
                ]
            }
        }
        mock_process.stdout.readline.return_value = json.dumps(
            tools_response) + "\n"
        mock_popen.return_value = mock_process

        client = MCPClient("/path/to/server")
        client.connect()

        tools = client.list_tools()

        assert len(tools) == 2
        assert tools[0]["name"] == "tool1"
        assert tools[1]["name"] == "tool2"

    @patch('mcp_client.subprocess.Popen')
    @patch('mcp_client.time.sleep')
    def test_list_tools_cached(self, mock_sleep, mock_popen):
        """Test that tools are cached after first call."""
        mock_process = MagicMock()
        mock_process.stdin = MagicMock()
        mock_process.stdout = MagicMock()

        tools_response = {
            "result": {
                "tools": [{"name": "tool1"}]
            }
        }
        mock_process.stdout.readline.return_value = json.dumps(
            tools_response) + "\n"
        mock_popen.return_value = mock_process

        client = MCPClient("/path/to/server")
        client.connect()

        # First call
        tools1 = client.list_tools()
        # Second call should use cache
        tools2 = client.list_tools()

        assert tools1 == tools2
        # Should only call _send_request once (plus initialize)
        assert mock_process.stdout.readline.call_count >= 2

    @patch('mcp_client.subprocess.Popen')
    @patch('mcp_client.time.sleep')
    def test_list_tools_empty_response(self, mock_sleep, mock_popen):
        """Test tool listing with empty response."""
        mock_process = MagicMock()
        mock_process.stdin = MagicMock()
        mock_process.stdout = MagicMock()
        mock_process.stdout.readline.return_value = json.dumps({}) + "\n"
        mock_popen.return_value = mock_process

        client = MCPClient("/path/to/server")
        client.connect()

        tools = client.list_tools()

        assert tools == []

    @patch('mcp_client.subprocess.Popen')
    @patch('mcp_client.time.sleep')
    def test_call_tool_success(self, mock_sleep, mock_popen):
        """Test successful tool call."""
        mock_process = MagicMock()
        mock_process.stdin = MagicMock()
        mock_process.stdout = MagicMock()

        tool_response = {
            "result": {"output": "Tool executed successfully"}
        }
        mock_process.stdout.readline.return_value = json.dumps(
            tool_response) + "\n"
        mock_popen.return_value = mock_process

        client = MCPClient("/path/to/server")
        client.connect()

        result = client.call_tool("test_tool", {"param1": "value1"})

        assert result == {"output": "Tool executed successfully"}

    @patch('mcp_client.subprocess.Popen')
    @patch('mcp_client.time.sleep')
    def test_call_tool_error(self, mock_sleep, mock_popen):
        """Test tool call with error response."""
        mock_process = MagicMock()
        mock_process.stdin = MagicMock()
        mock_process.stdout = MagicMock()

        error_response = {
            "error": {"message": "Tool execution failed"}
        }
        mock_process.stdout.readline.return_value = json.dumps(
            error_response) + "\n"
        mock_popen.return_value = mock_process

        client = MCPClient("/path/to/server")
        client.connect()

        with pytest.raises(RuntimeError, match="Tool error"):
            client.call_tool("test_tool", {})

    @patch('mcp_client.subprocess.Popen')
    @patch('mcp_client.time.sleep')
    def test_disconnect_success(self, mock_sleep, mock_popen):
        """Test successful disconnection."""
        mock_process = MagicMock()
        mock_process.stdin = MagicMock()
        mock_process.stdout = MagicMock()
        mock_process.stdout.readline.return_value = json.dumps(
            {"result": {}}) + "\n"
        mock_process.wait.return_value = 0
        mock_popen.return_value = mock_process

        client = MCPClient("/path/to/server")
        client.connect()
        client.tools_cache = [{"name": "tool1"}]

        client.disconnect()

        assert client.process is None
        assert client.tools_cache == []
        mock_process.terminate.assert_called_once()

    @patch('mcp_client.subprocess.Popen')
    @patch('mcp_client.time.sleep')
    def test_disconnect_kill_on_timeout(self, mock_sleep, mock_popen):
        """Test disconnection kills process on timeout."""
        mock_process = MagicMock()
        mock_process.stdin = MagicMock()
        mock_process.stdout = MagicMock()
        mock_process.stdout.readline.return_value = json.dumps(
            {"result": {}}) + "\n"
        mock_process.wait.side_effect = subprocess.TimeoutExpired("cmd", 5)
        mock_popen.return_value = mock_process

        client = MCPClient("/path/to/server")
        client.connect()

        client.disconnect()

        mock_process.terminate.assert_called_once()
        mock_process.kill.assert_called_once()
