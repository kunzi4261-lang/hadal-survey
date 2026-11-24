# 深蓝回声的美术与参考

游戏里看见的九个调查点、海床、鱼群、热液羽流和漂浮粒子都由本仓库的代码在浏览器中绘制。每片海域的海床高度同时驱动实时视图、驾驶深度和等深线图。仓库首页的驾驶舱截图来自运行中的游戏。[场景实现](../src/render/) · [海床函数](../src/core/world.mjs) · [实机截图](flight.webp)

任务甲板的潜水器封面单独使用 OpenAI ImageGen 生成，随后压缩为 WebP。下面保留了生成时使用的原文。[封面原图的 WebP 版本](../assets/descent.webp)

> Use case: stylized-concept. Wide cinematic 16:9 art-directed cover for an original premium underwater expedition game, no text or marks. Vast submerged basalt canyon at night, a single intensely detailed small orange-and-ivory industrial science ROV in the right upper-middle quadrant (right 65-80% of image), boxy cage, twin forward searchlights projecting cones diagonally down-left into the blue haze, curled tether rising out of frame, sparse points of suspended marine snow. A dramatic immense irregular black rock wall on the far right, receding middle-distance jagged silhouettes and a tiny coral-lit patch at the bottom. Deep petroleum blue with cyan shafts of light and a warm amber accent on the machine, atmospheric perspective and believable scale, photographic prestige sci-fi film still, tactile surfaces. Left 40% darker, subdued and visually quiet for white game title overlay; wide framing with whole ROV in frame, panoramic negative space. The image itself contains no typography, no UI, no border, no humans, no logo.

在构思玩家怎样进入一个可探索的 3D 世界时，参考了 Bruno Simon 的互动作品集。科考流程的灵感来自 NOAA Ocean Exploration 对 ROV 及其船上操作的介绍。游戏的海区、坐标、角色、设备参数与遗失信标故事均为虚构创作。[Bruno Simon](https://bruno-simon.com/) · [NOAA Ocean Exploration](https://oceanexplorer.noaa.gov/technology/subs-rovs/)
