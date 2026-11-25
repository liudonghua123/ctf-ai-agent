# 测试题集（真实比赛题目风格）

## 1. BUUCTF - RSA1（密码学，源自真实赛题改编）
- category: Crypto
- 描述: 已知 e=65537, n=小 N，c 给定，N 可直接分解
- 验证点: Agent 应识别小 N → 分解 → 解密

## 2. 攻防世界 - base64stem（Misc 入门）
- category: Misc
- 描述: 给出一段 base64 变体字符串
- 验证点: 解码链路

## 3. HCTF - warmup（Web，经典 PHP 源码审计）
- category: Web
- 描述: source.php 源码泄露，in_array 绕过 + include 文件包含
- 验证点: Agent 识别 PHP 审计套路

## 4. 强网杯 - upload（Web 进阶）
- category: Web
- 描述: PHP 反序列化链构造
- 验证点: 反序列化知识
