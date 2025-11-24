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
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
function resize(){ 
  canvas.width = innerWidth; 
  canvas.height = innerHeight;
  if(minimapCanvas) {
    minimapCanvas.width = 150;
    minimapCanvas.height = 150;
  }
}
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
  lives: 3, // Liczba żyć gracza
  speed: 2.8,
  attack: { cooldown: 0, cdMelee: 400, cdRanged: 300 },
  meleeDamage: 18, // Siła ataku wręcz
  rangedDamage: 16, // Siła ataku projectile
  pickupMagnetRange: 0, // Zasięg przyciągania dropów (w pikselach)
  levelUpPoints: 0, // Punkty do wykorzystania przy levelowaniu
  meleeSpin: null,
  lastAttackType: null, // 'melee' or 'ranged' - ostatni typ ataku gracza
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
  playerReaction: { emoji: null, timer: 0 }, // Reakcja gracza (emoji + czas)
    interactionMode: false, // Mode for interacting with NPCs
  quests: { tree: false, son: false, book: false },
    lastMinuteSpawn: 0, // Timer for periodic enemy spawning (every minute)
  // New: NPCs
  woman: { x: 3500, y: 3500, t: 0, givenApples: 0, givenMeat: 0 },
  // New: Children
  children: [],
  wizard: { x: 2500, y: 2500, t: 0, givenMeat: 0, givenApples: 0, givenGold: 0 },
  // New: trees and home
  trees: [],
  home: { x: 3000, y: 2800 }, // Domek nad graczem na starcie
  // New: nests/spawners for enemies
  nests: [], // Array of nests: { type: enemyIndex, x, y, hp, hpMax, spawnTimer, nextSpawn, id, respawnTimer }
  nestRespawns: [], // Array of pending respawns: { type: enemyIndex, timer: 30000 }
  // Achievements system
  achievements: {}, // { achievementId: true/false }
  stats: { // Statystyki do śledzenia achievmentów
    enemiesKilled: 0,
    treesPlanted: 0,
    nestsDestroyed: 0,
    itemsCollected: { apples: 0, meat: 0, mead: 0, gold: 0, seeds: 0, wood: 0 },
    childrenBorn: 0,
    maxLevel: 1
  }
};

// Initialize missing stats for old saves
  if(state.meleeDamage === undefined) state.meleeDamage = 18;
  if(state.rangedDamage === undefined) state.rangedDamage = 16;
  if(state.pickupMagnetRange === undefined) state.pickupMagnetRange = 0;
if(state.levelUpPoints === undefined) state.levelUpPoints = 0;
  if(state.inventory.wood === undefined) state.inventory.wood = 0;
  if(state.interactionMode === undefined) state.interactionMode = false;
  if(state.lastMinuteSpawn === undefined) state.lastMinuteSpawn = 0;
  if(state.nests === undefined) state.nests = [];
  if(state.nestRespawns === undefined) state.nestRespawns = [];
  if(state.lives === undefined) state.lives = 3;
  if(state.achievements === undefined) state.achievements = {};
  if(state.stats === undefined) {
    state.stats = {
      enemiesKilled: 0,
      treesPlanted: 0,
      nestsDestroyed: 0,
      itemsCollected: { apples: 0, meat: 0, mead: 0, gold: 0, seeds: 0, wood: 0 },
      childrenBorn: 0,
      maxLevel: 1
    };
  }
  if(state.achievements === undefined) state.achievements = {};
  if(state.stats === undefined) {
    state.stats = {
      enemiesKilled: 0,
      treesPlanted: 0,
      nestsDestroyed: 0,
      itemsCollected: { apples: 0, meat: 0, mead: 0, gold: 0, seeds: 0, wood: 0 },
      childrenBorn: 0,
      maxLevel: 1
    };
  }

// Initialize trees
if(state.trees.length === 0) {
  for(let i = 0; i < 60; i++) {
    state.trees.push({
      x: rand(0, state.world.width),
      y: rand(0, state.world.height),
      lastDrop: 0,
        hp: Math.round(rand(2, 3)), // 2-3 uderzenia
        hpMax: Math.round(rand(2, 3)),
      size: rand(2.2, 2.7), // Rozmiar od 2.2 do 2.7x standardowego emoji (30px)
      id: Math.random().toString(36).slice(2)
    });
  }
  } else {
    // Initialize HP and size for existing trees (for old saves)
    for(const tree of state.trees) {
      if(tree.hp === undefined) {
        tree.hp = Math.round(rand(2, 3));
        tree.hpMax = tree.hp;
      }
      if(tree.size === undefined) {
        tree.size = rand(2.2, 2.7); // Dodaj rozmiar dla starych zapisów
      }
    }
  }

// === Collision radii ===
const COLLIDE = { playerR: 20, enemyR: 18 };

// Emoji reakcje gracza dla różnych zdarzeń (tylko buźki, bez powtórzeń między kategoriami)
const PLAYER_REACTIONS = {
  // Radosne buźki przy zbieraniu przedmiotów (bez serduszek)
  pickup: ['😊', '😄', '😃', '🙂', '😁', '😆', '😅', '🤩', '🥳', '😋', '🤗', '😀', '😂', '🤣'],
  // Dumne/zadowolone buźki po zabiciu wroga (bez serduszek)
  killEnemy: ['😤', '😏', '😎', '🤓', '🤑', '🤠', '😈', '😉', '😌', '🤪', '😜', '😝', '😛', '🤨', '🧐'],
  // Zainteresowane/zakłopotane buźki przy kobiecie (TYLKO z serduszkami: 😍🥰😘😗😙😚)
  nearWoman: ['😳', '🤤', '😍', '🥰', '😘', '😗', '😙', '😚', '😊', '😉', '😏', '😌', '🤩', '😎', '😄', '😁', '😆', '😅', '🤗'],
  // Myślące/przyjazne buźki przy czarodzieju (bez serduszek)
  nearWizard: ['🤔', '🤝', '🙂', '🙃'],
  // Smutne/przestraszone buźki przy otrzymaniu obrażeń (bez serduszek)
  takeDamage: ['😢', '😰', '😓', '😞', '😟', '😔', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '😭', '😠', '😡', '🤬', '😱', '😨', '😥', '😪', '😵', '🥺', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤐', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '👿', '💀', '☠️']
};

// Funkcja do wywołania reakcji gracza
function triggerPlayerReaction(type) {
  const reactions = PLAYER_REACTIONS[type];
  if(reactions && reactions.length > 0) {
    const randomEmoji = reactions[Math.floor(Math.random() * reactions.length)];
    state.playerReaction.emoji = randomEmoji;
    state.playerReaction.timer = 3000; // 3 sekundy
  }
}

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
      {kind:'seed', chance:0.1, value:1}
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
      {kind:'seed', chance:0.15, value:1}
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
      {kind:'seed', chance:0.08, value:1}
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
      {kind:'seed', chance:0.2, value:1}
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

// XP requirement curve - zmniejszone wymagania dla łatwiejszego osiągnięcia wyższych poziomów
const xpReq = lvl => Math.floor(50 + (lvl-1)*(lvl-1)*8);

// === Achievements System ===
const ACHIEVEMENTS = [
  // Questy
  { id: 'quest_tree', emoji: '🌳', name: 'Pierwsze Drzewo', desc: 'Zasadź swoje pierwsze drzewo', check: () => state.quests.tree },
  { id: 'quest_son', emoji: '👶', name: 'Ojciec', desc: 'Spłodź dziecko', check: () => state.quests.son },
  { id: 'quest_book', emoji: '📖', name: 'Pisarz', desc: 'Napisz książkę', check: () => state.quests.book },
  { id: 'quest_all', emoji: '🏆', name: 'Mistrz Questów', desc: 'Ukończ wszystkie questy', check: () => state.quests.tree && state.quests.son && state.quests.book },
  
  // Poziomy
  { id: 'level_5', emoji: '⭐', name: 'Nowicjusz', desc: 'Osiągnij poziom 5', check: () => state.stats.maxLevel >= 5 },
  { id: 'level_10', emoji: '⭐⭐', name: 'Doświadczony', desc: 'Osiągnij poziom 10', check: () => state.stats.maxLevel >= 10 },
  { id: 'level_20', emoji: '⭐⭐⭐', name: 'Weteran', desc: 'Osiągnij poziom 20', check: () => state.stats.maxLevel >= 20 },
  { id: 'level_50', emoji: '👑', name: 'Legenda', desc: 'Osiągnij poziom 50', check: () => state.stats.maxLevel >= 50 },
  
  // Zabijanie wrogów
  { id: 'kill_10', emoji: '⚔️', name: 'Wojownik', desc: 'Zabij 10 wrogów', check: () => state.stats.enemiesKilled >= 10 },
  { id: 'kill_50', emoji: '🗡️', name: 'Zabójca', desc: 'Zabij 50 wrogów', check: () => state.stats.enemiesKilled >= 50 },
  { id: 'kill_100', emoji: '💀', name: 'Rzeźnik', desc: 'Zabij 100 wrogów', check: () => state.stats.enemiesKilled >= 100 },
  { id: 'kill_500', emoji: '☠️', name: 'Anioł Śmierci', desc: 'Zabij 500 wrogów', check: () => state.stats.enemiesKilled >= 500 },
  
  // Jaskinie
  { id: 'nest_1', emoji: '🏰', name: 'Niszczyciel', desc: 'Zniszcz pierwszą jaskinię', check: () => state.stats.nestsDestroyed >= 1 },
  { id: 'nest_5', emoji: '🏛️', name: 'Demolka', desc: 'Zniszcz 5 jaskiń', check: () => state.stats.nestsDestroyed >= 5 },
  { id: 'nest_10', emoji: '💣', name: 'Eksplozja', desc: 'Zniszcz 10 jaskiń', check: () => state.stats.nestsDestroyed >= 10 },
  
  // Drzewa
  { id: 'tree_5', emoji: '🌲', name: 'Ogrodnik', desc: 'Zasadź 5 drzew', check: () => state.stats.treesPlanted >= 5 },
  { id: 'tree_20', emoji: '🌳', name: 'Leśnik', desc: 'Zasadź 20 drzew', check: () => state.stats.treesPlanted >= 20 },
  { id: 'tree_50', emoji: '🌴', name: 'Las', desc: 'Zasadź 50 drzew', check: () => state.stats.treesPlanted >= 50 },
  
  // Zbieranie przedmiotów
  { id: 'collect_100_apple', emoji: '🍎', name: 'Zbieracz Jabłek', desc: 'Zbierz 100 jabłek', check: () => state.stats.itemsCollected.apples >= 100 },
  { id: 'collect_100_meat', emoji: '🍖', name: 'Myśliwy', desc: 'Zbierz 100 mięsa', check: () => state.stats.itemsCollected.meat >= 100 },
  { id: 'collect_50_mead', emoji: '🍾', name: 'Pijak', desc: 'Zbierz 50 flaszek', check: () => state.stats.itemsCollected.mead >= 50 },
  { id: 'collect_100_gold', emoji: '💰', name: 'Bogacz', desc: 'Zbierz 100 monet', check: () => state.stats.itemsCollected.gold >= 100 },
  { id: 'collect_500_gold', emoji: '💎', name: 'Milioner', desc: 'Zbierz 500 monet', check: () => state.stats.itemsCollected.gold >= 500 },
  
  // Dzieci
  { id: 'child_1', emoji: '👶', name: 'Ojciec', desc: 'Miej pierwsze dziecko', check: () => state.stats.childrenBorn >= 1 },
  { id: 'child_3', emoji: '👨‍👩‍👧‍👦', name: 'Rodzina', desc: 'Miej 3 dzieci', check: () => state.stats.childrenBorn >= 3 },
  { id: 'child_5', emoji: '👪', name: 'Klany', desc: 'Miej 5 dzieci', check: () => state.stats.childrenBorn >= 5 },
  
  // Specjalne
  { id: 'survivor', emoji: '💪', name: 'Ocalony', desc: 'Przetrwaj z 1 HP', check: () => state.hp <= 1 && state.hp > 0 },
  { id: 'collector', emoji: '🎒', name: 'Kolekcjoner', desc: 'Zbierz łącznie 500 przedmiotów', check: () => {
    const total = state.stats.itemsCollected.apples + state.stats.itemsCollected.meat + 
                  state.stats.itemsCollected.mead + state.stats.itemsCollected.gold + 
                  state.stats.itemsCollected.seeds + state.stats.itemsCollected.wood;
    return total >= 500;
  }}
];

// Funkcja sprawdzająca i odblokowująca achievmenty
function checkAchievements() {
  for(const achievement of ACHIEVEMENTS) {
    if(!state.achievements[achievement.id] && achievement.check()) {
      state.achievements[achievement.id] = true;
      toast(`🏆 Osiągnięcie odblokowane: ${achievement.emoji} ${achievement.name}`);
      updateAchievementsModal();
      // Zapisz stan
      localStorage.setItem('chrobry_save_v2', JSON.stringify(state));
    }
  }
}

// === Input ===
let pointer = {active:false,id:null,x:0,y:0,justTapped:false};
let mousePos = {x:0, y:0};
const cam = {x:state.pos.x, y:state.pos.y};

// Virtual joystick
let joystick = {
  active: false,
  touchId: null,
  baseX: 0,
  baseY: 0,
  stickX: 0,
  stickY: 0,
  maxDistance: 50 // Maksymalna odległość od środka
};
function worldToScreen(wx, wy){ return { x: wx - cam.x + canvas.width/2, y: wy - cam.y + canvas.height/2 }; }
function screenToWorld(sx, sy){ return { x: sx + cam.x - canvas.width/2, y: sy + cam.y - canvas.height/2 }; }

// Define renderWithWrapAround after cam and functions are initialized
renderWithWrapAround = function(x, y, renderFn, margin = 50) {
  const marginX = margin;
  const marginY = margin;
  const viewLeft = cam.x - canvas.width/2 - marginX;
  const viewRight = cam.x + canvas.width/2 + marginX;
  const viewTop = cam.y - canvas.height/2 - marginY;
  const viewBottom = cam.y + canvas.height/2 + marginY;
  
  // Calculate which copies to render
  const startOffsetX = Math.floor((viewLeft - x) / state.world.width) * state.world.width;
  const endOffsetX = Math.ceil((viewRight - x) / state.world.width) * state.world.width;
  const startOffsetY = Math.floor((viewTop - y) / state.world.height) * state.world.height;
  const endOffsetY = Math.ceil((viewBottom - y) / state.world.height) * state.world.height;
  
  // Render only visible copies
  for(let ox = startOffsetX; ox <= endOffsetX; ox += state.world.width) {
    for(let oy = startOffsetY; oy <= endOffsetY; oy += state.world.height) {
      const s = worldToScreen(x + ox, y + oy);
      if(s.x > -margin && s.x < canvas.width + margin && s.y > -margin && s.y < canvas.height + margin) {
        renderFn(s);
      }
    }
  }
};

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
      hp: Math.round(rand(2, 3)),
      hpMax: Math.round(rand(2, 3)),
      size: rand(2.2, 2.7), // Rozmiar od 2.2 do 2.7x standardowego emoji (30px)
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
  if(e.key === '?' || e.key === '/') {
    e.preventDefault();
    toggleHelp();
  }
  if(e.key === 'Escape') {
    e.preventDefault();
    // Zamknij wszystkie modale
    if(state.interactionMode) {
      toggleInteractionMode();
    }
    if(questModal && questModal.style.display === 'flex') {
      questModal.style.display = 'none';
      state.paused = false;
    }
    if(inventoryModal && inventoryModal.style.display === 'flex') {
      inventoryModal.style.display = 'none';
      state.paused = false;
      state.plantingMode = false;
    }
    if(statsModal && statsModal.style.display === 'flex') {
      statsModal.style.display = 'none';
      state.paused = false;
    }
    if(womanModal && womanModal.style.display === 'flex') {
      womanModal.style.display = 'none';
      state.paused = false;
    }
    if(wizardModal && wizardModal.style.display === 'flex') {
      wizardModal.style.display = 'none';
      state.paused = false;
    }
    if(helpModal && helpModal.style.display === 'flex') {
      helpModal.style.display = 'none';
      state.paused = false;
    }
    // Level up modal nie zamyka się przez Escape (musi użyć punktów)
    // Start screen nie zamyka się przez Escape
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
const hudApples = document.getElementById('hudApples');
const hudMeat = document.getElementById('hudMeat');
const hudMead = document.getElementById('hudMead');

  function updateHUD(force = false){
    const now = performance.now();
    if(!force && now - lastHUDUpdate < HUD_UPDATE_INTERVAL) return;
    lastHUDUpdate = now;
    
  const hpPercent = (state.hp/state.hpMax)*100;
  const mpPercent = (state.mp/state.mpMax)*100;
  const need = xpReq(state.level);
  const prog = clamp(state.xp/need, 0, 1);
  const xpPercent = prog*100;
  
    // Animate bars only if not already animating (pionowe paski używają height zamiast width)
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
  if(hudApples) hudApples.textContent = state.inventory.apples || 0;
  if(hudMeat) hudMeat.textContent = state.inventory.meat || 0;
  if(hudMead) hudMead.textContent = state.inventory.mead || 0;
    const livesDisplay = document.getElementById('livesDisplay');
    if(livesDisplay) livesDisplay.textContent = state.lives;
  updateQuestLog();
}

function animateBar(barType, fromPercent, toPercent) {
  const bar = barType === 'hp' ? hpFill : (barType === 'mp' ? mpFill : xpFill);
  const barContainer = barType === 'hp' ? hpFill.parentElement : (barType === 'mp' ? mpFill.parentElement : xpFill.parentElement);
  
  state.barAnimations[barType] = true;
  barContainer.classList.add('bar-animating');
  
  // Set start width (poziome paski)
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
    updateQuestLog(); // Aktualizuj quest log przy otwieraniu
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

// Close button (X) for quest modal
const questModalClose = questModal.querySelector('.modal-close');
if(questModalClose) {
  questModalClose.addEventListener('click', () => {
    state.paused = false;
    questModal.style.display = 'none';
  });
}

// Przyciski rozwijania opisów questów
if(quest1Toggle) {
  quest1Toggle.addEventListener('click', () => toggleQuestDescription(1));
}
if(quest2Toggle) {
  quest2Toggle.addEventListener('click', () => toggleQuestDescription(2));
}
if(quest3Toggle) {
  quest3Toggle.addEventListener('click', () => toggleQuestDescription(3));
}

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
    btn.style.animation = 'consumeApple 0.25s ease-in-out';
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
      // Automatycznie zamknij modal inventory, żeby można było kliknąć na mapie
      if(inventoryModal) {
        inventoryModal.style.display = 'none';
        state.paused = false;
      }
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

// Close button (X) for inventory modal
const inventoryModalClose = inventoryModal.querySelector('.modal-close');
if(inventoryModalClose) {
  inventoryModalClose.addEventListener('click', () => {
    state.paused = false;
    state.plantingMode = false;
    inventoryModal.style.display = 'none';
  });
}

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
const statsMagnet = document.getElementById('statsMagnet');

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
  // Całkowity zasięg = poziom + wartość z karty postaci
  statsMagnet.textContent = state.level + state.pickupMagnetRange + 'px (poziom: ' + state.level + ' + bonus: ' + state.pickupMagnetRange + ')';
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

// Close button (X) for stats modal
const statsModalClose = statsModal.querySelector('.modal-close');
if(statsModalClose) {
  statsModalClose.addEventListener('click', () => {
    state.paused = false;
    statsModal.style.display = 'none';
  });
}

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
  // Aktualizuj też quest log jeśli jest otwarty
  if(questModal && questModal.style.display === 'flex') {
    updateQuestLog();
  }
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
    meleeSpin: null, // Melee spin dla dziecka (naśladuje gracza)
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
      // Ukończ quest tylko przy pierwszym dziecku
      if(!state.quests.son) {
        state.quests.son = true;
        toast('🎉 Ukończono quest: Spłodź syna!');
      }
      spawnChild();
      // Resetuj liczniki po urodzeniu dziecka
      state.woman.givenApples = 0;
      state.woman.givenMeat = 0;
      updateWomanDialog();
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
      // Ukończ quest tylko przy pierwszym dziecku
      if(!state.quests.son) {
        state.quests.son = true;
        toast('🎉 Ukończono quest: Spłodź syna!');
      }
      spawnChild();
      // Resetuj liczniki po urodzeniu dziecka
      state.woman.givenApples = 0;
      state.woman.givenMeat = 0;
      updateWomanDialog();
      updateHUD();
    }
  }
});

document.getElementById('closeWomanBtn').addEventListener('click', ()=>{
  state.paused = false;
  womanModal.style.display = 'none';
});

// Close button (X) for woman modal
const womanModalClose = womanModal.querySelector('.modal-close');
if(womanModalClose) {
  womanModalClose.addEventListener('click', () => {
    state.paused = false;
    womanModal.style.display = 'none';
  });
}

// === Wizard Dialog ===
const wizardModal = document.getElementById('wizardModal');
const wizardMeat = document.getElementById('wizardMeat');
const wizardApples = document.getElementById('wizardApples');
const wizardGold = document.getElementById('wizardGold');

function updateWizardDialog() {
  wizardMeat.textContent = state.wizard.givenMeat;
  wizardApples.textContent = state.wizard.givenApples;
  wizardGold.textContent = state.wizard.givenGold;
  // Aktualizuj też quest log jeśli jest otwarty
  if(questModal && questModal.style.display === 'flex') {
    updateQuestLog();
  }
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

// Close button (X) for wizard modal
const wizardModalClose = wizardModal.querySelector('.modal-close');
if(wizardModalClose) {
  wizardModalClose.addEventListener('click', () => {
    state.paused = false;
    wizardModal.style.display = 'none';
  });
}

// === Spawning ===
function spawnEnemy(){
  const e = ENEMIES[Math.floor(Math.random()*ENEMIES.length)];
  const ang = rand(0, Math.PI*2), dist = rand(400, 900);
  const ex = clamp(state.pos.x + Math.cos(ang)*dist, 0, state.world.width);
  const ey = clamp(state.pos.y + Math.sin(ang)*dist, 0, state.world.height);
  state.enemies.push({ ...e, x:ex, y:ey, hp:e.hp, hpMax:e.hp, t:0, id:Math.random().toString(36).slice(2), nestId: null });
}

function spawnEnemyFromNest(nest) {
  const enemyDef = ENEMIES[nest.type];
  if(!enemyDef) return;
  
  // Spawn enemy near nest (within guard radius)
  const ang = rand(0, Math.PI*2);
  const dist = rand(30, nest.guardRadius * 0.8);
  const ex = (nest.x + Math.cos(ang)*dist + state.world.width) % state.world.width;
  const ey = (nest.y + Math.sin(ang)*dist + state.world.height) % state.world.height;
  
  state.enemies.push({ 
    ...enemyDef, 
    x: ex, 
    y: ey, 
    hp: enemyDef.hp, 
    hpMax: enemyDef.hp, // Zapisz maxHP dla paska zdrowia
    t: 0, 
    id: Math.random().toString(36).slice(2),
    nestId: nest.id, // Link enemy to nest for guard behavior
    guardState: 'guarding', // 'guarding', 'chasing', 'flanking', 'attacking'
    flankAngle: Math.random() * Math.PI * 2 // Losowy kąt do okrążania
  });
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
function spawnNest(enemyTypeIndex) {
  // Check if nest for this enemy type already exists
  if(state.nests.some(n => n.type === enemyTypeIndex)) return;
  
  const enemyDef = ENEMIES[enemyTypeIndex];
  if(!enemyDef) return;
  
  // Spawn nest away from player
  const ang = rand(0, Math.PI*2);
  const dist = rand(800, 1500);
  const nx = clamp(state.pos.x + Math.cos(ang)*dist, 200, state.world.width - 200);
  const ny = clamp(state.pos.y + Math.sin(ang)*dist, 200, state.world.height - 200);
  
  // HP legowiska = 5x więcej niż normalny mob
  const hpMax = enemyDef.hp * 5;
  const nextSpawn = rand(7000, 21000); // 7-21 seconds
  
  state.nests.push({
    type: enemyTypeIndex,
    x: nx,
    y: ny,
    hp: hpMax,
    hpMax: hpMax,
    spawnTimer: 0,
    nextSpawn: nextSpawn,
    id: Math.random().toString(36).slice(2),
    guardRadius: 200 // Promień ochrony legowiska
  });
}

function spawnInitial(){
  // Spawn nests for each enemy type
  for(let i = 0; i < ENEMIES.length; i++) {
    spawnNest(i);
  }
  
  for(let i=0;i<28;i++) spawnEnemy();
  for(let i=0;i<40;i++){
    spawnPickup(Math.random()<.5?'meat':'mead', rand(0,state.world.width), rand(0,state.world.height));
  }
  // Gold nie spawnuje się na początku - tylko z jaskiń
}

// === Combat ===
function startMeleeSpin(){
  if(state.attack.cooldown>0 || state.paused) return;
  state.attack.cooldown = state.attack.cdMelee;
  const startAngle = rand(0, Math.PI*2); // Random starting angle around player
  state.meleeSpin = { t:0, dur:450, hit:new Set(), startAngle }; // 450 ms pełne okrążenie (szybszy)
  state.lastAttackType = 'melee'; // Zapisz typ ataku dla dzieci
}

function fireArrow(target){
  if(state.attack.cooldown>0 || state.paused) return;
  if(state.mp < 3) return; // koszt many (zmniejszony z 6 na 3)
  const oldMP = state.mp;
  state.mp = clamp(state.mp-3, 0, state.mpMax); // Zmniejszony koszt many z 6 na 3
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
  state.lastAttackType = 'ranged'; // Zapisz typ ataku dla dzieci
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
  triggerPlayerReaction('killEnemy'); // Reakcja na zabicie wroga
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
  
  // Ogranicz liczbę dropów do dropCount, ale zawsze zostaw XP (gold tylko z jaskiń)
  const xpDrop = droppedItems.find(d => d.kind === 'xp');
  const otherDrops = droppedItems.filter(d => d.kind !== 'xp');
  
  // Zawsze dropnij XP (jeśli jest)
  const finalDrops = [];
  if(xpDrop) finalDrops.push(xpDrop);
  
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
  triggerPlayerReaction('killEnemy'); // Reakcja na zabicie wroga
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
    state.lives++; // +1 życie za każdy level up
    animateBar('xp', oldPercent, 0);
    toast(`🎉 Awans na poziom ${state.level}! +1 życie`);
    openLevelUp();
  } else {
    const newPercent = (state.xp/need)*100;
    animateBar('xp', oldPercent, newPercent);
  }
}

// === Level Up Modal ===
const levelUpModal = document.getElementById('levelUpModal');
const startScreenModal = document.getElementById('startScreenModal');
const startGameBtn = document.getElementById('startGameBtn');
const lvlUpTo = document.getElementById('lvlUpTo');
const levelUpPoints = document.getElementById('levelUpPoints');
const upHPValue = document.getElementById('upHPValue');
const upMPValue = document.getElementById('upMPValue');
const upSpeedValue = document.getElementById('upSpeedValue');
const upMeleeSpeedValue = document.getElementById('upMeleeSpeedValue');
const upMeleeDmgValue = document.getElementById('upMeleeDmgValue');
const upRangedSpeedValue = document.getElementById('upRangedSpeedValue');
const upRangedDmgValue = document.getElementById('upRangedDmgValue');
const upMagnetValue = document.getElementById('upMagnetValue');

function updateLevelUpModal() {
  levelUpPoints.textContent = state.levelUpPoints;
  upHPValue.textContent = state.hpMax;
  upMPValue.textContent = state.mpMax;
  upSpeedValue.textContent = state.speed.toFixed(1);
  upMeleeSpeedValue.textContent = Math.round(state.attack.cdMelee) + 'ms';
  upMeleeDmgValue.textContent = state.meleeDamage;
  upRangedSpeedValue.textContent = Math.round(state.attack.cdRanged) + 'ms';
  upRangedDmgValue.textContent = state.rangedDamage;
  // Wyświetl całkowity zasięg (poziom + bonus)
  if(upMagnetValue) upMagnetValue.textContent = (state.level + state.pickupMagnetRange) + 'px (' + state.level + '+' + state.pickupMagnetRange + ')';
  
  // Disable buttons if no points
  const buttons = ['upHP', 'upMP', 'upSpeed', 'upMeleeSpeed', 'upMeleeDmg', 'upRangedSpeed', 'upRangedDmg', 'upMagnet'];
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
document.getElementById('upMagnet').addEventListener('click', ()=>{
  if(state.levelUpPoints > 0) {
    state.pickupMagnetRange += 1; // +1 piksel za każdy level
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

// Close button (X) for level up modal (tylko jeśli nie ma punktów do wykorzystania)
const levelUpModalClose = levelUpModal.querySelector('.modal-close');
if(levelUpModalClose) {
  levelUpModalClose.addEventListener('click', () => {
    if(state.levelUpPoints <= 0) {
      closeLevelUp();
    }
  });
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
  
  // Aktualizuj timer reakcji gracza
  if(state.playerReaction.timer > 0) {
    state.playerReaction.timer -= dt;
    if(state.playerReaction.timer <= 0) {
      state.playerReaction.emoji = null;
      state.playerReaction.timer = 0;
    }
  }

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
    
    // Check for nest hits
    for(const nest of state.nests) {
      if(m.hit.has(nest.id)) continue; // Prevent multiple hits per spin
      // Handle wrap-around distance
      let dx = nest.x - sx, dy = nest.y - sy;
      if(Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
      if(Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
      if(Math.hypot(dx, dy) < 30) { // Same range as enemy hit
        m.hit.add(nest.id);
        nest.hp -= state.meleeDamage;
        floatingText(`-${state.meleeDamage}`, nest.x, nest.y, '#8B4513'); // Brown color for nest damage
        
        if(nest.hp <= 0) {
          // Nest destroyed, drop items and schedule respawn
          const baseDropCount = 10; // Domyślnie 10 itemów
          
          // Dodatkowe dropy: 1 szansa 10% za każdy level gracza
          let extraDrops = 0;
          for(let i = 0; i < state.level; i++) {
            if(Math.random() < 0.1) {
              extraDrops++;
            }
          }
          
          const totalDropCount = baseDropCount + extraDrops;
          
          for(let i = 0; i < totalDropCount; i++) {
            const dropDir = {x: rand(-0.8, 0.8), y: -0.5};
            const dropTypes = ['meat', 'apple', 'mead', 'gold', 'seed'];
            const dropType = dropTypes[Math.floor(Math.random() * dropTypes.length)];
            spawnPickup(dropType, nest.x, nest.y, undefined, dropDir);
          }
          
          // Schedule respawn after 30 seconds
          state.nestRespawns.push({
            type: nest.type,
            timer: 30000 // 30 seconds
          });
          
          const nestIdx = state.nests.findIndex(n => n.id === nest.id);
          if(nestIdx >= 0) {
            state.nests.splice(nestIdx, 1);
            const extraText = extraDrops > 0 ? ` (+${extraDrops} ekstra!)` : '';
            toast(`🏰 Legowisko zniszczone! +${totalDropCount} przedmiotów${extraText}`);
          }
        }
      }
    }
    
    if(m.t>=m.dur) state.meleeSpin=null;
  }

  // Trees drop apples
  for(const tree of state.trees) {
    tree.lastDrop += dt;
    if(tree.lastDrop > 10000) { // drop every 10 seconds
      tree.lastDrop = 0;
      
      // Sprawdź ile jabłek jest już w promieniu wokół drzewa (max 7)
      const appleRadius = 80; // Promień wokół drzewa
      let appleCount = 0;
      for(const pickup of state.pickups) {
        if(pickup.kind === 'apple') {
          let dx = pickup.x - tree.x, dy = pickup.y - tree.y;
          if(Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
          if(Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
          const dist = Math.hypot(dx, dy);
          if(dist < appleRadius) {
            appleCount++;
          }
        }
      }
      
      // Dropuj tylko jeśli jest mniej niż 7 jabłek w promieniu
      if(appleCount < 7) {
      const dropDir = {x: rand(-0.5, 0.5), y: 1}; // Drop forward/down
      spawnPickup('apple', tree.x, tree.y, undefined, dropDir);
      }
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

  // Nests: spawn enemies and handle respawns
  for(const nest of state.nests) {
    // Update spawn timer
    nest.spawnTimer += dt;
    if(nest.spawnTimer >= nest.nextSpawn) {
      nest.spawnTimer = 0;
      nest.nextSpawn = rand(7000, 21000); // 7-21 seconds
      spawnEnemyFromNest(nest);
    }
  }
  
  // Handle nest respawns
  for(let i = state.nestRespawns.length - 1; i >= 0; i--) {
    const respawn = state.nestRespawns[i];
    respawn.timer -= dt;
    if(respawn.timer <= 0) {
      spawnNest(respawn.type);
      state.nestRespawns.splice(i, 1);
    }
  }

  // move & simple AI
  for(const e of state.enemies){
    e.t+=dt; 
    
    // If enemy has nestId, guard the nest with improved AI
    if(e.nestId) {
      const nest = state.nests.find(n => n.id === e.nestId);
      if(nest) {
        // Initialize guard state if not set
        if(!e.guardState) e.guardState = 'guarding';
        if(e.flankAngle === undefined) e.flankAngle = Math.random() * Math.PI * 2;
        
        // Calculate distance to player
        let dxPlayer = state.pos.x - e.x, dyPlayer = state.pos.y - e.y;
        if(Math.abs(dxPlayer) > state.world.width / 2) dxPlayer = dxPlayer > 0 ? dxPlayer - state.world.width : dxPlayer + state.world.width;
        if(Math.abs(dyPlayer) > state.world.height / 2) dyPlayer = dyPlayer > 0 ? dyPlayer - state.world.height : dyPlayer + state.world.height;
        const dPlayer = Math.hypot(dxPlayer, dyPlayer);
        
        // Calculate distance to nest
        let dxNest = nest.x - e.x, dyNest = nest.y - e.y;
        if(Math.abs(dxNest) > state.world.width / 2) dxNest = dxNest > 0 ? dxNest - state.world.width : dxNest + state.world.width;
        if(Math.abs(dyNest) > state.world.height / 2) dyNest = dyNest > 0 ? dyNest - state.world.height : dyNest + state.world.height;
        const distToNest = Math.hypot(dxNest, dyNest);
        
        // State machine for guard behavior
        if(e.guardState === 'guarding') {
          // Guarding: patrol around nest, but if player is spotted, switch to chasing
          if(dPlayer < 400) {
            // Player spotted! Leave guard radius and chase
            e.guardState = 'chasing';
            // Rozproszenie: każdy przeciwnik idzie w nieco innym kierunku
            e.flankAngle = Math.atan2(dyPlayer, dxPlayer) + (Math.random() - 0.5) * 0.8; // ±40 stopni rozproszenia
          } else {
            // Normal patrol
            if(distToNest > nest.guardRadius) {
              // Return to guard radius
              e.x += (dxNest/distToNest) * e.speed * 0.8;
              e.y += (dyNest/distToNest) * e.speed * 0.8;
            } else {
              // Patrol around nest
              const patrolAngle = e.t * 0.001 + e.id.charCodeAt(0) * 0.1;
              const patrolDist = nest.guardRadius * 0.6;
              const targetX = nest.x + Math.cos(patrolAngle) * patrolDist;
              const targetY = nest.y + Math.sin(patrolAngle) * patrolDist;
              let dxPatrol = targetX - e.x, dyPatrol = targetY - e.y;
              if(Math.abs(dxPatrol) > state.world.width / 2) dxPatrol = dxPatrol > 0 ? dxPatrol - state.world.width : dxPatrol + state.world.width;
              if(Math.abs(dyPatrol) > state.world.height / 2) dyPatrol = dyPatrol > 0 ? dyPatrol - state.world.height : dyPatrol + state.world.height;
              const dPatrol = Math.hypot(dxPatrol, dyPatrol);
              if(dPatrol > 5) {
                e.x += (dxPatrol/dPatrol) * e.speed * 0.5;
                e.y += (dyPatrol/dPatrol) * e.speed * 0.5;
              }
            }
          }
        } else if(e.guardState === 'chasing') {
          // Chasing: leave guard radius and move towards player with spread
          if(distToNest > nest.guardRadius * 1.2) {
            // Left guard radius, switch to flanking
            e.guardState = 'flanking';
          } else {
            // Move away from nest towards player with spread
            const spreadDist = 80; // Odległość rozproszenia
            const targetX = e.x + Math.cos(e.flankAngle) * spreadDist;
            const targetY = e.y + Math.sin(e.flankAngle) * spreadDist;
            let dxSpread = targetX - e.x, dySpread = targetY - e.y;
            const dSpread = Math.hypot(dxSpread, dySpread);
            if(dSpread > 0) {
              e.x += (dxSpread/dSpread) * e.speed * 0.7;
              e.y += (dySpread/dSpread) * e.speed * 0.7;
            }
            // Also move towards player
            e.x += (dxPlayer/dPlayer) * e.speed * 0.3;
            e.y += (dyPlayer/dPlayer) * e.speed * 0.3;
          }
        } else if(e.guardState === 'flanking') {
          // Flanking: circle around player
          const playerAngle = Math.atan2(dyPlayer, dxPlayer);
          const flankDist = 150; // Odległość okrążania
          const flankOffset = e.flankAngle; // Użyj zapisanego kątu dla każdego przeciwnika
          
          // Cel okrążania: pozycja obok gracza
          const flankX = state.pos.x + Math.cos(playerAngle + flankOffset + Math.PI/2) * flankDist;
          const flankY = state.pos.y + Math.sin(playerAngle + flankOffset + Math.PI/2) * flankDist;
          
          let dxFlank = flankX - e.x, dyFlank = flankY - e.y;
          if(Math.abs(dxFlank) > state.world.width / 2) dxFlank = dxFlank > 0 ? dxFlank - state.world.width : dxFlank + state.world.width;
          if(Math.abs(dyFlank) > state.world.height / 2) dyFlank = dyFlank > 0 ? dyFlank - state.world.height : dyFlank + state.world.height;
          const dFlank = Math.hypot(dxFlank, dyFlank);
          
          if(dFlank > 30) {
            // Still flanking
            e.x += (dxFlank/dFlank) * e.speed * 0.8;
            e.y += (dyFlank/dFlank) * e.speed * 0.8;
          } else {
            // Close enough, switch to attacking
            e.guardState = 'attacking';
          }
          
          // If player is very close, attack immediately
          if(dPlayer < 100) {
            e.guardState = 'attacking';
          }
        } else if(e.guardState === 'attacking') {
          // Attacking: charge directly at player
          e.x += (dxPlayer/dPlayer) * e.speed;
          e.y += (dyPlayer/dPlayer) * e.speed;
          
          // If player moves far away, return to flanking
          if(dPlayer > 250) {
            e.guardState = 'flanking';
            e.flankAngle = Math.atan2(dyPlayer, dxPlayer) + (Math.random() - 0.5) * 1.0;
          }
        }
      } else {
        // Nest destroyed, enemy becomes normal
        e.nestId = null;
        e.guardState = null;
      }
    } else {
      // Normal enemy AI (no nest)
      // Dzik (🐗) preferuje jabłka zamiast atakowania gracza
      if(e.emoji === '🐗') {
        // Szukaj jabłek w promieniu ataku
        let nearestApple = null;
        let nearestAppleDist = Infinity;
        const attackRange = e.range || 20; // Promień ataku dzika
        
        for(const pickup of state.pickups) {
          if(pickup.kind === 'apple') {
            let dxApple = pickup.x - e.x, dyApple = pickup.y - e.y;
            if(Math.abs(dxApple) > state.world.width / 2) dxApple = dxApple > 0 ? dxApple - state.world.width : dxApple + state.world.width;
            if(Math.abs(dyApple) > state.world.height / 2) dyApple = dyApple > 0 ? dyApple - state.world.height : dyApple + state.world.height;
            const dApple = Math.hypot(dxApple, dyApple);
            
            if(dApple < attackRange && dApple < nearestAppleDist) {
              nearestApple = pickup;
              nearestAppleDist = dApple;
            }
          }
        }
        
        // Jeśli znalazł jabłko w promieniu ataku, idź do niego zamiast do gracza
        if(nearestApple) {
          let dxApple = nearestApple.x - e.x, dyApple = nearestApple.y - e.y;
          if(Math.abs(dxApple) > state.world.width / 2) dxApple = dxApple > 0 ? dxApple - state.world.width : dxApple + state.world.width;
          if(Math.abs(dyApple) > state.world.height / 2) dyApple = dyApple > 0 ? dyApple - state.world.height : dyApple + state.world.height;
          const dApple = Math.hypot(dxApple, dyApple);
          
          // Jeśli dzik dotknął jabłka, zjedz je
          if(dApple < 25) { // Promień kolizji (około 25 jednostek)
            const appleIdx = state.pickups.findIndex(p => p === nearestApple);
            if(appleIdx >= 0) {
              state.pickups.splice(appleIdx, 1);
              // Można dodać efekt wizualny lub dźwięk
            }
          } else if(dApple > 0) {
            e.x += (dxApple/dApple) * e.speed;
            e.y += (dyApple/dApple) * e.speed;
          }
        } else {
          // Brak jabłek w promieniu - normalne AI (atakuj gracza)
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
        }
      } else {
        // Normal enemy AI dla innych przeciwników
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
      }
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
  
  // Check distance to NPCs for reactions (co 500ms)
  const now = Date.now();
  if(!state.lastReactionCheck) state.lastReactionCheck = { woman: 0, wizard: 0 };
  
  if(now - state.lastReactionCheck.woman > 500) {
    let dxWoman = state.woman.x - state.pos.x, dyWoman = state.woman.y - state.pos.y;
    if(Math.abs(dxWoman) > state.world.width / 2) dxWoman = dxWoman > 0 ? dxWoman - state.world.width : dxWoman + state.world.width;
    if(Math.abs(dyWoman) > state.world.height / 2) dyWoman = dyWoman > 0 ? dyWoman - state.world.height : dyWoman + state.world.height;
    const distWoman = Math.hypot(dxWoman, dyWoman);
    if(distWoman < 150 && state.playerReaction.timer <= 0) {
      triggerPlayerReaction('nearWoman');
    }
    state.lastReactionCheck.woman = now;
  }
  
  if(now - state.lastReactionCheck.wizard > 500) {
    let dxWizard = state.wizard.x - state.pos.x, dyWizard = state.wizard.y - state.pos.y;
    if(Math.abs(dxWizard) > state.world.width / 2) dxWizard = dxWizard > 0 ? dxWizard - state.world.width : dxWizard + state.world.width;
    if(Math.abs(dyWizard) > state.world.height / 2) dyWizard = dyWizard > 0 ? dyWizard - state.world.height : dyWizard + state.world.height;
    const distWizard = Math.hypot(dxWizard, dyWizard);
    if(distWizard < 150 && state.playerReaction.timer <= 0) {
      triggerPlayerReaction('nearWizard');
    }
    state.lastReactionCheck.wizard = now;
  }
  
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
    
    // Attack enemies within 100 range of player - naśladuj ataki gracza
    if(child.reachedPlayer && distToPlayer < 100) {
      // Update child melee spin (jeśli aktywny)
      if(child.meleeSpin) {
        child.meleeSpin.t += dt;
        const m = child.meleeSpin;
        const r = 60; // Promień miecza dziecka (mniejszy niż gracza)
        const prog = clamp(m.t / m.dur, 0, 1);
        const startAng = m.startAngle || 0;
        const ang = startAng + prog * 2 * Math.PI;
        const sx = child.x + Math.cos(ang) * r;
        const sy = child.y + Math.sin(ang) * r;
        
        // Sprawdź trafienia wrogów
        for(const enemy of state.enemies) {
          const id = enemy.id;
          if(m.hit.has(id)) continue;
          let edx = enemy.x - sx, edy = enemy.y - sy;
          if(Math.abs(edx) > state.world.width / 2) edx = edx > 0 ? edx - state.world.width : edx + state.world.width;
          if(Math.abs(edy) > state.world.height / 2) edy = edy > 0 ? edy - state.world.height : edy + state.world.height;
          if(Math.hypot(edx, edy) < 25) {
            m.hit.add(id);
            const damage = state.level;
            enemy.hp -= damage;
            floatingText(`-${damage}`, enemy.x, enemy.y, '#ff6a6a');
            if(enemy.hp <= 0) {
              killEnemy(enemy);
            }
          }
        }
        
        if(m.t >= m.dur) {
          child.meleeSpin = null;
        }
      }
      
      // Znajdź najbliższego wroga
      let nearestEnemy = null;
      let nearestEnemyDist = Infinity;
      for(const enemy of state.enemies) {
        let edx = enemy.x - child.x, edy = enemy.y - child.y;
        if(Math.abs(edx) > state.world.width / 2) edx = edx > 0 ? edx - state.world.width : edx + state.world.width;
        if(Math.abs(edy) > state.world.height / 2) edy = edy > 0 ? edy - state.world.height : edy + state.world.height;
        const distToEnemy = Math.hypot(edx, edy);
        if(distToEnemy < 100 && distToEnemy < nearestEnemyDist) {
          nearestEnemy = enemy;
          nearestEnemyDist = distToEnemy;
        }
      }
      
      // Atak dziecka - gdy gracz uderza mieczem, wszystkie dzieci też uderzają mieczem
      if(nearestEnemy) { // Bez cooldownu
        // Jeśli gracz uderza mieczem, wszystkie dzieci też uderzają mieczem
        if(state.meleeSpin && !child.meleeSpin) {
          const startAngle = rand(0, Math.PI * 2);
          child.meleeSpin = { t: 0, dur: 450, hit: new Set(), startAngle };
        } else if(!state.meleeSpin && !child.meleeSpin) {
          // Gdy gracz nie atakuje melee, dzieci używają swoich domyślnych ataków
          if(child.gender === 'boy') {
            // Syn (👶) - używa miecza
            const startAngle = rand(0, Math.PI * 2);
            child.meleeSpin = { t: 0, dur: 450, hit: new Set(), startAngle };
          } else if(child.gender === 'girl') {
            // Córka (👧) - strzela z łuku
            let edx = nearestEnemy.x - child.x, edy = nearestEnemy.y - child.y;
            if(Math.abs(edx) > state.world.width / 2) edx = edx > 0 ? edx - state.world.width : edx + state.world.width;
            if(Math.abs(edy) > state.world.height / 2) edy = edy > 0 ? edy - state.world.height : edy + state.world.height;
            const len = Math.hypot(edx, edy) || 1;
            const vx = (edx / len) * 5.0; // Nieco wolniejsza niż gracz
            const vy = (edy / len) * 5.0;
            state.projectiles.push({ 
              x: child.x, 
              y: child.y, 
              vx, 
              vy, 
              ttl: 6000, 
              dmg: state.level, 
              emoji: '🏹',
              fromChild: true // Oznacz że to od dziecka
            });
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
      
      // Reakcja na utratę zdrowia (tylko jeśli HP faktycznie spadło)
      if(state.hp < oldHP) {
        triggerPlayerReaction('takeDamage');
      }
      
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

  // pickups - przyciąganie i zbieranie
  for(let i=state.pickups.length-1;i>=0;i--){
    const p = state.pickups[i]; 
    let dx = p.x - state.pos.x, dy = p.y - state.pos.y;
    if(Math.abs(dx) > state.world.width / 2) dx = dx > 0 ? dx - state.world.width : dx + state.world.width;
    if(Math.abs(dy) > state.world.height / 2) dy = dy > 0 ? dy - state.world.height : dy + state.world.height;
    const dist = Math.hypot(dx, dy);
    
    // Przyciąganie dropów (jak odkurzacz) - zasięg = poziom postaci + wartość z karty postaci
    const magnetRange = state.level + state.pickupMagnetRange;
    const collectRadius = 15; // Promień zbierania - gdy przedmiot osiągnie środek gracza
    const baseCollectRadius = 100; // Bazowy promień zbierania (bez przyciągania, gdy magnetRange = 0)
    
    // Inicjalizuj beingPulled jeśli nie istnieje
    if(p.beingPulled === undefined) p.beingPulled = false;
    
    // Przyciąganie: przedmioty w zasięgu magnetRange (ale poza promieniem zbierania) są przyciągane
    if(magnetRange > collectRadius && dist > collectRadius && dist <= magnetRange) {
      // Oznacz pickup jako przyciągany (dla animacji)
      p.beingPulled = true;
      
      // Przyciągnij pickup do gracza - zwiększona prędkość dla lepszej animacji
      // Prędkość zależy od odległości - im bliżej, tym szybciej (efekt przyspieszenia)
      const rangeForSpeed = magnetRange - collectRadius;
      const distInRange = dist - collectRadius;
      const speedMultiplier = rangeForSpeed > 0 ? 1 + (1 - (distInRange / rangeForSpeed)) * 2 : 1; // 1x do 3x prędkości
      const pullSpeed = 5.0 * speedMultiplier * (dt / 16); // Zwiększona bazowa prędkość
      const pullX = (dx / dist) * pullSpeed;
      const pullY = (dy / dist) * pullSpeed;
      p.x -= pullX;
      p.y -= pullY;
      
      // Wrap-around dla pickupów
      const wrapped = wrapPos(p.x, p.y, state.world.width, state.world.height);
      p.x = wrapped.x;
      p.y = wrapped.y;
      
      // NIE zbieraj przedmiotów, które są przyciągane - wyjdź z pętli
      continue;
    } else {
      p.beingPulled = false;
    }
    
    // Zbieranie pickupów (gdy osiągną środek gracza) - mały promień zbierania
    // LUB gdy magnetRange jest za mały, zbieraj w bazowym promieniu
    // WAŻNE: przedmioty przyciągane są pomijane (continue powyżej)
    const shouldCollect = (magnetRange > collectRadius && dist < collectRadius) || 
                          (magnetRange <= collectRadius && dist < baseCollectRadius);
    
    if(shouldCollect){
      if(p.kind==='meat'){ 
        state.inventory.meat++;
        toast('🍖 +Mięso');
        triggerPlayerReaction('pickup');
      }
      if(p.kind==='mead'){ 
        state.inventory.mead++;
        toast('🍾 +Flaszka');
        triggerPlayerReaction('pickup');
      }
      if(p.kind==='gold'){ 
        state.gold += p.value||1; 
        toast(`🪙 +${p.value||1}`);
        triggerPlayerReaction('pickup');
      }
      if(p.kind==='xp'){ 
        gainXP(p.value||10); // gainXP już ma animację
        toast(`✨ +${p.value||10} XP`);
        triggerPlayerReaction('pickup');
      }
      if(p.kind==='apple'){ 
        state.inventory.apples++;
        toast('🍎 +Jabłko');
        triggerPlayerReaction('pickup');
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
        triggerPlayerReaction('pickup');
      }
      if(p.kind==='wood') {
        state.inventory.wood++;
        toast('🪵 +Drewno');
        triggerPlayerReaction('pickup');
      }
      state.pickups.splice(i,1); updateHUD();
    }
  }

  // śmierć i respawn miękki
  if(state.hp<=0){
    state.lives--;
    if(state.lives > 0) {
      toast(`💀 Zginąłeś! Pozostało żyć: ${state.lives}`);
      state.paused = true;
      showStartScreen(); // Pokaż ekran startowy po śmierci
      // Reset pozycji i wrogów, ale zachowaj stan świata
      state.hp = state.hpMax;
      state.mp = state.mpMax;
      state.pos = {x:3000, y:3000};
      state.enemies = [];
      state.pickups = [];
      state.projectiles = [];
      state.children = [];
      // Nie resetuj jaskini i drzew - zachowaj stan świata
    } else {
      // Game Over - pokaż ekran startowy
      toast('💀 Game Over! Wszystkie życia wykorzystane.');
      state.paused = true;
      showStartScreen();
      // Reset gry
      state.hp = state.hpMax;
      state.mp = state.mpMax;
      state.pos = {x:3000, y:3000};
      state.enemies = [];
      state.pickups = [];
      state.projectiles = [];
      state.children = [];
      state.nests = [];
      state.nestRespawns = [];
      state.trees = [];
      state.lives = 3;
      state.level = 1;
      state.xp = 0;
      state.gold = 0;
      spawnInitial();
    }
  }

  // Periodic enemy spawn every minute
  state.lastMinuteSpawn += dt;
  if(state.lastMinuteSpawn >= 60000) { // 60 seconds = 60000ms
    state.lastMinuteSpawn = 0;
    const enemiesToSpawn = Math.round(rand(5, 12)); // Spawn 5-12 enemies every minute
    for(let i = 0; i < enemiesToSpawn; i++) {
      spawnEnemy();
    }
    toast(`⚠️ Pojawiło się ${enemiesToSpawn} nowych wrogów!`);
  }
  
  // spawny (random spawns - keep existing logic)
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
  ctx.globalAlpha=.9;
  for(let gx=startX; gx<=endX; gx++) for(let gy=startY; gy<=endY; gy++){ 
    // Wrap-around for background tiles
    let wx = gx % Math.ceil(state.world.width / tile);
    let wy = gy % Math.ceil(state.world.height / tile);
    if(wx < 0) wx += Math.ceil(state.world.width / tile);
    if(wy < 0) wy += Math.ceil(state.world.height / tile);
    const sx=wx*tile - cam.x + canvas.width/2; 
    const sy=wy*tile - cam.y + canvas.height/2; 
    if(((wx*73856093 ^ wy*19349663)>>>0)%7===0){ 
      // Losowy rozmiar choinki od 1.5 do 2.5x standardowego emoji (30px)
      // Używamy hash do deterministycznego wygenerowania rozmiaru dla każdej pozycji
      const hash = ((wx*73856093 ^ wy*19349663)>>>0);
      const sizeMultiplier = 1.5 + (hash % 100) / 100.0; // 1.5-2.5
      const treeSize = Math.round(sizeMultiplier * 30);
      ctx.font=`${treeSize}px "Apple Color Emoji", "Segoe UI Emoji"`;
      ctx.fillText('🌲', sx, sy); 
    } 
  }
  ctx.globalAlpha=1;

  // Deciduous trees (background) - optimized rendering
  ctx.globalAlpha=0.85;
  for(const tree of state.trees) {
    const treeSize = Math.round((tree.size || 2.5) * 30); // Standardowy emoji to ~30px
    ctx.font=`${treeSize}px "Apple Color Emoji", "Segoe UI Emoji"`;
    renderWithWrapAround(tree.x, tree.y, (s) => {
          ctx.fillText('🌳', s.x, s.y);
    });
  }
  ctx.globalAlpha=1;

  // Home - optimized rendering (4x emoji size = 120px)
        ctx.font='120px "Apple Color Emoji", "Segoe UI Emoji"';
  renderWithWrapAround(state.home.x, state.home.y, (s) => {
        ctx.fillText('🏠', s.x, s.y);
  });

  // Nests - optimized rendering (show animal emoji for each nest type)
  // Legowiska są 2x większe od normalnych mobów (wrogowie: 30px, legowiska: 60px)
  ctx.font='60px "Apple Color Emoji", "Segoe UI Emoji"';
  for(const nest of state.nests) {
    renderWithWrapAround(nest.x, nest.y, (s) => {
      // Kamień pod legowiskiem (2.5x większy)
      ctx.save();
      ctx.font='75px "Apple Color Emoji", "Segoe UI Emoji"'; // 30px * 2.5 = 75px
      ctx.globalAlpha = 0.8;
      ctx.fillText('🪨', s.x, s.y + 20); // Przesunięty w dół
      ctx.globalAlpha = 1;
      ctx.restore();
      
      // Emoji legowiska (zwierzę)
      ctx.font='60px "Apple Color Emoji", "Segoe UI Emoji"';
      const enemyDef = ENEMIES[nest.type];
      if(enemyDef) {
        // Show animal emoji (e.g., 🐺 for wolf nest, 🐗 for boar nest, etc.)
        ctx.fillText(enemyDef.emoji, s.x, s.y);
      } else {
        ctx.fillText('🏰', s.x, s.y); // Fallback
      }
      // Show HP bar (zawsze widoczny)
      const hpPercent = nest.hp / nest.hpMax;
      const barWidth = 50;
      const barHeight = 6;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(s.x - barWidth/2, s.y - 50, barWidth, barHeight);
      ctx.fillStyle = hpPercent > 0.5 ? '#4ade80' : hpPercent > 0.25 ? '#fbbf24' : '#ef4444';
      ctx.fillRect(s.x - barWidth/2, s.y - 50, barWidth * hpPercent, barHeight);
      ctx.fillStyle = '#e6e6e6';
    });
  }

  // pickups - optimized rendering z animacją przyciągania
  ctx.font='28px "Apple Color Emoji", "Segoe UI Emoji"';
  const playerScreenPos = worldToScreen(state.pos.x, state.pos.y);
  const magnetRange = state.level + state.pickupMagnetRange;
  
  for(const p of state.pickups){ 
    const spec = PICKUPS[p.kind];
    if(!spec) continue; // Skip if pickup kind doesn't exist
    const emo = spec.emoji;
    
    renderWithWrapAround(p.x, p.y, (s) => {
      // Animacja przyciągania - rysuj linię i efekt świecenia
      if(p.beingPulled === true) {
        // Oblicz odległość na ekranie
        let dx = s.x - playerScreenPos.x, dy = s.y - playerScreenPos.y;
        const screenDist = Math.hypot(dx, dy);
        
        // Rysuj animację dla wszystkich przyciąganych przedmiotów
        if(screenDist > 0 && screenDist < 1000) { // Ograniczenie do rozsądnej odległości na ekranie
          // Rysuj świecącą linię między graczem a przedmiotem
          ctx.save();
          // Alpha zależy od odległości - im bliżej, tym jaśniej
          const maxDist = Math.max(magnetRange * 2, 200); // Maksymalna odległość dla animacji
          const alpha = Math.max(0.3, 1 - (screenDist / maxDist));
          ctx.globalAlpha = alpha * 0.8; // Zwiększona widoczność
          ctx.strokeStyle = '#4ade80'; // Zielony kolor
          ctx.lineWidth = 3; // Grubsza linia dla lepszej widoczności
          ctx.shadowBlur = 15;
          ctx.shadowColor = '#4ade80';
          ctx.beginPath();
          ctx.moveTo(playerScreenPos.x, playerScreenPos.y);
          ctx.lineTo(s.x, s.y);
          ctx.stroke();
          
          // Dodaj animowane cząsteczki wzdłuż linii (poruszające się w kierunku gracza)
          const particleCount = Math.max(5, Math.floor(screenDist / 15));
          const timeOffset = (Date.now() % 2000) / 2000; // Animacja w pętli 2 sekundy
          for(let i = 0; i < particleCount; i++) {
            const t = ((i / particleCount) + timeOffset) % 1; // Cząsteczki poruszają się wzdłuż linii
            const px = playerScreenPos.x + dx * t;
            const py = playerScreenPos.y + dy * t;
            ctx.globalAlpha = alpha * 1.0;
            ctx.fillStyle = '#4ade80';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();
          }
          
          ctx.restore();
          
          // Efekt świecenia wokół przyciąganego przedmiotu (rysuj przed normalnym pickupem)
          ctx.save();
          ctx.globalAlpha = alpha * 0.6;
          ctx.shadowBlur = 25;
          ctx.shadowColor = '#4ade80';
          ctx.fillText(emo, s.x, s.y);
          ctx.restore();
        }
      }
      
      // Normalny pickup (zawsze rysuj, nawet jeśli beingPulled)
      ctx.fillText(emo, s.x, s.y);
    });
  }
  
  // Rysuj efekt wizualny zasięgu przyciągania wokół gracza (opcjonalnie, tylko jeśli magnetRange > 0)
  if(magnetRange > 0) {
    ctx.save();
    const time = Date.now() / 1000;
    const pulseAlpha = 0.1 + Math.sin(time * 3) * 0.05; // Pulsujący efekt
    ctx.globalAlpha = pulseAlpha;
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(playerScreenPos.x, playerScreenPos.y, magnetRange, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // enemies - optimized rendering
  ctx.font='30px "Apple Color Emoji", "Segoe UI Emoji"';
  for(const e of state.enemies){ 
    renderWithWrapAround(e.x, e.y, (s) => {
          ctx.fillText(e.emoji, s.x, s.y); 
      // Show HP bar (zawsze widoczny)
      // Znajdź maxHP z ENEMIES na podstawie emoji lub użyj zapisanego hpMax
      let maxHP = e.hpMax || e.hp;
      if(!e.hpMax) {
        // Jeśli nie ma hpMax, znajdź w ENEMIES
        const enemyDef = ENEMIES.find(en => en.emoji === e.emoji);
        if(enemyDef) maxHP = enemyDef.hp;
      }
      const hpPercent = e.hp / maxHP;
      const barWidth = 30;
      const barHeight = 4;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(s.x - barWidth/2, s.y - 25, barWidth, barHeight);
      ctx.fillStyle = hpPercent > 0.5 ? '#4ade80' : hpPercent > 0.25 ? '#fbbf24' : '#ef4444';
      ctx.fillRect(s.x - barWidth/2, s.y - 25, barWidth * hpPercent, barHeight);
      ctx.fillStyle = '#e6e6e6';
    });
  }

  // Children - optimized rendering
  // Rozmiar dziecka = 0.5 * rozmiar gracza
  const playerFontSizeForChild = 34 + (state.level * 0.25);
  const childFontSize = playerFontSizeForChild * 0.5;
  ctx.font=`${childFontSize}px "Apple Color Emoji", "Segoe UI Emoji"`;
  for(const child of state.children) {
    renderWithWrapAround(child.x, child.y, (s) => {
      ctx.fillText(child.emoji, s.x, s.y);
      
      // Render child melee spin (naśladuje gracza)
      if(child.meleeSpin) {
        const m = child.meleeSpin;
        const prog = clamp(m.t / m.dur, 0, 1);
        const startAng = m.startAngle || 0;
        const ang = startAng + prog * 2 * Math.PI;
        const r = 60 * 0.5; // Promień miecza dziecka (50% rozmiaru gracza)
        const sx = s.x + Math.cos(ang) * r;
        const sy = s.y + Math.sin(ang) * r;
        const swordFontSize = childFontSize * 0.8; // Miecz nieco mniejszy niż dziecko
        ctx.font=`${swordFontSize}px "Apple Color Emoji", "Segoe UI Emoji"`;
        ctx.fillText('⚔️', sx, sy);
        ctx.font=`${childFontSize}px "Apple Color Emoji", "Segoe UI Emoji"`; // Przywróć rozmiar
      }
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

  // player — mężczyzna z wąsami (używamy 🧔 jako styl moustache) lub reakcja emoji
  // Rozmiar gracza = bazowy (34px) + 0.25 * poziom
  const heroEmoji = state.playerReaction.emoji || '🧔';
  const ps=worldToScreen(state.pos.x, state.pos.y);
  const playerFontSize = 34 + (state.level * 0.25);
  ctx.font=`${playerFontSize}px "Apple Color Emoji", "Segoe UI Emoji"`;
  ctx.fillText(heroEmoji, ps.x, ps.y);

  // miecz w wirze
  if(state.meleeSpin){ const m=state.meleeSpin; const prog=clamp(m.t/m.dur,0,1); const startAng = m.startAngle || 0; const ang=startAng + prog*2*Math.PI; const r=90; const sx=ps.x + Math.cos(ang)*r; const sy=ps.y + Math.sin(ang)*r; ctx.font='28px "Apple Color Emoji", "Segoe UI Emoji"'; ctx.fillText('⚔️', sx, sy); }

  // teksty pływające
  for(let i=fly.length-1;i>=0;i--){ const f=fly[i]; f.t-=16; const s=worldToScreen(f.x, f.y - (800-f.t)/40); if(f.t<=0){ fly.splice(i,1); continue; } ctx.save(); ctx.globalAlpha=clamp(f.t/800,0,1); ctx.fillStyle=f.color||'#fff'; ctx.font='16px system-ui, sans-serif'; ctx.fillText(f.msg, s.x+12, s.y-6); ctx.restore(); }

  // toasty
  ctx.save(); ctx.font='16px system-ui, sans-serif'; ctx.textAlign='center'; let y=canvas.height-26; for(let i=toasts.length-1;i>=0;i--){ const t=toasts[i]; t.t-=16; if(t.t<=0){ toasts.splice(i,1); continue; } ctx.globalAlpha=Math.min(1,t.t/400); ctx.fillStyle='#e6e6e6'; ctx.fillText(t.msg, canvas.width/2, y); y-=20; } ctx.restore();
  
  // Mini-mapa
  drawMiniMap();
}

// Funkcja rysująca mini-mapę
function drawMiniMap() {
  if(!minimapCtx || !minimapCanvas) return;
  
  const mapSize = minimapCanvas.width;
  const worldWidth = state.world.width;
  const worldHeight = state.world.height;
  
  // Wyczyść mini-mapę
  minimapCtx.fillStyle = 'rgba(0,0,0,0.6)';
  minimapCtx.fillRect(0, 0, mapSize, mapSize);
  
  // Funkcja konwersji współrzędnych świata na mini-mapę
  const worldToMinimap = (wx, wy) => {
    const x = (wx / worldWidth) * mapSize;
    const y = (wy / worldHeight) * mapSize;
    return { x, y };
  };
  
  // Rysuj dom
  const homePos = worldToMinimap(state.home.x, state.home.y);
  minimapCtx.font = '16px "Apple Color Emoji", "Segoe UI Emoji"';
  minimapCtx.fillText('🏠', homePos.x - 8, homePos.y + 8);
  
  // Rysuj niewiastę
  const womanPos = worldToMinimap(state.woman.x, state.woman.y);
  minimapCtx.font = '14px "Apple Color Emoji", "Segoe UI Emoji"';
  minimapCtx.fillText('👩', womanPos.x - 7, womanPos.y + 7);
  
  // Rysuj czarodzieja
  const wizardPos = worldToMinimap(state.wizard.x, state.wizard.y);
  minimapCtx.font = '14px "Apple Color Emoji", "Segoe UI Emoji"';
  minimapCtx.fillText('🧙', wizardPos.x - 7, wizardPos.y + 7);
  
  // Rysuj siedliska mobów (jaskinie)
  for(const nest of state.nests) {
    const nestPos = worldToMinimap(nest.x, nest.y);
    const enemyDef = ENEMIES[nest.type];
    if(enemyDef) {
      // Rysuj emoji jaskini (emoji wroga)
      minimapCtx.font = '10px "Apple Color Emoji", "Segoe UI Emoji"';
      minimapCtx.fillText(enemyDef.emoji, nestPos.x - 5, nestPos.y + 5);
    } else {
      // Fallback - kamień
      minimapCtx.font = '10px "Apple Color Emoji", "Segoe UI Emoji"';
      minimapCtx.fillText('🪨', nestPos.x - 5, nestPos.y + 5);
    }
  }
  
  // Rysuj gracza (środek)
  const playerPos = worldToMinimap(state.pos.x, state.pos.y);
  minimapCtx.fillStyle = '#4ade80';
  minimapCtx.beginPath();
  minimapCtx.arc(playerPos.x, playerPos.y, 3, 0, Math.PI * 2);
  minimapCtx.fill();
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

// Start screen functions
function showStartScreen() {
  if(questModal && startGameBtn) {
    const startScreenLives = document.getElementById('startScreenLives');
    const startScreenLevel = document.getElementById('startScreenLevel');
    if(startScreenLives) startScreenLives.textContent = state.lives;
    if(startScreenLevel) startScreenLevel.textContent = state.level;
    
    questModal.style.display = 'flex';
    state.paused = true;
    
    // Aktualizuj status questów
    updateQuestLog();
  }
}

function hideStartScreen() {
  if(questModal) {
    questModal.style.display = 'none';
    state.paused = false;
  }
}

if(startGameBtn) {
  startGameBtn.addEventListener('click', () => {
    hideStartScreen();
  });
}


// Show start screen on game load
showStartScreen();

// === Virtual Joystick ===
const joystickEl = document.getElementById('joystick');
const joystickStick = document.getElementById('joystickStick');
const actionBtnA = document.getElementById('actionBtnA');
const actionBtnB = document.getElementById('actionBtnB');

if(joystickEl && joystickStick) {
  function updateJoystickBase() {
    const rect = joystickEl.getBoundingClientRect();
    joystick.baseX = rect.left + rect.width / 2;
    joystick.baseY = rect.top + rect.height / 2;
  }
  updateJoystickBase();
  window.addEventListener('resize', updateJoystickBase);
  
  function updateJoystickPosition(clientX, clientY) {
    const dx = clientX - joystick.baseX;
    const dy = clientY - joystick.baseY;
    const distance = Math.hypot(dx, dy);
    
    if(distance > joystick.maxDistance) {
      const angle = Math.atan2(dy, dx);
      joystick.stickX = Math.cos(angle) * joystick.maxDistance;
      joystick.stickY = Math.sin(angle) * joystick.maxDistance;
    } else {
      joystick.stickX = dx;
      joystick.stickY = dy;
    }
    
    joystickStick.style.transform = `translate(calc(-50% + ${joystick.stickX}px), calc(-50% + ${joystick.stickY}px))`;
    
    // Normalizuj do -1..1
    const normalizedX = joystick.stickX / joystick.maxDistance;
    const normalizedY = joystick.stickY / joystick.maxDistance;
    
    // Ustaw klawisze wirtualne
    keys['arrowleft'] = normalizedX < -0.3;
    keys['arrowright'] = normalizedX > 0.3;
    keys['arrowup'] = normalizedY < -0.3;
    keys['arrowdown'] = normalizedY > 0.3;
  }
  
  function resetJoystick() {
    joystick.active = false;
    joystick.touchId = null;
    joystick.stickX = 0;
    joystick.stickY = 0;
    if(joystickStick) {
      joystickStick.style.transform = 'translate(-50%, -50%)';
    }
    keys['arrowleft'] = false;
    keys['arrowright'] = false;
    keys['arrowup'] = false;
    keys['arrowdown'] = false;
  }
  
  joystickEl.addEventListener('touchstart', (e) => {
    if(joystick.active) return;
    e.preventDefault();
    const touch = e.touches[0];
    if(touch) {
      joystick.active = true;
      joystick.touchId = touch.identifier;
      updateJoystickPosition(touch.clientX, touch.clientY);
    }
  });
  
  joystickEl.addEventListener('touchmove', (e) => {
    if(!joystick.active) return;
    e.preventDefault();
    const touch = Array.from(e.touches).find(t => t.identifier === joystick.touchId);
    if(touch) {
      updateJoystickPosition(touch.clientX, touch.clientY);
    } else {
      // Touch zniknął - zresetuj
      resetJoystick();
    }
  });
  
  joystickEl.addEventListener('touchend', (e) => {
    if(!joystick.active) return;
    e.preventDefault();
    const touch = Array.from(e.changedTouches).find(t => t.identifier === joystick.touchId);
    if(touch) {
      resetJoystick();
    }
  });
  
  joystickEl.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    resetJoystick();
  });
  
  // Dodatkowe zabezpieczenie - globalne listenery dla touchcancel/touchend
  // na wypadek gdyby touch został przerwany poza obszarem gałki
  document.addEventListener('touchend', (e) => {
    if(joystick.active && joystick.touchId !== null) {
      const touch = Array.from(e.changedTouches).find(t => t.identifier === joystick.touchId);
      if(touch) {
        resetJoystick();
      }
    }
  }, { passive: true });
  
  document.addEventListener('touchcancel', (e) => {
    if(joystick.active && joystick.touchId !== null) {
      const touch = Array.from(e.changedTouches).find(t => t.identifier === joystick.touchId);
      if(touch) {
        resetJoystick();
      }
    }
  }, { passive: true });
  
  // Dodatkowe zabezpieczenie - reset przy starcie gry lub pauzie
  // Sprawdzaj co klatkę czy touch nadal istnieje
  setInterval(() => {
    if(joystick.active && joystick.touchId !== null) {
      // Sprawdź czy touch nadal istnieje
      const hasTouch = Array.from(document.querySelectorAll('*')).some(() => {
        // Sprawdź czy są jakieś aktywne touchy
        return false; // Uproszczone - zawsze resetuj jeśli jest problem
      });
      // Jeśli gałka jest aktywna ale nie ma ruchu przez dłuższy czas, zresetuj
      // (to będzie obsłużone przez normalne touchend/touchcancel)
    }
  }, 100);
}

// === Action Buttons ===
if(actionBtnA) {
  actionBtnA.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startMeleeSpin();
  });
  actionBtnA.addEventListener('click', () => {
    startMeleeSpin();
  });
}

if(actionBtnB) {
  actionBtnB.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const w = screenToWorld(canvas.width / 2, canvas.height / 2);
    fireArrow(null);
  });
  actionBtnB.addEventListener('click', () => {
    const w = screenToWorld(canvas.width / 2, canvas.height / 2);
    fireArrow(null);
  });
}

// init
spawnInitial();
requestAnimationFrame(loop);
updateHUD();
