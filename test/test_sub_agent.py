"""
Tests for the SubAgent module.
"""

from unittest.mock import Mock, MagicMock, patch
import pytest
from sub_agent import SubAgent
import sys
import os

# Add src to path BEFORE importing
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))


class TestSubAgent:
    """Test cases for SubAgent class."""

    @patch('sub_agent.OpenAI')
    def test_init(self, mock_openai_class, mock_api_key):
        """Test sub-agent initialization."""
        mock_client = MagicMock()
        mock_openai_class.return_value = mock_client
        agent = SubAgent(mock_api_key, "gpt-4o-mini")
        assert agent.model == "gpt-4o-mini"
        assert agent.client is not None
        mock_openai_class.assert_called_once_with(api_key=mock_api_key)

    @patch('sub_agent.OpenAI')
    def test_execute_task_success(self, mock_openai_class, mock_api_key, mock_openai_response):
        """Test successful task execution."""
        mock_client = MagicMock()
        mock_openai_class.return_value = mock_client

        mock_response = mock_openai_response("Task completed successfully")
        mock_client.chat.completions.create.return_value = mock_response

        agent = SubAgent(mock_api_key)
        result = agent.execute_task("Test task")

        assert result["task"] == "Test task"
        assert result["status"] == "completed"
        assert result["result"] == "Task completed successfully"
        mock_client.chat.completions.create.assert_called_once()

    @patch('sub_agent.OpenAI')
    def test_execute_task_api_error(self, mock_openai_class, mock_api_key):
        """Test task execution when API call fails."""
        mock_client = MagicMock()
        mock_openai_class.return_value = mock_client
        mock_client.chat.completions.create.side_effect = Exception(
            "API Error")

        agent = SubAgent(mock_api_key)
        result = agent.execute_task("Test task")

        assert result["task"] == "Test task"
        assert result["status"] == "error"
        assert result["result"] is None
        assert "error" in result
        assert "API Error" in result["error"]

    @patch('sub_agent.OpenAI')
    def test_execute_task_empty_response(self, mock_openai_class, mock_api_key, mock_openai_response):
        """Test task execution with empty response."""
        mock_client = MagicMock()
        mock_openai_class.return_value = mock_client

        mock_response = mock_openai_response("")
        mock_client.chat.completions.create.return_value = mock_response

        agent = SubAgent(mock_api_key)
        result = agent.execute_task("Test task")

        assert result["status"] == "completed"
        assert result["result"] == ""

    @patch('sub_agent.OpenAI')
    def test_execute_task_different_models(self, mock_openai_class, mock_api_key, mock_openai_response):
        """Test sub-agent with different models."""
        mock_client = MagicMock()
        mock_openai_class.return_value = mock_client

        mock_response = mock_openai_response("Result")
        mock_client.chat.completions.create.return_value = mock_response

        # Test with different model
        agent = SubAgent(mock_api_key, "gpt-4")
        result = agent.execute_task("Test task")

        assert result["status"] == "completed"
        # Verify the model was used in the API call
        call_args = mock_client.chat.completions.create.call_args
        assert call_args[1]["model"] == "gpt-4"
