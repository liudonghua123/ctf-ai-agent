"""Evaluation harness: generates solvable challenges, runs the agent, checks flags.

Round-based: python eval/run_eval.py [round]
"""
import asyncio
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.agents.engine import AgentRunner, load_agent_config  # noqa: E402
from app.kb.store import KnowledgeBase  # noqa: E402
from app.skills.loader import SkillLoader  # noqa: E402
from app.mcp_client.manager import MCPManager  # noqa: E402
from app.tools.registry import CHALLENGE_FILES_DIR  # noqa: E402

from Crypto.Util.number import bytes_to_long  # noqa: E402
import base64  # noqa: E402
import codecs  # noqa: E402


# ---------------------------------------------------------------- challenges
def gen_crypto_small_e():
    """Small-e RSA: c = m^3 without modulus reduction (Hastad style)."""
    flag = "flag{small_e_1s_d4ng3r}"
    m = bytes_to_long(flag.encode())
    c = m ** 3
    return {
        "title": "baby_rsa",
        "category": "Crypto",
        "description": (
            "We intercepted a ciphertext. e = 3. "
            f"c = {c}\n"
            "The plaintext is the flag itself (ASCII). flag format: flag{...}"
        ),
    }, flag


def gen_misc_encoding():
    """Layered encoding: flag -> rot13 -> base64 -> hex."""
    flag = "flag{enc0d1ng_ch41n}"
    layer1 = codecs.decode(flag, "rot13")
    layer2 = base64.b64encode(layer1.encode()).decode()
    layer3 = layer2.encode().hex()
    return {
        "title": "encoding_chain",
        "category": "Misc",
        "description": (
            "My friend hid a flag behind several layers of classical encoding:\n"
            f"{layer3}\n"
            "Recover it. flag format: flag{{...}}"
        ),
    }, flag


def gen_web_warmup():
    """Local vulnerable web app (攻防世界 warmup style): whitelist bypass."""
    flag = "flag{web_w4rmup_byp4ss}"
    return {
        "title": "warmup_local",
        "category": "Web",
        "description": (
            "A local vulnerable service is running at http://127.0.0.1:8901 . "
            "It serves source.php which whitelists files via in_array before "
            "including them. Read flag.php to get the flag. "
            "flag format: flag{...}"
        ),
    }, flag


CHALLENGES = {
    "crypto_small_e": gen_crypto_small_e,
    "misc_encoding": gen_misc_encoding,
    "web_warmup": gen_web_warmup,
}


# ---------------------------------------------------------------- web server
VULN_APP = r'''
from fastapi import FastAPI, Query
from fastapi.responses import PlainTextResponse
import urllib.parse

app = FastAPI()

FLAG = open(r"{flagfile}", encoding="utf-8").read().strip()

WHITELIST = ["source.php", "index.php"]

@app.get("/source.php", response_class=PlainTextResponse)
def source():
    return """
<?php
    highlight_file(__FILE__);
    class Emmm
    {{
        public function checkFile(&$page)
        {{
            $whitelist = ["source.php"=>"source.php", "flag.php"=>"flag.php"];
            if (! isset($page) || !is_string($page)) return false;
            if (in_array($page, $whitelist)) return true;   // <-- direct hit only
            $_page = urldecode($page);                       // <-- double-decode hint
            if (in_array($_page, $whitelist)) return true;
            return false;
        }}
    }}
    // include($_REQUEST[\"file\"]) happens after checkFile passes
"""
@app.get("/index.php", response_class=PlainTextResponse)
def index(file: str = Query("")):
    if file in WHITELIST:
        return "you read: " + file
    decoded = urllib.parse.unquote(file)
    if decoded in WHITELIST:
        return "you read: " + decoded
    return "file not allowed"

@app.get("/flag.php", response_class=PlainTextResponse)
def flagphp():
    # direct access blocked: emulate require-login
    return "ACCESS DENIED: not allowed directly"
'''.replace("{flagfile}", str(Path(__file__).parent / "flag_web.txt"))


# ---------------------------------------------------------------- runner
async def run_one(name, gen_fn, agent, workflow, hint=None, port_server=False):
    chal, expected = gen_fn()
    print(f"\n{'='*60}\n[EVAL] {name}  agent={agent} workflow={workflow}")
    t0 = time.time()
    cfg = load_agent_config(agent)
    runner = AgentRunner(cfg, KnowledgeBase(), SkillLoader(), MCPManager.instance())
    final = None
    tool_calls = 0
    steps = 0
    async for ev in runner.run(workflow, chal, hint):
        if ev["type"] == "tool_call":
            tool_calls += 1
            print(f"  [step{ev['step']}] tool={ev['tool']} args={json.dumps(ev['args'], ensure_ascii=False)[:120]}")
        elif ev["type"] == "final":
            final = ev
        elif ev["type"] == "step":
            steps = ev["step"]
    elapsed = time.time() - t0
    got = (final or {}).get("flag")
    ok = bool(got) and expected.lower() in got.lower()
    print(f"  expected={expected}\n  got={got}\n  steps={steps} tools={tool_calls} "
          f"elapsed={elapsed:.0f}s -> {'PASS' if ok else 'FAIL'}")
    return {"name": name, "ok": ok, "expected": expected, "got": got,
            "steps": steps, "tools": tool_calls, "elapsed": round(elapsed)}


async def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    # stage challenge files (for file tools)
    (CHALLENGE_FILES_DIR / "misc_encoding.txt").write_text(
        CHALLENGES["misc_encoding"]()[0]["description"], encoding="utf-8")

    results = []
    if which in ("all", "crypto"):
        results.append(await run_one("crypto_small_e", CHALLENGES["crypto_small_e"],
                                     "crypto", "solve"))
    if which in ("all", "misc"):
        results.append(await run_one("misc_encoding", CHALLENGES["misc_encoding"],
                                     "general", "solve"))
    if which in ("all", "web"):
        # start vulnerable app
        app_path = Path(__file__).parent / "vuln_app.py"
        app_path.write_text(VULN_APP, encoding="utf-8")
        (Path(__file__).parent / "flag_web.txt").write_text(
            CHALLENGES["web_warmup"]()[1], encoding="utf-8")
        proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "vuln_app:app", "--port", "8901"],
            cwd=str(Path(__file__).parent),
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        await asyncio.sleep(4)
        try:
            results.append(await run_one("web_warmup", CHALLENGES["web_warmup"],
                                         "web", "solve"))
        finally:
            proc.terminate()

    print("\n" + "=" * 60)
    print("SUMMARY")
    for r in results:
        print(f"  {'PASS' if r['ok'] else 'FAIL'}  {r['name']}  "
              f"steps={r['steps']} tools={r['tools']} {r['elapsed']}s")

    out = Path(__file__).parent / f"results_{which}.json"
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    asyncio.run(main())
