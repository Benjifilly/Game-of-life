const canvas = document.getElementById('gridCanvas');
const ctx = canvas.getContext('2d', { alpha: false }); // Alpha false pour perf

// --- État du Jeu ---
let liveCells = new Set(); // Stocke les clés "x,y"
let isRunning = false;
let generation = 0;
let lastFrameTime = 0;
let simulationSpeed = 30; // Images par seconde cibles pour la simulation
let frameInterval = 1000 / simulationSpeed;

// --- Outils & Sélection ---
let currentTool = 'draw'; // 'draw' | 'erase' | 'select' | 'hand' | 'pattern'
let selectionBox = null; // { x, y, w, h } (Coordonnées monde)
let selectedCells = new Set(); // Cellules capturées dans la sélection
let isSelecting = false;
let isMovingSelection = false;
let selectionDragStart = null; // { x, y }
let selectionOffset = { x: 0, y: 0 }; // Déplacement visuel temporaire

// --- Patterns ---
let currentPattern = null; // Nom du pattern sélectionné
let patternGhost = []; // Liste des offsets [{x, y}] pour le pattern

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
        { name: "Cordership (Switch Engine)", rle: `
.O...
O.O..
.O..O
.OOO.
..O..
OOO..
OOO..` }
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
..O.....O................
..OOOOOO.................
..OO...OO................
...O...O.................
...OO...OO...............
...........O.............
.........OOO.............
........O................
........OO...............
......................OOO
......................O..
.......................O.
OO.......................
OO.......................` },
        { name: "Schick Engine", rle: `
..........O
........OOO
.......O..O
..OO...OO..
..OO...OO..
..OO...OO..
.......O..O
........OOO
..........O
..........O` }
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
........O.O.O.O.O.....OOOO.
.O..OO.O..O..O..OO.O.OO...O
O.....OO...O.O.O...OO.....O
O...OO.O.OO..O..O.O.OO..O..
OOOO.....O.O.O.O.O.O.......
..........OO.O..O..O.OO..O.
.............O.....OO.....O
.OO.........OO.OOO.O.OO....
..OOO.O...O....O.O.....OOOO
..OO...O.O....O............
..OO.O.O.O.O....O..........
.....O.O..O.O...O..........
....OO.O..OOO..O...........
......OO....OOO............
.......OOO.................
........O..................
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
const closeModalBtn = document.querySelector('.close-modal');
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
    patternModal.style.display = 'none';
    stopActivePreview();
}

closeModalBtn.addEventListener('click', closePatternModal);
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

function getNeighbors(key) {
    const [x, y] = key.split(',').map(Number);
    return [
        `${x-1},${y-1}`, `${x},${y-1}`, `${x+1},${y-1}`,
        `${x-1},${y}`,               `${x+1},${y}`,
        `${x-1},${y+1}`, `${x},${y+1}`, `${x+1},${y+1}`
    ];
}

function nextGeneration() {
    const neighborCounts = new Map();
    const nextCells = new Set();

    // 1. Compter les voisins pour toutes les cellules vivantes et leurs voisins
    for (const cellKey of liveCells) {
        const neighbors = getNeighbors(cellKey);
        for (const neighborKey of neighbors) {
            neighborCounts.set(neighborKey, (neighborCounts.get(neighborKey) || 0) + 1);
        }
    }

    // 2. Appliquer les règles
    for (const [cellKey, count] of neighborCounts) {
        if (count === 3) {
            // Naissance
            nextCells.add(cellKey);
        } else if (count === 2 && liveCells.has(cellKey)) {
            // Survie
            nextCells.add(cellKey);
        }
        // Sinon mort (sous-population ou surpopulation)
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
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Dessiner la grille (optionnel, s'estompe si trop dézoomé)
    if (scale > 5) {
        ctx.strokeStyle = '#1a1a1a';
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
    ctx.fillStyle = '#ffffff';
    
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

// Panoramique (Clic Droit ou Molette Clic) & Dessin (Clic Gauche)
canvas.addEventListener('mousedown', (e) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    // Clic Droit ou Molette -> Panoramique (Toujours dispo sauf si outil Hand actif en clic gauche)
    if (e.button === 2 || e.button === 1) { 
        isDragging = true;
        canvas.style.cursor = 'grabbing';
        return;
    } 
    
    if (e.button === 0) { // Clic gauche
        const { x, y } = screenToWorld(e.clientX, e.clientY);
        
        if (currentTool === 'hand') {
            isDragging = true;
            canvas.style.cursor = 'grabbing';
        } else if (currentTool === 'pattern') {
            // Tamponner le pattern
            if (patternGhost.length > 0) {
                for (const p of patternGhost) {
                    liveCells.add(`${x + p.x},${y + p.y}`);
                }
                draw();
                updateUI();
            }
        } else if (currentTool === 'select') {
            // Gestion de la sélection (inchangée)
            if (selectionBox && 
                x >= selectionBox.x && x < selectionBox.x + selectionBox.w &&
                y >= selectionBox.y && y < selectionBox.y + selectionBox.h) {
                
                isMovingSelection = true;
                selectionDragStart = { x: e.clientX, y: e.clientY };
                selectionOffset = { x: 0, y: 0 };
            } else {
                isSelecting = true;
                selectionBox = null;
                selectedCells.clear();
                selectionDragStart = { x, y };
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
            const key = `${x},${y}`;
            
            if (currentTool === 'eraser') {
                drawMode = false; // Force effacer
            } else {
                // Pencil: Toggle ou Draw ? Habituellement Pencil ajoute, mais toggle est sympa.
                // Restons sur le comportement précédent: Toggle au clic initial, puis maintien de l'état
                drawMode = !liveCells.has(key);
            }
            toggleCell(x, y, drawMode);
        }
    }
    draw();
});

window.addEventListener('mousemove', (e) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    if (isDragging) {
        const dx = e.movementX;
        const dy = e.movementY;
        offsetX += dx;
        offsetY += dy;
        draw();
    } else if (isDrawing) {
        const { x, y } = screenToWorld(e.clientX, e.clientY);
        toggleCell(x, y, drawMode);
    } else if (isSelecting) {
        draw();
    } else if (isMovingSelection) {
        selectionOffset.x = e.clientX - selectionDragStart.x;
        selectionOffset.y = e.clientY - selectionDragStart.y;
        draw();
    } else if (currentTool === 'pattern') {
        draw(); // Redessiner pour le ghost
    }
});

window.addEventListener('mouseup', (e) => {
    if (isDragging) {
        isDragging = false;
        canvas.style.cursor = currentTool === 'hand' ? 'grab' : (currentTool === 'select' ? 'default' : 'crosshair');
    }
    if (isDrawing) {
        isDrawing = false;
    }
    
    if (isSelecting) {
        isSelecting = false;
        const { x: endX, y: endY } = screenToWorld(e.clientX, e.clientY);
        const startX = selectionDragStart.x;
        const startY = selectionDragStart.y;

        // Normaliser le rectangle
        const x = Math.min(startX, endX);
        const y = Math.min(startY, endY);
        const w = Math.abs(endX - startX) + 1;
        const h = Math.abs(endY - startY) + 1;

        if (w > 0 && h > 0) {
            selectionBox = { x, y, w, h };
            selectedCells.clear();
            for (const key of liveCells) {
                const [cx, cy] = key.split(',').map(Number);
                if (cx >= x && cx < x + w && cy >= y && cy < y + h) {
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
            const isCopy = e.ctrlKey;

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
        }
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
    if (state) {
        liveCells.add(key);
    } else {
        liveCells.delete(key);
    }
    draw();
    updateUI();
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
}

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
    
    // Reset Play Button
    const iconPath = playPauseBtn.querySelector('path');
    iconPath.setAttribute('d', 'M8 5v14l11-7z');
    playPauseBtn.classList.remove('active');
    
    draw();
    updateUI();
});

randomBtn.addEventListener('click', () => {
    liveCells.clear();
    generation = 0;
    
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
});

speedRange.addEventListener('input', (e) => {
    simulationSpeed = parseInt(e.target.value);
    frameInterval = 1000 / simulationSpeed;
});

// Initial draw
draw();
updateUI();