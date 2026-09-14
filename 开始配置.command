#!/bin/zsh
# 《蓝血》配置向导 —— 双击这个文件就会自动跑起来，不用自己敲命令。
# 它只做一件事：帮你把大模型的密钥写进本机的配置文件，然后当场试一句。

cd "$(dirname "$0")" || exit 1
clear

echo
echo "  《蓝血》· 配置向导"
echo "  ============================================================"
echo
echo "  接下来它会问你几个问题，照着回答就行。"
echo "  粘贴密钥的时候屏幕上只会出现圆点 —— 那是特意的，不是没粘上。"
echo

# 万一这个终端窗口的 PATH 里没有 node，再翻几个常见位置找一找
if ! command -v npm >/dev/null 2>&1; then
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
  for candidate in "$HOME"/.workbuddy/binaries/node/versions/*/bin(N) "$HOME"/.nvm/versions/node/*/bin(N); do
    [ -x "$candidate/npm" ] && export PATH="$candidate:$PATH"
  done
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "  ⚠️ 找不到 npm，说明这台电脑还没装 Node.js。"
  echo
  echo "  请到  https://nodejs.org  下载左边那个写着「LTS」的版本，"
  echo "  双击安装包一路「继续」装完，然后重新双击本文件。"
  echo
  echo "  按任意键关闭这个窗口。"
  read -k 1
  exit 1
fi

npm run setup
status=$?

echo
echo "  ============================================================"
if [ "$status" -eq 0 ]; then
  echo "  ✅ 配置好了。接下来双击「开始游戏.command」就能进游戏。"
else
  echo "  ⚠️ 这次没配好（退出码 $status）。"
  echo "  把上面这些文字截图发我，我看一眼就知道卡在哪儿。"
fi
echo
echo "  按任意键关闭这个窗口。"
read -k 1
