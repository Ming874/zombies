// 殭屍爬上道具(physics):玩家站在床、桌子、花台、木箱、矮牆上(腳下地面比腳底低)時,
// 走到旁邊被擋住就爬上去(沿用 zombie.js 的 'climb' 翻越動作與位移,落點在道具頂上);
// 跟玩家站在同一個檯面上時直接走過去(導航圖只有地面節點,沿導航場會走下檯面)。爬行者不爬(從下面打腳)。
// 每幀只有「玩家站在道具上、而且很近」時才做一次盒子掃描。
const OUT = { x: 0, z: 0, top: 0 };
const CLIMB_H = 1.45; // 比玩家攀上去的上限(1.42)高一點:玩家上得去的,殭屍也上得去

export function climbStep(z, world, p, hd, dy, w, ZR) {
  const v0 = z.vault;
  if (v0 && v0.onto != null && z.state !== 'climb') { z.pos.x = v0.x1; z.pos.z = v0.z1; z.pos.y = v0.onto; v0.onto = null; } // 狂奔者的 think 先結束了翻越:落到頂上
  if (!p || !p.pos || z.state !== 'chase' || z.type === 'crawler' || !world.climbOnto) return;
  const elevated = p.onGround && p.ground === p.ground && p.ground != null && p.pos.y - p.ground > 0.25; // 站在道具頂上
  if (!elevated || hd > 3) return;
  const dx = (p.pos.x - z.pos.x) / hd, dz = (p.pos.z - z.pos.z) / hd;
  if (dy > -0.3 && dy < 0.3) { if (z.los) { w.x = dx; w.z = dz; } return; } // 同一個檯面上:直接走過去
  if (dy < 0.3 || dy > CLIMB_H + 0.05 || (!z.blocked && hd > 1.3)) return;
  if (!world.climbOnto(z.pos.x, z.pos.y, z.pos.z, dx, dz, Math.min(z.T.radius, ZR), CLIMB_H, OUT)) return;
  const v = z.vault || (z.vault = { x0: 0, z0: 0, x1: 0, z1: 0, h: 0, onto: null });
  v.x0 = z.pos.x; v.z0 = z.pos.z; v.x1 = OUT.x; v.z1 = OUT.z; v.h = OUT.top - z.pos.y; v.onto = OUT.top;
  z.go('climb');
}
