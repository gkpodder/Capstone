"""
Tests for the MCPClient module.
"""

import subprocess
import json
from unittest.mock import Mock, MagicMock, patch
import pytest
from mcp_client import MCPClient
import sys
import os

# Add src to path BEFORE importing
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

    @patch('time.sleep')
    @patch('mcp_client.subprocess.Popen')
    def test_connect_success(self, mock_popen, mock_sleep):
        """Test successful MCP server connection."""
        # Mock process
        mock_process = MagicMock()
        mock_stdin = MagicMock()
        mock_stdout = MagicMock()
        mock_process.stdin = mock_stdin
        mock_process.stdout = mock_stdout
        # First call is for initialize, second for any subsequent calls
        mock_stdout.readline.side_effect = [
            json.dumps({"result": {"status": "ok"}}) + "\n",
            json.dumps({"result": {"status": "ok"}}) + "\n"
        ]
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
