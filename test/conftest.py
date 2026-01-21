"""
Shared pytest fixtures for testing the agent system.
"""

import pytest
from unittest.mock import Mock, MagicMock
import json


@pytest.fixture
def mock_api_key():
    """Mock API key for testing."""
    return "test-api-key-12345"


@pytest.fixture
def mock_openai_response():
    """Create a mock OpenAI response object."""
    def _create_response(content: str, model: str = "gpt-4o-mini"):
        mock_choice = Mock()
        mock_choice.message.content = content

        mock_response = Mock()
        mock_response.choices = [mock_choice]

        return mock_response
    return _create_response


@pytest.fixture
def mock_openai_client(mock_openai_response):
    """Create a mock OpenAI client."""
    client = MagicMock()

    def create_completion(*args, **kwargs):
        # Default response - can be overridden in tests
        return mock_openai_response('{"result": "default"}')

    client.chat.completions.create = MagicMock(side_effect=create_completion)
    return client


@pytest.fixture
def sample_plan():
    """Sample plan structure for testing."""
    return {
        "goal": "Test task",
        "steps": [
            {
                "step_number": 1,
                "type": "direct",
                "action": "test_action",
                "description": "Test step"
            }
        ]
    }


@pytest.fixture
def sample_tools():
    """Sample MCP tools for testing."""
    return [
        {
            "name": "test_tool",
            "description": "A test tool",
            "mcp_server": "test_server"
        },
        {
            "name": "another_tool",
            "description": "Another test tool",
            "mcp_server": "test_server"
        }
    ]
