from fastmcp import FastMCP
mcp = FastMCP("ctf-tools")
@mcp.tool
def caesar_shift(text: str, shift: int) -> str:
    """Shift letters by shift (classical cipher helper)."""
    out = []
    for ch in text:
        if ch.isalpha():
            base = 65 if ch.isupper() else 97
            out.append(chr((ord(ch) - base + shift) % 26 + base))
        else:
            out.append(ch)
    return "".join(out)
if __name__ == "__main__":
    mcp.run()
