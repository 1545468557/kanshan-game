#!/bin/zsh
# 《蓝血》启动游戏 —— 双击这个文件，它会开一个本地服务并自动打开浏览器。
# 这个窗口要一直开着；关掉窗口（或在窗口里按 Control + C）就是停止游戏。

cd "$(dirname "$0")" || exit 1
clear

# 万一这个终端窗口的 PATH 里没有 node，再翻几个常见位置找一找
if ! command -v npm >/dev/null 2>&1; then
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
  for candidate in "$HOME"/.workbuddy/binaries/node/versions/*/bin(N) "$HOME"/.nvm/versions/node/*/bin(N); do
    [ -x "$candidate/npm" ] && export PATH="$candidate:$PATH"
  done
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "  ⚠️ 找不到 npm，请先装 Node.js：https://nodejs.org（选 LTS 版本）"
  echo
  echo "  按任意键关闭这个窗口。"
  read -k 1
  exit 1
fi

echo
echo "  正在启动《蓝血》…… 起来之后浏览器会自动打开。"
echo

# 先清掉可能还占着 4180 的旧进程。
# 为什么必须做：server.mjs 和 lib/ 是 Node 程序代码，启动时加载一次，
# **改完必须重启才会生效**。
# 踩过的坑：改了 lib/http-util.mjs 里的文件类型表却没重启，旧进程继续把
# .mp3/.mp4 回成 application/octet-stream，浏览器就不肯把这些文件交给
# <audio>/<video> —— 表现为「没有背景音乐、也没有开场动画」。
# 更隐蔽的是：这时 npm start 会因为端口被占而启动失败，但健康检查会被
# **旧进程**应答成功，脚本照样打印「已打开」，用户完全看不出问题。
stale=($(lsof -nP -tiTCP:4180 -sTCP:LISTEN 2>/dev/null))
if [ ${#stale[@]} -gt 0 ]; then
  echo "  ⚠️ 4180 上还跑着一个旧的《蓝血》服务（进程 ${stale[@]}），先关掉再启动新的。"
  kill ${stale[@]} 2>/dev/null
  for _ in {1..8}; do
    lsof -nP -tiTCP:4180 -sTCP:LISTEN >/dev/null 2>&1 || break
    sleep 0.25
  done
  left=($(lsof -nP -tiTCP:4180 -sTCP:LISTEN 2>/dev/null))
  if [ ${#left[@]} -gt 0 ]; then
    kill -9 ${left[@]} 2>/dev/null
    sleep 0.5
  fi
  echo
fi

# -f：让 404/500 也算失败。不加 -f 的话，任何还在应答的服务都会被当成「起来了」。
# --noproxy '*'：这台机器设了 HTTP_PROXY，不绕开的话本地请求会被转发出去，
# 可能落到完全无关的进程上。
npm start &
server_pid=$!

# 等它真正可以访问了再开浏览器，避免打开一个「连不上」的页面
ready=0
for _ in {1..80}; do
  if curl -s -f --noproxy '*' -o /dev/null --max-time 1 http://127.0.0.1:4180/api/health; then
    ready=1
    break
  fi
  sleep 0.25
done

if [ "$ready" -eq 1 ]; then
  # 顺手自检一次音视频：这三个文件必须以正确的类型返回，否则浏览器不会播放它们。
  # 把结论直接打在窗口里，下次就不用从「怎么没有音乐」倒着查回来了。
  echo "  音视频自检（类型不对就会没声音 / 没画面）："
  media_bad=0
  for pair in "assets/bgm-piano.mp3:audio/mpeg" "assets/ui-soft-chime.mp3:audio/mpeg" "assets/cg1-opening.mp4:video/mp4"; do
    mpath="${pair%%:*}"; mwant="${pair##*:}"
    mgot=$(curl -s --noproxy '*' --max-time 3 -o /dev/null -w '%{content_type}' "http://127.0.0.1:4180/$mpath" 2>/dev/null)
    if [[ "$mgot" == "$mwant" ]]; then
      echo "    ✓ $mpath → $mgot"
    else
      echo "    ✗ $mpath → ${mgot:-（没拿到）}，应为 $mwant"
      media_bad=1
    fi
  done
  if [ "$media_bad" -eq 1 ]; then
    echo "    （类型不对时浏览器会拒绝播放，请把上面这几行发我）"
  fi
  echo

  # 打开的是**游戏首页**（开场菜单），和线上链接打开的是同一页。
  # 这里以前写的是 /room.html，于是双击启动会直接跳过首页蹦进第一关 ——
  # 本地看到的第一屏和线上评委看到的第一屏必须是同一页，否则两边没法对着排查。
  open "http://127.0.0.1:4180/"
  echo
  echo "  ============================================================"
  echo "  游戏首页已在浏览器里打开：http://127.0.0.1:4180/"
  echo "  直接进第一幕（想跳过开场菜单）：http://127.0.0.1:4180/room.html"
  echo "  玩家记录（改动后的密码在 .env.local 里）：http://127.0.0.1:4180/admin"
  echo
  echo "  想停止：在这个窗口按 Control + C，或者直接关掉这个窗口。"
  echo "  ============================================================"
  echo
else
  echo
  echo "  ⚠️ 等了 20 秒服务还没起来。请把上面的报错截图发我。"
  echo
fi

# 让服务一直跑着，日志会继续打在这个窗口里
wait $server_pid
