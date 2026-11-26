"""Bundled hub skills: installable without network."""

import base64


def _b64(text: str) -> str:
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


PWN_SKILL_YAML = """name: pwn_playbook
description: Pwn 解题手册：栈溢出、格式化字符串、堆利用入门
inject_prompt: |
  ## Pwn 解题手册
  ### 检查保护
  checksec ./chall: NX/Canary/PIE/RELRO
  - 无 NX → shellcode；无 PIE → 固定地址 ROP
  - Canary → 泄露 Canary 或格式化字符串读栈
  ### 栈溢出
  - 先算 offset (cyclic 模式)
  - ret2libc: 泄露 puts@got → 计算 libc base → system("/bin/sh")
  - ROPgadget --binary ./chall 找 gadgets
  ### 格式化字符串
  - %6$p 读栈；%n 写内存；fmtstr_payload 一步到位
tools: []
"""

FOR_SKILL_YAML = """name: forensics_playbook
description: 取证手册：文件恢复、内存取证、流量分析
inject_prompt: |
  ## Forensics 取证手册
  ### 流量分析
  - Wireshark/tshark: http.request, tcp.stream eq N 追踪
  - 导出对象: File → Export Objects → HTTP
  ### 文件恢复
  - binwalk -e 提取嵌入文件；foremost 按头恢复
  -磁盘镜像: photorec、FTK Imager 思路
  ### 内存取证
  - volatility: pslist, cmdline, filescan, dumpfiles
  ### 隐写
  - zsteg (png LSB)、steghide (jpg, 常空密码)、stegsolve
tools: []
"""
