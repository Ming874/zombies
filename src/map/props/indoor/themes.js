import { dressWard } from './th_ward.js';
import { dressCorridor, dressStairwell } from './th_common.js';
import { dressXray, dressCT, dressPharmacy, dressCafeteria, dressRehab, dressWaiting, dressER, dressChapel, dressLobby, dressSecurity } from './th_1f.js';
import { dressSurgery, dressICU, dressNursery, dressDelivery, dressPlayroom, dressPeds } from './th_2f.js';
import { dressDirector, dressOffice, dressPsychCell, dressMonitor, dressDorm } from './th_3f.js';
import { dressMorgue, dressAutopsy, dressArchive, dressLaundry, dressSupply } from './th_b1.js';

// theme → 擺設函式(29 個室內主題)
export const THEMES = {
  xray: dressXray, ct: dressCT, pharmacy: dressPharmacy, cafeteria: dressCafeteria, rehab: dressRehab, waiting: dressWaiting, er: dressER,
  chapel: dressChapel, lobby: dressLobby, security: dressSecurity, corridor: dressCorridor, stairwell: dressStairwell,
  ward: dressWard, surgery: dressSurgery, icu: dressICU, nursery: dressNursery, delivery: dressDelivery, playroom: dressPlayroom, peds_ward: dressPeds,
  director: dressDirector, office: dressOffice, psych_cell: dressPsychCell, monitor: dressMonitor, dorm: dressDorm,
  morgue: dressMorgue, autopsy: dressAutopsy, archive: dressArchive, laundry: dressLaundry, supply: dressSupply,
};
