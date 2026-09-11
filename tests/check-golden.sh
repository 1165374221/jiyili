#!/usr/bin/env bash
# 重新生成 golden 语料并与 baseline 逐字节比对。
# 每完成一个改造步骤就跑一次，确认输出没有意外变化。
#
# 用法: bash tests/check-golden.sh
#
# 退出码 0 = 逐字节一致；1 = 有差异（会打印前 60 行 diff）
set -e
cd "$(dirname "$0")/.."

npx esbuild tests/golden.ts --bundle --platform=node --format=cjs \
    --outfile=tests/golden.cjs --log-level=warning

node tests/golden.cjs > tests/golden.current.json

if diff -q tests/golden.baseline.json tests/golden.current.json >/dev/null; then
  echo "✅ golden 逐字节一致（$(node -p "require('./tests/golden.current.json').cases.length") 个用例）"
else
  echo "❌ golden 有差异："
  echo ""
  diff tests/golden.baseline.json tests/golden.current.json | head -60
  echo ""
  echo "若差异是【预期的 bug 修复】，请用 --update 重建 baseline 并在提交信息里说明。"
  exit 1
fi
