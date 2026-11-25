"""Skill tool example: an advanced decoder that goes beyond decode_helper."""
import base64
import re
import urllib.parse


B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def try_b58(s: str) -> str | None:
    try:
        n = 0
        for c in s:
            n = n * 58 + B58_ALPHABET.index(c)
        raw = n.to_bytes((n.bit_length() + 7) // 8, "big")
        return raw.decode("utf-8", "replace")
    except Exception:
        return None


def run(args: dict, challenge: dict) -> dict:
    """Smart decode: tries base64/58/32, hex, url, and reports flag candidates."""
    s = (args.get("data") or "").strip()
    results: dict = {}
    import base64 as b64
    for name, fn in [
        ("base64", lambda x: b64.b64decode(x + "=" * (-len(x) % 4), validate=False)),
        ("base32", lambda x: b64.b32decode(x + "=" * (-len(x) % 8))),
        ("base58", lambda x: (try_b58(x) or _raise()).encode()),
    ]:
        try:
            raw = fn(s)
            results[name] = raw.decode("utf-8", "replace")[:500]
        except Exception:
            pass
    try:
        results["url"] = urllib.parse.unquote(s)[:500]
    except Exception:
        pass
    flags = re.findall(r"(?:flag|ctf|NSSCTF|DASCTF|ISCC)\{[^}]{1,80}\}", s, re.I)
    for v in results.values():
        flags += re.findall(r"(?:flag|ctf)\{[^}]{1,80}\}", str(v), re.I)
    results["flag_candidates"] = list(set(flags))
    return results


def _raise():
    raise ValueError
