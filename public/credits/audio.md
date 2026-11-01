# 音效與配樂署名(audio)

音效系統(`src/audio/**`)以 WebAudio 即時合成為骨幹,並疊加下列錄音素材(放在 `public/audio/`)。
所有素材皆為 **CC0** 或 **CC BY 3.0 / 3.0 TW / 4.0** 授權(另有一件 **CC BY-SA 4.0**,見文末「真人錄音」),並經過剪輯(裁切、單聲道/立體聲轉換、響度/峰值正規化、淡入淡出、循環交叉淡化、MP3 編碼)。
錄音載入失敗或缺檔時,遊戲會自動改用程式合成的版本。

## 需要署名(Creative Commons Attribution)— 33 件作品、36 個檔案

- "Wind at door howling 4.wav" by Bosk1 (https://freesound.org/people/Bosk1/sounds/217186/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited: trimmed, normalized, converted to MP3.
  - 來源:https://freesound.org/people/Bosk1/sounds/217186/
  - 使用於:`audio/world/wind_howl_loop.mp3`
- "metal_scrape01.wav" by Claire.H (https://freesound.org/people/Claire.H/sounds/182350/), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Edited: trimmed, normalized, converted to MP3.
  - 來源:https://freesound.org/people/Claire.H/sounds/182350/
  - 使用於:`audio/world/metal_scrape_2.mp3`
- "crying.wav" by drotzruhn (https://freesound.org/people/drotzruhn/sounds/405204/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited: trimmed, normalized, converted to MP3.
  - 來源:https://freesound.org/people/drotzruhn/sounds/405204/
  - 使用於:`audio/world/woman_crying_2.mp3`
- "zombies.wav" by Erdie (https://freesound.org/people/Erdie/sounds/165615/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited: trimmed, normalized, converted to MP3.
  - 來源:https://freesound.org/people/Erdie/sounds/165615/
  - 使用於:`audio/zombies/horde_distant_loop.mp3`
- "Zombie Roar" by gneube (https://freesound.org/people/gneube/sounds/315846/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited: trimmed, normalized, converted to MP3.
  - 來源:https://freesound.org/people/gneube/sounds/315846/
  - 使用於:`audio/zombies/attack_roar.mp3`
- "Zombie Growling" by gneube (https://freesound.org/people/gneube/sounds/315847/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited: trimmed, normalized, converted to MP3.
  - 來源:https://freesound.org/people/gneube/sounds/315847/
  - 使用於:`audio/zombies/walker_groan_5.mp3`
- "RustyMusicbox.wav" by HerbertBoland (https://freesound.org/people/HerbertBoland/sounds/33210/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited: trimmed, normalized, converted to MP3.
  - 來源:https://freesound.org/people/HerbertBoland/sounds/33210/
  - 使用於:`audio/world/music_box_rusty_slow.mp3`
- "Final_Boss_Lair" by Hitctrl (https://opengameart.org/content/finalbosslair), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Edited: trimmed, normalized, converted to MP3.
  - 來源:https://opengameart.org/content/finalbosslair
  - 使用於:`audio/music/boss_loop_2.mp3`
- "Buzzing Faulty and Sparking Fluorescent Light" by iainmccurdy (https://freesound.org/people/iainmccurdy/sounds/737060/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited: trimmed, normalized, converted to MP3.
  - 來源:https://freesound.org/people/iainmccurdy/sounds/737060/
  - 使用於:`audio/world/fluorescent_buzz_faulty_loop.mp3`
- "Dark Ambience Loop" by Iwan Gabovitch qubodup.net (https://opengameart.org/content/dark-ambience-loop), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Edited: trimmed, normalized, converted to MP3.
  - 來源:https://opengameart.org/content/dark-ambience-loop
  - 使用於:`audio/music/ambient_bed_dark_loop.mp3`
- "Black Vortex" Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 License — http://creativecommons.org/licenses/by/4.0/
  - 來源:https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1300037
  - 使用於:`audio/music/boss_loop_1.mp3`
- "Ossuary 5 - Rest" Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 License — http://creativecommons.org/licenses/by/4.0/
  - 來源:https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1500047
  - 使用於:`audio/music/break_calm_loop.mp3`
- "Controlled Chaos" Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 License — http://creativecommons.org/licenses/by/4.0/
  - 來源:https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1200059
  - 使用於:`audio/music/combat_loop_1.mp3`
- "Enter the Maze" Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 License — http://creativecommons.org/licenses/by/4.0/
  - 來源:https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100782
  - 使用於:`audio/music/combat_loop_2.mp3`
- "Bent and Broken" Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 License — http://creativecommons.org/licenses/by/4.0/
  - 來源:https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1200087
  - 使用於:`audio/music/explore_loop_1.mp3`
- "Penumbra" Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 License — http://creativecommons.org/licenses/by/4.0/
  - 來源:https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1200105
  - 使用於:`audio/music/explore_loop_2.mp3`
- "Darkness Speaks" Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 License — http://creativecommons.org/licenses/by/4.0/
  - 來源:https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100364
  - 使用於:`audio/music/game_over_sting.mp3`
- "Darkest Child" Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 License — http://creativecommons.org/licenses/by/4.0/
  - 來源:https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100783
  - 使用於:`audio/music/menu_theme_loop.mp3`
- "Constance" Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 License — http://creativecommons.org/licenses/by/4.0/
  - 來源:https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100850
  - 使用於:`audio/music/tension_loop.mp3`
- "Eyes Gone Wrong" Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 License — http://creativecommons.org/licenses/by/4.0/
  - 來源:https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100362
  - 使用於:`audio/music/wave_start_sting.mp3`
- "Cash Register" by kiddpark (https://freesound.org/people/kiddpark/sounds/201159/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited: trimmed, normalized, converted to MP3.
  - 來源:https://freesound.org/people/kiddpark/sounds/201159/
  - 使用於:`audio/ui/purchase_cash_register_2.mp3`
- "horror scream woman long.wav" by klankbeeld (https://freesound.org/people/klankbeeld/sounds/171078/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited: trimmed, normalized, converted to MP3. Sound from http://www.freesound.org/people/klankbeeld/
  - 來源:https://freesound.org/people/klankbeeld/sounds/171078/
  - 使用於:`audio/world/distant_scream_woman.mp3`
- "horror zombie hell atmos.wav" by klankbeeld (https://freesound.org/people/klankbeeld/sounds/126323/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited: trimmed, normalized, converted to MP3. Sound from http://www.freesound.org/people/klankbeeld/
  - 來源:https://freesound.org/people/klankbeeld/sounds/126323/
  - 使用於:`audio/world/screams_crying_ambience_loop.mp3`
- "Classic Zombie moans and attack by Bernuy CC BY" by Miguel L. Bernuy (Bernuy) (https://freesound.org/people/Bernuy/sounds/415524/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited: trimmed, normalized, converted to MP3. Credit requested by the author: Miguel L. Bernuy - youtube.com/user/Miguelbernuy
  - 來源:https://freesound.org/people/Bernuy/sounds/415524/
  - 使用於:`audio/zombies/walker_groan_8.mp3`
- "Zombie Voice" by PatrickLieberkind (https://freesound.org/people/PatrickLieberkind/sounds/213835/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited: trimmed, normalized, converted to MP3.
  - 來源:https://freesound.org/people/PatrickLieberkind/sounds/213835/
  - 使用於:`audio/zombies/walker_groan_6.mp3`
- "Headshot 2" by SilverIllusionist (https://freesound.org/people/SilverIllusionist/sounds/470586/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited: trimmed, normalized, converted to MP3.
  - 來源:https://freesound.org/people/SilverIllusionist/sounds/470586/
  - 使用於:`audio/weapons/impact_headshot_gore.mp3`
- "Wood Creak.wav" by TimPryor (https://freesound.org/people/TimPryor/sounds/188606/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited: trimmed, normalized, converted to MP3.
  - 來源:https://freesound.org/people/TimPryor/sounds/188606/
  - 使用於:`audio/world/door_creak_3.mp3`
- "horror gate.aif" by Tomlija (https://freesound.org/people/Tomlija/sounds/109710/), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Edited: trimmed, normalized, converted to MP3.
  - 來源:https://freesound.org/people/Tomlija/sounds/109710/
  - 使用於:`audio/world/gate_creak_clang.mp3`
- "Bullet_Impact_1" by toxicwafflezz (https://freesound.org/people/toxicwafflezz/sounds/150837/), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Edited: trimmed, normalized, converted to MP3.
  - 來源:https://freesound.org/people/toxicwafflezz/sounds/150837/
  - 使用於:`audio/weapons/impact_concrete_1.mp3`
- "Bullet_Impact_2" by toxicwafflezz (https://freesound.org/people/toxicwafflezz/sounds/150838/), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Edited: trimmed, normalized, converted to MP3.
  - 來源:https://freesound.org/people/toxicwafflezz/sounds/150838/
  - 使用於:`audio/weapons/impact_concrete_2.mp3`
- "Bullet_Impact_3" by toxicwafflezz (https://freesound.org/people/toxicwafflezz/sounds/150839/), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Edited: trimmed, normalized, converted to MP3.
  - 來源:https://freesound.org/people/toxicwafflezz/sounds/150839/
  - 使用於:`audio/weapons/impact_concrete_3.mp3`
- "Monster Stomp Footsteps Sequence" by Vilkas_Sound (https://freesound.org/people/Vilkas_Sound/sounds/753178/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited: trimmed, normalized, converted to MP3.
  - 來源:https://freesound.org/people/Vilkas_Sound/sounds/753178/
  - 使用於:`audio/zombies/brute_stomp_1.mp3`、`audio/zombies/brute_stomp_2.mp3`、`audio/zombies/brute_stomp_3.mp3`、`audio/zombies/brute_stomp_4.mp3`
- "storm door slam 01.wav" by volivieri (https://freesound.org/people/volivieri/sounds/161190/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited: trimmed, normalized, converted to MP3.
  - 來源:https://freesound.org/people/volivieri/sounds/161190/
  - 使用於:`audio/world/door_slam_2.mp3`

## CC0(公眾領域,無需署名;仍列出以示感謝)— 181 件作品、293 個檔案

- Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney (Still North Media) — "The Free Firearm Sound Library - Prepared SFX Library / AK-47/C_28P.wav (AK-47 rifle)"、"The Free Firearm Sound Library - Prepared SFX Library / AR-15/D_32P.wav (AR-15 M4)"、"The Free Firearm Sound Library - Prepared SFX Library / Walther PPQ/X_39P.wav (Walther PPQ handgun)" 等 8 件(https://opengameart.org/content/the-free-firearm-sound-library)
  - 使用於:`audio/weapons/ak47_shot_1.mp3`、`audio/weapons/ak47_shot_2.mp3`、`audio/weapons/ak47_shot_3.mp3`、`audio/weapons/ak47_shot_4.mp3`、`audio/weapons/m4a1_shot_1.mp3`、`audio/weapons/m4a1_shot_2.mp3`、`audio/weapons/pistol_shot_1.mp3`、`audio/weapons/pistol_shot_2.mp3`、`audio/weapons/pistol_shot_3.mp3`、`audio/weapons/revolver_shot_1.mp3`、`audio/weapons/revolver_shot_2.mp3`、`audio/weapons/shotgun_shot_1.mp3`、`audio/weapons/shotgun_shot_2.mp3`、`audio/weapons/shotgun_shot_3.mp3`、`audio/weapons/sniper_shot_1.mp3`、`audio/weapons/sniper_shot_2.mp3`、`audio/weapons/sniper_shot_3.mp3`
- Nox_Sound — "Footsteps_Walk.wav"(https://freesound.org/people/Nox_Sound/sounds/490951/)
  - 使用於:`audio/footsteps/footstep_tile_1.mp3`、`audio/footsteps/footstep_tile_2.mp3`、`audio/footsteps/footstep_tile_3.mp3`、`audio/footsteps/footstep_tile_4.mp3`、`audio/footsteps/footstep_water_1.mp3`、`audio/footsteps/footstep_water_2.mp3`、`audio/footsteps/footstep_water_3.mp3`、`audio/footsteps/footstep_water_4.mp3`、`audio/zombies/bloater_step_wet_1.mp3`、`audio/zombies/bloater_step_wet_2.mp3`、`audio/zombies/bloater_step_wet_3.mp3`
- lolamadeus — "Zombie Vocals - Grunts.wav"(https://freesound.org/people/lolamadeus/sounds/181068/)
  - 使用於:`audio/zombies/attack_snarl_1.mp3`、`audio/zombies/attack_snarl_2.mp3`、`audio/zombies/attack_snarl_3.mp3`、`audio/zombies/attack_snarl_4.mp3`、`audio/zombies/attack_snarl_5.mp3`、`audio/zombies/zombie_pain_7.mp3`、`audio/zombies/zombie_pain_8.mp3`
- haratman — "Zombie Pack 2 (Edited)"(https://freesound.org/people/haratman/sounds/437134/)
  - 使用於:`audio/zombies/zombie_grunt_1.mp3`、`audio/zombies/zombie_grunt_2.mp3`、`audio/zombies/zombie_grunt_3.mp3`、`audio/zombies/zombie_grunt_4.mp3`、`audio/zombies/zombie_grunt_5.mp3`、`audio/zombies/zombie_grunt_6.mp3`
- u1769092 — "VisceralBulletImpacts.wav"(https://freesound.org/people/u1769092/sounds/423301/)
  - 使用於:`audio/weapons/impact_flesh_1.mp3`、`audio/weapons/impact_flesh_2.mp3`、`audio/weapons/impact_flesh_3.mp3`、`audio/weapons/impact_flesh_4.mp3`、`audio/weapons/impact_flesh_5.mp3`
- Fission9 — "Hiking Boot Footsteps on Stone"(https://freesound.org/people/Fission9/sounds/521590/)
  - 使用於:`audio/footsteps/footstep_concrete_1.mp3`、`audio/footsteps/footstep_concrete_2.mp3`、`audio/footsteps/footstep_concrete_3.mp3`、`audio/footsteps/footstep_concrete_4.mp3`
- Fission9 — "Hiking Boot Footsteps on Grass"(https://freesound.org/people/Fission9/sounds/521587/)
  - 使用於:`audio/footsteps/footstep_grass_1.mp3`、`audio/footsteps/footstep_grass_2.mp3`、`audio/footsteps/footstep_grass_3.mp3`、`audio/footsteps/footstep_grass_4.mp3`
- monte32 — "Footsteps_6_Dirt_shoe.wav"(https://freesound.org/people/monte32/sounds/353799/)
  - 使用於:`audio/footsteps/footstep_gravel_1.mp3`、`audio/footsteps/footstep_gravel_2.mp3`、`audio/footsteps/footstep_gravel_3.mp3`、`audio/footsteps/footstep_gravel_4.mp3`
- Phil25 — "Metal Steps"(https://freesound.org/people/Phil25/sounds/208101/)
  - 使用於:`audio/footsteps/footstep_metal_1.mp3`、`audio/footsteps/footstep_metal_2.mp3`、`audio/footsteps/footstep_metal_3.mp3`、`audio/footsteps/footstep_metal_4.mp3`
- IENBA — "Footsteps on Metal"(https://freesound.org/people/IENBA/sounds/698697/)
  - 使用於:`audio/footsteps/footstep_metal_stairs_1.mp3`、`audio/footsteps/footstep_metal_stairs_2.mp3`、`audio/footsteps/footstep_metal_stairs_3.mp3`、`audio/footsteps/footstep_metal_stairs_4.mp3`
- florianreichelt — "Footsteps on hollow wood"(https://freesound.org/people/florianreichelt/sounds/459970/)
  - 使用於:`audio/footsteps/footstep_wood_1.mp3`、`audio/footsteps/footstep_wood_2.mp3`、`audio/footsteps/footstep_wood_3.mp3`、`audio/footsteps/footstep_wood_4.mp3`
- altfuture — "Coins"(https://freesound.org/people/altfuture/sounds/174629/)
  - 使用於:`audio/ui/coin_pickup_1.mp3`、`audio/ui/coin_pickup_2.mp3`、`audio/ui/coin_pickup_3.mp3`、`audio/ui/coin_pickup_4.mp3`
- Kenney (kenney.nl) — "ui-audio - click1.ogg"、"ui-audio - click3.ogg"、"ui-audio - switch7.ogg" 等 4 件(https://kenney.nl/assets/ui-audio)
  - 使用於:`audio/ui/menu_click_1.mp3`、`audio/ui/menu_click_2.mp3`、`audio/ui/menu_click_3.mp3`、`audio/ui/menu_hover_1.mp3`
- GryffDavid — "Bouncing Shell Casings (Various Sizes)"(https://freesound.org/people/GryffDavid/sounds/318964/)
  - 使用於:`audio/weapons/casing_tile_1.mp3`、`audio/weapons/casing_tile_2.mp3`、`audio/weapons/casing_tile_3.mp3`、`audio/weapons/casing_tile_4.mp3`
- serøutōnin--deprivəd — "A Glock handgun having its magazine removed and re-inserted // 3 takes"(https://freesound.org/people/ser%C3%B8ut%C5%8Dnin--depriv%C9%99d/sounds/854460/)
  - 使用於:`audio/weapons/pistol_mag_in_1.mp3`、`audio/weapons/pistol_mag_in_2.mp3`、`audio/weapons/pistol_mag_out_1.mp3`、`audio/weapons/pistol_mag_out_2.mp3`
- Dredile — "Clean Revolver Reload"(https://freesound.org/people/Dredile/sounds/177863/)
  - 使用於:`audio/weapons/revolver_cylinder_close.mp3`、`audio/weapons/revolver_cylinder_open.mp3`、`audio/weapons/revolver_load_round_1.mp3`、`audio/weapons/revolver_load_round_2.mp3`
- unfa — "Medium Male Pain Grunts"(https://freesound.org/people/unfa/sounds/610998/)
  - 使用於:`audio/world/player_hurt_1.mp3`、`audio/world/player_hurt_2.mp3`、`audio/world/player_hurt_3.mp3`、`audio/world/player_hurt_4.mp3`
- MrPokephile — "Zombie Flesh Bites"(https://freesound.org/people/MrPokephile/sounds/155973/)
  - 使用於:`audio/zombies/bite_1.mp3`、`audio/zombies/bite_2.mp3`、`audio/zombies/bite_3.mp3`、`audio/zombies/bite_4.mp3`
- SpliceSound — "01-12 Footsteps, Tile, Male Barefoot, Fast Pace.wav"(https://freesound.org/people/SpliceSound/sounds/197401/)
  - 使用於:`audio/zombies/runner_step_1.mp3`、`audio/zombies/runner_step_2.mp3`、`audio/zombies/runner_step_3.mp3`、`audio/zombies/runner_step_4.mp3`
- Kenney (kenney.nl) — "rpg-audio - metalLatch.ogg"、"rpg-audio - handleCoins.ogg"、"rpg-audio - cloth1.ogg"(https://kenney.nl/assets/rpg-audio)
  - 使用於:`audio/ui/ammo_box_latch.mp3`、`audio/ui/coin_pickup_5.mp3`、`audio/ui/medkit_cloth.mp3`
- UnplugTheFridge — "Box of Ammo"(https://freesound.org/people/UnplugTheFridge/sounds/531074/)
  - 使用於:`audio/ui/ammo_pickup_1.mp3`、`audio/ui/ammo_pickup_2.mp3`、`audio/ui/ammo_pickup_3.mp3`
- barryshamir — "Bullet casings falling"(https://freesound.org/people/barryshamir/sounds/834236/)
  - 使用於:`audio/weapons/casing_concrete_1.mp3`、`audio/weapons/casing_concrete_2.mp3`、`audio/weapons/casing_concrete_3.mp3`
- martian — "Foley bullet hit metal 02.wav"(https://freesound.org/people/martian/sounds/182263/)
  - 使用於:`audio/weapons/impact_metal_1.mp3`、`audio/weapons/impact_metal_2.mp3`、`audio/weapons/impact_metal_3.mp3`
- qubodup — "Assault Rifle Reload"(https://freesound.org/people/qubodup/sounds/815879/)
  - 使用於:`audio/weapons/m4a1_charging_handle.mp3`、`audio/weapons/m4a1_mag_in.mp3`、`audio/weapons/m4a1_mag_out.mp3`
- serøutōnin--deprivəd — "Browning Hi-Power handgun being cocked 5x"(https://freesound.org/people/ser%C3%B8ut%C5%8Dnin--depriv%C9%99d/sounds/674744/)
  - 使用於:`audio/weapons/pistol_slide_rack_1.mp3`、`audio/weapons/pistol_slide_rack_2.mp3`、`audio/weapons/pistol_slide_rack_3.mp3`
- Bratish — "Shotgun Shell Load"(https://freesound.org/people/Bratish/sounds/500293/)
  - 使用於:`audio/weapons/shotgun_shell_insert_1.mp3`、`audio/weapons/shotgun_shell_insert_2.mp3`、`audio/weapons/shotgun_shell_insert_3.mp3`
- Legnalegna55 — "Water Droplets"(https://freesound.org/people/Legnalegna55/sounds/543649/)
  - 使用於:`audio/world/water_drip_1.mp3`、`audio/world/water_drip_2.mp3`、`audio/world/water_drip_3.mp3`
- Podsburgh — "Vomiting on the ground - Remixed"(https://freesound.org/people/Podsburgh/sounds/370710/)
  - 使用於:`audio/zombies/bloater_gurgle.mp3`、`audio/zombies/bloater_vomit_1.mp3`、`audio/zombies/bloater_vomit_2.mp3`
- cherrykdall — "HUMAN_SPIT1"(https://freesound.org/people/cherrykdall/sounds/724155/)
  - 使用於:`audio/zombies/bloater_spit_1.mp3`、`audio/zombies/bloater_spit_2.mp3`、`audio/zombies/bloater_spit_3.mp3`
- perrybassin — "zombies walking dead style"(https://freesound.org/people/perrybassin/sounds/616998/)
  - 使用於:`audio/zombies/walker_groan_2.mp3`、`audio/zombies/walker_groan_3.mp3`、`audio/zombies/walker_groan_4.mp3`
- congusbongus — "String and piano horror stings - abyss_0.ogg"、"String and piano horror stings - piano_sting.mp3"(https://opengameart.org/content/string-and-piano-horror-stings)
  - 使用於:`audio/music/stinger_jumpscare_1.mp3`、`audio/music/stinger_jumpscare_2.mp3`
- Kenney (kenney.nl) — "interface-sounds - error_006.ogg"、"interface-sounds - back_002.ogg"(https://kenney.nl/assets/interface-sounds)
  - 使用於:`audio/ui/error_deny_2.mp3`、`audio/ui/menu_back.mp3`
- bruno.auzet — "metal shutter.wav"(https://freesound.org/people/bruno.auzet/sounds/524695/)
  - 使用於:`audio/ui/shutter_close.mp3`、`audio/ui/shutter_open.mp3`
- serøutōnin--deprivəd — "AK-47 assault rifle being cocked 3x"(https://freesound.org/people/ser%C3%B8ut%C5%8Dnin--depriv%C9%99d/sounds/675008/)
  - 使用於:`audio/weapons/ak47_bolt_rack_1.mp3`、`audio/weapons/ak47_bolt_rack_2.mp3`
- serøutōnin--deprivəd — "AK-47 Assault Rifle being unloaded and reloaded"(https://freesound.org/people/ser%C3%B8ut%C5%8Dnin--depriv%C9%99d/sounds/674742/)
  - 使用於:`audio/weapons/ak47_mag_in.mp3`、`audio/weapons/ak47_mag_out.mp3`
- nicktermer — "small metal object fall "(https://freesound.org/people/nicktermer/sounds/259553/)
  - 使用於:`audio/weapons/grenade_bounce_1.mp3`、`audio/weapons/grenade_bounce_2.mp3`
- Johnnyfarmer — "Explosion Distant "(https://freesound.org/people/Johnnyfarmer/sounds/209769/)
  - 使用於:`audio/weapons/grenade_explosion_distant_1.mp3`、`audio/weapons/grenade_explosion_distant_2.mp3`
- Podcapocalipsis — "STABBING STAB KNIFE.mp3"(https://freesound.org/people/Podcapocalipsis/sounds/521030/)
  - 使用於:`audio/weapons/knife_stab_2.mp3`、`audio/weapons/knife_stab_3.mp3`
- Nox_Sound — "Weapon_Revolver_Hammer_Mono.wav"(https://freesound.org/people/Nox_Sound/sounds/540065/)
  - 使用於:`audio/weapons/revolver_hammer_cock_1.mp3`、`audio/weapons/revolver_hammer_cock_2.mp3`
- cedarstudios — "ricochet.mp3"(https://freesound.org/people/cedarstudios/sounds/148840/)
  - 使用於:`audio/weapons/ricochet_1.mp3`、`audio/weapons/ricochet_2.mp3`
- TotallyPhilip — "Remington 870 12 gauge shotgun pump racking cha chock"(https://freesound.org/people/TotallyPhilip/sounds/755495/)
  - 使用於:`audio/weapons/shotgun_pump_1.mp3`、`audio/weapons/shotgun_pump_2.mp3`
- JohnDelayniKIng — "Shotgun shell ejection.aif"(https://freesound.org/people/JohnDelayniKIng/sounds/147261/)
  - 使用於:`audio/weapons/shotgun_shell_drop_1.mp3`、`audio/weapons/shotgun_shell_drop_2.mp3`
- JeffWojo — "Generator StartUp, Run, Shutdown.wav"(https://freesound.org/people/JeffWojo/sounds/169940/)
  - 使用於:`audio/world/generator_start.mp3`、`audio/world/generator_stop.mp3`
- ngruber — "Breaking Glass "(https://freesound.org/people/ngruber/sounds/204777/)
  - 使用於:`audio/world/glass_break_2.mp3`、`audio/world/glass_break_3.mp3`
- mycompasstv — "Old Rotary Phone Ringing - Western Electric Bell 500 phone"(https://freesound.org/people/mycompasstv/sounds/456433/)
  - 使用於:`audio/world/phone_ring_loop.mp3`、`audio/world/phone_ring_single.mp3`
- bottles — "Sizzle / Acid Burn"(https://freesound.org/people/bottles/sounds/382313/)
  - 使用於:`audio/zombies/acid_sizzle_1.mp3`、`audio/zombies/acid_sizzle_2.mp3`
- Breviceps — "Dragon: Several roars, growls and snarls"(https://freesound.org/people/Breviceps/sounds/479380/)
  - 使用於:`audio/zombies/brute_roar_2.mp3`、`audio/zombies/brute_roar_3.mp3`
- MSEpitaph — "Alien Xenomorph Hissing and Growling (with and without FX)"(https://freesound.org/people/MSEpitaph/sounds/545484/)
  - 使用於:`audio/zombies/crawler_hiss_2.mp3`、`audio/zombies/crawler_hiss_3.mp3`
- ProductionNow — "Ripping Apart Carcass.wav"(https://freesound.org/people/ProductionNow/sounds/234236/)
  - 使用於:`audio/zombies/flesh_tear_2.mp3`、`audio/zombies/flesh_tear_3.mp3`
- gpag1 — "Monster screams.wav"(https://freesound.org/people/gpag1/sounds/391552/)
  - 使用於:`audio/zombies/runner_scream_3.mp3`、`audio/zombies/runner_scream_4.mp3`
- abbahoot — "Footstep Drag Indoors .wav"(https://freesound.org/people/abbahoot/sounds/221650/)
  - 使用於:`audio/zombies/walker_drag_step_1.mp3`、`audio/zombies/walker_drag_step_2.mp3`
- Joth — "Ambience Pack 1 -- Sci Fi Horror - The Depths of Hell.mp3"(https://opengameart.org/content/ambience-pack-1-sci-fi-horror)
  - 使用於:`audio/music/ambient_bed_depths_loop.mp3`
- congusbongus — "Abandoned passages (horror ambience loop) - freezer_0.ogg"(https://opengameart.org/content/abandoned-passages-horror-ambience-loop)
  - 使用於:`audio/music/ambient_bed_passages_loop.mp3`
- bevibeldesign — "gong.aiff"(https://freesound.org/people/bevibeldesign/sounds/316642/)
  - 使用於:`audio/music/round_end_gong.mp3`
- hotpin7 — "Sting/jumpscare"(https://freesound.org/people/hotpin7/sounds/846789/)
  - 使用於:`audio/music/stinger_jumpscare_3.mp3`
- Rudmer_Rotteveel — "Cloth Rip Fast"(https://freesound.org/people/Rudmer_Rotteveel/sounds/591195/)
  - 使用於:`audio/ui/bandage_rip.mp3`
- rolandseer — "MONEY_001.wav"(https://freesound.org/people/rolandseer/sounds/443334/)
  - 使用於:`audio/ui/coins_jingle.mp3`
- Jacco18 — "acess denied buzz"(https://freesound.org/people/Jacco18/sounds/419023/)
  - 使用於:`audio/ui/error_deny_1.mp3`
- Rudmer_Rotteveel — "Velcro Pull 01"(https://freesound.org/people/Rudmer_Rotteveel/sounds/536231/)
  - 使用於:`audio/ui/medkit_velcro.mp3`
- uEffects — "Zipper Zip"(https://freesound.org/people/uEffects/sounds/324659/)
  - 使用於:`audio/ui/medkit_zip.mp3`
- tmkappelt — "Double_Zipper_fast.aif"(https://freesound.org/people/tmkappelt/sounds/85679/)
  - 使用於:`audio/ui/medkit_zip_2.mp3`
- steaq — "UI hover item"(https://freesound.org/people/steaq/sounds/757328/)
  - 使用於:`audio/ui/menu_hover_2.mp3`
- PhilSavlem — "Money Bag"(https://freesound.org/people/PhilSavlem/sounds/338260/)
  - 使用於:`audio/ui/money_bag.mp3`
- CapsLok — "Cash Register Fake.wav"(https://freesound.org/people/CapsLok/sounds/184438/)
  - 使用於:`audio/ui/purchase_cash_register.mp3`
- FlashTrauma — "Reception Bell"(https://freesound.org/people/FlashTrauma/sounds/398281/)
  - 使用於:`audio/ui/purchase_confirm.mp3`
- Bruce Burbank — "electric garage door opens.aif"(https://freesound.org/people/Bruce%20Burbank/sounds/151258/)
  - 使用於:`audio/ui/shutter_open_electric.mp3`
- WasabiWielder — "Clothes Rustling 1"(https://freesound.org/people/WasabiWielder/sounds/334219/)
  - 使用於:`audio/weapons/ads_cloth_1.mp3`
- martian — "foley cloth rustle.wav"(https://freesound.org/people/martian/sounds/19291/)
  - 使用於:`audio/weapons/ads_cloth_2.mp3`
- jaredpass24 — "Jacket Rustle_Aggressive 2.wav"(https://freesound.org/people/jaredpass24/sounds/235243/)
  - 使用於:`audio/weapons/ads_cloth_3.mp3`
- serøutōnin--deprivəd — "9mm Handgun Being Dry Fired"(https://freesound.org/people/ser%C3%B8ut%C5%8Dnin--depriv%C9%99d/sounds/674568/)
  - 使用於:`audio/weapons/dry_fire_pistol.mp3`
- serøutōnin--deprivəd — "A rifle being dry fired once"(https://freesound.org/people/ser%C3%B8ut%C5%8Dnin--depriv%C9%99d/sounds/725402/)
  - 使用於:`audio/weapons/dry_fire_rifle.mp3`
- Nox_Sound — "Foley_Object_Toolbox_Metal_Drop_Mono.wav"(https://freesound.org/people/Nox_Sound/sounds/556648/)
  - 使用於:`audio/weapons/grenade_bounce_3.mp3`
- unfa — "Grenade Explosion SFX (medium-sized, meaty, realistic)"(https://freesound.org/people/unfa/sounds/609587/)
  - 使用於:`audio/weapons/grenade_explosion_1.mp3`
- FlashTrauma — "Explosion"(https://freesound.org/people/FlashTrauma/sounds/398283/)
  - 使用於:`audio/weapons/grenade_explosion_2.mp3`
- NenadSimic — "Muffled Distant Explosion"(https://freesound.org/people/NenadSimic/sounds/149966/)
  - 使用於:`audio/weapons/grenade_explosion_distant_3.mp3`
- Pablobd — "Headshot.wav"(https://freesound.org/people/Pablobd/sounds/511194/)
  - 使用於:`audio/weapons/impact_headshot.mp3`
- wilhellboy — "HeavyBulletPing.mp3"(https://freesound.org/people/wilhellboy/sounds/351371/)
  - 使用於:`audio/weapons/impact_metal_4.mp3`
- Mixedupmoviestuff — "Knife Stab.wav"(https://freesound.org/people/Mixedupmoviestuff/sounds/179222/)
  - 使用於:`audio/weapons/knife_stab_1.mp3`
- neilsher — "Knife Stab Pull.wav"(https://freesound.org/people/neilsher/sounds/411742/)
  - 使用於:`audio/weapons/knife_stab_pull.mp3`
- Shamewap — "Small Knife Whoosh.wav"(https://freesound.org/people/Shamewap/sounds/389690/)
  - 使用於:`audio/weapons/knife_swing_1.mp3`
- spycrah — "Knife/sword swing"(https://freesound.org/people/spycrah/sounds/471097/)
  - 使用於:`audio/weapons/knife_swing_2.mp3`
- michorvath — "9mm pistol load and chamber"(https://freesound.org/people/michorvath/sounds/427593/)
  - 使用於:`audio/weapons/pistol_slide_release.mp3`
- jhka — "Revolver Chamber Spin (Ratchet Sound)"(https://freesound.org/people/jhka/sounds/139001/)
  - 使用於:`audio/weapons/revolver_cylinder_spin.mp3`
- serøutōnin--deprivəd — "22lr Revolver ejecting bullets from cylinder"(https://freesound.org/people/ser%C3%B8ut%C5%8Dnin--depriv%C9%99d/sounds/693125/)
  - 使用於:`audio/weapons/revolver_eject_shells.mp3`
- morganpurkis — "Ricochet 2.wav"(https://freesound.org/people/morganpurkis/sounds/392975/)
  - 使用於:`audio/weapons/ricochet_3.mp3`
- dasBUTCHER84 — "SXP_SHOTGUN_RACK_01"(https://freesound.org/people/dasBUTCHER84/sounds/449614/)
  - 使用於:`audio/weapons/shotgun_pump_3.mp3`
- Walking.With.Microphones — "Mauser 98k - bolt-action mechanism sound"(https://freesound.org/people/Walking.With.Microphones/sounds/802673/)
  - 使用於:`audio/weapons/sniper_bolt_cycle.mp3`
- qubodup — "Pulling and Releasing Barrett M82A1 Charging Handle to Load Round 1"(https://freesound.org/people/qubodup/sounds/855598/)
  - 使用於:`audio/weapons/sniper_charging_handle.mp3`
- qubodup — "Pushing 50 Cal BMG Round into Magazine"(https://freesound.org/people/qubodup/sounds/855580/)
  - 使用於:`audio/weapons/sniper_round_insert.mp3`
- nioczkus — "Holster Pistol"(https://freesound.org/people/nioczkus/sounds/388819/)
  - 使用於:`audio/weapons/weapon_holster.mp3`
- myrinvp — "Old air conditioning unit"(https://freesound.org/people/myrinvp/sounds/273620/)
  - 使用於:`audio/world/ac_unit_loop.mp3`
- Nox_Sound — "Male_Breath_Fast_Loop_Stereo.wav"(https://freesound.org/people/Nox_Sound/sounds/554907/)
  - 使用於:`audio/world/breathing_fast_loop.mp3`
- Under7dude — "Heavy Breathing"(https://freesound.org/people/Under7dude/sounds/163383/)
  - 使用於:`audio/world/breathing_heavy.mp3`
- Mafon2 — "Wooden Creak"(https://freesound.org/people/Mafon2/sounds/377552/)
  - 使用於:`audio/world/door_creak_1.mp3`
- JarredGibb — "Door - Creak.wav"(https://freesound.org/people/JarredGibb/sounds/219499/)
  - 使用於:`audio/world/door_creak_2.mp3`
- NachtmahrTV — "Door slamming hard"(https://freesound.org/people/NachtmahrTV/sounds/571797/)
  - 使用於:`audio/world/door_slam_1.mp3`
- TurtleLG — "JailDoorClose.wav"(https://freesound.org/people/TurtleLG/sounds/80449/)
  - 使用於:`audio/world/door_slam_heavy_cell.mp3`
- Lunardrive — "Metal Door Slam_SoundSmith.wav"(https://freesound.org/people/Lunardrive/sounds/48980/)
  - 使用於:`audio/world/door_slam_metal.mp3`
- kentspublicdomain — "Flickering Fluorescent Light with Background Hum (Seamless Loop, 44100 Hz Mono)"(https://freesound.org/people/kentspublicdomain/sounds/777053/)
  - 使用於:`audio/world/fluorescent_flicker_loop.mp3`
- EverydaySounds — "Faulty Fluorescent Light Starter & Hum.wav"(https://freesound.org/people/EverydaySounds/sounds/125064/)
  - 使用於:`audio/world/fluorescent_flicker_on.mp3`
- janbezouska — "Factory Fluorescent light buzz"(https://freesound.org/people/janbezouska/sounds/537769/)
  - 使用於:`audio/world/fluorescent_hum_loop.mp3`
- Garuda1982 — "large diesel emergency generator is running"(https://freesound.org/people/Garuda1982/sounds/606933/)
  - 使用於:`audio/world/generator_hum_loop.mp3`
- justBrando — "Glass breaking.mp3"(https://freesound.org/people/justBrando/sounds/159197/)
  - 使用於:`audio/world/glass_break_1.mp3`
- patobottos — "Heartbeats 61.wav"(https://freesound.org/people/patobottos/sounds/369017/)
  - 使用於:`audio/world/heartbeat_loop.mp3`
- Kinoton — "Room Tone, Empty Hospital"(https://freesound.org/people/Kinoton/sounds/670070/)
  - 使用於:`audio/world/hvac_hospital_roomtone_loop.mp3`
- dslrguide — "Scraping Stone "(https://freesound.org/people/dslrguide/sounds/321488/)
  - 使用於:`audio/world/metal_scrape_1.mp3`
- Aureolus_Omicron — "4 Music Box Tracks - musicbox1_spooky_waltz.ogg"(https://opengameart.org/content/4-music-box-tracks)
  - 使用於:`audio/world/music_box_melody_loop.mp3`
- Modification1089 — "creepy music box.wav"(https://freesound.org/people/Modification1089/sounds/274379/)
  - 使用於:`audio/world/music_box_windup_real.mp3`
- cookies+policy — "Rotary Phone Ring loopable"(https://freesound.org/people/cookies+policy/sounds/556499/)
  - 使用於:`audio/world/phone_ring_loop_2.mp3`
- randbsoundbites — "The Last gasp before death"(https://freesound.org/people/randbsoundbites/sounds/798649/)
  - 使用於:`audio/world/player_death_gasp.mp3`
- Kenney (kenney.nl) — "impact-sounds - impactPunch_heavy_000.ogg"(https://kenney.nl/assets/impact-sounds)
  - 使用於:`audio/world/player_hit_heavy.mp3`
- MrFossy — "Voice_AdultMale_PainGrunts_09.wav"(https://freesound.org/people/MrFossy/sounds/547209/)
  - 使用於:`audio/world/player_hurt_5.mp3`
- DiArchangeli — "TV Static.wav"(https://freesound.org/people/DiArchangeli/sounds/116395/)
  - 使用於:`audio/world/tv_static_loop.mp3`
- Jace — "continuous static.wav"(https://freesound.org/people/Jace/sounds/35291/)
  - 使用於:`audio/world/tv_static_loop_2.mp3`
- iampagan — "Droplets in a cave"(https://freesound.org/people/iampagan/sounds/177031/)
  - 使用於:`audio/world/water_drips_faucet_loop.mp3`
- Sclolex — "Water Dripping in Cave.wav"(https://freesound.org/people/Sclolex/sounds/177958/)
  - 使用於:`audio/world/water_drips_loop.mp3`
- Litruv — "Ghost Whispers"(https://freesound.org/people/Litruv/sounds/175944/)
  - 使用於:`audio/world/whispers_1.mp3`
- dimbark1 — "Ghostly Whispers"(https://freesound.org/people/dimbark1/sounds/316797/)
  - 使用於:`audio/world/whispers_2.mp3`
- geoneo0 — "Four_Voices_Whispering_6_wEcho.wav"(https://freesound.org/people/geoneo0/sounds/193818/)
  - 使用於:`audio/world/whispers_3.mp3`
- mistersherlock — "Halloween - Graveyard At Night Howling Wind.mp3"(https://freesound.org/people/mistersherlock/sounds/159509/)
  - 使用於:`audio/world/wind_graveyard_loop.mp3`
- teadrinker — "wind_forest_08_strong_l_01.wav"(https://freesound.org/people/teadrinker/sounds/403051/)
  - 使用於:`audio/world/wind_outdoor_loop.mp3`
- AlucardsBride — "crying woman.wav"(https://freesound.org/people/AlucardsBride/sounds/172738/)
  - 使用於:`audio/world/woman_crying_1.mp3`
- spookymodem — "Acid Bubbling.wav"(https://freesound.org/people/spookymodem/sounds/202094/)
  - 使用於:`audio/zombies/acid_bubbling.mp3`
- soykevin — "Zombie Attack"(https://freesound.org/people/soykevin/sounds/213509/)
  - 使用於:`audio/zombies/attack_devour.mp3`
- Lukeo135 — "Zombie Bite"(https://freesound.org/people/Lukeo135/sounds/518155/)
  - 使用於:`audio/zombies/bite_5.mp3`
- Breviceps — "Horror / Zombie - Biting on bones"(https://freesound.org/people/Breviceps/sounds/445987/)
  - 使用於:`audio/zombies/bite_bone.mp3`
- Framefive — "Burp_monster.wav"(https://freesound.org/people/Framefive/sounds/142932/)
  - 使用於:`audio/zombies/bloater_belch_1.mp3`
- EricsSoundschmiede — "Burp Monster Zombie groan moan"(https://freesound.org/people/EricsSoundschmiede/sounds/463721/)
  - 使用於:`audio/zombies/bloater_belch_2.mp3`
- Anko6 — "Vomit.wav"(https://freesound.org/people/Anko6/sounds/388525/)
  - 使用於:`audio/zombies/bloater_retch.mp3`
- DeezSoundzTho — "pukesplash.wav"(https://freesound.org/people/DeezSoundzTho/sounds/383334/)
  - 使用於:`audio/zombies/bloater_spit_splat.mp3`
- DylanTheFish — "Body fall.wav"(https://freesound.org/people/DylanTheFish/sounds/417994/)
  - 使用於:`audio/zombies/body_fall_1.mp3`
- Breviceps — "Thud / Falling on wooden floor / Snapping, breaking neck"(https://freesound.org/people/Breviceps/sounds/447922/)
  - 使用於:`audio/zombies/body_fall_2.mp3`
- deleted_user_2104797 — "Body fall_02.wav"(https://freesound.org/people/deleted_user_2104797/sounds/346694/)
  - 使用於:`audio/zombies/body_fall_3.mp3`
- leonelmail — "BODY FALL - V HVY - DIRT"(https://freesound.org/people/leonelmail/sounds/504626/)
  - 使用於:`audio/zombies/body_fall_heavy.mp3`
- husky70 — "Angry Beast.wav"(https://freesound.org/people/husky70/sounds/170454/)
  - 使用於:`audio/zombies/brute_growl.mp3`
- JoelAudio — "DRAGON_ROAR.wav"(https://freesound.org/people/JoelAudio/sounds/85568/)
  - 使用於:`audio/zombies/brute_roar_1.mp3`
- AudioPapkin — "Big robot footstep"(https://freesound.org/people/AudioPapkin/sounds/813056/)
  - 使用於:`audio/zombies/brute_stomp_5.mp3`
- PostProdDog — "Dragging a body across a concrete floor 2"(https://freesound.org/people/PostProdDog/sounds/578493/)
  - 使用於:`audio/zombies/crawler_drag_loop.mp3`
- mrh4hn — "Zombie Choking.wav"(https://freesound.org/people/mrh4hn/sounds/426637/)
  - 使用於:`audio/zombies/crawler_gurgle.mp3`
- courtneyeck — "Monster Hiss"(https://freesound.org/people/courtneyeck/sounds/673425/)
  - 使用於:`audio/zombies/crawler_hiss_1.mp3`
- ProductionNow — "Eating Juicy Meat.wav"(https://freesound.org/people/ProductionNow/sounds/234237/)
  - 使用於:`audio/zombies/eating_loop.mp3`
- magnuswaker — "Gut Rip (Unbladed)"(https://freesound.org/people/magnuswaker/sounds/530919/)
  - 使用於:`audio/zombies/flesh_tear_1.mp3`
- ThefitzyG — "goreSplat.wav"(https://freesound.org/people/ThefitzyG/sounds/414296/)
  - 使用於:`audio/zombies/gore_burst.mp3`
- magnuswaker — "Gore Impact - "LOT OF HEART""(https://freesound.org/people/magnuswaker/sounds/641046/)
  - 使用於:`audio/zombies/gore_splat_1.mp3`
- deleted_user_3277771 — "VERY LOUD Splat.wav"(https://freesound.org/people/deleted_user_3277771/sounds/176549/)
  - 使用於:`audio/zombies/gore_splat_2.mp3`
- nebulasnails — "Wet Splat 1.mp3"(https://freesound.org/people/nebulasnails/sounds/495118/)
  - 使用於:`audio/zombies/gore_splat_3.mp3`
- lolamadeus — "Monster Zombie Scream.wav"(https://freesound.org/people/lolamadeus/sounds/179345/)
  - 使用於:`audio/zombies/runner_attack_growl.mp3`
- Wakerone — "Zombie Demon Scream"(https://freesound.org/people/Wakerone/sounds/435651/)
  - 使用於:`audio/zombies/runner_scream_1.mp3`
- nick121087 — "Demonic Woman Scream.wav"(https://freesound.org/people/nick121087/sounds/333832/)
  - 使用於:`audio/zombies/runner_scream_2.mp3`
- PaulMorek — "SZ_Zombies_06.wav"(https://freesound.org/people/PaulMorek/sounds/196722/)
  - 使用於:`audio/zombies/walker_groan_1.mp3`
- mrh4hn — "Zombie Moan.wav"(https://freesound.org/people/mrh4hn/sounds/426628/)
  - 使用於:`audio/zombies/walker_groan_7.mp3`
- scorpion67890 — "Mutant Scream"(https://freesound.org/people/scorpion67890/sounds/396797/)
  - 使用於:`audio/zombies/zombie_death_1.mp3`
- tonsil5 — "Zombie Death 1.wav"(https://freesound.org/people/tonsil5/sounds/555412/)
  - 使用於:`audio/zombies/zombie_death_2.mp3`
- tonsil5 — "Zombie Death 2.wav"(https://freesound.org/people/tonsil5/sounds/555411/)
  - 使用於:`audio/zombies/zombie_death_3.mp3`
- tonsil5 — "Zombie Growl 1.wav"(https://freesound.org/people/tonsil5/sounds/555416/)
  - 使用於:`audio/zombies/zombie_growl_1.mp3`
- tonsil5 — "Zombie Growl 2.wav"(https://freesound.org/people/tonsil5/sounds/555415/)
  - 使用於:`audio/zombies/zombie_growl_2.mp3`
- tonsil5 — "Zombie Growl 3.wav"(https://freesound.org/people/tonsil5/sounds/555414/)
  - 使用於:`audio/zombies/zombie_growl_3.mp3`
- tonsil5 — "Zombie Growl 4.wav"(https://freesound.org/people/tonsil5/sounds/555413/)
  - 使用於:`audio/zombies/zombie_growl_4.mp3`
- tonsil5 — "Zombie Growl 5.wav"(https://freesound.org/people/tonsil5/sounds/555417/)
  - 使用於:`audio/zombies/zombie_growl_5.mp3`
- tonsil5 — "Zombie Hit 1.wav"(https://freesound.org/people/tonsil5/sounds/555420/)
  - 使用於:`audio/zombies/zombie_hit_1.mp3`
- tonsil5 — "Zombie Hit 2.wav"(https://freesound.org/people/tonsil5/sounds/555419/)
  - 使用於:`audio/zombies/zombie_hit_2.mp3`
- tonsil5 — "Zombie Pain 1.wav"(https://freesound.org/people/tonsil5/sounds/555424/)
  - 使用於:`audio/zombies/zombie_pain_1.mp3`
- tonsil5 — "Zombie Pain 2.wav"(https://freesound.org/people/tonsil5/sounds/555423/)
  - 使用於:`audio/zombies/zombie_pain_2.mp3`
- tonsil5 — "Zombie Pain 3.wav"(https://freesound.org/people/tonsil5/sounds/555422/)
  - 使用於:`audio/zombies/zombie_pain_3.mp3`
- tonsil5 — "Zombie Pain 4.wav"(https://freesound.org/people/tonsil5/sounds/555421/)
  - 使用於:`audio/zombies/zombie_pain_4.mp3`
- tonsil5 — "Zombie Pain 5.wav"(https://freesound.org/people/tonsil5/sounds/555426/)
  - 使用於:`audio/zombies/zombie_pain_5.mp3`
- tonsil5 — "Zombie Pain 6.wav"(https://freesound.org/people/tonsil5/sounds/555425/)
  - 使用於:`audio/zombies/zombie_pain_6.mp3`

素材清單與原始授權說明:每個檔案的作者、標題、來源網址、授權與剪輯紀錄都保存在素材 manifest(整理自 OpenGameArt、Freesound、incompetech、Kenney 等 CC0 / CC-BY 資源)。

## 雨聲與雷聲(public/audio/rain/,皆為 CC0 / 免署名)

每層兩個不同的片段(左右各一,去相關的立體寬度);從原檔裁切穩定段落、等功率交叉淡化做成無縫循環、RMS 對齊 -24 dBFS、轉成 Opus 單聲道 40~44 kbps(共約 1.05 MB)。

| 檔案 | 來源作品 | 作者 | 授權 | 來源網址 |
|---|---|---|---|---|
| `audio/rain/rain_wash_a.ogg`、`rain_wash_b.ogg`(遠處雨幕,原檔 290 秒、100 秒起各 30 秒) | amb rain loop 2(GoPro 實地錄音) | kresiek-the-furry | CC0 | https://opengameart.org/content/amb-rain-loop-2 |
| `audio/rain/rain_near_a.ogg`、`rain_near_b.ogg`(近處雨滴/水窪,原檔 660 秒、500 秒起各 24 秒) | amb rain loop 2(同上) | kresiek-the-furry | CC0 | https://opengameart.org/content/amb-rain-loop-2 |
| `audio/rain/rain_roof_a.ogg`、`rain_roof_b.ogg`(雨棚/排水溝,原檔 21 秒起 28 秒、1 秒起 18 秒) | Rain Gutter Loop | ogrebane | CC0 | https://opengameart.org/content/rain-gutter-loop |
| `audio/rain/rain_window_a.ogg`、`rain_window_b.ogg`(窗戶,`3.ogg` 16 秒起、`1.ogg` 2 秒起各 22 秒) | Rain (loopable) | ylmir | CC0 | https://opengameart.org/content/rain-loopable |
| `audio/rain/rain_gush.ogg`(排水管湧流,`water_flowing.ogg` 1.5 秒循環) | 30 CC0 SFX loops | rubberduck | CC0 | https://opengameart.org/content/30-cc0-sfx-loops |
| `audio/rain/thunder_roll.ogg`(雷聲,原檔 21.2~44.3 秒) | Rain - Long Thunder | wuxiascrub | CC0(作者註明「No need to credit」) | https://opengameart.org/content/rain-long-thunder |

## 台灣民謠與儀式聲(src/audio/folk.js、src/audio/vox.js)

旋律只用公有領域的作品,簡譜依記憶整理為五聲音階的單旋律、節奏簡化。演奏分兩種:
- **真人錄音**(下一節的表):哼唱用真人哼聲/童聲的單音做成取樣樂器、照簡譜演奏;誦經、遠處的北管、收音機裡的老唱片、錄音帶裡的〈天黑黑〉直接用錄音片段。
- **程式合成**:音樂盒、卡帶電子琴、收音機裡的大廣弦與月琴、嗩吶、西索米、引魂鈴、哀歌、配樂床。真人錄音載入失敗時,哼唱與誦經、北管也會退回合成版本。

任何程式、字幕、署名或文件裡都不寫歌詞,只寫曲名。

| 旋律 | 作者 | 公有領域依據 | 用法 |
|---|---|---|---|
| 《望春風》(1933) | 鄧雨賢 作曲(1906–1944) | 作曲者逝世已逾 50 年(台灣著作權法:生存期間 + 50 年),旋律為公有領域。**只用旋律**:作詞者李臨秋(1909–1979)的歌詞仍受保護,只哼、只用樂器演奏,不唱、不顯示歌詞 | 音樂盒(207 病房的搖籃曲、育嬰室的音樂盒)、阿嬤的哼唱(真人哼聲取樣,閉口、無詞)、恐懼配樂床裡的音樂盒片段 |
| 《雨夜花》(1934) | 鄧雨賢 作曲 | 同上。**只用旋律**:作詞者周添旺(1911–1988)的歌詞仍受保護,只用樂器演奏 | 護理站錄音機的卡帶電子琴、收音機(都是合成的器樂) |
| 《天黑黑》 | 作者不詳(台灣傳統童謠) | 傳統民謠,無著作權人 | 空病房裡孩子的哼唱(真人童聲取樣)、育嬰區錄音帶裡大人唱的版本(Tè Khái-sū 的錄音,見下表) |
| 《火金姑》 | 作者不詳(台灣傳統童謠) | 傳統民謠 | 孩子的哼唱(真人童聲取樣) |
| 《思想起》 | 作者不詳(恆春傳統民謠) | 傳統民謠 | 收音機(大廣弦 + 月琴)、配樂片段 |
| 《丟丟銅仔》 | 作者不詳(宜蘭傳統民謠) | 傳統民謠 | 收音機 |
| 《桃花過渡》 | 作者不詳(傳統車鼓戲曲調) | 傳統民謠 | 收音機 |
| 《六月茉莉》 | 作者不詳(傳統民謠) | 傳統民謠 | 收音機、補給站的溫暖配樂床 |
| 《一隻鳥仔哮啾啾》 | 作者不詳(傳統民謠) | 傳統民謠 | 遠處出殯的西索米樂隊 |
| 〈豐原調〉 | 作者不詳(歌仔戲傳統曲調) | 傳統曲調;錄音本身為 CC0(見下表) | 收音機裡的老唱片(林茂賢老師示範演唱,只留唱的段落) |
| 北管風嗩吶短句、牽亡歌風哀歌、AM 1207 台呼、追逐/停電/恐懼/頭七配樂床 | 本專案原創 | 原創 | 錄音載不到時的北管替代、頭七、收音機台呼、配樂狀態 |


### 真人錄音(public/audio/folk/,`src/audio/vox.js`)

全部是單聲道 MP3(16~24 kHz、40~64 kbps,共約 1.2 MB),暖機完成後才在背景下載解碼。剪輯:裁切、單聲道、高通/低通、響度正規化、淡入淡出、循環交叉淡化;哼唱的取樣表另做了頻譜對齊、迴圈點(整數個週期)與音高拉平。每個檔案的 ID3 標籤也寫了來源、作者與授權。

| 檔案 | 來源作品 | 作者 / 典藏 | 授權 | 來源網址 | 用了哪一段、怎麼改 |
|---|---|---|---|---|---|
| `audio/folk/hum_ama_sheet.mp3`(阿嬤的哼唱) | Humming C D A for alexggqs | drotzruhn | CC0 | https://freesound.org/people/drotzruhn/sounds/439504/ | 前半段乾聲的 A3 / C4 / D4 長音各兩個 take(約 0:01.6~0:53.6 之間),頻譜對齊、做成迴圈取樣表 |
| 同上(吸氣聲) | Woman humming a nondescript tune | PSsoundproject(Wikimedia Commons) | CC0 | https://commons.wikimedia.org/wiki/File:Woman_humming_a_nondescript_tune.wav | 三個鼻子吸氣(0:04.9、0:09.3、0:13.9 起各約 0.45 秒) |
| `audio/folk/hum_kid_sheet.mp3`(孩子的哼唱) | Child Chops, Glitchy Sampler, Dry | f-r-a-g-i-l-e | CC0 | https://freesound.org/people/f-r-a-g-i-l-e/sounds/500743/ | 女童唱的 E4 G4 A4 B4 C5 D5 E5 單音(各 0.14~0.3 秒),音高拉平後用顆粒接長成約 1 秒的迴圈;一個吸氣取自上一列的 Commons 錄音 |
| `audio/folk/chant_longshan_a_loop.mp3`(太平間/納骨堂/禮拜堂的助念) | Mengjia Longshan Temple, Taipei - Chanting(2013) | Wu, Tsan-Cheng 吳燦政(radio aporee ::: maps,Taiwan SoundMap,檔名 SoundMap201305251) | CC BY 3.0(https://creativecommons.org/licenses/by/3.0/) | https://aporee.org/maps/ | 11:30.6~11:53.4,雙耳錄音取一耳,22.8 秒無縫循環(2 秒等功率交叉淡化) |
| `audio/folk/chant_longshan_b_loop.mp3`(同上) | Mengjia Longshan Temple - Chant Buddhist scriptures(2012) | Wu, Tsan-Cheng 吳燦政(radio aporee ::: maps,Taiwan SoundMap 20121103) | CC BY 3.0(https://creativecommons.org/licenses/by/3.0/) | https://archive.org/details/aporee_15924_18493 | 0:24.8~0:45.2,取一個聲道,20.4 秒無縫循環 |
| `audio/folk/chant_muyu_loop.mp3`(同上,有木魚) | buddhist-2.wav | xserra | CC BY 4.0(https://creativecommons.org/licenses/by/4.0/) | https://freesound.org/s/320270/ | 1:16.7~1:37.7(木魚五個四拍循環),混成單聲道、陷波濾掉 1845 Hz 的持續嘯音,無縫循環 |
| `audio/folk/beiguan_far_1.mp3`、`beiguan_far_2.mp3`、`beiguan_far_3.mp3`(戶外遠處的北管) | 〈什牌・倒旗〉,《內行與子弟:林阿春與賴木松的北管亂彈藝術世界》(彰化縣文化局,1999);嗩吶 邱火榮、鄭榮興,北鼓 賴木松 | 創作者 范揚坤;國家文化記憶庫 | CC BY 3.0 TW(https://creativecommons.org/licenses/by/3.0/tw/) | https://tcmb.culture.tw/zh-tw/detail?indexCode=Culture_Media&id=697685 | 三個自然起落的樂句:5:51.4~6:12.8、7:55.1~8:12.3、8:12.3~8:35.2;單聲道、低通 |
| `audio/folk/radio_fengyuan_sung.mp3`(收音機裡的老唱片) | 林茂賢老師示範演唱豐原調 | 林茂賢;臺中市政府文化局,國家文化記憶庫 | CC0 | https://tcmb.culture.tw/zh-tw/detail?indexCode=Culture_Media&id=666001 | 只留唱的段落(0:03.2~0:17.9、1:13.9~1:17.2、1:20.1~1:25.4),講解的口白全部去掉;遊戲裡再過 AM 收音機的窄頻、失真、轉速不穩與炒豆聲 |
| `audio/folk/tape_thinn_oo_oo.mp3`(育嬰區錄音帶裡大人唱的〈天黑黑〉) | Thinn-oo-oo.mp3 | Tè Khái-sū(Kaihsu Tai),Wikimedia Commons | **CC BY-SA 4.0**(https://creativecommons.org/licenses/by-sa/4.0/) | https://commons.wikimedia.org/wiki/File:Thinn-oo-oo.mp3 | 0:00.7~0:40.95,單聲道、高通/低通、響度正規化;遊戲裡再過卡帶的抖音、掉音與嘶聲 |

**CC BY-SA 4.0 的衍生物**:`audio/folk/tape_thinn_oo_oo.mp3` 是 "Thinn-oo-oo.mp3" by Tè Khái-sū (Kaihsu Tai) 的剪輯版,依原授權的「相同方式分享」條款,**這個剪輯過的檔案同樣以 CC BY-SA 4.0 釋出**(https://creativecommons.org/licenses/by-sa/4.0/)。這個條款只及於這個音檔本身,不及於遊戲的程式或其他素材。

宗教與喪葬的聲音(誦經、木魚、引魂鈴、牽亡歌、西索米)只在安靜時段以低音量、完整演出出現,間隔很長,不用於跳嚇或玩笑;誦經錄音不變調、不加速。
