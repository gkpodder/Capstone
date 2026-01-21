"""
Example usage of the general-purpose agent.
"""

from agent import Agent


def main():
    """Example demonstrating agent usage."""

    # Initialize the agent
    print("Initializing agent...")
    agent = Agent()

    # Example 1: Simple task without MCP
    print("\n" + "="*60)
    print("Example 1: Simple planning task")
    print("="*60)
    results1 = agent.run(
        "Create a plan for organizing a small coding project with 3 files: "
        "main.py, utils.py, and config.py"
    )
    print(f"\nSuccess: {results1['success']}")

    # Example 2: Task that might need sub-agents
    print("\n" + "="*60)
    print("Example 2: Complex task with sub-agents")
    print("="*60)
    results2 = agent.run(
        "Help me understand what steps I need to take to set up a Python "
        "development environment, then explain the benefits of using virtual environments"
    )
    print(f"\nSuccess: {results2['success']}")

    # Example 3: Task that could use MCP (if connected)
    # Uncomment and configure if you have an MCP server:
    # agent.connect_mcp("example", "/path/to/mcp-server", ["node"])
    # results3 = agent.run("Use available tools to complete a task")

    # Clean up
    agent.cleanup()
    print("\n✓ Examples completed!")


if __name__ == "__main__":
    main()
