"""
MCP (Model Context Protocol) client for connecting to MCP servers.
"""

import json
import subprocess
import sys
from typing import List, Dict, Any, Optional


class MCPClient:
    """Client for connecting to and interacting with MCP servers."""
    
    def __init__(self, server_path: str, args: List[str] = None):
        """
        Initialize MCP client.
        
        Args:
            server_path: Path to the MCP server executable/script
            args: Additional arguments for the server
        """
        self.server_path = server_path
        self.args = args or []
        self.process: Optional[subprocess.Popen] = None
        self.tools_cache: List[Dict[str, Any]] = []
        
    def connect(self):
        """Start the MCP server process."""
        try:
            cmd = [self.server_path] + self.args
            self.process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1
            )
            # Give it a moment to start
            import time
            time.sleep(0.5)
            
            # Try to initialize connection (simple handshake)
            self._send_request({"method": "initialize", "params": {}})
            
        except Exception as e:
            raise ConnectionError(f"Failed to connect to MCP server: {e}")
    
    def _send_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """
        Send a request to the MCP server.
        
        Args:
            request: Request dictionary
            
        Returns:
            Response dictionary
        """
        if not self.process:
            raise ConnectionError("MCP server not connected")
        
        try:
            # Send request as JSON-RPC
            request_json = json.dumps(request) + "\n"
            self.process.stdin.write(request_json)
            self.process.stdin.flush()
            
            # Read response (simple line-based JSON)
            response_line = self.process.stdout.readline()
            if response_line:
                return json.loads(response_line.strip())
            else:
                return {"error": "No response from server"}
                
        except Exception as e:
            raise RuntimeError(f"Error communicating with MCP server: {e}")
    
    def list_tools(self) -> List[Dict[str, Any]]:
        """
        List available tools from the MCP server.
        
        Returns:
            List of tool definitions
        """
        if self.tools_cache:
            return self.tools_cache
        
        try:
            # Try standard MCP tool listing
            response = self._send_request({
                "method": "tools/list",
                "params": {}
            })
            
            if "result" in response and "tools" in response["result"]:
                self.tools_cache = response["result"]["tools"]
                return self.tools_cache
            else:
                # Fallback: return empty list
                return []
                
        except Exception as e:
            print(f"Warning: Could not list tools: {e}")
            return []
    
    def call_tool(self, tool_name: str, parameters: Dict[str, Any]) -> Any:
        """
        Call a tool on the MCP server.
        
        Args:
            tool_name: Name of the tool to call
            parameters: Tool parameters
            
        Returns:
            Tool execution result
        """
        try:
            response = self._send_request({
                "method": "tools/call",
                "params": {
                    "name": tool_name,
                    "arguments": parameters
                }
            })
            
            if "result" in response:
                return response["result"]
            elif "error" in response:
                raise RuntimeError(f"Tool error: {response['error']}")
            else:
                return response
                
        except Exception as e:
            raise RuntimeError(f"Error calling tool {tool_name}: {e}")
    
    def disconnect(self):
        """Disconnect from the MCP server."""
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=5)
            except:
                self.process.kill()
            finally:
                self.process = None
                self.tools_cache = []
