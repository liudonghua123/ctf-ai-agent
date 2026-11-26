import os
from fastmcp import FastMCP
mcp = FastMCP("env-test")

@mcp.tool
def read_env() -> str:
    """Return the value of CTF_SECRET env var."""
    return os.environ.get("CTF_SECRET", "NOT SET")

if __name__ == "__main__":
    mcp.run()
