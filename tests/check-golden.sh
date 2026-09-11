#!/usr/bin/env bash
# 重新生成 golden 语料并与 baseline 逐字节比对。
# 每完成一个改造步骤就跑一次，确认输出没有意外变化。
#
# 用法:
#   bash tests/check-golden.sh            比对；有差异则退出码 1
#   bash tests/check-golden.sh --update   把当前输出固化为新 baseline
#                                         （仅用于【已解释的】预期变更）
set -e
cd "$(dirname "$0")/.."

npx esbuild tests/golden.ts --bundle --platform=node --format=cjs \
    --outfile=tests/golden.cjs --log-level=warning

node tests/golden.cjs > tests/golden.current.json
COUNT=$(node -p "require('./tests/golden.current.json').cases.length")

if [ "$1" = "--update" ]; then
  cp tests/golden.current.json tests/golden.baseline.json
  echo "✅ baseline 已更新（$COUNT 个用例）"
  echo "   请在提交信息里说明【哪些用例变了、为什么变】。"
  exit 0
fi

if diff -q tests/golden.baseline.json tests/golden.current.json >/dev/null; then
  echo "✅ golden 逐字节一致（$COUNT 个用例）"
else
  echo "❌ golden 有差异："
  echo ""
  diff tests/golden.baseline.json tests/golden.current.json | head -60
  echo ""
  echo "若差异是【预期的 bug 修复】，运行 bash tests/check-golden.sh --update"
  echo "重建 baseline，并在提交信息里说明哪些用例变了、为什么变。"
  exit 1
fi
