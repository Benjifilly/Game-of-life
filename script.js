const canvas = document.getElementById('gridCanvas');
const ctx = canvas.getContext('2d', { alpha: false }); // Alpha false pour perf

// --- État du Jeu ---
let liveCells = new Set(); // Stocke les clés "x,y"
let isRunning = false;
let generation = 0;
let lastFrameTime = 0;
let simulationSpeed = 30; // Images par seconde cibles pour la simulation
let frameInterval = 1000 / simulationSpeed;

// --- Statistiques Avancées ---
let maxPopulation = 0;
let births = 0;
let deaths = 0;
let statsHistory = []; // { gen, pop }
const MAX_STATS_HISTORY = 100;

// --- Apparence ---
let cellColor = '#ffffff';
let backgroundColor = '#000000';
let gridColor = '#1a1a1a';

// --- Outils & Sélection ---
let currentTool = 'draw'; // 'draw' | 'erase' | 'select' | 'hand' | 'pattern'
let selectionBox = null; // { x, y, w, h } (Coordonnées monde)
let selectedCells = new Set(); // Cellules capturées dans la sélection
let isSelecting = false;
let isMovingSelection = false;
let selectionDragStart = null; // { x, y }
let selectionOffset = { x: 0, y: 0 }; // Déplacement visuel temporaire
let hasDragged = false; // Pour empêcher le menu contextuel après un drag
let currentStrokeChanges = new Map(); // key -> previousState (boolean) pour annuler le trait si pinch

// --- Patterns ---
let currentPattern = null; // Nom du pattern sélectionné
let patternGhost = []; // Liste des offsets [{x, y}] pour le pattern

// --- Historique (Undo/Redo) ---
let history = [];
let historyStep = -1;
const MAX_HISTORY = 50;

const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');

function saveState() {
    // Couper l'historique si on est au milieu
    if (historyStep < history.length - 1) {
        history = history.slice(0, historyStep + 1);
    }

    // Sauvegarder l'état actuel
    history.push(new Set(liveCells));
    historyStep++;

    // Limiter la taille
    if (history.length > MAX_HISTORY) {
        history.shift();
        historyStep--;
    }

    updateUndoRedoButtons();
}

function undo() {
    if (historyStep > 0) {
        historyStep--;
        liveCells = new Set(history[historyStep]);
        selectionBox = null;
        selectedCells.clear();
        draw();
        updateUI();
        updateUndoRedoButtons();
    }
}

function redo() {
    if (historyStep < history.length - 1) {
        historyStep++;
        liveCells = new Set(history[historyStep]);
        selectionBox = null;
        selectedCells.clear();
        draw();
        updateUI();
        updateUndoRedoButtons();
    }
}

function updateUndoRedoButtons() {
    if (undoBtn && redoBtn) {
        undoBtn.disabled = historyStep <= 0;
        redoBtn.disabled = historyStep >= history.length - 1;
        undoBtn.style.opacity = undoBtn.disabled ? 0.5 : 1;
        redoBtn.style.opacity = redoBtn.disabled ? 0.5 : 1;
    }
}

undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

// Helper to parse visual grids
function parseGrid(str) {
    const points = [];
    // Split by lines and remove empty lines at start/end
    const rows = str.split('\n').filter(r => r.trim().length > 0);
    if (rows.length === 0) return [];

    // Find the minimum indentation to correctly handle indented template literals
    // (Though we'll try to keep strings clean)

    const centerY = Math.floor(rows.length / 2);
    const centerX = Math.floor(rows[0].length / 2);

    rows.forEach((row, y) => {
        // We use trim() here assuming the pattern is defined as a block of dots/Os
        // If the pattern relies on leading spaces instead of dots, this would be an issue.
        // But we will use dots for dead cells in our definitions.
        const cleanRow = row.trim();
        [...cleanRow].forEach((char, x) => {
            if (char === 'O' || char === '#' || char === '*') {
                points.push({x: x - centerX, y: y - centerY});
            }
        });
    });
    return points;
}

const patternCategories = {
    "Spaceships": [
        { name: "Glider", rle: `
.O.
..O
OOO` },
        { name: "Lightweight Spaceship (LWSS)", rle: `
.O..O
O....
O...O
OOOO.` },
        { name: "Middleweight Spaceship (MWSS)", rle: `
...O..
.O...O
O.....
O....O
OOOOO.` },
        { name: "Heavyweight Spaceship (HWSS)", rle: `
...OO..
.O....O
O......
O.....O
OOOOOO` },
        { name: "Copperhead", rle: `
.OO..OO.
...OO...
...OO...
O.O..O.O
O......O
........
O......O
.OO..OO.
..OOOO..
........
...OO...
...OO...` },
        { name: "Weekender", rle: `
.O............O.
.O............O.
O.O..........O.O
.O............O.
.O............O.
..O...OOOO...O..
......OOOO......
..OOOO....OOOO..
................
....O......O....
.....OO..OO.....` },
        { name: "Spider", rle: `
......O...OOO.....OOO...O......
...OO.OOOOO.OO...OO.OOOOO.OO...
.O.OO.O.....O.O.O.O.....O.OO.O.
O...O.O...OOOOO.OOOOO...O.O...O
....OOO.....OO...OO.....OOO....
.O..O.OOO.............OOO.O..O.
...O.......................O...` },
        { name: "Dart", rle: `
.......O.......
......O.O......
.....O...O.....
......OOO......
...............
....OO...OO....
..O...O.O...O..
.OO...O.O...OO.
O.....O.O.....O
.O.OO.O.O.OO.O.` },
        { name: "Cordership", rle: `
...................OO....................
...................OOOO..................
...................O.OO..................
.........................................
....................O....................
...................OO....................
...................OOO...................
.....................O...................
.................................OO......
.................................OO......
.........................................
.........................................
.........................................
.........................................
.........................................
.........................................
.........................................
....................................O....
...................................OO....
..................................O...O..
...................................OO..O.
........................................O
.....................................O.O.
......................................O..
......................................O..
......................................OO.
......................................OO.
.........................................
.........................................
.............O..........O................
............OOOOO.....O.OO...........O...
...........O..........O...O.........O....
............OO........OOO.O.........OO...
.............OO.........OO............O..
OO.............O.....................OOO.
OO...................................OOO.
.........................................
.........................................
.........................................
.........................................
.........................................
.........................................
........OO...............................
........OO...........OO..................
...................OO..O.................
........................O...O............
..................O.....O...O............
...................O..OO...O.O...........
....................OOO.....O............
............................O............` }
    ],
    "Oscillators": [
        { name: "Blinker", rle: `OOO` },
        { name: "Toad", rle: `
.OOO
OOO.` },
        { name: "Beacon", rle: `
OO..
OO..
..OO
..OO` },
        { name: "Pulsar", rle: `
..OOO...OOO..
.............
O....O.O....O
O....O.O....O
O....O.O....O
..OOO...OOO..
.............
..OOO...OOO..
O....O.O....O
O....O.O....O
O....O.O....O
.............
..OOO...OOO..` },
        { name: "Pentadecathlon", rle: `
..O....O..
OO.OOOO.OO
..O....O..` },
        { name: "Galaxy", rle: `
OOOOOO.OO
OOOOOO.OO
.......OO
OO.....OO
OO.....OO
OO.....OO
OO.......
OO.OOOOOO
OO.OOOOOO` },
        { name: "Clock", rle: `
..O.
O.O.
.O.O
.O..` },
        { name: "Queen Bee Shuttle", rle: `
.........O............
.......O.O............
......O.O.............
OO...O..O...........OO
OO....O.O...........OO
.......O.O............
.........O............` },
        { name: "Tumbler", rle: `
.O.....O.
O.O...O.O
O..O.O..O
..O...O..
..OO.OO..` }
    ],
    "Still Lifes": [
        { name: "Block", rle: `
OO
OO` },
        { name: "Beehive", rle: `
.OO.
O..O
.OO.` },
        { name: "Loaf", rle: `
.OO.
O..O
.O.O
..O.` },
        { name: "Boat", rle: `
OO.
O.O
.O.` },
        { name: "Tub", rle: `
.O.
O.O
.O.` }
    ],
    "Methuselahs": [
        { name: "R-pentomino", rle: `
.OO
OO.
.O.` },
        { name: "Diehard", rle: `
......O.
OO......
.O...OOO` },
        { name: "Acorn", rle: `
.O.....
...O...
OO..OOO` },
        { name: "Rabbits", rle: `
O...OOO
OOO..O.
.O.....` },
        { name: "Lidka", rle: `
..........OOO..
..........O....
..........O...O
...........O..O
............OOO
...............
.O.............
O.O............
.O.............` }
    ],
    "Guns": [
        { name: "Gosper Glider Gun", rle: `
........................O...........
......................O.O...........
............OO......OO............OO
...........O...O....OO............OO
OO........O.....O...OO..............
OO........O...O.OO....O.O...........
..........O.....O.......O...........
...........O...O....................
............OO......................` },
        { name: "Simkin Glider Gun", rle: `
OO.....OO........................
OO.....OO........................
.................................
....OO...........................
....OO...........................
.................................
.................................
.................................
.................................
......................OO.OO......
.....................O.....O.....
.....................O......O..OO
.....................OOO...O...OO
..........................O......
.................................
.................................
.................................
....................OO...........
....................O............
.....................OOO.........
.......................O.........` }
    ],
    "Puffers & Rakes": [
        { name: "Puffer 1", rle: `
.OOO......O.....O......OOO.
O..O.....OOO...OOO.....O..O
...O....OO.O...O.OO....O...
...O...................O...
...O..O.............O..O...
...O..OO...........OO..O...
..O...OO...........OO...O..` },
        { name: "Backrake 1", rle: `
.O..O...............
O...................
O...O...............
OOOO.........OO.....
......OOO.....OO....
......OO.OO......OOO
......OOO.....OO....
OOOO.........OO.....
O...O...............
O...................
.O..O...............` },
        { name: "Schick Engine", rle: `
.....OOO...........OOO.....
....O...O.........O...O....
...OO....O.......O....OO...
..O.O.OO.OO.....OO.OO.O.O..
.OO.O....O.OO.OO.O....O.OO.
O....O...O..O.O..O...O....O
............O.O............
OO.......OO.O.O.OO.......OO
............O.O............
......OOO.........OOO......
......O...O.........O......
......O.O....OOO...........
............O..O....OO.....
...............O...........
...........O...O...........
...........O...O...........
...............O...........
............O.O............` }
    ],
    "Spacefillers": [
        { name: "Max", rle: `
..................O........
.................OOO.......
............OOO....OO......
...........O..OOO..O.OO....
..........O...O.O..O.O.....
..........O....O.O.O.O.OO..
............O....O.O...OO..
OOOO.....O.O....O...O.OOO..
O...OO.O.OOO.OO.........OO.
O.....OO.....O.............
.O..OO.O..O..O.OO..........
.......O.O.O.O.O.O.....OOOO
.O..OO.O..O..O..OO.O.OO...O
O.....OO...O.O.O...OO.....O
O...OO.O.OO..O..O..O.OO..O.
OOOO.....O.O.O.O.O.O.......
..........OO.O..O..O.OO..O.
.............O.....OO.....O
.OO.........OO.OOO.O.OO...O
..OOO.O...O....O.O.....OOOO
..OO...O.O....O............
..OO.O.O.O.O....O..........
.....O.O..O.O...O..........
....OO.O..OOO..O...........
......OO....OOO............
.......OOO.................
........O..................` }
    ]
};

// Convertir les strings en objets points au chargement
const patterns = {};
for (const cat in patternCategories) {
    patternCategories[cat].forEach(p => {
        p.points = parseGrid(p.rle);
        patterns[p.name] = p.points;
    });
}

// --- Caméra & Vue ---
let scale = 20; // Pixels par cellule
let offsetX = 0; // Décalage X en pixels
let offsetY = 0; // Décalage Y en pixels
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let isDrawing = false;
let drawMode = true; // true = ajouter, false = effacer
let showGrid = true; // Afficher la grille

// --- Éléments UI ---
const playPauseBtn = document.getElementById('playPauseBtn');
const pencilBtn = document.getElementById('pencilBtn');
const eraserBtn = document.getElementById('eraserBtn');
const selectBtn = document.getElementById('selectBtn');
const handBtn = document.getElementById('handBtn');
const patternBtn = document.getElementById('patternBtn');
const clearBtn = document.getElementById('clearBtn');
const randomBtn = document.getElementById('randomBtn');
const speedRange = document.getElementById('speedRange');
const popDisplay = document.getElementById('population');
const genDisplay = document.getElementById('generation');
// const patternsMenu = document.getElementById('patterns-menu'); // Supprimé

// --- Modal Logic ---
const patternModal = document.getElementById('patternModal');
const closePatternModalBtn = patternModal.querySelector('.close-modal');
const categoriesList = document.getElementById('categoriesList');
const patternsGrid = document.getElementById('patternsGrid');
let activePreviewInterval = null;

function openPatternModal() {
    patternModal.style.display = 'block';
    renderCategories();
    // Sélectionner la première catégorie par défaut
    const firstCat = Object.keys(patternCategories)[0];
    selectCategory(firstCat);
}

function closePatternModal() {
    patternModal.classList.add('closing');
    patternModal.addEventListener('animationend', () => {
        patternModal.classList.remove('closing');
        patternModal.style.display = 'none';
        stopActivePreview();
    }, { once: true });
}

closePatternModalBtn.addEventListener('click', closePatternModal);
window.addEventListener('click', (e) => {
    if (e.target === patternModal) closePatternModal();
});

function renderCategories() {
    categoriesList.innerHTML = '';
    Object.keys(patternCategories).forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'category-btn';
        btn.textContent = cat;
        btn.onclick = () => selectCategory(cat);
        categoriesList.appendChild(btn);
    });
}

function selectCategory(category) {
    // Update active state
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent === category);
    });

    patternsGrid.innerHTML = '';
    const patternsList = patternCategories[category];

    patternsList.forEach(pattern => {
        const card = document.createElement('div');
        card.className = 'pattern-card';

        card.innerHTML = `
            <div class="preview-container">
                <canvas class="preview-canvas"></canvas>
            </div>
            <div class="pattern-info">
                <h3>${pattern.name}</h3>
            </div>
        `;

        const canvas = card.querySelector('canvas');

        // Initial render (static) with auto-fit
        setTimeout(() => {
            renderPreview(canvas, pattern.points);
        }, 0);

        // Auto-play on hover
        card.addEventListener('mouseenter', () => {
            startPreviewAnimation(canvas, pattern.points);
        });

        card.addEventListener('mouseleave', () => {
            stopActivePreview();
            renderPreview(canvas, pattern.points); // Reset to static
        });

        card.onclick = () => {
            patternGhost = pattern.points;
            setTool('pattern');
            closePatternModal();
        };

        patternsGrid.appendChild(card);
    });
}

function renderPreview(canvas, points, offset = null) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;

    ctx.fillStyle = '#080808'; // Match CSS background
    ctx.fillRect(0, 0, width, height);

    if (points.length === 0) return;

    // 1. Calculer la bounding box du pattern
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    points.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    });

    const pWidth = maxX - minX + 1;
    const pHeight = maxY - minY + 1;

    // 2. Calculer l'échelle optimale (avec marge)
    const margin = 60; // Increased margin for better visibility (dezoom)
    const scaleX = (width - margin * 2) / pWidth;
    const scaleY = (height - margin * 2) / pHeight;
    const pScale = Math.min(Math.max(scaleX, scaleY, 1), 15); // Min 1px, Max 15px

    // 3. Centrer
    // Si offset est fourni (animation), on l'utilise, sinon on centre statiquement
    let drawOffsetX, drawOffsetY;

    if (offset) {
        // Mode animation : on centre le monde (0,0) au centre du canvas
        // Mais on applique le scale calculé initialement pour que ça rentre
        drawOffsetX = width / 2;
        drawOffsetY = height / 2;
    } else {
        // Mode statique : on centre la bounding box
        const pCenterX = minX + pWidth / 2;
        const pCenterY = minY + pHeight / 2;
        drawOffsetX = (width / 2) - (pCenterX * pScale);
        drawOffsetY = (height / 2) - (pCenterY * pScale);
    }

    ctx.fillStyle = '#ffffff'; // Blanc pour la preview

    points.forEach(p => {
        // Coordonnées écran
        const sx = drawOffsetX + (p.x + (offset ? offset.x : 0)) * pScale;
        const sy = drawOffsetY + (p.y + (offset ? offset.y : 0)) * pScale;

        // Dessiner seulement si dans le canvas (avec petite marge)
        if (sx > -pScale && sx < width && sy > -pScale && sy < height) {
            ctx.fillRect(sx, sy, pScale - 1, pScale - 1);
        }
    });

    return { pScale, drawOffsetX, drawOffsetY }; // Retourner pour réutilisation si besoin
}

function startPreviewAnimation(canvas, initialPoints) {
    if (activePreviewInterval) {
        stopActivePreview();
    }

    // Calculer l'échelle une fois pour la cohérence visuelle
    // On fait un render "fake" pour récupérer le scale optimal du pattern initial
    const { pScale } = renderPreview(canvas, initialPoints);

    // Préparer la simulation
    // On va simuler sur un espace torique (monde qui boucle) pour que les vaisseaux ne partent pas
    // On définit une taille de monde virtuel basée sur la taille du canvas pour que ça boucle visuellement
    const visibleCols = Math.ceil(canvas.width / pScale);
    const visibleRows = Math.ceil(canvas.height / pScale);

    // Add a small buffer so it goes fully off screen before wrapping
    const buffer = 1;
    const worldWidth = visibleCols + buffer * 2;
    const worldHeight = visibleRows + buffer * 2;

    const halfWidth = worldWidth / 2;
    const halfHeight = worldHeight / 2;

    let currentPoints = new Set(initialPoints.map(p => `${p.x},${p.y}`));

    activePreviewInterval = setInterval(() => {
        const neighborCounts = new Map();
        const nextCells = new Set();

        // Logique torique
        for (const key of currentPoints) {
            const [x, y] = key.split(',').map(Number);

            // Voisins avec wrapping
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (dx === 0 && dy === 0) continue;

                    let nx = x + dx;
                    let ny = y + dy;

                    // Wrap logic
                    if (nx > halfWidth) nx -= worldWidth;
                    if (nx < -halfWidth) nx += worldWidth;
                    if (ny > halfHeight) ny -= worldHeight;
                    if (ny < -halfHeight) ny += worldHeight;

                    const nKey = `${nx},${ny}`;
                    neighborCounts.set(nKey, (neighborCounts.get(nKey) || 0) + 1);
                }
            }
        }

        for (const [key, count] of neighborCounts) {
            // Vérifier si la cellule était vivante
            // Attention: currentPoints contient les coordonnées wrappées
            if (count === 3 || (count === 2 && currentPoints.has(key))) {
                nextCells.add(key);
            }
        }
        currentPoints = nextCells;

        if (currentPoints.size === 0) {
            stopActivePreview();
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            return;
        }

        // Convertir pour render
        const pointsArray = [];
        for (const key of currentPoints) {
            const [x, y] = key.split(',').map(Number);
            pointsArray.push({x, y});
        }

        // Render avec le scale fixe calculé au début, centré sur 0,0
        // On réutilise la logique de renderPreview mais en forçant le mode "offset" (animation)
        // On passe offset {x:0, y:0} pour dire "dessine tel quel par rapport au centre"

        // Hack: On réimplémente un render partiel ici pour forcer le scale
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        ctx.fillStyle = '#000000'; // Noir pur
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#ffffff'; // Blanc

        const drawOffsetX = width / 2;
        const drawOffsetY = height / 2;

        pointsArray.forEach(p => {
            const sx = drawOffsetX + p.x * pScale;
            const sy = drawOffsetY + p.y * pScale;
            ctx.fillRect(sx, sy, pScale - 1, pScale - 1);
        });

    }, 100);
}

function stopActivePreview() {
    if (activePreviewInterval) {
        clearInterval(activePreviewInterval);
        activePreviewInterval = null;
    }
}

// --- Initialisation ---
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    // Centrer la vue au démarrage
    if (generation === 0 && liveCells.size === 0) {
        offsetX = canvas.width / 2;
        offsetY = canvas.height / 2;
    }
    draw();
}
window.addEventListener('resize', resize);
resize();

// --- Logique du Jeu de la Vie (Optimisée) ---

function nextGeneration() {
    const neighborCounts = new Map();
    const nextCells = new Set();

    // 1. Compter les voisins pour toutes les cellules vivantes
    // Optimisation: Parsing manuel et inlining pour éviter l'allocation de tableaux/strings
    for (const cellKey of liveCells) {
        const commaIndex = cellKey.indexOf(',');
        const x = +cellKey.substring(0, commaIndex);
        const y = +cellKey.substring(commaIndex + 1);

        // Voisins (Unrolled)
        let k;
        
        k = (x - 1) + ',' + (y - 1); neighborCounts.set(k, (neighborCounts.get(k) || 0) + 1);
        k = x + ',' + (y - 1);       neighborCounts.set(k, (neighborCounts.get(k) || 0) + 1);
        k = (x + 1) + ',' + (y - 1); neighborCounts.set(k, (neighborCounts.get(k) || 0) + 1);
        
        k = (x - 1) + ',' + y;       neighborCounts.set(k, (neighborCounts.get(k) || 0) + 1);
        k = (x + 1) + ',' + y;       neighborCounts.set(k, (neighborCounts.get(k) || 0) + 1);
        
        k = (x - 1) + ',' + (y + 1); neighborCounts.set(k, (neighborCounts.get(k) || 0) + 1);
        k = x + ',' + (y + 1);       neighborCounts.set(k, (neighborCounts.get(k) || 0) + 1);
        k = (x + 1) + ',' + (y + 1); neighborCounts.set(k, (neighborCounts.get(k) || 0) + 1);
    }

    // 2. Appliquer les règles
    let currentBirths = 0;

    for (const [cellKey, count] of neighborCounts) {
        if (count === 3) {
            // Naissance
            nextCells.add(cellKey);
            if (!liveCells.has(cellKey)) currentBirths++;
        } else if (count === 2) {
            // Survie (seulement si déjà vivante)
            if (liveCells.has(cellKey)) {
                nextCells.add(cellKey);
            }
        }
    }

    // Calculer les morts
    births = currentBirths;
    deaths = liveCells.size - (nextCells.size - births);
    maxPopulation = Math.max(maxPopulation, nextCells.size);

    // Historique pour le graphique
    statsHistory.push({
        gen: generation + 1,
        pop: nextCells.size
    });
    if (statsHistory.length > MAX_STATS_HISTORY) {
        statsHistory.shift();
    }

    liveCells = nextCells;
    generation++;
    updateUI();

    if (liveCells.size === 0 && isRunning) {
        isRunning = false;
        const iconPath = playPauseBtn.querySelector('path');
        iconPath.setAttribute('d', 'M8 5v14l11-7z');
        playPauseBtn.classList.remove('active');
    }
}

// --- Rendu (Optimisé) ---

function draw() {
    // 1. Effacer l'écran (Fond Noir)
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Dessiner la grille (optionnel, s'estompe si trop dézoomé)
    if (showGrid && scale > 5) {
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.beginPath();

        // Calculer les limites visibles de la grille
        const startCol = Math.floor(-offsetX / scale);
        const endCol = startCol + (canvas.width / scale) + 1;
        const startRow = Math.floor(-offsetY / scale);
        const endRow = startRow + (canvas.height / scale) + 1;

        // Lignes verticales
        for (let c = startCol; c <= endCol; c++) {
            const x = Math.floor(c * scale + offsetX) + 0.5; // +0.5 pour netteté
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
        }
        // Lignes horizontales
        for (let r = startRow; r <= endRow; r++) {
            const y = Math.floor(r * scale + offsetY) + 0.5;
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
        }
        ctx.stroke();
    }

    // 3. Dessiner les cellules vivantes
    ctx.fillStyle = cellColor;

    // Optimisation: Ne dessiner que ce qui est visible
    // On pourrait itérer sur toutes les cellules si le zoom est loin,
    // mais pour un zoom proche, on vérifie les bornes.
    // Vu que c'est une Map sparse, itérer est souvent plus rapide que scanner l'écran sauf si la map est énorme.

    const visibleMargin = 1; // Marge pour éviter le clipping
    const minX = -offsetX / scale - visibleMargin;
    const maxX = (canvas.width - offsetX) / scale + visibleMargin;
    const minY = -offsetY / scale - visibleMargin;
    const maxY = (canvas.height - offsetY) / scale + visibleMargin;

    ctx.beginPath();
    // Dessiner les cellules normales (non sélectionnées si en mouvement)
    const cellsToDraw = isMovingSelection ? liveCells : new Set([...liveCells, ...selectedCells]);

    // Si on déplace la sélection, on ne dessine pas les cellules originales qui sont dans la sélection
    // (Elles sont "soulevées")

    for (const cellKey of liveCells) {
        if (isMovingSelection && selectedCells.has(cellKey)) continue;

        // Optimisation: Parsing manuel plus rapide que split
        const commaIndex = cellKey.indexOf(',');
        const gx = parseInt(cellKey.substring(0, commaIndex));
        const gy = parseInt(cellKey.substring(commaIndex + 1));

        // Culling (ne dessiner que si visible)
        if (gx >= minX && gx <= maxX && gy >= minY && gy <= maxY) {
            const screenX = gx * scale + offsetX;
            const screenY = gy * scale + offsetY;

            // Dessiner un carré légèrement plus petit que la grille pour l'esthétique
            const size = Math.max(scale - 1, 1);
            ctx.rect(screenX, screenY, size, size);
        }
    }
    ctx.fill();

    // 4. Dessiner la sélection
    if (selectionBox) {
        // Dessiner la boîte de sélection
        let bx = selectionBox.x * scale + offsetX;
        let by = selectionBox.y * scale + offsetY;

        // Ajouter le décalage visuel si on déplace
        if (isMovingSelection) {
            bx += selectionOffset.x;
            by += selectionOffset.y;
        }

        const bw = selectionBox.w * scale;
        const bh = selectionBox.h * scale;

        // Fond semi-transparent
        ctx.fillStyle = 'rgba(33, 150, 243, 0.2)';
        ctx.fillRect(bx, by, bw, bh);

        // Bordure
        ctx.strokeStyle = '#2196F3';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, bh);

        // Dessiner les cellules sélectionnées (si en mouvement)
        if (isMovingSelection || selectedCells.size > 0) {
            ctx.fillStyle = '#90CAF9'; // Couleur légèrement différente pour la sélection
            ctx.beginPath();

            // Calculer le décalage en grille
            const moveX = Math.round(selectionOffset.x / scale);
            const moveY = Math.round(selectionOffset.y / scale);

            for (const cellKey of selectedCells) {
                const commaIndex = cellKey.indexOf(',');
                const gx = parseInt(cellKey.substring(0, commaIndex));
                const gy = parseInt(cellKey.substring(commaIndex + 1));

                // Position finale = Position originale + Décalage
                const finalX = gx + (isMovingSelection ? moveX : 0);
                const finalY = gy + (isMovingSelection ? moveY : 0);

                if (finalX >= minX && finalX <= maxX && finalY >= minY && finalY <= maxY) {
                    const screenX = finalX * scale + offsetX;
                    const screenY = finalY * scale + offsetY;
                    const size = Math.max(scale - 1, 1);
                    ctx.rect(screenX, screenY, size, size);
                }
            }
            ctx.fill();
        }
    } else if (isSelecting && selectionDragStart) {
        // Dessiner le rectangle de sélection en cours
        const startScreenX = selectionDragStart.x * scale + offsetX;
        const startScreenY = selectionDragStart.y * scale + offsetY;
        const currentScreenX = lastMouseX; // Mis à jour par mousemove
        const currentScreenY = lastMouseY;

        const w = currentScreenX - startScreenX;
        const h = currentScreenY - startScreenY;

        ctx.fillStyle = 'rgba(33, 150, 243, 0.2)';
        ctx.fillRect(startScreenX, startScreenY, w, h);

        ctx.strokeStyle = '#2196F3';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(startScreenX, startScreenY, w, h);
        ctx.setLineDash([]);
    }

    // 5. Dessiner le fantôme du pattern (si outil pattern actif)
    if (currentTool === 'pattern' && patternGhost.length > 0) {
        const { x: mx, y: my } = screenToWorld(lastMouseX, lastMouseY);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        for (const p of patternGhost) {
            const px = mx + p.x;
            const py = my + p.y;

            // Vérifier visibilité (optionnel pour ghost mais mieux)
            if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
                const screenX = px * scale + offsetX;
                const screenY = py * scale + offsetY;
                const size = Math.max(scale - 1, 1);
                ctx.rect(screenX, screenY, size, size);
            }
        }
        ctx.fill();
    }
}

// --- Boucle Principale ---

function loop(timestamp) {
    if (!lastFrameTime) lastFrameTime = timestamp;
    const elapsed = timestamp - lastFrameTime;

    if (isRunning) {
        if (elapsed > frameInterval) {
            nextGeneration();
            lastFrameTime = timestamp - (elapsed % frameInterval);
            draw();
        }
    } else {
        // Si en pause, on redessine quand même pour la fluidité du pan/zoom
        // Mais on limite le redraw aux événements pour économiser la batterie (géré par les listeners)
    }

    if (isRunning) {
        requestAnimationFrame(loop);
    }
}

// --- Gestion des Entrées (Souris/Clavier) ---

function screenToWorld(sx, sy) {
    return {
        x: Math.floor((sx - offsetX) / scale),
        y: Math.floor((sy - offsetY) / scale)
    };
}

// Zoom (Molette)
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();

    const zoomIntensity = 0.1;
    const mouseX = e.clientX;
    const mouseY = e.clientY;

    // Calculer la position de la souris dans le monde AVANT le zoom
    const worldXBefore = (mouseX - offsetX) / scale;
    const worldYBefore = (mouseY - offsetY) / scale;

    // Appliquer le zoom
    if (e.deltaY < 0) {
        scale *= (1 + zoomIntensity);
    } else {
        scale *= (1 - zoomIntensity);
    }

    // Limites de zoom (pour éviter les bugs flottants extrêmes)
    scale = Math.max(0.05, Math.min(scale, 200));

    // Recalculer l'offset pour que la souris reste au même point du monde
    offsetX = mouseX - worldXBefore * scale;
    offsetY = mouseY - worldYBefore * scale;

    draw();
}, { passive: false });

// --- Unified Input Handling (Mouse & Touch) ---

function getPointerPos(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

function onPointerDown(clientX, clientY, button) {
    const pos = getPointerPos(clientX, clientY);
    const x = pos.x;
    const y = pos.y;

    lastMouseX = x;
    lastMouseY = y;
    hasDragged = false;

    // Clic Droit ou Molette -> Panoramique
    if (button === 2 || button === 1) {
        isDragging = true;
        canvas.style.cursor = 'grabbing';
        return;
    }

    if (button === 0) { // Clic gauche
        const { x: wx, y: wy } = screenToWorld(x, y);

        if (currentTool === 'hand') {
            isDragging = true;
            canvas.style.cursor = 'grabbing';
        } else if (currentTool === 'pattern') {
            // Tamponner le pattern
            if (patternGhost.length > 0) {
                for (const p of patternGhost) {
                    liveCells.add(`${wx + p.x},${wy + p.y}`);
                }
                draw();
                updateUI();
                saveState();
                setTool('draw'); // Switch back to draw mode
            }
        } else if (currentTool === 'select') {
            if (selectionBox &&
                wx >= selectionBox.x && wx < selectionBox.x + selectionBox.w &&
                wy >= selectionBox.y && wy < selectionBox.y + selectionBox.h) {

                isMovingSelection = true;
                selectionDragStart = { x: x, y: y }; // Screen coords pour drag
                selectionOffset = { x: 0, y: 0 };
            } else {
                isSelecting = true;
                selectionBox = null;
                selectedCells.clear();
                selectionDragStart = { x: wx, y: wy }; // World coords pour création
            }
        } else {
            // Outil Dessin (Pencil) ou Gomme (Eraser)
            if (selectionBox) {
                selectionBox = null;
                selectedCells.clear();
                draw();
                return;
            }

            isDrawing = true;
            const key = `${wx},${wy}`;

            if (currentTool === 'erase') {
                drawMode = false;
            } else {
                drawMode = !liveCells.has(key);
            }
            toggleCell(wx, wy, drawMode);
        }
    }
    draw();
}

function onPointerMove(clientX, clientY, dx, dy) {
    const pos = getPointerPos(clientX, clientY);
    const x = pos.x;
    const y = pos.y;

    lastMouseX = x;
    lastMouseY = y;

    if (isDragging) {
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) hasDragged = true;
        offsetX += dx;
        offsetY += dy;
        draw();
    } else if (isDrawing) {
        const { x: wx, y: wy } = screenToWorld(x, y);
        toggleCell(wx, wy, drawMode);
    } else if (isSelecting) {
        draw();
    } else if (isMovingSelection) {
        selectionOffset.x = x - selectionDragStart.x;
        selectionOffset.y = y - selectionDragStart.y;
        draw();
    } else if (currentTool === 'pattern') {
        draw();
    }
}

function onPointerUp(clientX, clientY, isCtrl) {
    const pos = getPointerPos(clientX, clientY);
    const x = pos.x;
    const y = pos.y;

    if (isDragging) {
        isDragging = false;
        canvas.style.cursor = currentTool === 'hand' ? 'grab' : (currentTool === 'select' ? 'default' : 'crosshair');
    }
    if (isDrawing) {
        isDrawing = false;
        currentStrokeChanges.clear(); // Valider le trait
        saveState();
    }

    if (isSelecting) {
        isSelecting = false;
        const { x: endX, y: endY } = screenToWorld(x, y);
        const startX = selectionDragStart.x;
        const startY = selectionDragStart.y;

        // Normaliser le rectangle
        const rx = Math.min(startX, endX);
        const ry = Math.min(startY, endY);
        const w = Math.abs(endX - startX) + 1;
        const h = Math.abs(endY - startY) + 1;

        if (w > 0 && h > 0) {
            selectionBox = { x: rx, y: ry, w, h };
            selectedCells.clear();
            for (const key of liveCells) {
                const [cx, cy] = key.split(',').map(Number);
                if (cx >= rx && cx < rx + w && cy >= ry && cy < ry + h) {
                    selectedCells.add(key);
                }
            }
        } else {
            selectionBox = null;
        }
        draw();
    }

    if (isMovingSelection) {
        isMovingSelection = false;

        const moveX = Math.round(selectionOffset.x / scale);
        const moveY = Math.round(selectionOffset.y / scale);

        if (moveX !== 0 || moveY !== 0) {
            const newCells = new Set();
            const isCopy = isCtrl;

            if (!isCopy) {
                for (const key of selectedCells) {
                    liveCells.delete(key);
                }
            }

            for (const key of selectedCells) {
                const [cx, cy] = key.split(',').map(Number);
                const newKey = `${cx + moveX},${cy + moveY}`;
                liveCells.add(newKey);
                newCells.add(newKey);
            }

            selectedCells = newCells;
            selectionBox.x += moveX;
            selectionBox.y += moveY;
        }

        selectionOffset = { x: 0, y: 0 };
        draw();
        updateUI();
        saveState();
    }
}

// Mouse Listeners
canvas.addEventListener('mousedown', (e) => onPointerDown(e.clientX, e.clientY, e.button));
window.addEventListener('mousemove', (e) => onPointerMove(e.clientX, e.clientY, e.movementX, e.movementY));
window.addEventListener('mouseup', (e) => onPointerUp(e.clientX, e.clientY, e.ctrlKey));

// Touch Listeners
let lastPinchDist = -1;
let isPinching = false;
let lastPinchCenter = { x: 0, y: 0 };

// Empêcher les gestes natifs iOS (zoom page, retour arrière)
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('gestureend', (e) => e.preventDefault());

canvas.addEventListener('touchstart', (e) => {
    if (e.cancelable) e.preventDefault();

    if (e.touches.length === 1) {
        const t = e.touches[0];
        // Init last positions for drag calc
        const pos = getPointerPos(t.clientX, t.clientY);
        lastMouseX = pos.x;
        lastMouseY = pos.y;
        onPointerDown(t.clientX, t.clientY, 0);
    } else if (e.touches.length === 2) {
        // Si on était en train de dessiner avec le premier doigt, on annule
        if (isDrawing) {
            cancelCurrentStroke();
        }
        
        isPinching = true;
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        lastPinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        lastPinchCenter = {
            x: (t1.clientX + t2.clientX) / 2,
            y: (t1.clientY + t2.clientY) / 2
        };
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    if (e.cancelable) e.preventDefault();

    if (e.touches.length === 1 && !isPinching) {
        const t = e.touches[0];
        const pos = getPointerPos(t.clientX, t.clientY);
        const dx = pos.x - lastMouseX;
        const dy = pos.y - lastMouseY;
        onPointerMove(t.clientX, t.clientY, dx, dy);
    } else if (e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const currentCenter = {
            x: (t1.clientX + t2.clientX) / 2,
            y: (t1.clientY + t2.clientY) / 2
        };

        // Pan (Déplacement à 2 doigts)
        const dx = currentCenter.x - lastPinchCenter.x;
        const dy = currentCenter.y - lastPinchCenter.y;
        offsetX += dx;
        offsetY += dy;

        // Zoom (Pincement)
        if (lastPinchDist > 0) {
            const zoom = dist / lastPinchDist;
            
            // Calculer la position monde sous le centre du pincement (après le pan)
            // Note: Pour le pinch, on utilise les coords client directes car le calcul de centre est relatif
            // Mais idéalement on devrait aussi corriger par getPointerPos si le canvas est décalé.
            // Pour l'instant on suppose que le canvas est plein écran ou que l'erreur est minime pour le zoom.
            // Correction simple : utiliser getPointerPos pour le centre
            const centerPos = getPointerPos(currentCenter.x, currentCenter.y);
            
            const worldX = (centerPos.x - offsetX) / scale;
            const worldY = (centerPos.y - offsetY) / scale;

            // Appliquer le zoom
            scale *= zoom;
            scale = Math.max(0.05, Math.min(scale, 200));

            // Ajuster l'offset pour maintenir le point monde sous le centre
            offsetX = centerPos.x - worldX * scale;
            offsetY = centerPos.y - worldY * scale;
        }

        lastPinchDist = dist;
        lastPinchCenter = currentCenter;
        
        draw();
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    if (e.cancelable) e.preventDefault();
    // Touchend fires for the touch that was removed
    // We assume if 0 touches left, interaction ended
    if (e.touches.length === 0) {
        // On utilise lastMouseX/Y qui sont déjà corrigés
        // Mais onPointerUp attend des clientX/Y bruts pour recalculer getPointerPos
        // C'est un peu redondant mais pour garder la signature cohérente :
        // On va tricher et passer des valeurs qui donneront les bons x/y une fois corrigés
        // Ou plus simplement, modifier onPointerUp pour utiliser lastMouseX/Y si pas d'arguments
        // Pour l'instant, on passe les coordonnées écran approximatives (rect.left + lastMouseX)
        const rect = canvas.getBoundingClientRect();
        onPointerUp(lastMouseX + rect.left, lastMouseY + rect.top, false);
    }
    if (e.touches.length < 2) {
        lastPinchDist = -1;
        isPinching = false;
    }
});

// Raccourcis Clavier
window.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectionBox && selectedCells.size > 0) {
            for (const key of selectedCells) {
                liveCells.delete(key);
            }
            selectedCells.clear();
            draw();
            updateUI();
            saveState();
        }
    }

    // Undo / Redo
    if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
    }
    if (e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        redo();
    }

    // Outils
    switch(e.key.toLowerCase()) {
        case 'd': setTool('draw'); break;
        case 'e': setTool('erase'); break;
        case 's': setTool('select'); break;
        case 'h': setTool('hand'); break;
        case 'p': openPatternModal(); break;
        case ' ': playPauseBtn.click(); break;
    }
});

canvas.addEventListener('contextmenu', e => e.preventDefault());

function toggleCell(x, y, state) {
    const key = `${x},${y}`;
    const wasAlive = liveCells.has(key);

    if (state !== wasAlive) {
        // Enregistrer le changement pour pouvoir l'annuler si c'est un début de pinch
        if (isDrawing && !currentStrokeChanges.has(key)) {
            currentStrokeChanges.set(key, wasAlive);
        }

        if (state) {
            liveCells.add(key);
        } else {
            liveCells.delete(key);
        }
        draw();
        updateUI();
    }
}

function cancelCurrentStroke() {
    if (currentStrokeChanges.size > 0) {
        for (const [key, wasAlive] of currentStrokeChanges) {
            if (wasAlive) liveCells.add(key);
            else liveCells.delete(key);
        }
        currentStrokeChanges.clear();
        draw();
        updateUI();
    }
    isDrawing = false;
}

// --- Gestion des Outils ---

function setTool(tool) {
    currentTool = tool;

    // Reset UI states
    [pencilBtn, eraserBtn, selectBtn, handBtn, patternBtn].forEach(btn => btn.classList.remove('active'));

    // Set active button
    if (tool === 'draw') pencilBtn.classList.add('active');
    else if (tool === 'erase') eraserBtn.classList.add('active');
    else if (tool === 'select') selectBtn.classList.add('active');
    else if (tool === 'hand') handBtn.classList.add('active');
    else if (tool === 'pattern') patternBtn.classList.add('active');

    // Cursor
    if (tool === 'hand') canvas.style.cursor = 'grab';
    else if (tool === 'select') canvas.style.cursor = 'default';
    else if (tool === 'pattern') canvas.style.cursor = 'none'; // On dessine le ghost
    else canvas.style.cursor = 'crosshair';

    // Reset selection if changing tool (optional, but cleaner)
    if (tool !== 'select') {
        selectionBox = null;
        selectedCells.clear();
        draw();
    }
}

// --- Contrôles UI ---

function updateUI() {
    popDisplay.textContent = liveCells.size;
    genDisplay.textContent = generation;
    updateStatsUI();
}

function updateStatsUI() {
    // Update modal values if open
    if (settingsModal.style.display !== 'none') {
        popModal.textContent = liveCells.size;
        genModal.textContent = generation;
        
        const maxPopDisplay = document.getElementById('maxPopDisplay');
        const birthsDisplay = document.getElementById('birthsDisplay');
        const deathsDisplay = document.getElementById('deathsDisplay');
        
        if (maxPopDisplay) maxPopDisplay.textContent = maxPopulation;
        if (birthsDisplay) birthsDisplay.textContent = births;
        if (deathsDisplay) deathsDisplay.textContent = deaths;

        drawStatsChart();
    }
}

function drawStatsChart(highlightIndex = -1) {
    const canvas = document.getElementById('statsChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    if (statsHistory.length < 2) return;
    
    // Trouver le min/max pour l'échelle Y
    let minPop = Infinity;
    let maxPop = -Infinity;
    
    statsHistory.forEach(s => {
        if (s.pop < minPop) minPop = s.pop;
        if (s.pop > maxPop) maxPop = s.pop;
    });
    
    // Ajouter une marge
    const range = maxPop - minPop;
    const padding = range * 0.1;
    const yMin = Math.max(0, minPop - padding);
    const yMax = maxPop + padding;
    
    // Dessiner la ligne
    ctx.beginPath();
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 2;
    
    const stepX = width / (MAX_STATS_HISTORY - 1);
    
    statsHistory.forEach((s, i) => {
        const x = i * stepX;
        // Inverser Y car canvas 0 est en haut
        const normalizedY = (s.pop - yMin) / (yMax - yMin || 1);
        const y = height - (normalizedY * height);
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    
    ctx.stroke();
    
    // Remplir sous la courbe
    ctx.lineTo(statsHistory.length * stepX, height);
    ctx.lineTo(0, height);
    ctx.fillStyle = 'rgba(76, 175, 80, 0.1)';
    ctx.fill();

    // Draw Highlight
    if (highlightIndex !== -1 && highlightIndex < statsHistory.length) {
        const x = highlightIndex * stepX;
        const s = statsHistory[highlightIndex];
        
        // Vertical Line
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Dot
        const normalizedY = (s.pop - yMin) / (yMax - yMin || 1);
        const y = height - (normalizedY * height);
        
        ctx.beginPath();
        ctx.fillStyle = '#fff';
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Tooltip Text
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = x > width / 2 ? 'right' : 'left';
        const textX = x > width / 2 ? x - 10 : x + 10;
        ctx.fillText(`Gen: ${s.gen}`, textX, 20);
        ctx.fillText(`Pop: ${s.pop}`, textX, 35);
    }
}

function initChartInteractions() {
    const canvas = document.getElementById('statsChart');
    if (!canvas) return;

    canvas.addEventListener('mousemove', (e) => {
        if (statsHistory.length < 2) return;
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        
        const stepX = width / (MAX_STATS_HISTORY - 1);
        let index = Math.round(x / stepX);
        
        if (index < 0) index = 0;
        if (index >= statsHistory.length) index = statsHistory.length - 1;
        
        drawStatsChart(index);
    });

    canvas.addEventListener('mouseleave', () => {
        drawStatsChart(-1);
    });
}

// Call this at the end of script
initChartInteractions();

pencilBtn.addEventListener('click', () => setTool('draw'));
eraserBtn.addEventListener('click', () => setTool('erase'));
selectBtn.addEventListener('click', () => setTool('select'));
handBtn.addEventListener('click', () => setTool('hand'));

patternBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openPatternModal();
});

/* Supprimé car remplacé par le modal
function togglePatternsMenu() {
    const rect = patternBtn.getBoundingClientRect();
    patternsMenu.style.left = `${rect.left}px`;
    patternsMenu.style.bottom = `${window.innerHeight - rect.top + 10}px`; // Au dessus du bouton
    patternsMenu.classList.toggle('visible');
}

// Sélection de pattern
patternsMenu.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
        const patternName = item.dataset.pattern;
        if (patterns[patternName]) {
            patternGhost = patterns[patternName];
            setTool('pattern');
        }
        patternsMenu.classList.remove('visible');
    });
});

// Fermer menus au clic ailleurs
window.addEventListener('click', (e) => {
    if (!patternsMenu.contains(e.target) && e.target !== patternBtn && !patternBtn.contains(e.target)) {
        patternsMenu.classList.remove('visible');
    }
});
*/

// --- Context Menu ---
const contextMenu = document.getElementById('context-menu');
const ctxSelectionGroup = document.getElementById('ctx-selection-group');
const ctxDuplicate = document.getElementById('ctx-duplicate');
const ctxDeleteSel = document.getElementById('ctx-delete-sel');
const ctxCenter = document.getElementById('ctx-center');
const ctxRandom = document.getElementById('ctx-random');
const ctxClear = document.getElementById('ctx-clear');
const ctxCancel = document.getElementById('ctx-cancel');

canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (hasDragged) return;

    let showSelectionMenu = false;

    // Si on a une sélection et qu'on clique dedans
    if (selectionBox) {
        const { x, y } = screenToWorld(e.clientX, e.clientY);
        if (x >= selectionBox.x && x < selectionBox.x + selectionBox.w &&
            y >= selectionBox.y && y < selectionBox.y + selectionBox.h) {
            showSelectionMenu = true;
        }
    }

    if (showSelectionMenu) {
        ctxSelectionGroup.style.display = 'block';
    } else {
        ctxSelectionGroup.style.display = 'none';
    }

    // Afficher le menu
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.classList.add('visible');
});

// Cacher le menu au clic ailleurs
window.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
        contextMenu.classList.remove('visible');
    }
});

// Actions du menu
ctxDuplicate.addEventListener('click', () => {
    const newCells = new Set();
    const offsetX = 2;
    const offsetY = 2;

    for (const key of selectedCells) {
        const [cx, cy] = key.split(',').map(Number);
        const newKey = `${cx + offsetX},${cy + offsetY}`;
        liveCells.add(newKey);
        newCells.add(newKey);
    }

    selectedCells = newCells;
    selectionBox.x += offsetX;
    selectionBox.y += offsetY;

    draw();
    updateUI();
    saveState();
    contextMenu.classList.remove('visible');
});

ctxDeleteSel.addEventListener('click', () => {
    if (selectionBox && selectedCells.size > 0) {
        for (const key of selectedCells) {
            liveCells.delete(key);
        }
        selectedCells.clear();
        draw();
        updateUI();
        saveState();
    }
    contextMenu.classList.remove('visible');
});

ctxCenter.addEventListener('click', () => {
    offsetX = canvas.width / 2;
    offsetY = canvas.height / 2;
    scale = 20;
    draw();
    contextMenu.classList.remove('visible');
});

ctxRandom.addEventListener('click', () => {
    randomBtn.click();
    contextMenu.classList.remove('visible');
});

ctxClear.addEventListener('click', () => {
    clearBtn.click();
    contextMenu.classList.remove('visible');
});

ctxCancel.addEventListener('click', () => {
    contextMenu.classList.remove('visible');
});

playPauseBtn.addEventListener('click', () => {
    isRunning = !isRunning;
    const iconPath = playPauseBtn.querySelector('path');

    if (isRunning) {
        // Icone Pause
        iconPath.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
        playPauseBtn.classList.add('active');
        lastFrameTime = performance.now();
        requestAnimationFrame(loop);
    } else {
        // Icone Play
        iconPath.setAttribute('d', 'M8 5v14l11-7z');
        playPauseBtn.classList.remove('active');
    }
});

clearBtn.addEventListener('click', () => {
    liveCells.clear();
    generation = 0;
    isRunning = false;
    
    // Reset Stats
    maxPopulation = 0;
    births = 0;
    deaths = 0;
    statsHistory = [];

    // Reset Play Button
    const iconPath = playPauseBtn.querySelector('path');
    iconPath.setAttribute('d', 'M8 5v14l11-7z');
    playPauseBtn.classList.remove('active');

    draw();
    updateUI();
    saveState();
});

randomBtn.addEventListener('click', () => {
    liveCells.clear();
    generation = 0;
    
    // Reset Stats
    maxPopulation = 0;
    births = 0;
    deaths = 0;
    statsHistory = [];

    // Remplir une zone visible aléatoirement
    const cols = Math.ceil(canvas.width / scale);
    const rows = Math.ceil(canvas.height / scale);
    const startX = Math.floor(-offsetX / scale);
    const startY = Math.floor(-offsetY / scale);

    for (let x = 0; x < cols; x++) {
        for (let y = 0; y < rows; y++) {
            if (Math.random() > 0.85) { // 15% de chance d'être vivant
                liveCells.add(`${startX + x},${startY + y}`);
            }
        }
    }
    draw();
    updateUI();
    saveState();
});

speedRange.addEventListener('input', (e) => {
    simulationSpeed = parseInt(e.target.value);
    frameInterval = 1000 / simulationSpeed;
    // Sync with modal slider
    if (speedRangeModal) {
        speedRangeModal.value = e.target.value;
        speedValueDisplay.textContent = `${e.target.value} FPS`;
    }
});

// --- Settings Modal ---
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsModal = document.getElementById('closeSettingsModal');
const speedRangeModal = document.getElementById('speedRangeModal');
const speedValueDisplay = document.getElementById('speedValueDisplay');
const showGridToggle = document.getElementById('showGridToggle');
const cellColorPicker = document.getElementById('cellColorPicker');
const bgColorPicker = document.getElementById('bgColorPicker');
const gridColorPicker = document.getElementById('gridColorPicker');
const popModal = document.getElementById('popModal');
const genModal = document.getElementById('genModal');

function openSettingsModal() {
    settingsModal.style.display = 'block';
    // Sync values
    speedRangeModal.value = simulationSpeed;
    speedValueDisplay.textContent = `${simulationSpeed} FPS`;
    popModal.textContent = liveCells.size;
    genModal.textContent = generation;

    // Sync colors
    if (cellColorPicker) cellColorPicker.value = cellColor;
    if (bgColorPicker) bgColorPicker.value = backgroundColor;
    if (gridColorPicker) gridColorPicker.value = gridColor;
}

function closeSettingsModalFn() {
    settingsModal.classList.add('closing');
    setTimeout(() => {
        settingsModal.classList.remove('closing');
        settingsModal.style.display = 'none';
    }, 200);
}

settingsBtn.addEventListener('click', openSettingsModal);
closeSettingsModal.addEventListener('click', closeSettingsModalFn);
window.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeSettingsModalFn();
});

speedRangeModal.addEventListener('input', (e) => {
    simulationSpeed = parseInt(e.target.value);
    frameInterval = 1000 / simulationSpeed;
    speedValueDisplay.textContent = `${e.target.value} FPS`;
    // Sync with main slider
    speedRange.value = e.target.value;
});

showGridToggle.addEventListener('change', (e) => {
    showGrid = e.target.checked;
    draw();
});

cellColorPicker.addEventListener('input', (e) => {
    cellColor = e.target.value;
    draw();
});

bgColorPicker.addEventListener('input', (e) => {
    backgroundColor = e.target.value;
    draw();
});

gridColorPicker.addEventListener('input', (e) => {
    gridColor = e.target.value;
    draw();
});

// --- Toolbar Dragging (Desktop Only) ---
const controls = document.querySelector('.controls');
const dragHandle = document.querySelector('.drag-handle');
const uiLayer = document.getElementById('ui-layer');
let toolbarDrag = { active: false, startX: 0, startY: 0, initialLeft: 0, initialTop: 0 };

// Create Snap Preview Element
const snapPreview = document.createElement('div');
snapPreview.className = 'snap-preview';
document.body.appendChild(snapPreview);

function initToolbarDrag() {
    // Only enable on desktop
    if (window.matchMedia("(max-width: 768px)").matches) return;

    // Only drag from handle
    dragHandle.addEventListener('mousedown', startToolbarDrag);
    window.addEventListener('mousemove', moveToolbarDrag);
    window.addEventListener('mouseup', endToolbarDrag);
    window.addEventListener('resize', resetToolbarPosition);
}

function startToolbarDrag(e) {
    e.preventDefault();
    toolbarDrag.active = true;
    toolbarDrag.startX = e.clientX;
    toolbarDrag.startY = e.clientY;
    
    const rect = controls.getBoundingClientRect();
    
    // Move to body to ensure fixed positioning works relative to viewport
    // (Escapes #ui-layer transform)
    if (controls.parentElement !== document.body) {
        document.body.appendChild(controls);
    }
    
    // Switch to fixed positioning relative to viewport
    controls.style.position = 'fixed';
    controls.style.left = rect.left + 'px';
    controls.style.top = rect.top + 'px';
    controls.style.bottom = 'auto';
    controls.style.right = 'auto';
    controls.style.transform = 'none'; 
    controls.style.zIndex = '1000'; // Ensure it's on top
    
    // Remove docked classes to allow free movement
    controls.classList.remove('docked', 'docked-left', 'docked-right');
    controls.classList.add('dragging');
    
    toolbarDrag.initialLeft = rect.left;
    toolbarDrag.initialTop = rect.top;
    
    document.body.style.cursor = 'grabbing';
}

function moveToolbarDrag(e) {
    if (!toolbarDrag.active) return;
    
    const dx = e.clientX - toolbarDrag.startX;
    const dy = e.clientY - toolbarDrag.startY;
    
    const newLeft = toolbarDrag.initialLeft + dx;
    const newTop = toolbarDrag.initialTop + dy;
    
    controls.style.left = newLeft + 'px';
    controls.style.top = newTop + 'px';

    // Snap Preview Logic
    const previewThreshold = 400; // Zone d'apparition du preview
    const windowWidth = window.innerWidth;
    
    let opacity = 0;
    let scale = 0.9;
    let side = null;

    if (e.clientX < previewThreshold) {
        side = 'left';
        // Calculer l'intensité (0 à 1) en fonction de la proximité du bord
        // Plus on est proche de 0, plus c'est visible
        const dist = Math.max(0, e.clientX);
        const intensity = 1 - (dist / previewThreshold);
        opacity = Math.max(0, Math.min(intensity, 1));
        
    } else if (e.clientX > windowWidth - previewThreshold) {
        side = 'right';
        const dist = Math.max(0, windowWidth - e.clientX);
        const intensity = 1 - (dist / previewThreshold);
        opacity = Math.max(0, Math.min(intensity, 1));
    }

    if (side) {
        snapPreview.classList.add('visible', side);
        snapPreview.classList.remove(side === 'left' ? 'right' : 'left');
        
        // Animation scale: 0.9 -> 1.0
        scale = 0.9 + (0.1 * opacity);
        
        snapPreview.style.opacity = opacity;
        snapPreview.style.transform = `translateY(-50%) scale(${scale})`;
    } else {
        snapPreview.classList.remove('visible', 'left', 'right');
        snapPreview.style.opacity = 0;
        snapPreview.style.transform = `translateY(-50%) scale(0.9)`;
    }
}

function endToolbarDrag(e) {
    if (!toolbarDrag.active) return;
    
    toolbarDrag.active = false;
    document.body.style.cursor = '';
    controls.classList.remove('dragging');
    snapPreview.classList.remove('visible', 'left', 'right');
    snapPreview.style.opacity = '0';
    
    // Snapping Logic
    const snapThreshold = 120;
    const windowWidth = window.innerWidth;
    
    if (e.clientX < snapThreshold) {
        // Snap Left
        dockToolbar('left');
    } else if (e.clientX > windowWidth - snapThreshold) {
        // Snap Right
        dockToolbar('right');
    } else {
        // Float (keep current position but ensure inside bounds)
        const rect = controls.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width;
        const maxY = window.innerHeight - rect.height;
        
        let finalLeft = Math.max(0, Math.min(rect.left, maxX));
        let finalTop = Math.max(0, Math.min(rect.top, maxY));
        
        controls.style.left = finalLeft + 'px';
        controls.style.top = finalTop + 'px';
    }
}

function dockToolbar(side) {
    // Reset inline styles that conflict with classes
    controls.style.left = '';
    controls.style.top = '';
    controls.style.right = '';
    controls.style.bottom = '';
    controls.style.transform = '';
    
    controls.classList.add('docked');
    if (side === 'left') {
        controls.classList.add('docked-left');
        controls.classList.remove('docked-right');
    } else {
        controls.classList.add('docked-right');
        controls.classList.remove('docked-left');
    }
}

function resetToolbarPosition() {
    if (window.matchMedia("(max-width: 768px)").matches) {
        // Put back in ui-layer for mobile layout
        if (controls.parentElement !== uiLayer) {
            uiLayer.insertBefore(controls, uiLayer.firstChild);
        }

        // Reset to CSS defaults for mobile
        controls.style.position = '';
        controls.style.bottom = '';
        controls.style.left = '';
        controls.style.top = '';
        controls.style.transform = '';
        controls.style.right = '';
        controls.style.zIndex = '';
        controls.classList.remove('docked', 'docked-left', 'docked-right', 'dragging');
    }
}

// Initialize
initToolbarDrag();

// Initial draw
draw();
updateUI();
saveState(); // Initial state