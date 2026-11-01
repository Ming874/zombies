# 寫實殭屍模型(zombie-models)素材署名

寫實殭屍的人物模型來自 **Microsoft Rocketbox Avatar Library**(MIT License):
https://github.com/microsoft/Microsoft-Rocketbox

由建置工具 `tools/zombies/build.mjs` 轉換後放在 `public/models/zombies/<id>.glb`。修改內容:
骨架改為遊戲的 22 根骨骼並擺成靜止姿勢(蒙皮權重重新對應、手指微彎)、貼圖縮小為 1024/512 並烘焙殭屍化外觀
(死人膚色、屍斑、血管紋路、凹陷的眼窩、白濁的眼球、傷口與血跡、汙垢),頂點量化 + meshopt 壓縮、貼圖轉 WebP。

| 遊戲內 id | Rocketbox 角色 | 原始路徑 |
| --- | --- | --- |
| nurse | Medical_Female_01 | https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Professions/Medical_Female_01 |
| doctor | Medical_Male_01 | https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Professions/Medical_Male_01 |
| paramedic | Medical_Male_02 | https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Professions/Medical_Male_02 |
| guard | Security_Male_01 | https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Professions/Security_Male_01 |
| worker | Construction_Male_07 | https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Professions/Construction_Male_07 |
| man | Male_Adult_08 | https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Adults/Male_Adult_08 |
| oldman | Male_Adult_03 | https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Adults/Male_Adult_03 |
| woman | Female_Adult_08 | https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Adults/Female_Adult_08 |
| athlete | Sports_Male_04 | https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Professions/Sports_Male_04 |
| jogger | Sports_Female_02 | https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Professions/Sports_Female_02 |

## 多人模式的倖存者角色

隊友看到的玩家角色同樣來自 Rocketbox,轉換方式相同但保留健康外觀(不做殭屍化,右手握槍、左手托護木的手指姿勢),
放在 `public/models/survivors/<id>.glb`(進入多人房間才下載)。

| 遊戲內 id(座位) | Rocketbox 角色 | 原始路徑 |
| --- | --- | --- |
| soldier(0) | Military_Male_02 | https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Professions/Military_Male_02 |
| medic(1) | Medical_Female_03 | https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Professions/Medical_Female_03 |
| builder(2) | Construction_Male_08 | https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Professions/Construction_Male_08 |
| hoodie(3) | Female_Adult_12 | https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Adults/Female_Adult_12 |
| police(4) | Police_Male_06 | https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Professions/Police_Male_06 |
| hunter(5) | Male_Adult_05 | https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Adults/Male_Adult_05 |
| firefighter(6) | Fire_Male_06 | https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Professions/Fire_Male_06 |
| biker(7) | Female_Adult_04 | https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Adults/Female_Adult_04 |

## 授權全文(Microsoft Rocketbox,LICENSE.md)

```
MIT License

Copyright (c) 2020 Microsoft

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
