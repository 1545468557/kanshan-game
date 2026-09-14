'use strict';
// 手上设备（手机 / 平板，尤其微信内置浏览器）：**这个站上的视频一律不许自己播。**
//
// 为什么专门做成一个文件（2026-09-14 用户报障后加的）：
// 用户在微信里点「用知乎账号登录」，看到的不是知乎授权页，而是一个 **5 秒的视频播放器**
// （带倍速、全屏），整页被盖住 —— 微信/安卓的浏览器内核会把页面里的 <video> 接管成自己的
// 播放器（X5 的「视频全屏化」）。首页那段背景循环视频正好 5 秒，就是它。
// 触发它的那根线在 menu.js 里：因为手机常拦自动播放，所以写了一句
// 「用户第一次点屏幕/按键时再补一次 play()」—— 于是**任意一次触屏**（包括点登录按钮）
// 都可能在微信里把视频叫起来，把登录门盖掉。
//
// 定下的规矩（桌面行为完全不变）：
//   首页背景视频 —— 手机上**根本不加载**（这 1 MB 省掉；画面交给 .world-drift 那层纯 CSS 推镜，
//                  它是同一张图，手机上几乎看不出区别）；
//   房间序幕视频 —— 手机上**不自动播**，改成「点一下再播」，而且因为有了真实手势，
//                  直接给**带声音**的版本（比静音自动播更好）。
//
// 判定只写在这一处：它要同时被首页（menu.js）和房间（room.html 的内联脚本）用到，
// 两份拷贝迟早会不一致。
(function () {
  function handheld() {
    const ua = String((navigator && navigator.userAgent) || '');
    if (/android|iphone|ipad|ipod|mobile|harmonyos|micromessenger|wechat/i.test(ua)) return true;
    // UA 认不出来时看环境：窄屏 + 粗指针（手指）。触屏笔记本也会落进来，那正好 —— 它也不缺这点效果。
    try {
      return matchMedia('(max-width: 900px)').matches && matchMedia('(pointer: coarse)').matches;
    } catch {
      return false;
    }
  }

  const value = handheld();
  window.isHandheld = function isHandheld() {
    return value;
  };
  // 顺手写在 <html> 上：CSS 与验收脚本可以直接读，不用再算一次。
  try {
    document.documentElement.dataset.handheld = value ? '1' : '0';
  } catch {
    /* 忽略 */
  }
})();
