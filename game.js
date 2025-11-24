// === Utility ===
const rand = (a,b)=>Math.random()*(b-a)+a;
const clamp = (v, a, b)=>Math.max(a, Math.min(b, v));

// Wrap-around function for pacman-style map
function wrapPos(x, y, width, height) {
  let wx = x % width;
  let wy = y % height;
  if(wx < 0) wx += width;
  if(wy < 0) wy += height;
  return {x: wx, y: wy};
}

// === Canvas setup ===
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
function resize(){ canvas.width = innerWidth; canvas.height = innerHeight; }
addEventListener('resize', resize, {passive:true});
resize();

// === Performance optimizations ===
let lastHUDUpdate = 0;
const HUD_UPDATE_INTERVAL = 100; // Update HUD every 100ms instead of every frame

// Helper function to render object with wrap-around (optimized - only renders visible copies)
// This function will be defined after state is initialized
let renderWithWrapAround;

// === Game state (single class: Chrobry) ===
let state = JSON.parse(localStorage.getItem('chrobry_save_v2')) || {
  pos: {x:3000, y:3000}, vel: {x:0, y:0}, facing: {x:1, y:0},
  hp: 100, hpMax: 100, mp: 50, mpMax: 50,
  level: 1, xp: 0, gold: 0,
  speed: 2.8,
  attack: { cooldown: 0, cdMelee: 400, cdRanged: 300 },
  meleeDamage: 18, // Siła ataku wręcz
  rangedDamage: 16, // Siła ataku projectile
  levelUpPoints: 0, // Punkty do wykorzystania przy levelowaniu
  meleeSpin: null,
  enemies: [], pickups: [], projectiles: [],
  knockback: {x:0, y:0, t:0}, // Knockback animation
  lastHitTime: 0, // Cooldown for taking damage
  barAnimations: { hp: false, mp: false, xp: false }, // Animacje pasków
  enemyKnockback: {}, // Knockback dla przeciwników {enemyId: {x, y, t}}
  world: { width: 6000, height: 6000 },
  paused: false,
    // New: inventory and quests
    inventory: { apples: 0, meat: 0, seeds: 0, mead: 0, wood: 0 },
    plantingMode: false, // Mode for planting trees
    interactionMode: false, // Mode for interacting with NPCs
    quests: { tree: false, son: false, book: false },
  // New: NPCs
  woman: { x: 3500, y: 3500, t: 0, givenApples: 0, givenMeat: 0 },
  // New: Children
  children: [],
  wizard: { x: 2500, y: 2500, t: 0, givenMeat: 0, givenApples: 0, givenGold: 0 },
  // New: trees and home
  trees: [],
  home: { x: 3000, y: 2800 } // Domek nad graczem na starcie
};

// Initialize missing stats for old saves
if(state.meleeDamage === undefined) state.meleeDamage = 18;
if(state.rangedDamage === undefined) state.rangedDamage = 16;
if(state.levelUpPoints === undefined) state.levelUpPoints = 0;

  // Initialize trees
  if(state.trees.length === 0) {
    for(let i = 0; i < 60; i++) {
      state.trees.push({
        x: rand(0, state.world.width),
        y: rand(0, state.world.height),
        lastDrop: 0,
        hp: Math.round(rand(2, 3)), // 2-3 uderzenia
        hpMax: Math.round(rand(2, 3)),
        id: Math.random().toString(36).slice(2)
      });
    }
  } else {
    // Initialize HP for existing trees (for old saves)
    for(const tree of state.trees) {
      if(tree.hp === undefined) {
        tree.hp = Math.round(rand(2, 3));
        tree.hpMax = tree.hp;
      }
    }
  }

// === Collision radii ===
const COLLIDE = { playerR: 20, enemyR: 18 };

// Enemies & pickups
// === Enemy Definitions ===
// Każdy przeciwnik ma:
// - dropCount: [min, max] - ile przedmiotów może dropnąć (słaby: 1-2, średni: 2-3, mocny: 3-5)
// - drops: lista możliwych dropów z szansą (chance: 0.0-1.0) i wartością
// Aby dodać nowy typ dropu:
// 1. Dodaj nowy typ do PICKUPS (jeśli nie istnieje)
// 2. Dodaj {kind:'nowyTyp', chance:0.X, value:Y} do listy drops odpowiedniego przeciwnika
const ENEMIES = [
  {
    name:'Wilk', 
    emoji:'🐺', 
    hp:30, 
    atk:8, 
    speed:1.6, 
    range:20, 
    dropCount:[1,2], // Słaby - 1-2 dropy
    drops:[
      {kind:'xp', chance:1.0, value:[10,20]}, // Zawsze XP
      {kind:'meat', chance:0.6, value:1},
      {kind:'apple', chance:0.3, value:1},
      {kind:'mead', chance:0.2, value:1},
      {kind:'seed', chance:0.1, value:1},
      {kind:'gold', chance:0.8, value:[1,5]}
    ]
  },
  {
    name:'Dzika świnia', 
    emoji:'🐗', 
    hp:40, 
    atk:10, 
    speed:1.4, 
    range:16, 
    dropCount:[2,3], // Średni - 2-3 dropy
    drops:[
      {kind:'xp', chance:1.0, value:[15,25]}, // Zawsze XP
      {kind:'meat', chance:0.7, value:1},
      {kind:'apple', chance:0.4, value:1},
      {kind:'mead', chance:0.3, value:1},
      {kind:'seed', chance:0.15, value:1},
      {kind:'gold', chance:0.9, value:[1,6]}
    ]
  },
  {
    name:'Żmija', 
    emoji:'🐍', 
    hp:20, 
    atk:6, 
    speed:1.8, 
    range:14, 
    dropCount:[1,2], // Słaby - 1-2 dropy
    drops:[
      {kind:'xp', chance:1.0, value:[8,15]}, // Zawsze XP
      {kind:'meat', chance:0.5, value:1},
      {kind:'apple', chance:0.25, value:1},
      {kind:'mead', chance:0.15, value:1},
      {kind:'seed', chance:0.08, value:1},
      {kind:'gold', chance:0.7, value:[1,4]}
    ]
  },
  {
    name:'Trup', 
    emoji:'🧟', 
    hp:50, 
    atk:12, 
    speed:1.2, 
    range:18, 
    dropCount:[3,5], // Mocny - 3-5 dropów
    drops:[
      {kind:'xp', chance:1.0, value:[20,35]}, // Zawsze XP
      {kind:'meat', chance:0.8, value:1},
      {kind:'apple', chance:0.5, value:1},
      {kind:'mead', chance:0.4, value:1},
      {kind:'seed', chance:0.2, value:1},
      {kind:'gold', chance:1.0, value:[2,9]} // Zawsze złoto
    ]
  },
];
const PICKUPS = {
  meat: { emoji:'🍖', kind:'hp', value:[15,25] },
  mead: { emoji:'🍾', kind:'mp', value:[12,22] },
  gold: { emoji:'🪙', kind:'gold', value:[1,4] },
  xp:   { emoji:'✨', kind:'xp', value:[12,22] },
  apple: { emoji:'🍎', kind:'apple', value:1 },
  seed: { emoji:'🌱', kind:'seed', value:1 },
  wood: { emoji:'🪵', kind:'wood', value:1 },
};

// XP requirement curve
const xpReq = lvl => Math.floor(100 + (lvl-1)*(lvl-1)*35);

// === Input ===
let pointer = {active:false,id:null,x:0,y:0,justTapped:false};
let mousePos = {x:0, y:0};
const cam = {x:state.pos.x, y:state.pos.y};
function worldToScreen(wx, wy){ return { x: wx - cam.x + canvas.width/2, y: wy - cam.y + canvas.height/2 }; }
function screenToWorld(sx, sy){ return { x: sx + cam.x - canvas.width/2, y: sy + cam.y - canvas.height/2 }; }

canvas.addEventListener('pointerdown', (e)=>{ canvas.setPointerCapture(e.pointerId); pointer.active=true; pointer.id=e.pointerId; pointer.x=e.clientX; pointer.y=e.clientY; pointer.justTapped=true; });
canvas.addEventListener('pointermove', (e)=>{ if(pointer.active&&e.pointerId===pointer.id){ pointer.x=e.clientX; pointer.y=e.clientY; } mousePos.x=e.clientX; mousePos.y=e.clientY; });
canvas.addEventListener('pointerup', (e)=>{ if(e.pointerId===pointer.id){ pointer.active=false; pointer.id=null; state.vel.x=0; state.vel.y=0; }});

// Mouse click for arrow or planting
canvas.addEventListener('click', (e)=>{
  if(state.paused) return;
  const w = screenToWorld(e.clientX, e.clientY);
  
  // Planting mode - plant tree at clicked location
  if(state.plantingMode && state.inventory.seeds > 0) {
    state.trees.push({
      x: w.x,
      y: w.y,
      lastDrop: 0,
      id: Math.random().toString(36).slice(2)
    });
    state.inventory.seeds--;
    toast('🌳 Zasadzono drzewo!');
    updateInventory();
    if(!state.quests.tree) {
      state.quests.tree = true;
      toast('🎉 Ukończono quest: Zasadź drzewo!');
      updateHUD();
    }
    return;
  }
  
  // Interaction mode - check if clicking on NPCs
  if(state.interactionMode) {
    // Check woman
    let dx = state.woman.x - w.x, dy = state.woman.y - w.y;
    if(Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
    if(Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
    if(Math.hypot(dx, dy) < 50) {
      state.paused = true;
      updateWomanDialog();
      womanModal.style.display = 'flex';
      return;
    }
    
    // Check wizard
    dx = state.wizard.x - w.x;
    dy = state.wizard.y - w.y;
    if(Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
    if(Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
    if(Math.hypot(dx, dy) < 50) {
      state.paused = true;
      updateWizardDialog();
      wizardModal.style.display = 'flex';
      return;
    }
    
    // If clicked but not on NPC, just exit interaction mode
    toggleInteractionMode();
    return;
  }
  
  // Check if clicking on seed pickup to collect
  let clickedSeed = null;
  for(let i = state.pickups.length - 1; i >= 0; i--) {
    const p = state.pickups[i];
    if(p.kind === 'seed') {
      let dx = p.x - w.x, dy = p.y - w.y;
      if(Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
      if(Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
      const dist = Math.hypot(dx, dy);
      if(dist < 40) {
        clickedSeed = p;
        break;
      }
    }
  }
  if(clickedSeed) {
    // Collect seed to inventory
    state.inventory.seeds++;
    const idx = state.pickups.findIndex(p => p === clickedSeed);
    if(idx >= 0) state.pickups.splice(idx, 1);
    toast('🌱 Zebrano nasiono!');
    updateInventory();
    return;
  }
  
  // Otherwise fire arrow
  let target=null; 
  for(const enemy of state.enemies){ 
    let dx = enemy.x - w.x, dy = enemy.y - w.y;
    if(Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
    if(Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
    if(Math.hypot(dx, dy) < 28){ 
      target=enemy; 
      break; 
    } 
  }
  fireArrow(target || w);
});

// Keyboard shortcuts
let keys = {};
addEventListener('keydown', (e)=>{
  keys[e.key.toLowerCase()] = true;
  if(e.key === ' ' || e.key === 'Space') {
    e.preventDefault();
    startMeleeSpin();
  }
  if(e.key.toLowerCase() === 'q') {
    e.preventDefault();
    toggleQuestLog();
  }
  if(e.key.toLowerCase() === 'e') {
    e.preventDefault();
    toggleInventory();
  }
  if(e.key.toLowerCase() === 'r') {
    e.preventDefault();
    toggleStats();
  }
  if(e.key.toLowerCase() === 'f') {
    e.preventDefault();
    toggleInteractionMode();
  }
  if(e.key === 'Escape') {
    if(state.interactionMode) {
      toggleInteractionMode();
    }
  }
});
addEventListener('keyup', (e)=>{
  keys[e.key.toLowerCase()] = false;
});

// === HUD refs ===
const hpFill = document.getElementById('hpFill');
const mpFill = document.getElementById('mpFill');
const xpFill = document.getElementById('xpFill');
const hpNum = document.getElementById('hpNum');
const mpNum = document.getElementById('mpNum');
const xpNum = document.getElementById('xpNum');
const lvlNum = document.getElementById('lvlNum');
const goldEl = document.getElementById('gold');

  function updateHUD(force = false){
    const now = performance.now();
    if(!force && now - lastHUDUpdate < HUD_UPDATE_INTERVAL) return;
    lastHUDUpdate = now;
    
    const hpPercent = (state.hp/state.hpMax)*100;
    const mpPercent = (state.mp/state.mpMax)*100;
    const need = xpReq(state.level);
    const prog = clamp(state.xp/need, 0, 1);
    const xpPercent = prog*100;
    
    // Animate bars only if not already animating
    if(!state.barAnimations.hp) {
      hpFill.style.width = `${hpPercent}%`;
    }
    if(!state.barAnimations.mp) {
      mpFill.style.width = `${mpPercent}%`;
    }
    if(!state.barAnimations.xp) {
      xpFill.style.width = `${xpPercent}%`;
    }
    
    hpNum.textContent = `${Math.floor(state.hp)}/${state.hpMax}`;
    mpNum.textContent = `${Math.floor(state.mp)}/${state.mpMax}`;
    xpNum.textContent = `${state.xp}/${need}`;
    lvlNum.textContent = state.level;
    goldEl.textContent = state.gold;
    updateQuestLog();
  }

function animateBar(barType, fromPercent, toPercent) {
  const bar = barType === 'hp' ? hpFill : (barType === 'mp' ? mpFill : xpFill);
  const barContainer = barType === 'hp' ? hpFill.parentElement : (barType === 'mp' ? mpFill.parentElement : xpFill.parentElement);
  
  state.barAnimations[barType] = true;
  barContainer.classList.add('bar-animating');
  
  // Set start width
  bar.style.width = `${fromPercent}%`;
  bar.style.transition = 'width 0.4s ease-out';
  
  // Force reflow
  bar.offsetHeight;
  
  // Animate to target
  setTimeout(() => {
    bar.style.width = `${toPercent}%`;
    setTimeout(() => {
      state.barAnimations[barType] = false;
      barContainer.classList.remove('bar-animating');
      bar.style.transition = '';
    }, 400);
  }, 10);
}

// === Quest Log ===
const questModal = document.getElementById('questModal');
const quest1Status = document.getElementById('quest1Status');
const quest2Status = document.getElementById('quest2Status');
const quest3Status = document.getElementById('quest3Status');

function updateQuestLog() {
  quest1Status.textContent = state.quests.tree ? '✓ Ukończone' : 'W toku';
  quest1Status.style.color = state.quests.tree ? '#4ade80' : '#fbbf24';
  quest2Status.textContent = state.quests.son ? '✓ Ukończone' : 'W toku';
  quest2Status.style.color = state.quests.son ? '#4ade80' : '#fbbf24';
  quest3Status.textContent = state.quests.book ? '✓ Ukończone' : 'W toku';
  quest3Status.style.color = state.quests.book ? '#4ade80' : '#fbbf24';
}

function toggleQuestLog(){
  if(questModal.style.display === 'flex') {
    state.paused = false;
    questModal.style.display = 'none';
  } else {
    state.paused = true;
    questModal.style.display = 'flex';
  }
}

// Quest button in header
document.getElementById('questBtn').addEventListener('click', ()=>{
  toggleQuestLog();
});

document.getElementById('closeQuestBtn').addEventListener('click', ()=>{
  state.paused = false;
  questModal.style.display = 'none';
});

// === Inventory Modal ===
const inventoryModal = document.getElementById('inventoryModal');
const invApples = document.getElementById('invApples');
const invMeat = document.getElementById('invMeat');
const invMead = document.getElementById('invMead');
const invSeeds = document.getElementById('invSeeds');
const plantingModeIndicator = document.getElementById('plantingModeIndicator');

function updateInventory() {
  invApples.textContent = state.inventory.apples;
  invMeat.textContent = state.inventory.meat;
  invMead.textContent = state.inventory.mead;
  invSeeds.textContent = state.inventory.seeds;
  plantingModeIndicator.style.display = state.plantingMode ? 'block' : 'none';
}

function toggleInventory(){
  if(inventoryModal.style.display === 'flex') {
    state.paused = false;
    state.plantingMode = false; // Disable planting mode when closing
    inventoryModal.style.display = 'none';
  } else {
    state.paused = true;
    updateInventory();
    inventoryModal.style.display = 'flex';
  }
}

// Inventory button in header
document.getElementById('inventoryBtn').addEventListener('click', ()=>{
  toggleInventory();
});

// Consume apple
document.getElementById('invAppleClick').addEventListener('click', ()=>{
  if(state.inventory.apples > 0) {
    const btn = document.getElementById('invAppleClick');
    const oldHP = state.hp;
    
    // Animation
    btn.style.animation = 'consumeApple 0.6s ease-in-out';
    setTimeout(() => { btn.style.animation = ''; }, 600);
    
    state.inventory.apples--;
    state.hp = clamp(state.hp + 1, 0, state.hpMax);
    animateBar('hp', (oldHP/state.hpMax)*100, (state.hp/state.hpMax)*100);
    toast('🍎 +1HP');
    updateInventory();
    updateHUD();
    // 10% chance to drop seed
    if(Math.random() < 0.1) {
      state.inventory.seeds++;
      toast('🌱 Pestka!');
      updateInventory();
    }
  }
});

// Consume meat
document.getElementById('invMeatClick').addEventListener('click', ()=>{
  if(state.inventory.meat > 0) {
    const btn = document.getElementById('invMeatClick');
    const oldHP = state.hp;
    const heal = Math.round(rand(15, 25));
    
    // Animation
    btn.style.animation = 'consumeMeat 0.5s ease-in-out';
    setTimeout(() => { btn.style.animation = ''; }, 500);
    
    state.inventory.meat--;
    state.hp = clamp(state.hp + heal, 0, state.hpMax);
    animateBar('hp', (oldHP/state.hpMax)*100, (state.hp/state.hpMax)*100);
    toast(`🍖 +${heal}HP`);
    updateInventory();
    updateHUD();
  }
});

// Consume mead
document.getElementById('invMeadClick').addEventListener('click', ()=>{
  if(state.inventory.mead > 0) {
    const btn = document.getElementById('invMeadClick');
    const oldMP = state.mp;
    const mana = Math.round(rand(12, 22));
    
    // Animation
    btn.style.animation = 'consumeMead 0.4s ease-in-out';
    setTimeout(() => { btn.style.animation = ''; }, 400);
    
    state.inventory.mead--;
    state.mp = clamp(state.mp + mana, 0, state.mpMax);
    animateBar('mp', (oldMP/state.mpMax)*100, (state.mp/state.mpMax)*100);
    toast(`🍾 +${mana} Mana`);
    updateInventory();
    updateHUD();
  }
});

// Activate planting mode
document.getElementById('invSeedClick').addEventListener('click', ()=>{
  if(state.inventory.seeds > 0) {
    state.plantingMode = !state.plantingMode; // Toggle planting mode
    if(state.plantingMode) {
      toast('🌱 Tryb zasadzania aktywny - kliknij na mapie');
    } else {
      toast('🌱 Tryb zasadzania wyłączony');
    }
    updateInventory();
  }
});

document.getElementById('closeInventoryBtn').addEventListener('click', ()=>{
  state.paused = false;
  state.plantingMode = false; // Disable planting mode when closing
  inventoryModal.style.display = 'none';
});

// === Stats Modal ===
const statsModal = document.getElementById('statsModal');
const statsHP = document.getElementById('statsHP');
const statsHPMax = document.getElementById('statsHPMax');
const statsMP = document.getElementById('statsMP');
const statsMPMax = document.getElementById('statsMPMax');
const statsLevel = document.getElementById('statsLevel');
const statsSpeed = document.getElementById('statsSpeed');
const statsMeleeCD = document.getElementById('statsMeleeCD');
const statsMeleeDmg = document.getElementById('statsMeleeDmg');
const statsRangedCD = document.getElementById('statsRangedCD');
const statsRangedDmg = document.getElementById('statsRangedDmg');

function updateStats() {
  statsHP.textContent = Math.floor(state.hp);
  statsHPMax.textContent = state.hpMax;
  statsMP.textContent = Math.floor(state.mp);
  statsMPMax.textContent = state.mpMax;
  statsLevel.textContent = state.level;
  statsSpeed.textContent = state.speed.toFixed(1);
  statsMeleeCD.textContent = Math.round(state.attack.cdMelee);
  statsMeleeDmg.textContent = state.meleeDamage;
  statsRangedCD.textContent = Math.round(state.attack.cdRanged);
  statsRangedDmg.textContent = state.rangedDamage;
}

function toggleStats(){
  if(statsModal.style.display === 'flex') {
    state.paused = false;
    statsModal.style.display = 'none';
  } else {
    state.paused = true;
    updateStats();
    statsModal.style.display = 'flex';
  }
}

// Stats button in header
document.getElementById('statsBtn').addEventListener('click', ()=>{
  toggleStats();
});

document.getElementById('closeStatsBtn').addEventListener('click', ()=>{
  state.paused = false;
  statsModal.style.display = 'none';
});

// === Interaction Mode ===
const interactBtn = document.getElementById('interactBtn');
function toggleInteractionMode(){
  state.interactionMode = !state.interactionMode;
  if(state.interactionMode) {
    interactBtn.style.background = 'rgba(76,222,128,0.3)';
    interactBtn.style.borderColor = 'rgba(76,222,128,0.6)';
    toast('💬 Tryb interakcji aktywny - kliknij na NPC');
  } else {
    interactBtn.style.background = '';
    interactBtn.style.borderColor = '';
    toast('💬 Tryb interakcji wyłączony');
  }
}

// Interaction button in footer
interactBtn.addEventListener('click', ()=>{
  toggleInteractionMode();
});

// === Woman Dialog ===
const womanModal = document.getElementById('womanModal');
const womanApples = document.getElementById('womanApples');
const womanMeat = document.getElementById('womanMeat');

function updateWomanDialog() {
  womanApples.textContent = state.woman.givenApples;
  womanMeat.textContent = state.woman.givenMeat;
}

function spawnChild() {
  const isBoy = Math.random() < 0.5; // 50% chance
  const child = {
    x: state.woman.x,
    y: state.woman.y,
    emoji: isBoy ? '👶' : '👧',
    gender: isBoy ? 'boy' : 'girl',
    speed: 2.0,
    reachedPlayer: false, // Has reached player for the first time
    lastAttack: 0,
    id: Math.random().toString(36).slice(2)
  };
  state.children.push(child);
  toast(isBoy ? '👶 Urodził się syn!' : '👧 Urodziła się córka!');
}

document.getElementById('giveAppleBtn').addEventListener('click', ()=>{
  if(state.inventory.apples > 0 && state.woman.givenApples < 50) {
    state.inventory.apples--;
    state.woman.givenApples++;
    updateWomanDialog();
    if(state.woman.givenApples >= 50 && state.woman.givenMeat >= 50) {
      state.quests.son = true;
      spawnChild();
      toast('🎉 Ukończono quest: Spłodź syna!');
      updateHUD();
    }
  }
});

document.getElementById('giveMeatBtn').addEventListener('click', ()=>{
  if(state.inventory.meat > 0 && state.woman.givenMeat < 50) {
    state.inventory.meat--;
    state.woman.givenMeat++;
    updateWomanDialog();
    if(state.woman.givenApples >= 50 && state.woman.givenMeat >= 50) {
      state.quests.son = true;
      spawnChild();
      toast('🎉 Ukończono quest: Spłodź syna!');
      updateHUD();
    }
  }
});

document.getElementById('closeWomanBtn').addEventListener('click', ()=>{
  state.paused = false;
  womanModal.style.display = 'none';
});

// === Wizard Dialog ===
const wizardModal = document.getElementById('wizardModal');
const wizardMeat = document.getElementById('wizardMeat');
const wizardApples = document.getElementById('wizardApples');
const wizardGold = document.getElementById('wizardGold');

function updateWizardDialog() {
  wizardMeat.textContent = state.wizard.givenMeat;
  wizardApples.textContent = state.wizard.givenApples;
  wizardGold.textContent = state.wizard.givenGold;
}

document.getElementById('wizardGiveMeatBtn').addEventListener('click', ()=>{
  if(state.inventory.meat > 0 && state.wizard.givenMeat < 100) {
    state.inventory.meat--;
    state.wizard.givenMeat++;
    updateWizardDialog();
    updateHUD();
    if(state.wizard.givenMeat >= 100 && state.wizard.givenApples >= 100 && state.wizard.givenGold >= 100) {
      toast('✅ Masz wszystkie zasoby! Możesz napisać książkę.');
    }
  }
});

document.getElementById('wizardGiveAppleBtn').addEventListener('click', ()=>{
  if(state.inventory.apples > 0 && state.wizard.givenApples < 100) {
    state.inventory.apples--;
    state.wizard.givenApples++;
    updateWizardDialog();
    updateHUD();
    if(state.wizard.givenMeat >= 100 && state.wizard.givenApples >= 100 && state.wizard.givenGold >= 100) {
      toast('✅ Masz wszystkie zasoby! Możesz napisać książkę.');
    }
  }
});

document.getElementById('wizardGiveGoldBtn').addEventListener('click', ()=>{
  if(state.gold > 0 && state.wizard.givenGold < 100) {
    state.gold--;
    state.wizard.givenGold++;
    updateWizardDialog();
    updateHUD();
    if(state.wizard.givenMeat >= 100 && state.wizard.givenApples >= 100 && state.wizard.givenGold >= 100) {
      toast('✅ Masz wszystkie zasoby! Możesz napisać książkę.');
    }
  }
});

document.getElementById('wizardCompleteBtn').addEventListener('click', ()=>{
  if(state.wizard.givenMeat >= 100 && state.wizard.givenApples >= 100 && state.wizard.givenGold >= 100) {
    state.quests.book = true;
    toast('🎉 Ukończono quest: Napisz książkę!');
    state.paused = false;
    wizardModal.style.display = 'none';
    updateHUD();
  } else {
    toast('❌ Nie masz wystarczających zasobów!');
  }
});

document.getElementById('closeWizardBtn').addEventListener('click', ()=>{
  state.paused = false;
  wizardModal.style.display = 'none';
});

// === Spawning ===
function spawnEnemy(){
  const e = ENEMIES[Math.floor(Math.random()*ENEMIES.length)];
  const ang = rand(0, Math.PI*2), dist = rand(400, 900);
  const ex = clamp(state.pos.x + Math.cos(ang)*dist, 0, state.world.width);
  const ey = clamp(state.pos.y + Math.sin(ang)*dist, 0, state.world.height);
  state.enemies.push({ ...e, x:ex, y:ey, hp:e.hp, t:0, id:Math.random().toString(36).slice(2) });
}
function spawnPickup(kind, x, y, value, direction){
  const spec = PICKUPS[kind];
  if(!spec) {
    console.warn(`Unknown pickup kind: ${kind}`);
    return; // Don't spawn if kind doesn't exist
  }
  // Check collision with existing pickups
  const pickupRadius = 20;
  let attempts = 0;
  let finalX = x, finalY = y;
  
  // Try to find a free spot
  while(attempts < 20) {
    let collides = false;
    for(const existing of state.pickups) {
      let dx = existing.x - finalX, dy = existing.y - finalY;
      if(Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
      if(Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
      if(Math.hypot(dx, dy) < pickupRadius * 2) {
        collides = true;
        break;
      }
    }
    if(!collides) break;
    finalX = x + rand(-30, 30);
    finalY = y + rand(-30, 30);
    attempts++;
  }
  
  // Physics animation: throw forward and up with bounces (only if direction is provided)
  const hasDirection = direction !== undefined;
  let vx = 0, vy = 0, bouncing = false, bounceCount = 0, groundY = finalY;
  
  if(hasDirection) {
    const dir = direction;
    const len = Math.hypot(dir.x, dir.y) || 1;
    vx = (dir.x / len) * 3.5; // Initial horizontal velocity
    vy = -4.5; // Initial upward velocity (negative Y is up)
    bouncing = true;
    bounceCount = 0;
  }
  
  // Use provided value, or generate from spec, or default to 1
  let finalValue = value;
  if(finalValue === undefined || finalValue === null) {
    if(spec.value) {
      if(Array.isArray(spec.value)) {
        finalValue = Math.round(rand(spec.value[0], spec.value[1]));
      } else {
        finalValue = spec.value;
      }
    } else {
      finalValue = 1;
    }
  }
  
  state.pickups.push({ 
    kind, 
    x: finalX, 
    y: finalY, 
    value: finalValue,
    vx, vy, // Physics velocity
    bouncing, // Is still bouncing
    bounceCount, // Number of bounces
    groundY // Will be set when it stops bouncing
  });
}
function spawnInitial(){
  for(let i=0;i<28;i++) spawnEnemy();
  for(let i=0;i<40;i++){
    spawnPickup(Math.random()<.5?'meat':'mead', rand(0,state.world.width), rand(0,state.world.height));
  }
  for(let i=0;i<40;i++) spawnPickup('gold', rand(0,state.world.width), rand(0,state.world.height), Math.round(rand(1,4)));
}

// === Combat ===
function startMeleeSpin(){
  if(state.attack.cooldown>0 || state.paused) return;
  state.attack.cooldown = state.attack.cdMelee;
  const startAngle = rand(0, Math.PI*2); // Random starting angle around player
  state.meleeSpin = { t:0, dur:450, hit:new Set(), startAngle }; // 450 ms pełne okrążenie (szybszy)
}

function fireArrow(target){
  if(state.attack.cooldown>0 || state.paused) return;
  if(state.mp < 6) return; // koszt many
  const oldMP = state.mp;
  state.mp = clamp(state.mp-6, 0, state.mpMax);
  animateBar('mp', (oldMP/state.mpMax)*100, (state.mp/state.mpMax)*100);
  state.attack.cooldown = state.attack.cdRanged;
  let ax, ay;
  if(target && target.x !== undefined && target.y !== undefined) {
    // target is enemy or world position
    ax = target.x - state.pos.x;
    ay = target.y - state.pos.y;
    // Handle wrap-around distance
    let dx = ax, dy = ay;
    if(Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
    if(Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
    ax = dx; ay = dy;
  } else {
    // use facing direction
    ax = state.facing.x;
    ay = state.facing.y;
  }
  const len = Math.hypot(ax, ay) || 1; 
  const vx = (ax/len)*6.0; 
  const vy = (ay/len)*6.0;
  state.projectiles.push({ x:state.pos.x, y:state.pos.y, vx, vy, ttl: 6000, dmg: state.rangedDamage, emoji:'🏹' });
}

function killEnemy(e){
  // Znajdź bazową definicję przeciwnika
  const enemyDef = ENEMIES.find(en => en.name === e.name || en.emoji === e.emoji);
  if(!enemyDef) {
    // Fallback dla starych przeciwników
    const dropDir1 = {x: rand(-0.8, 0.8), y: -0.5};
    const dropDir2 = {x: rand(-0.8, 0.8), y: -0.5};
    spawnPickup('meat', e.x, e.y, undefined, dropDir1);
    spawnPickup('xp', e.x, e.y, Math.round(rand(10,20)), dropDir2);
    const idx = state.enemies.findIndex(x=>x===e); if(idx>=0) state.enemies.splice(idx,1);
    setTimeout(spawnEnemy, 500);
    return;
  }
  
  // Losuj ile dropów
  const dropCount = Math.round(rand(enemyDef.dropCount[0], enemyDef.dropCount[1]));
  const droppedItems = [];
  
  // Zbierz wszystkie przedmioty które mają być dropnięte
  for(const drop of enemyDef.drops) {
    if(Math.random() < drop.chance) {
      // Use drop.value if it's a number, otherwise use PICKUPS default value
      let value = drop.value;
      if(typeof value === 'number') {
        // Use the number as-is (e.g., for apples, meat, seeds, mead count)
        value = value;
      } else if(Array.isArray(value)) {
        // Use the range (e.g., for XP, gold)
        value = Math.round(rand(value[0], value[1]));
      } else {
        // If no value specified, use PICKUPS default
        const pickupSpec = PICKUPS[drop.kind];
        if(pickupSpec && pickupSpec.value) {
          if(Array.isArray(pickupSpec.value)) {
            value = Math.round(rand(pickupSpec.value[0], pickupSpec.value[1]));
          } else {
            value = pickupSpec.value;
          }
        } else {
          value = 1;
        }
      }
      droppedItems.push({kind: drop.kind, value});
    }
  }
  
  // Jeśli nie ma żadnych dropów (nie powinno się zdarzyć, ale na wszelki wypadek)
  if(droppedItems.length === 0) {
    // Zawsze dropnij przynajmniej XP
    droppedItems.push({kind: 'xp', value: Math.round(rand(10,20))});
  }
  
  // Ogranicz liczbę dropów do dropCount, ale zawsze zostaw XP i gold jeśli są
  const xpDrop = droppedItems.find(d => d.kind === 'xp');
  const goldDrop = droppedItems.find(d => d.kind === 'gold');
  const otherDrops = droppedItems.filter(d => d.kind !== 'xp' && d.kind !== 'gold');
  
  // Zawsze dropnij XP i gold (jeśli są)
  const finalDrops = [];
  if(xpDrop) finalDrops.push(xpDrop);
  if(goldDrop) finalDrops.push(goldDrop);
  
  // Dodaj pozostałe dropy do limitu
  const remainingSlots = Math.max(0, dropCount - finalDrops.length);
  const shuffled = otherDrops.sort(() => Math.random() - 0.5);
  finalDrops.push(...shuffled.slice(0, remainingSlots));
  
  // Spawnuj dropy z różnymi kierunkami
  for(let i = 0; i < finalDrops.length; i++) {
    const angle = (i / finalDrops.length) * Math.PI * 2;
    const dropDir = {
      x: Math.cos(angle) * 0.8 + rand(-0.2, 0.2),
      y: Math.sin(angle) * 0.8 - 0.5
    };
    spawnPickup(finalDrops[i].kind, e.x, e.y, finalDrops[i].value, dropDir);
  }
  
  // remove
  const idx = state.enemies.findIndex(x=>x===e); if(idx>=0) state.enemies.splice(idx,1);
  // kolejny przeciwnik za chwilę
  setTimeout(spawnEnemy, 500);
}

// === XP / Level ===
function gainXP(v){
  let need = xpReq(state.level);
  const oldXP = state.xp;
  const oldPercent = (oldXP/need)*100;
  state.xp += v;
  if(state.xp >= need){
    state.level++;
    state.xp = 0;
    animateBar('xp', oldPercent, 0);
    openLevelUp();
  } else {
    const newPercent = (state.xp/need)*100;
    animateBar('xp', oldPercent, newPercent);
  }
}

// === Level Up Modal ===
const levelUpModal = document.getElementById('levelUpModal');
const lvlUpTo = document.getElementById('lvlUpTo');
const levelUpPoints = document.getElementById('levelUpPoints');
const upHPValue = document.getElementById('upHPValue');
const upMPValue = document.getElementById('upMPValue');
const upSpeedValue = document.getElementById('upSpeedValue');
const upMeleeSpeedValue = document.getElementById('upMeleeSpeedValue');
const upMeleeDmgValue = document.getElementById('upMeleeDmgValue');
const upRangedSpeedValue = document.getElementById('upRangedSpeedValue');
const upRangedDmgValue = document.getElementById('upRangedDmgValue');

function updateLevelUpModal() {
  levelUpPoints.textContent = state.levelUpPoints;
  upHPValue.textContent = state.hpMax;
  upMPValue.textContent = state.mpMax;
  upSpeedValue.textContent = state.speed.toFixed(1);
  upMeleeSpeedValue.textContent = Math.round(state.attack.cdMelee) + 'ms';
  upMeleeDmgValue.textContent = state.meleeDamage;
  upRangedSpeedValue.textContent = Math.round(state.attack.cdRanged) + 'ms';
  upRangedDmgValue.textContent = state.rangedDamage;
  
  // Disable buttons if no points
  const buttons = ['upHP', 'upMP', 'upSpeed', 'upMeleeSpeed', 'upMeleeDmg', 'upRangedSpeed', 'upRangedDmg'];
  buttons.forEach(id => {
    const btn = document.getElementById(id);
    btn.disabled = state.levelUpPoints <= 0;
    btn.style.opacity = state.levelUpPoints <= 0 ? '0.5' : '1';
  });
}

function spendLevelUpPoint() {
  if(state.levelUpPoints > 0) {
    state.levelUpPoints--;
    updateLevelUpModal();
    if(state.levelUpPoints <= 0) {
      closeLevelUp();
    }
  }
}

document.getElementById('upHP').addEventListener('click', ()=>{
  if(state.levelUpPoints > 0) {
    state.hpMax = Math.floor(state.hpMax*1.1);
    state.hp = state.hpMax;
    spendLevelUpPoint();
  }
});
document.getElementById('upMP').addEventListener('click', ()=>{
  if(state.levelUpPoints > 0) {
    state.mpMax = Math.floor(state.mpMax*1.1);
    state.mp = state.mpMax;
    spendLevelUpPoint();
  }
});
document.getElementById('upSpeed').addEventListener('click', ()=>{
  if(state.levelUpPoints > 0) {
    state.speed = state.speed*1.1;
    spendLevelUpPoint();
  }
});
document.getElementById('upMeleeSpeed').addEventListener('click', ()=>{
  if(state.levelUpPoints > 0) {
    state.attack.cdMelee = Math.max(160, state.attack.cdMelee*0.9);
    spendLevelUpPoint();
  }
});
document.getElementById('upMeleeDmg').addEventListener('click', ()=>{
  if(state.levelUpPoints > 0) {
    state.meleeDamage = Math.floor(state.meleeDamage*1.1);
    spendLevelUpPoint();
  }
});
document.getElementById('upRangedSpeed').addEventListener('click', ()=>{
  if(state.levelUpPoints > 0) {
    state.attack.cdRanged = Math.max(120, state.attack.cdRanged*0.9);
    spendLevelUpPoint();
  }
});
document.getElementById('upRangedDmg').addEventListener('click', ()=>{
  if(state.levelUpPoints > 0) {
    state.rangedDamage = Math.floor(state.rangedDamage*1.1);
    spendLevelUpPoint();
  }
});

function openLevelUp(){ 
  state.paused=true; 
  state.levelUpPoints = 1; // Give 1 point per level
  lvlUpTo.textContent = state.level; 
  updateLevelUpModal();
  levelUpModal.style.display='flex'; 
  updateHUD(); 
}
function closeLevelUp(){
  state.paused=false; 
  levelUpModal.style.display='none'; 
  updateHUD(); 
}

// === Save ===
document.getElementById('saveBtn').addEventListener('click', ()=>{ localStorage.setItem('chrobry_save_v2', JSON.stringify(state)); toast('💾 Zapisano'); });

// === Toasts ===
let toasts = [];
function toast(msg){ toasts.push({msg, t: 1600}); }
let fly = [];
function floatingText(msg, x,y, color){ fly.push({msg,x,y,t:800,color}); }

// === Game loop ===
function step(dt){
  if(state.paused) return;

  // WASD keyboard movement
  let moveX = 0, moveY = 0;
  if(keys['w'] || keys['arrowup']) moveY -= 1;
  if(keys['s'] || keys['arrowdown']) moveY += 1;
  if(keys['a'] || keys['arrowleft']) moveX -= 1;
  if(keys['d'] || keys['arrowright']) moveX += 1;
  
  if(moveX !== 0 || moveY !== 0) {
    const len = Math.hypot(moveX, moveY);
    state.vel.x = (moveX / len) * state.speed;
    state.vel.y = (moveY / len) * state.speed;
    state.facing.x = moveX / len;
    state.facing.y = moveY / len;
  }
  
  // ruch jak w agar.io (touch/mouse)
  if(pointer.active){
    const ws = screenToWorld(pointer.x, pointer.y);
    // Handle wrap-around for movement target
    let dx = ws.x - state.pos.x;
    let dy = ws.y - state.pos.y;
    if(Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
    if(Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
    const dist = Math.hypot(dx,dy);
    const maxSpeed = state.speed * clamp(dist/120, 0, 2.8);
    if(dist>6){ 
      state.vel.x = (dx/dist) * maxSpeed; 
      state.vel.y = (dy/dist) * maxSpeed; 
      state.facing.x = dx/dist; 
      state.facing.y = dy/dist; 
    }
  } else if(!(keys['w'] || keys['s'] || keys['a'] || keys['d'] || keys['arrowup'] || keys['arrowdown'] || keys['arrowleft'] || keys['arrowright'])) {
    // Stop if no input
    state.vel.x *= 0.9;
    state.vel.y *= 0.9;
  }
  state.pos.x += state.vel.x;
  state.pos.y += state.vel.y;
  
  // Apply knockback if active
  if(state.knockback.t > 0) {
    state.knockback.t -= dt;
    const decay = Math.min(state.knockback.t / 350, 1); // Decay over time
    state.pos.x += state.knockback.x * decay * (dt / 16);
    state.pos.y += state.knockback.y * decay * (dt / 16);
    state.knockback.x *= 0.92; // Friction
    state.knockback.y *= 0.92;
    if(state.knockback.t <= 0) {
      state.knockback.x = 0;
      state.knockback.y = 0;
    }
  }
  
  // Wrap-around (pacman style)
  const wrapped = wrapPos(state.pos.x, state.pos.y, state.world.width, state.world.height);
  state.pos.x = wrapped.x;
  state.pos.y = wrapped.y;
  cam.x = state.pos.x; cam.y = state.pos.y;

  // tap logic: na postaci = miecz, na wrogu = strzała
  if(pointer.justTapped){
    pointer.justTapped=false;
    const ps = worldToScreen(state.pos.x, state.pos.y);
    const d = Math.hypot(pointer.x-ps.x, pointer.y-ps.y);
    if(d<48){ startMeleeSpin(); }
    else {
      const w = screenToWorld(pointer.x, pointer.y);
      let target=null; 
      for(const e of state.enemies){ 
        // Handle wrap-around distance
        let dx = e.x - w.x, dy = e.y - w.y;
        if(Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
        if(Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
        if(Math.hypot(dx, dy)<28){ target=e; break; } 
      }
      fireArrow(target);
    }
  }

  if(state.attack.cooldown>0) state.attack.cooldown -= dt;

  // melee spin update
  if(state.meleeSpin){
    const m = state.meleeSpin; m.t += dt; const r = 90; // promień miecza (50% większy: 60 * 1.5 = 90)
    const prog = clamp(m.t/m.dur, 0, 1);
    const startAng = m.startAngle || 0; // Random starting angle
    const ang = startAng + prog*2*Math.PI; // Start from random position, full circle
    const sx = state.pos.x + Math.cos(ang)*r;
    const sy = state.pos.y + Math.sin(ang)*r;
    // dmg kontaktowy miecza
    for(const e of state.enemies){
      const id = e.id; if(m.hit.has(id)) continue;
      // Handle wrap-around distance
      let dx = e.x - sx, dy = e.y - sy;
      if(Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
      if(Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
      if(Math.hypot(dx, dy) < 30){ // Zwiększony zasięg trafienia z 22 do 30
        m.hit.add(id); 
        e.hp -= state.meleeDamage; 
        floatingText(`-${state.meleeDamage}`, e.x, e.y, '#ff6a6a');
        
        // Knockback
        const nx = dx / Math.hypot(dx, dy) || 0;
        const ny = dy / Math.hypot(dx, dy) || 0;
        if(!state.enemyKnockback[e.id]) {
          state.enemyKnockback[e.id] = {x: 0, y: 0, t: 0};
        }
        state.enemyKnockback[e.id].x = nx * 8;
        state.enemyKnockback[e.id].y = ny * 8;
        state.enemyKnockback[e.id].t = 200; // 200ms knockback
        
        if(e.hp<=0) killEnemy(e);
      }
    }
    if(m.t>=m.dur) state.meleeSpin=null;
  }

  // Trees drop apples
  for(const tree of state.trees) {
    tree.lastDrop += dt;
    if(tree.lastDrop > 8000) { // drop every 8 seconds
      tree.lastDrop = 0;
      const dropDir = {x: rand(-0.5, 0.5), y: 1}; // Drop forward/down
      spawnPickup('apple', tree.x, tree.y, undefined, dropDir);
    }
  }
  
  // Update pickup physics (bouncing animation)
  for(const p of state.pickups) {
    if(p.bouncing) {
      // Gravity
      p.vy += 0.15 * (dt / 16); // Gravity acceleration
      
      // Move
      p.x += p.vx * (dt / 16);
      p.y += p.vy * (dt / 16);
      
      // Wrap-around
      const wrapped = wrapPos(p.x, p.y, state.world.width, state.world.height);
      p.x = wrapped.x;
      p.y = wrapped.y;
      
      // Bounce on ground (when velocity becomes positive/downward)
      if(p.vy > 0) {
        // First big bounce
        if(p.bounceCount === 0) {
          p.vy = -p.vy * 0.7; // Big bounce, 70% energy retained
          p.vx *= 0.8; // Reduce horizontal velocity
          p.bounceCount = 1;
          p.groundY = p.y;
        }
        // Subsequent smaller bounces
        else if(p.bounceCount < 4 && Math.abs(p.vy) > 0.3) {
          p.vy = -p.vy * 0.5; // Smaller bounce, 50% energy
          p.vx *= 0.7;
          p.bounceCount++;
        }
        // Stop bouncing
        else {
          p.bouncing = false;
          p.vx = 0;
          p.vy = 0;
          if(p.groundY) p.y = p.groundY; // Snap to ground
        }
      }
    }
  }

  // move & simple AI
  for(const e of state.enemies){
    e.t+=dt; 
    // Handle wrap-around distance
    let dx = state.pos.x - e.x, dy = state.pos.y - e.y;
    if(Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
    if(Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
    const d = Math.hypot(dx,dy);
    if(d<380){ 
      e.x += (dx/d)*e.speed; 
      e.y += (dy/d)*e.speed; 
    }
    else { 
      e.x += Math.cos(e.t*.002 + e.x*1e-3) * .4; 
      e.y += Math.sin(e.t*.002 + e.y*1e-3) * .4; 
    }
    
    // Update enemy knockback
    if(state.enemyKnockback[e.id] && state.enemyKnockback[e.id].t > 0) {
      const kb = state.enemyKnockback[e.id];
      kb.t -= dt;
      const decay = Math.min(kb.t / 250, 1);
      e.x += kb.x * decay * (dt / 16);
      e.y += kb.y * decay * (dt / 16);
      kb.x *= 0.9; // Friction
      kb.y *= 0.9;
      
      if(kb.t <= 0) {
        delete state.enemyKnockback[e.id];
      }
    }
    
    // Wrap-around for enemies
    const wrapped = wrapPos(e.x, e.y, state.world.width, state.world.height);
    e.x = wrapped.x;
    e.y = wrapped.y;
  }
  
  // Woman NPC movement
  state.woman.t += dt;
  state.woman.x += Math.cos(state.woman.t * 0.001 + state.woman.x * 1e-3) * 0.5;
  state.woman.y += Math.sin(state.woman.t * 0.001 + state.woman.y * 1e-3) * 0.5;
  const womanWrapped = wrapPos(state.woman.x, state.woman.y, state.world.width, state.world.height);
  state.woman.x = womanWrapped.x;
  state.woman.y = womanWrapped.y;
  
  // Woman interaction removed - use interaction mode (F) instead
  
  // Wizard NPC movement
  state.wizard.t += dt;
  state.wizard.x += Math.cos(state.wizard.t * 0.0012 + state.wizard.x * 1e-3) * 0.4;
  state.wizard.y += Math.sin(state.wizard.t * 0.0012 + state.wizard.y * 1e-3) * 0.4;
  const wizardWrapped = wrapPos(state.wizard.x, state.wizard.y, state.world.width, state.world.height);
  state.wizard.x = wizardWrapped.x;
  state.wizard.y = wizardWrapped.y;
  
  // Children AI - follow player and attack enemies
  const currentTime = Date.now();
  for(const child of state.children) {
    // Calculate distance to player
    let dx = state.pos.x - child.x, dy = state.pos.y - child.y;
    if(Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
    if(Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
    const distToPlayer = Math.hypot(dx, dy);
    
    // Move towards player
    if(distToPlayer > 0) {
      const moveSpeed = child.speed * (dt / 16);
      child.x += (dx / distToPlayer) * moveSpeed;
      child.y += (dy / distToPlayer) * moveSpeed;
      
      // Mark as reached player if close enough
      if(distToPlayer < 50 && !child.reachedPlayer) {
        child.reachedPlayer = true;
      }
    }
    
    // Wrap-around
    const childWrapped = wrapPos(child.x, child.y, state.world.width, state.world.height);
    child.x = childWrapped.x;
    child.y = childWrapped.y;
    
    // Attack enemies within 100 range of player
    if(child.reachedPlayer && distToPlayer < 100) {
      for(const enemy of state.enemies) {
        let edx = enemy.x - child.x, edy = enemy.y - child.y;
        if(Math.abs(edx) > state.world.width / 2) edx = edx > 0 ? edx - state.world.width : edx + state.world.width;
        if(Math.abs(edy) > state.world.height / 2) edy = edy > 0 ? edy - state.world.height : edy + state.world.height;
        const distToEnemy = Math.hypot(edx, edy);
        
        // Attack if close enough and cooldown passed
        if(distToEnemy < 30 && currentTime - child.lastAttack > 1000) { // 1 second cooldown
          const damage = state.level; // Damage equals player level
          enemy.hp -= damage;
          floatingText(`-${damage}`, enemy.x, enemy.y, '#ff6a6a');
          child.lastAttack = currentTime;
          
          if(enemy.hp <= 0) {
            killEnemy(enemy);
          }
        }
      }
    }
  }
  
  // Wizard interaction removed - use interaction mode (F) instead
  
  // === Collision resolution & Enemy attacks ===
  // enemies vs player (collision + attack hitbox)
  for(const e of state.enemies){
    let dx = e.x - state.pos.x, dy = e.y - state.pos.y;
    if(Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
    if(Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
    const d = Math.hypot(dx,dy);
    const minD = COLLIDE.playerR + COLLIDE.enemyR;
    
    // Collision push
    if(d>0 && d < minD){ 
      const nx = dx/d, ny = dy/d; 
      const push = (minD - d) + 0.01; 
      e.x += nx*push; 
      e.y += ny*push; 
      const wrapped = wrapPos(e.x, e.y, state.world.width, state.world.height);
      e.x = wrapped.x;
      e.y = wrapped.y;
      
      // Knockback animation for player on collision
      if(state.knockback.t <= 0) {
        state.knockback.x = -nx * 6; // Push player away
        state.knockback.y = -ny * 6;
        state.knockback.t = 150; // 150ms knockback
      }
    }
    
    // Attack hitbox - enemy can attack when close enough
    const attackRange = COLLIDE.playerR + COLLIDE.enemyR + 8; // Slightly larger than collision
    if(d <= attackRange && currentTime - state.lastHitTime > 800) { // 800ms cooldown between hits
      const oldHP = state.hp;
      state.hp = clamp(state.hp - e.atk, 0, state.hpMax);
      animateBar('hp', (oldHP/state.hpMax)*100, (state.hp/state.hpMax)*100);
      floatingText(`-${e.atk}`, state.pos.x, state.pos.y, '#ffb3b3');
      state.lastHitTime = currentTime;
      
      // Knockback on hit
      const nx = (d > 0 ? dx/d : 0), ny = (d > 0 ? dy/d : 0);
      state.knockback.x = -nx * 15; // Stronger knockback on hit
      state.knockback.y = -ny * 15;
      state.knockback.t = 350; // Longer knockback on hit
      updateHUD();
    }
  }
  
  // enemies vs enemies (optimized - only check nearby enemies)
  const enemyCollisionRadius = COLLIDE.enemyR * 4; // Only check enemies within this range
  for(let i=0;i<state.enemies.length;i++){
    const a = state.enemies[i];
    for(let j=i+1;j<state.enemies.length;j++){
      const b = state.enemies[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      if(Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
      if(Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
      const d = Math.hypot(dx,dy);
      
      // Early exit if too far
      if(d > enemyCollisionRadius) continue;
      
      const minD = COLLIDE.enemyR*2;
      if(d>0 && d < minD){ 
        const nx = dx/d, ny = dy/d; 
        const push = (minD - d)/2 + 0.01; 
        a.x -= nx*push; 
        a.y -= ny*push; 
        b.x += nx*push; 
        b.y += ny*push; 
        const wrappedA = wrapPos(a.x, a.y, state.world.width, state.world.height);
        const wrappedB = wrapPos(b.x, b.y, state.world.width, state.world.height);
        a.x = wrappedA.x; a.y = wrappedA.y;
        b.x = wrappedB.x; b.y = wrappedB.y;
      }
    }
  }

  for(let i=state.projectiles.length-1;i>=0;i--){
    const pr = state.projectiles[i]; 
    pr.x+=pr.vx; 
    pr.y+=pr.vy; 
    // Wrap-around for projectiles
    const wrapped = wrapPos(pr.x, pr.y, state.world.width, state.world.height);
    pr.x = wrapped.x;
    pr.y = wrapped.y;
    pr.ttl-=dt;
    
    // Optimized collision - only check enemies within range
    const projectileRange = 30; // Check enemies within this range
    for(const e of state.enemies){ 
      let dx = e.x - pr.x, dy = e.y - pr.y;
      if(Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
      if(Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
      const dist = Math.hypot(dx, dy);
      
      // Early exit if too far
      if(dist > projectileRange) continue;
      
      if(dist < 20){ 
        e.hp -= pr.dmg; 
        floatingText(`-${pr.dmg}`, e.x, e.y, '#ff6a6a');
        
        // Knockback
        const nx = dx / dist || 0;
        const ny = dy / dist || 0;
        if(!state.enemyKnockback[e.id]) {
          state.enemyKnockback[e.id] = {x: 0, y: 0, t: 0};
        }
        state.enemyKnockback[e.id].x = nx * 10; // Stronger knockback from arrow
        state.enemyKnockback[e.id].y = ny * 10;
        state.enemyKnockback[e.id].t = 250;
        
        pr.ttl=0; 
        if(e.hp<=0) killEnemy(e); 
        break; 
      } 
    }
    if(pr.ttl<=0) state.projectiles.splice(i,1);
  }

  // pickups
  for(let i=state.pickups.length-1;i>=0;i--){
    const p = state.pickups[i]; 
    let dx = p.x - state.pos.x, dy = p.y - state.pos.y;
    if(Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
    if(Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
    if(Math.hypot(dx, dy) < 28){
      if(p.kind==='meat'){ 
        state.inventory.meat++;
        toast('🍖 +Mięso'); 
      }
      if(p.kind==='mead'){ 
        state.inventory.mead++;
        toast('🍾 +Flaszka'); 
      }
      if(p.kind==='gold'){ state.gold += p.value||1; toast(`🪙 +${p.value||1}`); }
      if(p.kind==='xp'){ 
        gainXP(p.value||10); // gainXP już ma animację
        toast(`✨ +${p.value||10} XP`); 
      }
      if(p.kind==='apple'){ 
        state.inventory.apples++;
        toast('🍎 +Jabłko'); 
        // 10% chance to drop seed
        if(Math.random() < 0.1) {
          const seedDir = {x: state.facing.x || rand(-0.5, 0.5), y: -0.5};
          spawnPickup('seed', state.pos.x, state.pos.y, undefined, seedDir);
          toast('🌱 Pestka!');
        }
      }
      if(p.kind==='seed') {
        state.inventory.seeds++;
        toast('🌱 +Nasiono');
      }
      state.pickups.splice(i,1); updateHUD();
    }
  }

  // śmierć i respawn miękki
  if(state.hp<=0){ toast('💀 Zginąłeś!'); state.hp=state.hpMax; state.mp=state.mpMax; state.pos={x:3000,y:3000}; state.enemies=[]; state.pickups=[]; state.projectiles=[]; state.children=[]; spawnInitial(); }

  // spawny
  if(state.enemies.length<26 && Math.random()<0.03) spawnEnemy();
  if(Math.random()<0.02) {
    const dropDir = {x: rand(-0.5, 0.5), y: -0.5};
    spawnPickup(Math.random()<.5?'meat':'mead', rand(0,state.world.width), rand(0,state.world.height), undefined, dropDir);
  }
}

// === Render ===
function draw(){
  ctx.clearRect(0,0,canvas.width, canvas.height);

  // tło: las
  const tile=80; const startX=Math.floor((cam.x - canvas.width/2)/tile)-2; const startY=Math.floor((cam.y - canvas.height/2)/tile)-2; const endX=Math.floor((cam.x + canvas.width/2)/tile)+2; const endY=Math.floor((cam.y + canvas.height/2)/tile)+2;
  ctx.globalAlpha=.9; ctx.font='28px "Apple Color Emoji", "Segoe UI Emoji"';
  for(let gx=startX; gx<=endX; gx++) for(let gy=startY; gy<=endY; gy++){ 
    // Wrap-around for background tiles
    let wx = gx % Math.ceil(state.world.width / tile);
    let wy = gy % Math.ceil(state.world.height / tile);
    if(wx < 0) wx += Math.ceil(state.world.width / tile);
    if(wy < 0) wy += Math.ceil(state.world.height / tile);
    const sx=wx*tile - cam.x + canvas.width/2; 
    const sy=wy*tile - cam.y + canvas.height/2; 
    if(((wx*73856093 ^ wy*19349663)>>>0)%7===0){ ctx.fillText('🌲', sx, sy); } 
  }
  ctx.globalAlpha=1;

  // Deciduous trees (background) - optimized rendering
  ctx.font='32px "Apple Color Emoji", "Segoe UI Emoji"';
  ctx.globalAlpha=0.85;
  for(const tree of state.trees) {
    renderWithWrapAround(tree.x, tree.y, (s) => {
      ctx.fillText('🌳', s.x, s.y);
    });
  }
  ctx.globalAlpha=1;

  // Home - optimized rendering
  ctx.font='36px "Apple Color Emoji", "Segoe UI Emoji"';
  renderWithWrapAround(state.home.x, state.home.y, (s) => {
    ctx.fillText('🏠', s.x, s.y);
  });

  // pickups - optimized rendering
  ctx.font='28px "Apple Color Emoji", "Segoe UI Emoji"';
  for(const p of state.pickups){ 
    const emo = PICKUPS[p.kind].emoji;
    renderWithWrapAround(p.x, p.y, (s) => {
      ctx.fillText(emo, s.x, s.y);
    });
  }

  // enemies - optimized rendering
  ctx.font='30px "Apple Color Emoji", "Segoe UI Emoji"';
  for(const e of state.enemies){ 
    renderWithWrapAround(e.x, e.y, (s) => {
      ctx.fillText(e.emoji, s.x, s.y);
    });
  }

  // Children - optimized rendering
  ctx.font='28px "Apple Color Emoji", "Segoe UI Emoji"';
  for(const child of state.children) {
    renderWithWrapAround(child.x, child.y, (s) => {
      ctx.fillText(child.emoji, s.x, s.y);
    });
  }

  // Woman NPC - optimized rendering
  ctx.font='32px "Apple Color Emoji", "Segoe UI Emoji"';
  renderWithWrapAround(state.woman.x, state.woman.y, (s) => {
    ctx.fillText('👩', s.x, s.y);
  });

  // Wizard NPC - optimized rendering
  ctx.font='32px "Apple Color Emoji", "Segoe UI Emoji"';
  renderWithWrapAround(state.wizard.x, state.wizard.y, (s) => {
    ctx.fillText('🧙', s.x, s.y);
  });

  // projectiles - optimized rendering
  ctx.font='24px "Apple Color Emoji", "Segoe UI Emoji"';
  for(const pr of state.projectiles){ 
    renderWithWrapAround(pr.x, pr.y, (s) => {
      ctx.fillText(pr.emoji, s.x, s.y);
    });
  }

  // player — mężczyzna z wąsami (używamy 🧔 jako styl moustache)
  const heroEmoji='🧔';
  const ps=worldToScreen(state.pos.x, state.pos.y); ctx.font='34px "Apple Color Emoji", "Segoe UI Emoji"'; ctx.fillText(heroEmoji, ps.x, ps.y);

  // miecz w wirze
  if(state.meleeSpin){ const m=state.meleeSpin; const prog=clamp(m.t/m.dur,0,1); const startAng = m.startAngle || 0; const ang=startAng + prog*2*Math.PI; const r=90; const sx=ps.x + Math.cos(ang)*r; const sy=ps.y + Math.sin(ang)*r; ctx.font='28px "Apple Color Emoji", "Segoe UI Emoji"'; ctx.fillText('⚔️', sx, sy); }

  // teksty pływające
  for(let i=fly.length-1;i>=0;i--){ const f=fly[i]; f.t-=16; const s=worldToScreen(f.x, f.y - (800-f.t)/40); if(f.t<=0){ fly.splice(i,1); continue; } ctx.save(); ctx.globalAlpha=clamp(f.t/800,0,1); ctx.fillStyle=f.color||'#fff'; ctx.font='16px system-ui, sans-serif'; ctx.fillText(f.msg, s.x+12, s.y-6); ctx.restore(); }

  // toasty
  ctx.save(); ctx.font='16px system-ui, sans-serif'; ctx.textAlign='center'; let y=canvas.height-26; for(let i=toasts.length-1;i>=0;i--){ const t=toasts[i]; t.t-=16; if(t.t<=0){ toasts.splice(i,1); continue; } ctx.globalAlpha=Math.min(1,t.t/400); ctx.fillStyle='#e6e6e6'; ctx.fillText(t.msg, canvas.width/2, y); y-=20; } ctx.restore();
}

// === Main ===
let last=performance.now();
function loop(){ 
  const now=performance.now(); 
  const dt=Math.min(now-last, 50); // Cap dt to prevent huge jumps
  last=now; 
  step(dt); 
  draw(); 
  updateHUD(); // Now throttled internally
  requestAnimationFrame(loop); 
}

// init
spawnInitial();
requestAnimationFrame(loop);
updateHUD();
</script>
