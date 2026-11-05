// ========================================================
// Mignotes (Chromebook Edition) + CCnotes
// Motor Unificado de Notas e Circuitos Elétricos
// ========================================================

// Inicialização de Ícones Lucide
if (window.lucide) {
    lucide.createIcons();
}

// --------------------------------------------------------
// Constantes e Elementos do DOM (Mignotes)
// --------------------------------------------------------
const A4_WIDTH = 794;
const A4_HEIGHT = 1123;

const templateCanvas = document.getElementById('templateCanvas');
const templateCtx = templateCanvas.getContext('2d');
const highlighterCanvas = document.getElementById('highlighterCanvas');
const highlighterCtx = highlighterCanvas.getContext('2d');
const paintCanvas = document.getElementById('paintCanvas');
const paintCtx = paintCanvas.getContext('2d');
const previewCanvas = document.getElementById('previewCanvas');
const previewCtx = previewCanvas.getContext('2d');

const paperWrapper = document.getElementById('paperWrapper');
const paper = document.getElementById('paper');
const snapIndicator = document.getElementById('snapIndicator');
const placedBlocksContainer = document.getElementById('placedBlocksContainer');
const workspace = document.getElementById('workspace');

// Estados Globais de Desenho
let currentTool = 'pen'; // 'pen', 'pencil', 'highlighter', 'shape', 'eraser', 'select'
let currentShape = 'line'; // 'line', 'arrow_single', 'arrow_double', 'rect', 'rect_round', 'circle', 'triangle', 'diamond', 'star', 'callout'
let eraserMode = 'stroke'; // 'stroke', 'ink_path', 'total'
let currentColor = '#000000';
let currentSize = 3;

let isDrawing = false;
let startX = 0, startY = 0;
let lastCoord = null;
let strokeStartTime = 0;
let holdTimer = null;

let isOCRActive = false;
let ocrPoints = [];

let currentStrokes = []; // Traços e formas da folha ativa
let selectedElement = null; // Elemento selecionado (bloco, circuito ou forma)
let selectedShapeStroke = null; // Forma perfeita selecionada para mover
let shapeDragOffset = null; // Offset do arrasto da forma

let isSidebarOpen = true;

// Zoom Calibrado: degraus de 20% para baixo de 100% e de 25% para cima até 200% (Ponto 8)
const ZOOM_LEVELS = [0.4, 0.6, 0.8, 1.0, 1.25, 1.5, 1.75, 2.0];
let currentZoomIdx = 3; // 1.0 (100%)

// Templates de Folha A4
const TEMPLATES = ['grid_5mm', 'lines_margin', 'dots', 'blank'];
const TEMPLATE_NAMES = {
    'grid_5mm': 'Quadriculada 5mm',
    'lines_margin': 'Pautada c/ Margem',
    'dots': 'Pontilhada',
    'blank': 'Lisa'
};
let templateIdx = 0;

// Sistema de Cadernos com Abas Internas (Separadores)
let notebooks = {
    "Circuitos Elétricos I": {
        tabs: ["Teoria", "Exercícios"],
        activeTab: "Teoria",
        "Teoria": { strokes: [], blocks: [], circuits: [], templateIdx: 0 },
        "Exercícios": { strokes: [], blocks: [], circuits: [], templateIdx: 0 }
    },
    "Análise de Circuitos": {
        tabs: ["Teoria", "Leis de Kirchhoff", "Laboratório"],
        activeTab: "Teoria",
        "Teoria": { strokes: [], blocks: [], circuits: [], templateIdx: 0 },
        "Leis de Kirchhoff": { strokes: [], blocks: [], circuits: [], templateIdx: 0 },
        "Laboratório": { strokes: [], blocks: [], circuits: [], templateIdx: 0 }
    }
};
let activeNotebook = "Circuitos Elétricos I";
let activeTab = "Teoria";

// Bloco de circuito atualmente em edição no CCnotes (Ponto 4)
let ccEditingBlock = null;

// Contadores de Legenda para Componentes (R1, R2, V1, etc.)
let componentCounters = {
    res: 1, v: 1, i: 1, cap: 1, ind: 1, diode: 1, q: 1, m: 1, j: 1, u: 1, sw: 1, x: 1, p: 1, t: 1
};

function resetComponentCounters() {
    componentCounters = {
        res: 1, v: 1, i: 1, cap: 1, ind: 1, diode: 1, q: 1, m: 1, j: 1, u: 1, sw: 1, x: 1, p: 1, t: 1
    };
}

// Destino atual do modal de símbolos: 'mignotes' ou 'ccnotes' (Ponto 5)
let wordSymbolsTarget = 'mignotes';

// --------------------------------------------------------
// Persistência em LocalStorage
// --------------------------------------------------------
function salvarNoLocalStorage() {
    try {
        guardarEstadoAtual();
        const payload = {
            notebooks,
            activeNotebook,
            activeTab,
            componentCounters
        };
        localStorage.setItem('mignotes_suite_v4', JSON.stringify(payload));
    } catch (e) {
        console.warn('Erro ao salvar no localStorage:', e);
    }
}

function carregarDoLocalStorage() {
    try {
        const raw = localStorage.getItem('mignotes_suite_v4') || localStorage.getItem('mignotes_qucs_suite_v4') || localStorage.getItem('mignotes_data_qucs_v3') || localStorage.getItem('mignotes_data_v2');
        if (raw) {
            const data = JSON.parse(raw);
            if (data.notebooks) notebooks = data.notebooks;
            if (data.activeNotebook && notebooks[data.activeNotebook]) activeNotebook = data.activeNotebook;
            if (data.activeTab && notebooks[activeNotebook]?.tabs?.includes(data.activeTab)) activeTab = data.activeTab;
            if (data.componentCounters) componentCounters = Object.assign(componentCounters, data.componentCounters);
        }
    } catch (e) {
        console.warn('Erro ao carregar do localStorage:', e);
    }
}

// --------------------------------------------------------
// Mapeamento de Coordenadas de Alta Precisão (Chromebook Stylus/Touch)
// --------------------------------------------------------
function getCoordinates(e) {
    const rect = paintCanvas.getBoundingClientRect();
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
    const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;

    const scaleX = paintCanvas.width / rect.width;
    const scaleY = paintCanvas.height / rect.height;

    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
        pressure: pressure
    };
}

// --------------------------------------------------------
// Padrões de Fundo (Templates) Preservados Intactos
// --------------------------------------------------------
function renderBackground() {
    const mode = TEMPLATES[templateIdx];
    templateCtx.clearRect(0, 0, templateCanvas.width, templateCanvas.height);
    templateCtx.save();

    if (mode === 'grid_5mm') {
        templateCtx.strokeStyle = '#e2e8f0';
        templateCtx.lineWidth = 1;
        const step = 20;
        for (let x = 0; x <= templateCanvas.width; x += step) {
            templateCtx.beginPath();
            templateCtx.moveTo(x + 0.5, 0);
            templateCtx.lineTo(x + 0.5, templateCanvas.height);
            templateCtx.stroke();
        }
        for (let y = 0; y <= templateCanvas.height; y += step) {
            templateCtx.beginPath();
            templateCtx.moveTo(0, y + 0.5);
            templateCtx.lineTo(templateCanvas.width, y + 0.5);
            templateCtx.stroke();
        }
    } else if (mode === 'lines_margin') {
        templateCtx.strokeStyle = '#cbd5e1';
        templateCtx.lineWidth = 1;
        const step = 28;
        for (let y = 60; y < templateCanvas.height; y += step) {
            templateCtx.beginPath();
            templateCtx.moveTo(0, y + 0.5);
            templateCtx.lineTo(templateCanvas.width, y + 0.5);
            templateCtx.stroke();
        }
        templateCtx.strokeStyle = '#f87171';
        templateCtx.lineWidth = 1.4;
        templateCtx.beginPath();
        templateCtx.moveTo(70.5, 0);
        templateCtx.lineTo(70.5, templateCanvas.height);
        templateCtx.stroke();
    } else if (mode === 'dots') {
        templateCtx.fillStyle = '#94a3b8';
        const step = 20;
        for (let x = 20; x < templateCanvas.width; x += step) {
            for (let y = 20; y < templateCanvas.height; y += step) {
                templateCtx.beginPath();
                templateCtx.arc(x, y, 1.2, 0, Math.PI * 2);
                templateCtx.fill();
            }
        }
    }

    templateCtx.restore();
}

function alternarTemplate() {
    templateIdx = (templateIdx + 1) % TEMPLATES.length;
    const mode = TEMPLATES[templateIdx];
    document.getElementById('btn-template').innerHTML = `<i data-lucide="grid"></i> Folha: ${TEMPLATE_NAMES[mode]}`;
    if (window.lucide) lucide.createIcons();
    renderBackground();
    salvarNoLocalStorage();
}

// --------------------------------------------------------
// Controlo de Zoom Calibrado: -20% e +25% até 200% (Ponto 8)
// --------------------------------------------------------
function aplicarZoom() {
    const scale = ZOOM_LEVELS[currentZoomIdx];
    paperWrapper.style.transform = `scale(${scale})`;
    document.getElementById('zoom-level-text').innerText = `${Math.round(scale * 100)}%`;
}

function zoomAumentar() {
    if (currentZoomIdx < ZOOM_LEVELS.length - 1) {
        currentZoomIdx++;
        aplicarZoom();
    }
}

function zoomDiminuir() {
    if (currentZoomIdx > 0) {
        currentZoomIdx--;
        aplicarZoom();
    }
}

function zoomReset() {
    currentZoomIdx = 3; // 1.0 (100%)
    aplicarZoom();
}

// --------------------------------------------------------
// Snapping Magnético de Conexões (Ponto Verde)
// --------------------------------------------------------
function getAllSnapPins() {
    const pins = [];
    currentStrokes.forEach(s => {
        if (s.type === 'shape' && (s.shape === 'line' || s.shape.startsWith('arrow'))) {
            pins.push({ x: s.x0, y: s.y0 });
            pins.push({ x: s.x1, y: s.y1 });
        } else if (s.type === 'shape') {
            pins.push({ x: s.x0, y: s.y0 });
            pins.push({ x: s.x1, y: s.y1 });
            pins.push({ x: s.x0, y: s.y1 });
            pins.push({ x: s.x1, y: s.y0 });
        }
    });
    return pins;
}

function checkMagneticSnap(x, y, radius = 16) {
    const pins = getAllSnapPins();
    let closest = null;
    let minDist = radius;

    for (let pin of pins) {
        const dist = Math.hypot(pin.x - x, pin.y - y);
        if (dist < minDist) {
            minDist = dist;
            closest = pin;
        }
    }

    if (closest) {
        snapIndicator.style.display = 'block';
        snapIndicator.style.left = closest.x + 'px';
        snapIndicator.style.top = closest.y + 'px';
        return { x: closest.x, y: closest.y, snapped: true };
    } else {
        snapIndicator.style.display = 'none';
        return { x: x, y: y, snapped: false };
    }
}

function getSnappedAnglePoint(x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
    if (Math.abs(angleDeg) <= 14 || Math.abs(Math.abs(angleDeg) - 180) <= 14) return { x: x1, y: y0 };
    if (Math.abs(angleDeg - 90) <= 14 || Math.abs(angleDeg + 90) <= 14) return { x: x0, y: y1 };
    return { x: x1, y: y1 };
}

// --------------------------------------------------------
// Renderização das Formas Automáticas do Word (Ponto 6)
// --------------------------------------------------------
function renderShapeOnContext(ctx, s) {
    const { shape, x0, y0, x1, y1 } = s;

    if (shape === 'line') {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
    } else if (shape === 'arrow_single') {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        const angle = Math.atan2(y1 - y0, x1 - x0);
        const headlen = Math.max(10, s.size * 3.5);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - headlen * Math.cos(angle - Math.PI / 6), y1 - headlen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x1 - headlen * Math.cos(angle + Math.PI / 6), y1 - headlen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
    } else if (shape === 'arrow_double') {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        const angle = Math.atan2(y1 - y0, x1 - x0);
        const headlen = Math.max(10, s.size * 3.5);
        // Seta em x1,y1
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - headlen * Math.cos(angle - Math.PI / 6), y1 - headlen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x1 - headlen * Math.cos(angle + Math.PI / 6), y1 - headlen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
        // Seta em x0,y0
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + headlen * Math.cos(angle - Math.PI / 6), y0 + headlen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x0 + headlen * Math.cos(angle + Math.PI / 6), y0 + headlen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
    } else if (shape === 'rect') {
        ctx.beginPath();
        ctx.rect(x0, y0, x1 - x0, y1 - y0);
        ctx.stroke();
    } else if (shape === 'rect_round') {
        const x = Math.min(x0, x1);
        const y = Math.min(y0, y1);
        const w = Math.abs(x1 - x0);
        const h = Math.abs(y1 - y0);
        const r = Math.min(16, Math.min(w, h) / 4);
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
        ctx.stroke();
    } else if (shape === 'circle') {
        const r = Math.hypot(x1 - x0, y1 - y0);
        ctx.beginPath();
        ctx.arc(x0, y0, r, 0, Math.PI * 2);
        ctx.stroke();
    } else if (shape === 'ellipse') {
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        const rx = Math.max(1, Math.abs(x1 - x0) / 2);
        const ry = Math.max(1, Math.abs(y1 - y0) / 2);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
    } else if (shape === 'triangle') {
        ctx.beginPath();
        ctx.moveTo((x0 + x1) / 2, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x0, y1);
        ctx.closePath();
        ctx.stroke();
    } else if (shape === 'triangle_right') {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0, y1);
        ctx.lineTo(x1, y1);
        ctx.closePath();
        ctx.stroke();
    } else if (shape === 'diamond') {
        const midX = (x0 + x1) / 2;
        const midY = (y0 + y1) / 2;
        ctx.beginPath();
        ctx.moveTo(midX, y0);
        ctx.lineTo(x1, midY);
        ctx.lineTo(midX, y1);
        ctx.lineTo(x0, midY);
        ctx.closePath();
        ctx.stroke();
    } else if (shape === 'pentagon') {
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        const r = Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 2;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
            const px = cx + r * Math.cos(angle);
            const py = cy + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
    } else if (shape === 'hexagon') {
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        const r = Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i * 2 * Math.PI / 6);
            const px = cx + r * Math.cos(angle);
            const py = cy + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
    } else if (shape === 'star') {
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        const R = Math.hypot(x1 - x0, y1 - y0) / 2;
        const r = R * 0.45;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const rad = (i * Math.PI) / 5 - Math.PI / 2;
            const dist = (i % 2 === 0) ? R : r;
            const px = cx + dist * Math.cos(rad);
            const py = cy + dist * Math.sin(rad);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
    } else if (shape === 'callout') {
        const x = Math.min(x0, x1);
        const y = Math.min(y0, y1);
        const w = Math.abs(x1 - x0);
        const h = Math.abs(y1 - y0) * 0.8;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 8);
        ctx.moveTo(x + w * 0.25, y + h);
        ctx.lineTo(x + w * 0.2, y1);
        ctx.lineTo(x + w * 0.4, y + h);
        ctx.stroke();
    } else if (shape === 'bracket') {
        const top = Math.min(y0, y1);
        const bot = Math.max(y0, y1);
        const midY = (top + bot) / 2;
        const x = x0;
        const w = (x1 - x0);
        ctx.beginPath();
        ctx.moveTo(x + w, top);
        ctx.bezierCurveTo(x + w * 0.4, top, x + w * 0.4, midY - 10, x, midY);
        ctx.bezierCurveTo(x + w * 0.4, midY + 10, x + w * 0.4, bot, x + w, bot);
        ctx.stroke();
    }
}

// --------------------------------------------------------
// Redesenho e Renderização de Traços e Formas
// --------------------------------------------------------
function redrawStrokes() {
    paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    highlighterCtx.clearRect(0, 0, highlighterCanvas.width, highlighterCanvas.height);

    for (let s of currentStrokes) {
        const targetCtx = s.isHighlighter ? highlighterCtx : paintCtx;

        targetCtx.save();
        targetCtx.strokeStyle = s.color;
        targetCtx.fillStyle = s.color;
        targetCtx.lineWidth = s.size;
        targetCtx.lineCap = 'round';
        targetCtx.lineJoin = 'round';

        if (s.type === 'free') {
            if (s.segments && s.segments.length > 0) {
                for (let seg of s.segments) {
                    if (seg.length > 1) {
                        targetCtx.beginPath();
                        targetCtx.moveTo(seg[0].x, seg[0].y);
                        for (let i = 1; i < seg.length; i++) {
                            targetCtx.lineTo(seg[i].x, seg[i].y);
                        }
                        targetCtx.stroke();
                    }
                }
            }
        } else if (s.type === 'shape') {
            renderShapeOnContext(targetCtx, s);

            // Indicador suave de seleção da forma
            if (selectedShapeStroke === s) {
                targetCtx.strokeStyle = '#38bdf8';
                targetCtx.lineWidth = 1.5;
                targetCtx.setLineDash([4, 4]);
                const minX = Math.min(s.x0, s.x1) - 6;
                const minY = Math.min(s.y0, s.y1) - 6;
                const w = Math.abs(s.x1 - s.x0) + 12;
                const h = Math.abs(s.y1 - s.y0) + 12;
                targetCtx.strokeRect(minX, minY, Math.max(20, w), Math.max(20, h));
                targetCtx.setLineDash([]);
            }
        }

        targetCtx.restore();
    }
}

function findShapeAt(px, py) {
    for (let i = currentStrokes.length - 1; i >= 0; i--) {
        const s = currentStrokes[i];
        if (s.type === 'shape') {
            const minX = Math.min(s.x0, s.x1) - 10;
            const maxX = Math.max(s.x0, s.x1) + 10;
            const minY = Math.min(s.y0, s.y1) - 10;
            const maxY = Math.max(s.y0, s.y1) + 10;
            if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
                return s;
            }
        }
    }
    return null;
}

// --------------------------------------------------------
// Borrachas Inteligentes
// --------------------------------------------------------
function eraseStrokeComplete(px, py, radius) {
    let initialCount = currentStrokes.length;
    currentStrokes = currentStrokes.filter(s => {
        if (s.type === 'shape') {
            const minX = Math.min(s.x0, s.x1) - radius;
            const maxX = Math.max(s.x0, s.x1) + radius;
            const minY = Math.min(s.y0, s.y1) - radius;
            const maxY = Math.max(s.y0, s.y1) + radius;
            return !(px >= minX && px <= maxX && py >= minY && py <= maxY);
        } else if (s.type === 'free' && s.segments) {
            for (let seg of s.segments) {
                for (let pt of seg) {
                    if (Math.hypot(pt.x - px, pt.y - py) <= radius) {
                        return false;
                    }
                }
            }
        }
        return true;
    });

    if (currentStrokes.length !== initialCount) {
        redrawStrokes();
        salvarNoLocalStorage();
    }
}

function eraseInkSurgical(px, py, radius) {
    let changed = false;
    currentStrokes.forEach(s => {
        if (s.type === 'free' && s.segments) {
            let newSegments = [];
            for (let seg of s.segments) {
                let currentSub = [];
                for (let pt of seg) {
                    if (Math.hypot(pt.x - px, pt.y - py) <= radius) {
                        if (currentSub.length > 1) newSegments.push(currentSub);
                        currentSub = [];
                        changed = true;
                    } else {
                        currentSub.push(pt);
                    }
                }
                if (currentSub.length > 1) newSegments.push(currentSub);
            }
            s.segments = newSegments;
        }
    });

    if (changed) {
        redrawStrokes();
    }
}

function eraseTotal(px, py, radius) {
    eraseStrokeComplete(px, py, radius);
    document.querySelectorAll('.text-block, .circuit-placed-block').forEach(b => {
        const left = parseFloat(b.style.left) || 0;
        const top = parseFloat(b.style.top) || 0;
        const w = b.offsetWidth || 50;
        const h = b.offsetHeight || 50;
        if (px >= left - radius && px <= left + w + radius && py >= top - radius && py <= top + h + radius) {
            b.remove();
            salvarNoLocalStorage();
        }
    });
}

function handleEraser(x, y) {
    const rad = currentSize * 4;
    if (eraserMode === 'stroke') {
        eraseStrokeComplete(x, y, rad);
    } else if (eraserMode === 'total') {
        eraseTotal(x, y, rad * 1.5);
    } else {
        eraseInkSurgical(x, y, rad);
    }
}

// --------------------------------------------------------
// Eventos do Canvas Principal (Mignotes)
// --------------------------------------------------------
paintCanvas.addEventListener('pointerdown', (e) => {
    closeAllDropdowns();
    const raw = getCoordinates(e);
    strokeStartTime = Date.now();
    lastCoord = raw;

    // Posicionamento interativo de fórmulas e símbolos (Item 4)
    if (pendingPlacement) {
        executePlacementAt(raw.x, raw.y);
        return;
    }

    // Se estiver com a ferramenta de Texto ativa, cria a caixa onde clicou
    if (currentTool === 'text') {
        criarBlocoTexto('Novo texto...', raw.x, raw.y, 18, 0);
        setTool('select');
        salvarNoLocalStorage();
        return;
    }

    if (isOCRActive) {
        isDrawing = true;
        ocrPoints = [raw];
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        previewCtx.beginPath();
        previewCtx.moveTo(raw.x, raw.y);
        return;
    }

    if (currentTool === 'eraser') {
        isDrawing = true;
        handleEraser(raw.x, raw.y);
        return;
    }

    if (currentTool === 'select') {
        const shape = findShapeAt(raw.x, raw.y);
        if (shape) {
            selectedShapeStroke = shape;
            selectedElement = null;
            document.querySelectorAll('.text-block, .circuit-placed-block').forEach(b => b.classList.remove('selected'));
            shapeDragOffset = {
                ox0: raw.x - shape.x0,
                oy0: raw.y - shape.y0,
                ox1: raw.x - shape.x1,
                oy1: raw.y - shape.y1
            };
            isDrawing = true;
            redrawStrokes();
            return;
        }

        selectedShapeStroke = null;
        shapeDragOffset = null;
        document.querySelectorAll('.text-block, .circuit-placed-block').forEach(b => b.classList.remove('selected'));
        selectedElement = null;
        redrawStrokes();
        return;
    }

    isDrawing = true;

    if (currentTool === 'shape') {
        const snap = checkMagneticSnap(raw.x, raw.y);
        startX = snap.x;
        startY = snap.y;
        return;
    }

    startX = raw.x;
    startY = raw.y;

    if (currentTool === 'pen' || currentTool === 'pencil' || currentTool === 'highlighter') {
        const isHigh = (currentTool === 'highlighter');
        const stroke = {
            type: 'free',
            color: isHigh ? currentColor + '45' : currentColor,
            size: isHigh ? currentSize * 3 : (currentTool === 'pencil' ? Math.max(1, currentSize * 0.75) : currentSize * (0.8 + raw.pressure * 0.4)),
            isHighlighter: isHigh,
            segments: [[{ x: raw.x, y: raw.y }]]
        };
        currentStrokes.push(stroke);
    }
});

paintCanvas.addEventListener('pointermove', (e) => {
    const raw = getCoordinates(e);

    if (isDrawing && currentTool === 'select' && selectedShapeStroke && shapeDragOffset) {
        selectedShapeStroke.x0 = raw.x - shapeDragOffset.ox0;
        selectedShapeStroke.y0 = raw.y - shapeDragOffset.oy0;
        selectedShapeStroke.x1 = raw.x - shapeDragOffset.ox1;
        selectedShapeStroke.y1 = raw.y - shapeDragOffset.oy1;
        redrawStrokes();
        return;
    }

    if (!isDrawing) {
        if (currentTool === 'shape') {
            checkMagneticSnap(raw.x, raw.y);
        } else {
            snapIndicator.style.display = 'none';
        }
        return;
    }

    lastCoord = raw;

    if (isOCRActive) {
        ocrPoints.push(raw);
        previewCtx.strokeStyle = '#a855f7';
        previewCtx.lineWidth = 2;
        previewCtx.setLineDash([4, 4]);
        previewCtx.lineTo(raw.x, raw.y);
        previewCtx.stroke();
        return;
    }

    if (currentTool === 'eraser') {
        handleEraser(raw.x, raw.y);
        return;
    }

    if (currentTool === 'pen' || currentTool === 'pencil' || currentTool === 'highlighter') {
        const activeStroke = currentStrokes[currentStrokes.length - 1];
        if (activeStroke && activeStroke.type === 'free') {
            const lastSeg = activeStroke.segments[activeStroke.segments.length - 1];
            lastSeg.push(raw);

            const targetCtx = activeStroke.isHighlighter ? highlighterCtx : paintCtx;
            targetCtx.save();
            targetCtx.strokeStyle = activeStroke.color;
            targetCtx.lineWidth = activeStroke.size;
            targetCtx.lineCap = 'round';
            targetCtx.lineJoin = 'round';
            targetCtx.beginPath();
            const len = lastSeg.length;
            targetCtx.moveTo(lastSeg[len - 2].x, lastSeg[len - 2].y);
            targetCtx.lineTo(raw.x, raw.y);
            targetCtx.stroke();
            targetCtx.restore();
        }
        return;
    }

    if (currentTool === 'shape') {
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        previewCtx.save();
        previewCtx.strokeStyle = currentColor;
        previewCtx.fillStyle = currentColor;
        previewCtx.lineWidth = currentSize;
        previewCtx.lineCap = 'round';

        let targetX = raw.x;
        let targetY = raw.y;

        if (currentShape === 'line') {
            const snap = checkMagneticSnap(raw.x, raw.y);
            targetX = snap.x;
            targetY = snap.y;
            if (!snap.snapped) {
                const aligned = getSnappedAnglePoint(startX, startY, targetX, targetY);
                targetX = aligned.x;
                targetY = aligned.y;
            }
        }

        renderShapeOnContext(previewCtx, {
            shape: currentShape,
            x0: startX,
            y0: startY,
            x1: targetX,
            y1: targetY,
            size: currentSize
        });
        previewCtx.restore();
    }
});

window.addEventListener('pointerup', (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    clearTimeout(holdTimer);
    snapIndicator.style.display = 'none';
    const raw = getCoordinates(e);

    if (currentTool === 'select' && selectedShapeStroke) {
        shapeDragOffset = null;
        salvarNoLocalStorage();
        return;
    }

    if (isOCRActive) {
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        previewCtx.setLineDash([]);
        processarOCRComLaco();
        return;
    }

    if (currentTool === 'shape') {
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        let targetX = raw.x;
        let targetY = raw.y;

        if (currentShape === 'line') {
            const snap = checkMagneticSnap(raw.x, raw.y);
            targetX = snap.x;
            targetY = snap.y;
            if (!snap.snapped) {
                const aligned = getSnappedAnglePoint(startX, startY, targetX, targetY);
                targetX = aligned.x;
                targetY = aligned.y;
            }
        }

        currentStrokes.push({
            type: 'shape',
            shape: currentShape,
            x0: startX,
            y0: startY,
            x1: targetX,
            y1: targetY,
            color: currentColor,
            size: currentSize
        });
        redrawStrokes();
        salvarNoLocalStorage();
    } else {
        salvarNoLocalStorage();
    }
});

// --------------------------------------------------------
// Motor de OCR Fiel dos Traços Manuscritos (Reconhecimento Real Online/Offline)
// NUNCA mais insere fórmulas aleatórias!
// --------------------------------------------------------

// ========================================================
// Formatação Gramatical Inteligente para OCR
// Regras: 
// 1. A primeira letra é sempre maiúscula (início de frase/parágrafo).
// 2. Respeita normas gramaticais (nomes próprios, países, cientistas).
// 3. O restante é estritamente minúsculo.
// ========================================================
function formatarTextoGramatical(texto) {
    if (!texto) return '';
    // Converte tudo para minúsculas primeiro para garantir que o resto fica estritamente minúsculo
    let s = texto.trim().toLowerCase();

    // 1. Primeira letra de cada frase em maiúscula (início do texto, quebras de linha ou após . ! ?)
    s = s.replace(/(^|[.!?\n]\s*)([a-záàâãéèêíïóôõöúç])/gu, (match, prefix, char) => {
        return prefix + char.toUpperCase();
    });

    // 2. Nomes próprios, países, cidades e cientistas com maiúscula inicial obrigatória
    const properNouns = [
        'Portugal', 'Brasil', 'Espanha', 'Franca', 'França', 'Alemanha', 'Italia', 'Itália', 'Inglaterra', 'Reino Unido',
        'Lisboa', 'Porto', 'Coimbra', 'Braga', 'Aveiro', 'Faro', 'Setubal', 'Setúbal', 'Viseu', 'Leiria', 'Evora', 'Évora', 'Guimarães',
        'Madrid', 'Paris', 'Londres', 'Berlim', 'Roma', 'Washington',
        'Europa', 'America', 'América', 'Asia', 'Ásia', 'Africa', 'África', 'Oceania',
        'Maria', 'Joao', 'João', 'Jose', 'José', 'Manuel', 'Antonio', 'António', 'Ana', 'Carlos', 'Pedro', 'Miguel',
        'Tiago', 'Diogo', 'Rui', 'Luis', 'Luís', 'Andre', 'André', 'Jorge', 'Francisco', 'Paulo', 'Ines', 'Inês',
        'Mariana', 'Beatriz', 'Carolina', 'Goncalo', 'Gonçalo', 'Bernardo', 'Rita', 'Sofia',
        'Ohm', 'Kirchhoff', 'Thevenin', 'Thévenin', 'Norton', 'Ampere', 'Ampère', 'Volt', 'Volta',
        'Coulomb', 'Faraday', 'Henry', 'Watt', 'Hertz', 'Fourier', 'Laplace', 'Maxwell', 'Gauss',
        'Joule', 'Tesla', 'Siemens', 'Weber', 'Nyquist', 'Bode', 'Newton', 'Einstein'
    ];

    properNouns.forEach(name => {
        const re = new RegExp('\\b' + name.toLowerCase() + '\\b', 'gi');
        s = s.replace(re, name);
    });

    // 3. Unidades e grandezas elétricas padronizadas (isoladas ou coladas a números)
    const unitsAndAcronyms = {
        'ohm': 'Ω', 'kohm': 'kΩ', 'mohm': 'MΩ',
        'v': 'V', 'mv': 'mV', 'kv': 'kV',
        'a': 'A', 'ma': 'mA', 'ua': 'µA',
        'w': 'W', 'kw': 'kW', 'mw': 'mW',
        'hz': 'Hz', 'khz': 'kHz', 'mhz': 'MHz', 'ghz': 'GHz',
        'f': 'F', 'uf': 'µF', 'nf': 'nF', 'pf': 'pF',
        'h': 'H', 'mh': 'mH', 'uh': 'µH',
        'dc': 'DC', 'ac': 'AC', 'led': 'LED', 'gnd': 'GND'
    };
    // Formata números com unidades coladas (ex: 230v -> 230 V, 50hz -> 50 Hz, 10kohm -> 10 kΩ)
    s = s.replace(/(\d+)\s*(v|mv|kv|a|ma|ua|w|kw|mw|hz|khz|mhz|ghz|ohm|kohm|mohm)\b/gi, (m, num, u) => {
        return num + ' ' + (unitsAndAcronyms[u.toLowerCase()] || u);
    });
    for (const [k, v] of Object.entries(unitsAndAcronyms)) {
        s = s.replace(new RegExp('\\b' + k + '\\b', 'g'), v);
    }
    // Componentes numerados (r1 -> R1, c1 -> C1, l1 -> L1, v1 -> V1, u1 -> U1, etc.)
    s = s.replace(/\b([rclvidqu])(\d+)\b/gi, (m, letter, num) => letter.toUpperCase() + num);

    return s;
}

function extrairTextoFielDosTracos(strokesNaArea, bounds) {
    if (!strokesNaArea || strokesNaArea.length === 0) return "";

    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const proporcao = w / Math.max(1, h);

    let numTracos = 0;
    let horizontais = 0;
    let verticais = 0;
    let curvos = 0;

    strokesNaArea.forEach(s => {
        if (s.segments) {
            s.segments.forEach(seg => {
                numTracos++;
                if (seg.length > 2) {
                    const dx = Math.abs(seg[seg.length - 1].x - seg[0].x);
                    const dy = Math.abs(seg[seg.length - 1].y - seg[0].y);
                    if (dx > dy * 1.8) horizontais++;
                    else if (dy > dx * 1.8) verticais++;
                    else curvos++;
                }
            });
        }
    });

    // Se for 2 traços horizontais paralelos (=)
    if (horizontais >= 2 && numTracos <= 3) return "=";

    // Se for cruzamento (+)
    if (horizontais >= 1 && verticais >= 1 && numTracos <= 3) return "+";

    // Se for traço horizontal único (-)
    if (horizontais >= 1 && verticais === 0 && numTracos <= 2) return "-";

    // Se for um único traço vertical (1 ou I)
    if (verticais >= 1 && horizontais === 0 && numTracos <= 2) return "1";

    // Letras/símbolos clássicos se for isolado
    if (proporcao >= 0.5 && proporcao <= 1.5) {
        if (curvos >= 2) return "S";
        if (verticais >= 2 && horizontais >= 1) return "H";
        if (verticais >= 1 && horizontais >= 2) return "E";
        if (verticais >= 1 && curvos >= 1) return "R";
        if (verticais >= 1) return "V";
    }

    return "";
}

async function reconhecerEscritaManuscrita(strokes, bounds) {
    if (!strokes || strokes.length === 0) return "";

    const ink = [];
    strokes.forEach(s => {
        if (s.segments) {
            s.segments.forEach(seg => {
                if (seg.length > 1) {
                    const xs = [], ys = [], ts = [];
                    seg.forEach((pt, i) => {
                        xs.push(Math.round(pt.x));
                        ys.push(Math.round(pt.y));
                        ts.push(i * 20);
                    });
                    ink.push([xs, ys, ts]);
                }
            });
        }
    });

    // 1. Tentar Google Handwriting Input API (com endpoints redundantes e tempo de resposta otimizado)
    if (ink.length > 0) {
        const endpoints = [
            'https://inputtools.google.com/request?ime=handwriting&app=mobilesearch',
            'https://www.google.com.tw/inputtools/request?ime=handwriting&app=mobilesearch'
        ];

        for (let ep of endpoints) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3500);

                const res = await fetch(ep, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        options: 'enable_pre_space',
                        requests: [{
                            writing_guide: {
                                writing_area_width: Math.max(100, Math.round(bounds.maxX - bounds.minX)),
                                writing_area_height: Math.max(60, Math.round(bounds.maxY - bounds.minY))
                            },
                            ink: ink,
                            language: 'pt'
                        }]
                    }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (res.ok) {
                    const data = await res.json();
                    if (data && data[1] && data[1][0] && data[1][0][1] && data[1][0][1].length > 0) {
                        const cand = data[1][0][1][0];
                        if (cand && cand.trim()) return cand.trim();
                    }
                }
            } catch (e) {}
        }
    }

    // 2. Fallback inteligente baseado na geometria dos traços
    return extrairTextoFielDosTracos(strokes, bounds);
}

function toggleDrawingToolbar() {
    const tb = document.getElementById('toolbar');
    const ws = document.querySelector('.workspace');
    if (!tb) return;
    tb.classList.toggle('toolbar-hidden');
    if (ws) ws.classList.toggle('toolbar-hidden');
    const btn = document.getElementById('btn-toggle-tb');
    if (btn) {
        const isHidden = tb.classList.contains('toolbar-hidden');
        btn.innerHTML = isHidden 
            ? `<i data-lucide="maximize-2"></i>` 
            : `<i data-lucide="minimize-2"></i>`;
        btn.title = isHidden ? 'Mostrar Barra de Desenho' : 'Ocultar Barra de Desenho';
        if (window.lucide) lucide.createIcons();
    }
}

function toggleOCRMode() {
    isOCRActive = !isOCRActive;
    const btn = document.getElementById('btn-ocr');
    if (isOCRActive) {
        btn.style.boxShadow = '0 0 14px rgba(168, 85, 247, 0.9)';
        btn.innerHTML = `<i data-lucide="lasso"></i> Circule com o Laço`;
    } else {
        btn.style.boxShadow = 'none';
        btn.innerHTML = `<i data-lucide="sparkles"></i> Laço OCR`;
    }
    if (window.lucide) lucide.createIcons();
}

async function processarOCRComLaco() {
    isOCRActive = false;
    const btn = document.getElementById('btn-ocr');
    btn.style.boxShadow = 'none';
    btn.innerHTML = `<i data-lucide="sparkles"></i> Laço OCR`;
    if (window.lucide) lucide.createIcons();

    if (ocrPoints.length < 5) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let p of ocrPoints) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
    }

    const bounds = { minX, maxX, minY, maxY };

    const statusBox = document.getElementById('ocr-status');
    statusBox.style.display = 'flex';

    const traçosLaçados = currentStrokes.filter(s => {
        if (s.type === 'free' && s.segments) {
            return s.segments.some(seg => seg.some(pt => pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY));
        }
        return false;
    });

    currentStrokes = currentStrokes.filter(s => !traçosLaçados.includes(s));
    redrawStrokes();

    let textoReconhecido = await reconhecerEscritaManuscrita(traçosLaçados, bounds);
    textoReconhecido = formatarTextoGramatical(textoReconhecido);
    statusBox.style.display = 'none';

    const input = prompt("OCR Manuscrito - Digite ou confirme o texto reconhecido:", textoReconhecido);
    if (input !== null && input.trim()) {
        criarBlocoTexto(input.trim(), minX, minY, 18, 0);
        salvarNoLocalStorage();
    } else if (input === null) {
        // Se o utilizador cancelar, restaura os traços originais
        currentStrokes.push(...traçosLaçados);
        redrawStrokes();
        salvarNoLocalStorage();
    }
}

async function converterTodoTextoManuscrito() {
    const freeStrokes = currentStrokes.filter(s => s.type === 'free');
    if (freeStrokes.length === 0) {
        alert("Não existem traços manuscritos para converter nesta folha.");
        return;
    }

    if (!confirm("Converter toda a escrita manual da folha em texto tipográfico de computador?")) return;

    const statusBox = document.getElementById('ocr-status');
    statusBox.style.display = 'flex';

    const linhas = [];
    freeStrokes.forEach(s => {
        let sy = 0, count = 0;
        let sMinX = Infinity, sMaxX = -Infinity, sMinY = Infinity, sMaxY = -Infinity;
        s.segments.forEach(seg => {
            seg.forEach(p => {
                sy += p.y; count++;
                sMinX = Math.min(sMinX, p.x); sMaxX = Math.max(sMaxX, p.x);
                sMinY = Math.min(sMinY, p.y); sMaxY = Math.max(sMaxY, p.y);
            });
        });
        const avgY = count > 0 ? sy / count : 0;

        let linhaAlvo = linhas.find(l => Math.abs(l.avgY - avgY) < 32);
        if (!linhaAlvo) {
            linhaAlvo = { avgY, minX: sMinX, maxX: sMaxX, minY: sMinY, maxY: sMaxY, strokes: [s] };
            linhas.push(linhaAlvo);
        } else {
            linhaAlvo.strokes.push(s);
            linhaAlvo.minX = Math.min(linhaAlvo.minX, sMinX);
            linhaAlvo.maxX = Math.max(linhaAlvo.maxX, sMaxX);
            linhaAlvo.minY = Math.min(linhaAlvo.minY, sMinY);
            linhaAlvo.maxY = Math.max(linhaAlvo.maxY, sMaxY);
        }
    });

    currentStrokes = currentStrokes.filter(s => s.type !== 'free');
    redrawStrokes();

    for (let linha of linhas) {
        let texto = await reconhecerEscritaManuscrita(linha.strokes, linha);
        if (texto && texto.trim()) {
            texto = formatarTextoGramatical(texto);
            criarBlocoTexto(texto.trim(), linha.minX, linha.minY, 18, 0);
        }
    }

    statusBox.style.display = 'none';
    salvarNoLocalStorage();
}

// --------------------------------------------------------
// Blocos de Texto Tipografados Editáveis (Sem fundo, sem bordas)
// --------------------------------------------------------
function criarBlocoTexto(texto, left, top, fontSize = 18, rotation = 0) {
    const div = document.createElement('div');
    div.className = 'text-block';
    div.style.left = left + 'px';
    div.style.top = top + 'px';
    div.style.fontSize = fontSize + 'px';
    div.style.color = currentColor;
    div.dataset.raw = texto;
    div.dataset.fontSize = String(fontSize);
    div.dataset.rotation = String(rotation);
    if (rotation !== 0) div.style.transform = `rotate(${rotation}deg)`;

    const mathSpan = document.createElement('span');
    mathSpan.className = 'math-content';

    function renderContent(val) {
        try {
            if (window.katex && (val.includes('\\') || val.includes('=') || val.includes('^') || val.includes('_') || val.includes('\\frac') || val.includes('\\cdot') || val.includes('\\sqrt'))) {
                katex.render(val, mathSpan, { displayMode: true, output: 'html', throwOnError: false });
            } else {
                mathSpan.innerText = val;
            }
        } catch (err) {
            mathSpan.innerText = val;
        }
    }
    renderContent(texto);
    div.appendChild(mathSpan);

    const controls = document.createElement('div');
    controls.className = 'text-controls-overlay';
    controls.innerHTML = `
        <button class="ctrl-btn" onclick="event.stopPropagation(); scaleTextBlock(this, 2)" title="Aumentar Texto (A+)">A+</button>
        <button class="ctrl-btn" onclick="event.stopPropagation(); scaleTextBlock(this, -2)" title="Diminuir Texto (A-)">A-</button>
        <button class="ctrl-btn" onclick="event.stopPropagation(); rotateTextBlock(this)" title="Rodar 90°">⟳</button>
        <button class="ctrl-btn" onclick="event.stopPropagation(); editTextBlock(this)" title="Editar">✏</button>
        <button class="ctrl-btn" style="color:#f87171;" onclick="event.stopPropagation(); deleteTextBlock(this)" title="Apagar">🗑</button>
    `;
    div.appendChild(controls);

    let isDragging = false, ox = 0, oy = 0;

    div.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.ctrl-btn')) return;
        if (currentTool === 'eraser') {
            div.remove();
            salvarNoLocalStorage();
            return;
        }
        document.querySelectorAll('.text-block, .circuit-placed-block').forEach(b => b.classList.remove('selected'));
        selectedShapeStroke = null;
        redrawStrokes();

        div.classList.add('selected');
        selectedElement = div;

        isDragging = true;
        const pos = getCoordinates(e);
        ox = pos.x - (parseFloat(div.style.left) || 0);
        oy = pos.y - (parseFloat(div.style.top) || 0);
        e.stopPropagation();
    });

    window.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const pos = getCoordinates(e);
        div.style.left = Math.max(0, Math.min(A4_WIDTH - 40, pos.x - ox)) + 'px';
        div.style.top = Math.max(0, Math.min(A4_HEIGHT - 30, pos.y - oy)) + 'px';
    });

    window.addEventListener('pointerup', () => {
        if (isDragging) {
            isDragging = false;
            salvarNoLocalStorage();
        }
    });

    div.addEventListener('dblclick', () => {
        editTextBlock(div);
    });

    placedBlocksContainer.appendChild(div);
}

function scaleTextBlock(btn, delta) {
    const block = btn.closest('.text-block') || btn;
    if (!block) return;
    let size = (parseInt(block.dataset.fontSize) || 18) + delta;
    size = Math.max(10, Math.min(72, size));
    block.dataset.fontSize = String(size);
    block.style.fontSize = size + 'px';
    salvarNoLocalStorage();
}

function rotateTextBlock(btn) {
    const block = btn.closest('.text-block') || btn;
    if (!block) return;
    let rot = ((parseInt(block.dataset.rotation) || 0) + 90) % 360;
    block.dataset.rotation = String(rot);
    block.style.transform = `rotate(${rot}deg)`;
    salvarNoLocalStorage();
}

function editTextBlock(target) {
    const block = target.closest ? (target.closest('.text-block') || target) : target;
    if (!block) return;
    const novo = prompt("Editar texto ou fórmula:", block.dataset.raw);
    if (novo !== null && novo.trim() !== '') {
        block.dataset.raw = novo;
        const span = block.querySelector('.math-content');
        try {
            if (window.katex && (novo.includes('\\') || novo.includes('=') || novo.includes('^') || novo.includes('_') || novo.includes('\\frac') || novo.includes('\\cdot') || novo.includes('\\sqrt'))) {
                katex.render(novo, span, { displayMode: true, output: 'html', throwOnError: false });
            } else {
                span.innerText = novo;
            }
        } catch (e) { span.innerText = novo; }
        salvarNoLocalStorage();
    }
}

function deleteTextBlock(btn) {
    const block = btn.closest('.text-block');
    if (block) {
        block.remove();
        salvarNoLocalStorage();
    }
}

// --------------------------------------------------------
// Blocos de Circuito na Folha A4 (Ponto 2 & 4: Sem bordas, sem pontos azuis, editável)
// --------------------------------------------------------
function criarBlocoCircuitoNaFolha(svgContent, left = 200, top = 200, scale = 1, rotation = 0, circuitData = null) {
    const div = document.createElement('div');
    div.className = 'circuit-placed-block';
    div.style.left = left + 'px';
    div.style.top = top + 'px';
    div.dataset.scale = String(scale);
    div.dataset.rotation = String(rotation);
    div.dataset.svgRaw = svgContent;
    div.dataset.circuitData = JSON.stringify(circuitData || ccState);

    const wrap = document.createElement('div');
    wrap.className = 'circuit-inner-svg';
    wrap.innerHTML = svgContent;
    div.appendChild(wrap);

    const controls = document.createElement('div');
    controls.className = 'circuit-controls-overlay';
    controls.innerHTML = `
        <button class="ctrl-btn" onclick="event.stopPropagation(); scaleCircuitBlock(this, 1.15)" title="Aumentar Circuito">🔍 +</button>
        <button class="ctrl-btn" onclick="event.stopPropagation(); scaleCircuitBlock(this, 0.85)" title="Diminuir Circuito">🔍 -</button>
        <button class="ctrl-btn" onclick="event.stopPropagation(); rotateCircuitBlock(this)" title="Rodar 90° (R)">⟳ Rodar</button>
        <button class="ctrl-btn" onclick="event.stopPropagation(); editCircuitBlock(this)" title="Reabrir no CCnotes para mover ou apagar">✏ Editar</button>
        <button class="ctrl-btn" style="color:#f87171;" onclick="event.stopPropagation(); deleteCircuitBlock(this)" title="Apagar">🗑</button>
    `;
    div.appendChild(controls);

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    div.appendChild(resizeHandle);

    function aplicarTransformacao() {
        const sc = parseFloat(div.dataset.scale) || 1;
        const rot = parseInt(div.dataset.rotation) || 0;
        wrap.style.transform = `scale(${sc}) rotate(${rot}deg)`;
        wrap.style.transformOrigin = 'center center';
    }
    aplicarTransformacao();

    let isDragging = false, ox = 0, oy = 0;
    div.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.ctrl-btn') || e.target.classList.contains('resize-handle')) return;
        if (currentTool === 'eraser') {
            div.remove();
            salvarNoLocalStorage();
            return;
        }

        document.querySelectorAll('.text-block, .circuit-placed-block').forEach(b => b.classList.remove('selected'));
        selectedShapeStroke = null;
        redrawStrokes();

        div.classList.add('selected');
        selectedElement = div;

        isDragging = true;
        const pos = getCoordinates(e);
        ox = pos.x - (parseFloat(div.style.left) || 0);
        oy = pos.y - (parseFloat(div.style.top) || 0);
        e.stopPropagation();
    });

    window.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const pos = getCoordinates(e);
        div.style.left = Math.max(0, Math.min(A4_WIDTH - 60, pos.x - ox)) + 'px';
        div.style.top = Math.max(0, Math.min(A4_HEIGHT - 60, pos.y - oy)) + 'px';
    });

    window.addEventListener('pointerup', () => {
        if (isDragging) {
            isDragging = false;
            salvarNoLocalStorage();
        }
    });

    let isResizing = false, startDist = 0;
    resizeHandle.addEventListener('pointerdown', (e) => {
        isResizing = true;
        const pos = getCoordinates(e);
        startDist = Math.hypot(pos.x - (parseFloat(div.style.left) || 0), pos.y - (parseFloat(div.style.top) || 0));
        e.stopPropagation();
    });

    window.addEventListener('pointermove', (e) => {
        if (!isResizing) return;
        const pos = getCoordinates(e);
        const curDist = Math.hypot(pos.x - (parseFloat(div.style.left) || 0), pos.y - (parseFloat(div.style.top) || 0));
        if (startDist > 0) {
            const factor = curDist / startDist;
            let newScale = Math.max(0.3, Math.min(3.5, (parseFloat(div.dataset.scale) || 1) * factor));
            div.dataset.scale = newScale.toFixed(2);
            aplicarTransformacao();
            startDist = curDist;
        }
    });

    window.addEventListener('pointerup', () => {
        if (isResizing) {
            isResizing = false;
            salvarNoLocalStorage();
        }
    });

    placedBlocksContainer.appendChild(div);
}

function scaleCircuitBlock(btn, factor) {
    const block = btn.closest('.circuit-placed-block');
    if (!block) return;
    let sc = (parseFloat(block.dataset.scale) || 1) * factor;
    sc = Math.max(0.3, Math.min(3.5, sc));
    block.dataset.scale = sc.toFixed(2);
    const wrap = block.querySelector('.circuit-inner-svg');
    const rot = parseInt(block.dataset.rotation) || 0;
    wrap.style.transform = `scale(${sc}) rotate(${rot}deg)`;
    salvarNoLocalStorage();
}

function rotateCircuitBlock(btn) {
    const block = btn.closest('.circuit-placed-block');
    if (!block) return;
    let rot = ((parseInt(block.dataset.rotation) || 0) + 90) % 360;
    block.dataset.rotation = String(rot);
    const wrap = block.querySelector('.circuit-inner-svg');
    const sc = parseFloat(block.dataset.scale) || 1;
    wrap.style.transform = `scale(${sc}) rotate(${rot}deg)`;
    salvarNoLocalStorage();
}

function deleteCircuitBlock(btn) {
    const block = btn.closest('.circuit-placed-block');
    if (block) {
        block.remove();
        salvarNoLocalStorage();
    }
}

// Reabrir circuito no CCnotes para mover ou apagar componentes (Ponto 4)
function editCircuitBlock(btn) {
    const block = btn.closest('.circuit-placed-block');
    if (!block) return;
    ccEditingBlock = block;

    try {
        if (block.dataset.circuitData) {
            const data = JSON.parse(block.dataset.circuitData);
            ccState.parts = data.parts || [];
            ccState.wires = data.wires || [];
            ccState.annotations = data.annotations || []; // Restaura anotações e fórmulas (Item 8)
        }
    } catch (e) {
        console.warn('Erro ao restaurar dados do circuito:', e);
    }

    abrirCCnotesModal();
}

// --------------------------------------------------------
// Rotação e Eliminação por Teclado
// --------------------------------------------------------
function rotateCurrentSelection() {
    if (selectedShapeStroke) {
        const midX = (selectedShapeStroke.x0 + selectedShapeStroke.x1) / 2;
        const midY = (selectedShapeStroke.y0 + selectedShapeStroke.y1) / 2;
        const dx0 = selectedShapeStroke.x0 - midX;
        const dy0 = selectedShapeStroke.y0 - midY;
        const dx1 = selectedShapeStroke.x1 - midX;
        const dy1 = selectedShapeStroke.y1 - midY;
        selectedShapeStroke.x0 = midX - dy0;
        selectedShapeStroke.y0 = midY + dx0;
        selectedShapeStroke.x1 = midX - dy1;
        selectedShapeStroke.y1 = midY + dx1;
        redrawStrokes();
        salvarNoLocalStorage();
        return;
    }

    if (selectedElement) {
        if (selectedElement.classList && selectedElement.classList.contains('circuit-placed-block')) {
            rotateCircuitBlock(selectedElement);
        } else if (selectedElement.classList && selectedElement.classList.contains('text-block')) {
            rotateTextBlock(selectedElement);
        }
    }
}

window.addEventListener('keydown', (e) => {
    // Tecla ESC para sair do modo de desenho de fios no CCnotes (Ponto 1)
    if (e.key === 'Escape') {
        if (pendingPlacement) {
            cancelPendingPlacement();
            return;
        }
        if (currentTool === 'text') {
            setTool('pen');
            return;
        }
        if (document.getElementById('ccnotesModal').classList.contains('active')) {
            if (ccTool === 'wire') {
                ccWireStart = null;
                document.getElementById('ccPreviewLayer').innerHTML = '';
                document.getElementById('ccSnapPinIndicator').innerHTML = '';
                ccSetTool('select');
                return;
            }
        }
    }

    // Tecla ESPAÇO para alternar direção da curva de 90° no CCnotes (H-V ou V-H)
    if (e.code === 'Space' && document.getElementById('ccnotesModal').classList.contains('active')) {
        if (ccTool === 'wire' && ccWireStart && ccLastWireTarget) {
            e.preventDefault();
            ccWireCornerMode = (ccWireCornerMode === 'VH') ? 'HV' : 'VH';
            ccDrawWirePreview(ccLastWireTarget);
            return;
        }
    }

    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    if (e.key === 'r' || e.key === 'R') {
        if (document.getElementById('ccnotesModal').classList.contains('active')) {
            ccRotateSelected();
        } else {
            rotateCurrentSelection();
        }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (document.getElementById('ccnotesModal').classList.contains('active')) {
            ccDeleteSelected();
        } else {
            if (selectedShapeStroke) {
                currentStrokes = currentStrokes.filter(s => s !== selectedShapeStroke);
                selectedShapeStroke = null;
                redrawStrokes();
                salvarNoLocalStorage();
                return;
            }
            if (selectedElement) {
                selectedElement.remove();
                selectedElement = null;
                salvarNoLocalStorage();
            }
        }
    }
});

// --------------------------------------------------------
// Menus e Ferramentas (Toolbar do Mignotes)
// --------------------------------------------------------
function setTool(tool) {
    cancelPendingPlacement();
    currentTool = tool;
    document.querySelectorAll('.toolbar .tool-btn').forEach(btn => btn.classList.remove('active'));

    const targetBtn = document.getElementById(`btn-${tool}`);
    if (targetBtn) targetBtn.classList.add('active');

    if (tool === 'pen') toggleDropdown('pen-dropdown');
    else if (tool === 'pencil') toggleDropdown('pencil-dropdown');
    else if (tool === 'highlighter') toggleDropdown('highlighter-dropdown');
    else closeAllDropdowns();

    if (tool !== 'select') {
        document.querySelectorAll('.text-block, .circuit-placed-block').forEach(b => b.classList.remove('selected'));
        selectedElement = null;
        selectedShapeStroke = null;
        redrawStrokes();
    }
}

function toggleDropdown(id) {
    const el = document.getElementById(id);
    const isOpen = el.classList.contains('show');
    closeAllDropdowns();
    if (!isOpen) el.classList.add('show');
}

function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-menu').forEach(d => d.classList.remove('show'));
}

function selectShape(shape, iconName, label) {
    currentShape = shape;
    currentTool = 'shape';
    document.querySelectorAll('.toolbar .tool-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('btn-shape-menu').classList.add('active');
    document.getElementById('active-shape-icon').setAttribute('data-lucide', iconName);
    document.querySelectorAll('#shape-dropdown .dropdown-item').forEach(i => i.classList.remove('active'));
    if (event.currentTarget) event.currentTarget.classList.add('active');
    if (window.lucide) lucide.createIcons();
    closeAllDropdowns();
}

function setEraserType(type) {
    eraserMode = type;
    currentTool = 'eraser';
    document.querySelectorAll('.toolbar .tool-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('btn-eraser-menu').classList.add('active');
    document.querySelectorAll('#eraser-dropdown .dropdown-item').forEach(i => i.classList.remove('active'));
    const item = document.getElementById(`item-eraser-${type}`);
    if (item) item.classList.add('active');
    closeAllDropdowns();
}

function selectSwatch(el, color) {
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    el.classList.add('active');
    currentColor = color;
    updateColorPreviews(color);
    if (currentTool === 'eraser' || currentTool === 'select') setTool('pen');
}

function setColor(color) {
    currentColor = color;
    updateColorPreviews(color);
    if (currentTool === 'eraser' || currentTool === 'select') setTool('pen');
}

function updateColorPreviews(color) {
    const dot1 = document.getElementById('pen-preview-dot');
    const dot2 = document.getElementById('pencil-preview-dot');
    const dot3 = document.getElementById('high-preview-dot');
    if (dot1) dot1.style.background = color;
    if (dot2) dot2.style.background = color;
    if (dot3) dot3.style.background = color;

    document.getElementById('quick-color-picker').value = color;
    document.getElementById('pen-color-picker').value = color;
}

function setSize(size) {
    currentSize = parseInt(size, 10);
    document.getElementById('quick-size-label').innerText = currentSize + 'px';
    document.getElementById('quick-size-picker').value = currentSize;

    const pLabel = document.getElementById('pen-size-label');
    const pSlider = document.getElementById('pen-size-slider');
    const pDot = document.getElementById('pen-preview-dot');
    if (pLabel) pLabel.innerText = currentSize + 'px';
    if (pSlider) pSlider.value = currentSize;
    if (pDot) { pDot.style.width = Math.min(24, currentSize) + 'px'; pDot.style.height = Math.min(24, currentSize) + 'px'; }
}

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    isSidebarOpen = !isSidebarOpen;
    sb.classList.toggle('collapsed', !isSidebarOpen);
}

function executarImpressao() {
    closeAllDropdowns();
    window.print();
}

function limparFolha() {
    if (!confirm("Limpar toda a tinta, componentes e blocos desta folha?")) return;
    currentStrokes = [];
    selectedElement = null;
    selectedShapeStroke = null;
    placedBlocksContainer.innerHTML = '';
    paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    highlighterCtx.clearRect(0, 0, highlighterCanvas.width, highlighterCanvas.height);
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    renderBackground();
    salvarNoLocalStorage();
}

// --------------------------------------------------------
// Fórmulas Automáticas & Símbolos (Estilo Word - Ponto 5)
// Ordenadas estritamente pela sua importância em Engenharia Eletrotécnica
// --------------------------------------------------------
const ELECTRICAL_FORMULAS = [
    // 1. Leis Fundamentais (Divididas individualmente estilo escolar com U para Tensão)
    { cat: "1. LEIS FUNDAMENTAIS", name: "Lei de Ohm (Tensão)", tex: "U = R \\cdot I" },
    { cat: "1. LEIS FUNDAMENTAIS", name: "Lei de Ohm (Corrente)", tex: "I = \\frac{U}{R}" },
    { cat: "1. LEIS FUNDAMENTAIS", name: "Lei de Ohm (Resistência)", tex: "R = \\frac{U}{I}" },
    { cat: "1. LEIS FUNDAMENTAIS", name: "Potência Elétrica (Base)", tex: "P = U \\cdot I" },
    { cat: "1. LEIS FUNDAMENTAIS", name: "Potência (Efeito Joule)", tex: "P = R \\cdot I^2" },
    { cat: "1. LEIS FUNDAMENTAIS", name: "Potência (Tensão e Resistência)", tex: "P = \\frac{U^2}{R}" },
    { cat: "1. LEIS FUNDAMENTAIS", name: "Energia Elétrica", tex: "E = P \\cdot \\Delta t" },
    { cat: "1. LEIS FUNDAMENTAIS", name: "1ª Lei de Kirchhoff (Nós - KCL)", tex: "\\sum I_{in} = \\sum I_{out}" },
    { cat: "1. LEIS FUNDAMENTAIS", name: "2ª Lei de Kirchhoff (Malhas - KVL)", tex: "\\sum U_k = 0" },

    // 2. Circuitos DC e Divisores
    { cat: "2. CIRCUITOS DC & ASSOCIAÇÃO", name: "Resistores em Série", tex: "R_{eq} = R_1 + R_2 + \\dots" },
    { cat: "2. CIRCUITOS DC & ASSOCIAÇÃO", name: "Resistores em Paralelo (2R)", tex: "R_{eq} = \\frac{R_1 \\cdot R_2}{R_1 + R_2}" },
    { cat: "2. CIRCUITOS DC & ASSOCIAÇÃO", name: "Resistores em Paralelo (Geral)", tex: "\\frac{1}{R_{eq}} = \\frac{1}{R_1} + \\frac{1}{R_2} + \\dots" },
    { cat: "2. CIRCUITOS DC & ASSOCIAÇÃO", name: "Divisor de Tensão", tex: "U_{out} = U_{in} \\cdot \\frac{R_2}{R_1 + R_2}" },
    { cat: "2. CIRCUITOS DC & ASSOCIAÇÃO", name: "Divisor de Corrente (I1)", tex: "I_1 = I_{total} \\cdot \\frac{R_2}{R_1 + R_2}" },
    { cat: "2. CIRCUITOS DC & ASSOCIAÇÃO", name: "Divisor de Corrente (I2)", tex: "I_2 = I_{total} \\cdot \\frac{R_1}{R_1 + R_2}" },
    { cat: "2. CIRCUITOS DC & ASSOCIAÇÃO", name: "Tensão de Thévenin", tex: "U_{th} = U_{oc}" },
    { cat: "2. CIRCUITOS DC & ASSOCIAÇÃO", name: "Resistência de Thévenin", tex: "R_{th} = \\frac{U_{oc}}{I_{sc}}" },
    { cat: "2. CIRCUITOS DC & ASSOCIAÇÃO", name: "Corrente de Norton", tex: "I_N = \\frac{U_{th}}{R_{th}}" },

    // 3. Capacitores e Indutores
    { cat: "3. CAPACITORES & INDUTORES", name: "Carga no Capacitor", tex: "Q = C \\cdot U" },
    { cat: "3. CAPACITORES & INDUTORES", name: "Capacitância", tex: "C = \\frac{Q}{U}" },
    { cat: "3. CAPACITORES & INDUTORES", name: "Energia no Capacitor", tex: "E = \\frac{1}{2} C \\cdot U^2" },
    { cat: "3. CAPACITORES & INDUTORES", name: "Corrente no Capacitor", tex: "i(t) = C \\cdot \\frac{du}{dt}" },
    { cat: "3. CAPACITORES & INDUTORES", name: "Capacitores em Paralelo", tex: "C_{eq} = C_1 + C_2 + \\dots" },
    { cat: "3. CAPACITORES & INDUTORES", name: "Capacitores em Série (2C)", tex: "C_{eq} = \\frac{C_1 \\cdot C_2}{C_1 + C_2}" },
    { cat: "3. CAPACITORES & INDUTORES", name: "Tensão no Indutor", tex: "u(t) = L \\cdot \\frac{di}{dt}" },
    { cat: "3. CAPACITORES & INDUTORES", name: "Energia no Indutor", tex: "E = \\frac{1}{2} L \\cdot I^2" },
    { cat: "3. CAPACITORES & INDUTORES", name: "Constante de Tempo RC", tex: "\\tau = R \\cdot C" },
    { cat: "3. CAPACITORES & INDUTORES", name: "Carga RC no Tempo", tex: "u(t) = U_{max} \\left(1 - e^{-\\frac{t}{\\tau}}\\right)" },
    { cat: "3. CAPACITORES & INDUTORES", name: "Descarga RC no Tempo", tex: "u(t) = U_0 \\cdot e^{-\\frac{t}{\\tau}}" },
    { cat: "3. CAPACITORES & INDUTORES", name: "Constante de Tempo RL", tex: "\\tau = \\frac{L}{R}" },

    // 4. Circuitos AC, Fasores e Ressonância
    { cat: "4. CIRCUITOS AC & IMPEDÂNCIA", name: "Reatância Indutiva", tex: "X_L = 2\\pi f L" },
    { cat: "4. CIRCUITOS AC & IMPEDÂNCIA", name: "Reatância Capacitiva", tex: "X_C = \\frac{1}{2\\pi f C}" },
    { cat: "4. CIRCUITOS AC & IMPEDÂNCIA", name: "Impedância RLC Série", tex: "Z = \\sqrt{R^2 + (X_L - X_C)^2}" },
    { cat: "4. CIRCUITOS AC & IMPEDÂNCIA", name: "Frequência de Ressonância", tex: "f_0 = \\frac{1}{2\\pi\\sqrt{L \\cdot C}}" },
    { cat: "4. CIRCUITOS AC & IMPEDÂNCIA", name: "Ângulo de Fase", tex: "\\tan\\phi = \\frac{X_L - X_C}{R}" },
    { cat: "4. CIRCUITOS AC & IMPEDÂNCIA", name: "Potência Ativa (P)", tex: "P = U \\cdot I \\cdot \\cos\\phi" },
    { cat: "4. CIRCUITOS AC & IMPEDÂNCIA", name: "Potência Reativa (Q)", tex: "Q = U \\cdot I \\cdot \\sin\\phi" },
    { cat: "4. CIRCUITOS AC & IMPEDÂNCIA", name: "Potência Aparente (S)", tex: "S = U \\cdot I" },
    { cat: "4. CIRCUITOS AC & IMPEDÂNCIA", name: "Fator de Potência", tex: "\\cos\\phi = \\frac{P}{S}" },

    // 5. Filtros e Resposta em Frequência
    { cat: "5. FILTROS & DECIBÉIS", name: "Frequência de Corte RC", tex: "f_c = \\frac{1}{2\\pi R C}" },
    { cat: "5. FILTROS & DECIBÉIS", name: "Frequência de Corte RL", tex: "f_c = \\frac{R}{2\\pi L}" },
    { cat: "5. FILTROS & DECIBÉIS", name: "Ganho em Tensão (dB)", tex: "G_{dB} = 20 \\log_{10}\\left(\\frac{U_{out}}{U_{in}}\\right)" },
    { cat: "5. FILTROS & DECIBÉIS", name: "Ganho em Potência (dB)", tex: "G_{dB} = 10 \\log_{10}\\left(\\frac{P_{out}}{P_{in}}\\right)" },

    // 6. Semicondutores e Amplificadores
    { cat: "6. SEMICONDUTORES & OP-AMP", name: "Equação do Díodo (Shockley)", tex: "I_D = I_S \\left( e^{\\frac{U_D}{n U_T}} - 1 \\right)" },
    { cat: "6. SEMICONDUTORES & OP-AMP", name: "Ganho de Corrente BJT", tex: "I_C = \\beta \\cdot I_B" },
    { cat: "6. SEMICONDUTORES & OP-AMP", name: "Corrente de Emissor BJT", tex: "I_E = I_C + I_B" },
    { cat: "6. SEMICONDUTORES & OP-AMP", name: "Op-Amp Inversor", tex: "U_{out} = -U_{in} \\cdot \\frac{R_f}{R_{in}}" },
    { cat: "6. SEMICONDUTORES & OP-AMP", name: "Op-Amp Não-Inversor", tex: "U_{out} = U_{in} \\left( 1 + \\frac{R_f}{R_1} \\right)" },
    { cat: "6. SEMICONDUTORES & OP-AMP", name: "Op-Amp Buffer", tex: "U_{out} = U_{in}" }
];

const WORD_SYMBOLS = [
    // Unidades Elétricas Fundamentais (Ohm, Quilo-ohm, etc.)
    { sym: "Ω", tex: "\Omega", label: "Ohm (Ω)", unit: true },
    { sym: "kΩ", tex: "k\Omega", label: "Quilo-ohm (kΩ)", unit: true },
    { sym: "MΩ", tex: "M\Omega", label: "Mega-ohm (MΩ)", unit: true },
    { sym: "mΩ", tex: "m\Omega", label: "Mili-ohm (mΩ)", unit: true },
    { sym: "µF", tex: "\mu F", label: "Microfarad (µF)", unit: true },
    { sym: "nF", tex: "nF", label: "Nanofarad (nF)", unit: true },
    { sym: "pF", tex: "pF", label: "Picofarad (pF)", unit: true },
    { sym: "mH", tex: "mH", label: "Milihenry (mH)", unit: true },
    { sym: "µH", tex: "\mu H", label: "Microhenry (µH)", unit: true },
    { sym: "V", tex: "V", label: "Volt (V)", unit: true },
    { sym: "kV", tex: "kV", label: "Quilovolt (kV)", unit: true },
    { sym: "mV", tex: "mV", label: "Milivolt (mV)", unit: true },
    { sym: "A", tex: "A", label: "Ampere (A)", unit: true },
    { sym: "mA", tex: "mA", label: "Miliampere (mA)", unit: true },
    { sym: "µA", tex: "\mu A", label: "Microampere (µA)", unit: true },
    { sym: "W", tex: "W", label: "Watt (W)", unit: true },
    { sym: "kW", tex: "kW", label: "Quilowatt (kW)", unit: true },
    { sym: "Hz", tex: "Hz", label: "Hertz (Hz)", unit: true },
    { sym: "kHz", tex: "kHz", label: "Quilohertz (kHz)", unit: true },
    { sym: "MHz", tex: "MHz", label: "Megahertz (MHz)", unit: true },
    { sym: "GHz", tex: "GHz", label: "Gigahertz (GHz)", unit: true },

    // Letras Gregas & Variáveis
    { sym: "π", tex: "\pi", label: "Pi (π)" },
    { sym: "θ", tex: "\theta", label: "Teta (θ)" },
    { sym: "ω", tex: "\omega", label: "Ómega / Velocidade Angular (ω)" },
    { sym: "φ", tex: "\phi", label: "Fase (φ)" },
    { sym: "Φ", tex: "\Phi", label: "Fluxo Magnético (Φ)" },
    { sym: "Δ", tex: "\Delta", label: "Delta / Variação (Δ)" },
    { sym: "μ", tex: "\mu", label: "Micro / Permeabilidade (µ)" },
    { sym: "α", tex: "\alpha", label: "Alfa (α)" },
    { sym: "β", tex: "\beta", label: "Beta (β)" },
    { sym: "γ", tex: "\gamma", label: "Gama (γ)" },
    { sym: "λ", tex: "\lambda", label: "Comprimento de Onda (λ)" },
    { sym: "τ", tex: "\tau", label: "Constante de Tempo (τ)" },
    { sym: "ρ", tex: "\rho", label: "Resistividade (ρ)" },
    { sym: "σ", tex: "\sigma", label: "Condutividade (σ)" },
    { sym: "ε", tex: "\epsilon", label: "Permissividade (ε)" },
    { sym: "η", tex: "\eta", label: "Rendimento (η)" },

    // Símbolos Matemáticos & Escolares
    { sym: "±", tex: "\pm", label: "Mais ou Menos (±)" },
    { sym: "·", tex: "\cdot", label: "Ponto de Multiplicação (·)" },
    { sym: "×", tex: "\times", label: "Vezes (×)" },
    { sym: "÷", tex: "\div", label: "Divisão (÷)" },
    { sym: "√", tex: "\sqrt{}", label: "Raiz Quadrada (√)" },
    { sym: "∞", tex: "\infty", label: "Infinito (∞)" },
    { sym: "≈", tex: "\approx", label: "Aproximadamente (≈)" },
    { sym: "≠", tex: "\neq", label: "Diferente (≠)" },
    { sym: "≤", tex: "\le", label: "Menor ou Igual (≤)" },
    { sym: "≥", tex: "\ge", label: "Maior ou Igual (≥)" },
    { sym: "∠", tex: "\angle", label: "Fasor / Ângulo (∠)" },
    { sym: "∥", tex: "\parallel", label: "Paralelo (∥)" },
    { sym: "⊥", tex: "\perp", label: "Perpendicular (⊥)" },
    { sym: "∫", tex: "\int", label: "Integral (∫)" },
    { sym: "∑", tex: "\sum", label: "Somatório (∑)" },
    { sym: "∂", tex: "\partial", label: "Derivada Parcial (∂)" },
    { sym: "°", tex: "^\circ", label: "Grau (°)" }
];

function toggleWordSymbolsModal(target = 'mignotes') {
    wordSymbolsTarget = target;
    const modal = document.getElementById('wordSymbolsModal');
    const isActive = modal.classList.contains('active');
    if (!isActive) {
        renderWordFormulas();
        renderWordSymbols();
        modal.classList.add('active');
    } else {
        modal.classList.remove('active');
    }
}

function switchWordTab(tab) {
    document.getElementById('tab-btn-formulas').classList.toggle('active', tab === 'formulas');
    document.getElementById('tab-btn-symbols').classList.toggle('active', tab === 'symbols');
    document.getElementById('ws-content-formulas').style.display = (tab === 'formulas') ? 'flex' : 'none';
    document.getElementById('ws-content-symbols').style.display = (tab === 'symbols') ? 'grid' : 'none';
}

function renderWordFormulas() {
    const wrap = document.getElementById('ws-content-formulas');
    wrap.innerHTML = '';
    let currentCat = '';

    ELECTRICAL_FORMULAS.forEach(f => {
        if (f.cat !== currentCat) {
            currentCat = f.cat;
            const h = document.createElement('div');
            h.className = 'ws-category-header';
            h.innerText = currentCat;
            wrap.appendChild(h);
        }

        const card = document.createElement('div');
        card.className = 'formula-card';
        card.innerHTML = `
            <div>
                <div class="formula-name">${f.name}</div>
                <div class="formula-tex" style="margin-top:2px;"></div>
            </div>
            <span style="font-size:11px; color:#38bdf8; font-weight:700;">+ Inserir</span>
        `;
        const texSpan = card.querySelector('.formula-tex');
        try { katex.render(f.tex, texSpan, { output: 'html', throwOnError: false }); } catch(e) { texSpan.innerText = f.tex; }

        card.onclick = () => {
            if (wordSymbolsTarget === 'ccnotes') {
                ccAddTextAnnotation(f.tex);
            } else {
                activatePlacementMode('formula', f.tex, f.name);
            }
            toggleWordSymbolsModal();
        };
        wrap.appendChild(card);
    });
}

function renderWordSymbols() {
    const wrap = document.getElementById('ws-content-symbols');
    wrap.innerHTML = '';
    wrap.className = 'ws-content symbols-grid';
    WORD_SYMBOLS.forEach(item => {
        const b = document.createElement('button');
        b.className = 'symbol-btn';
        b.title = item.label || item.sym;
        b.innerHTML = `<span class="sym-char">${item.sym}</span>`;
        b.onclick = () => {
            if (wordSymbolsTarget === 'ccnotes') {
                ccAddTextAnnotation(item.sym);
            } else {
                activatePlacementMode('symbol', item.sym, item.label);
            }
            toggleWordSymbolsModal();
        };
        wrap.appendChild(b);
    });
}

// ========================================================
// Gestão de Cadernos e Navegação de Folhas (10 Folhas Predefinidas, Editável)
// ========================================================
function getTabData(cad = activeNotebook, tab = activeTab) {
    if (!notebooks[cad]) {
        notebooks[cad] = {
            tabs: ["Teoria", "Exercícios"],
            activeTab: "Teoria"
        };
    }
    if (!notebooks[cad].tabs || !Array.isArray(notebooks[cad].tabs) || notebooks[cad].tabs.length === 0) {
        notebooks[cad].tabs = ["Teoria", "Exercícios"];
    }
    if (!notebooks[cad][tab]) {
        notebooks[cad][tab] = {
            pages: [],
            currentPage: 0
        };
        for (let i = 0; i < 10; i++) {
            notebooks[cad][tab].pages.push({ strokes: [], blocks: [], circuits: [], templateIdx: templateIdx ?? 0 });
        }
    }
    // Migração de formato plano anterior se existir
    if (!notebooks[cad][tab].pages || !Array.isArray(notebooks[cad][tab].pages)) {
        const old = notebooks[cad][tab];
        notebooks[cad][tab] = {
            pages: [{
                strokes: old.strokes || [],
                blocks: old.blocks || [],
                circuits: old.circuits || [],
                templateIdx: old.templateIdx ?? 0
            }],
            currentPage: 0
        };
        while (notebooks[cad][tab].pages.length < 10) {
            notebooks[cad][tab].pages.push({ strokes: [], blocks: [], circuits: [], templateIdx: templateIdx ?? 0 });
        }
    }
    if (notebooks[cad][tab].pages.length === 0) {
        for (let i = 0; i < 10; i++) {
            notebooks[cad][tab].pages.push({ strokes: [], blocks: [], circuits: [], templateIdx: templateIdx ?? 0 });
        }
    }
    if (notebooks[cad][tab].currentPage === undefined || notebooks[cad][tab].currentPage < 0) {
        notebooks[cad][tab].currentPage = 0;
    }
    return notebooks[cad][tab];
}

function guardarEstadoAtual() {
    const tabData = getTabData(activeNotebook, activeTab);
    const pIdx = tabData.currentPage || 0;

    const blocks = [];
    document.querySelectorAll('.text-block').forEach(b => {
        blocks.push({
            text: b.dataset.raw || b.innerText,
            left: parseFloat(b.style.left) || 0,
            top: parseFloat(b.style.top) || 0,
            fontSize: parseInt(b.style.fontSize) || 18,
            rotation: parseInt(b.dataset.rotation) || 0
        });
    });

    const circuits = [];
    document.querySelectorAll('.circuit-placed-block').forEach(b => {
        let circuitData = null;
        try {
            if (b.dataset.circuitData) circuitData = JSON.parse(b.dataset.circuitData);
        } catch(e) {}
        circuits.push({
            svg: b.dataset.svgRaw || '',
            left: parseFloat(b.style.left) || 0,
            top: parseFloat(b.style.top) || 0,
            scale: parseFloat(b.dataset.scale) || 1,
            rotation: parseInt(b.dataset.rotation) || 0,
            circuitData: circuitData
        });
    });

    tabData.pages[pIdx] = {
        strokes: JSON.parse(JSON.stringify(currentStrokes || [])),
        templateIdx: templateIdx ?? 0,
        blocks: blocks,
        circuits: circuits
    };
}

function carregarPagina(cad, tab, pageIdx = 0) {
    guardarEstadoAtual();

    activeNotebook = cad;
    activeTab = tab;
    if (notebooks[cad]) notebooks[cad].activeTab = tab;

    const tabData = getTabData(cad, tab);
    if (pageIdx < 0) pageIdx = 0;
    if (pageIdx >= tabData.pages.length) pageIdx = tabData.pages.length - 1;
    tabData.currentPage = pageIdx;

    const page = tabData.pages[pageIdx];

    // Limpar elementos visuais da folha anterior
    document.querySelectorAll('.text-block').forEach(b => b.remove());
    document.querySelectorAll('.circuit-placed-block').forEach(b => b.remove());

    templateIdx = page.templateIdx ?? 0;
    currentStrokes = JSON.parse(JSON.stringify(page.strokes || []));

    (page.blocks || []).forEach(b => {
        criarBlocoTexto(b.text, b.left, b.top, b.fontSize || 18, b.rotation || 0);
    });

    (page.circuits || []).forEach(c => {
        criarBlocoCircuitoNaFolha(c.svg, c.left, c.top, c.scale || 1, c.rotation || 0, c.circuitData);
    });

    renderBackground();
    redrawStrokes();
    atualizarContadorFolhas();
    renderCadernosSidebar();
    salvarNoLocalStorage();
}

function atualizarContadorFolhas() {
    const tabData = getTabData(activeNotebook, activeTab);
    const cur = (tabData.currentPage || 0) + 1;
    const total = (tabData.pages || []).length;
    const txt = document.getElementById('page-counter-text');
    if (txt) {
        txt.innerText = `Folha ${cur} / ${total}`;
    }
}

function cadernoFolhaAnterior() {
    const tabData = getTabData(activeNotebook, activeTab);
    if ((tabData.currentPage || 0) > 0) {
        carregarPagina(activeNotebook, activeTab, tabData.currentPage - 1);
    }
}

function cadernoProximaFolha() {
    const tabData = getTabData(activeNotebook, activeTab);
    const total = tabData.pages.length;
    const cur = tabData.currentPage || 0;
    if (cur < total - 1) {
        carregarPagina(activeNotebook, activeTab, cur + 1);
    } else {
        // Se estiver na última folha e clicar em avançar, adiciona nova folha
        tabData.pages.push({ strokes: [], blocks: [], circuits: [], templateIdx: templateIdx ?? 0 });
        carregarPagina(activeNotebook, activeTab, cur + 1);
    }
}

function abrirModalNovoCaderno() {
    const modal = document.getElementById('modalNovoCaderno');
    if (modal) {
        const inpNome = document.getElementById('nbModalNome');
        const inpFolhas = document.getElementById('nbModalFolhas');
        if (inpNome) inpNome.value = '';
        if (inpFolhas) inpFolhas.value = '10';
        modal.classList.add('active');
        setTimeout(() => inpNome?.focus(), 80);
    }
}

function fecharModalNovoCaderno() {
    const modal = document.getElementById('modalNovoCaderno');
    if (modal) modal.classList.remove('active');
}

function confirmarCriarCaderno() {
    const nomeEl = document.getElementById('nbModalNome');
    const folhasEl = document.getElementById('nbModalFolhas');
    const nome = (nomeEl?.value || '').trim();
    let numFolhas = parseInt(folhasEl?.value) || 10;
    if (numFolhas < 1) numFolhas = 1;
    if (numFolhas > 100) numFolhas = 100;

    if (!nome) {
        alert("Por favor insira um nome para o novo caderno.");
        nomeEl?.focus();
        return;
    }

    if (notebooks[nome]) {
        alert("Já existe um caderno com este nome.");
        nomeEl?.focus();
        return;
    }

    guardarEstadoAtual();

    const pagesTeoria = [];
    const pagesExerc = [];
    for (let i = 0; i < numFolhas; i++) {
        pagesTeoria.push({ strokes: [], blocks: [], circuits: [], templateIdx: templateIdx ?? 0 });
        pagesExerc.push({ strokes: [], blocks: [], circuits: [], templateIdx: templateIdx ?? 0 });
    }

    notebooks[nome] = {
        tabs: ["Teoria", "Exercícios"],
        activeTab: "Teoria",
        "Teoria": { pages: pagesTeoria, currentPage: 0 },
        "Exercícios": { pages: pagesExerc, currentPage: 0 }
    };

    activeNotebook = nome;
    activeTab = "Teoria";
    fecharModalNovoCaderno();
    carregarPagina(nome, "Teoria", 0);
    renderCadernosSidebar();
    salvarNoLocalStorage();
}

function novoCaderno() {
    abrirModalNovoCaderno();
}

function adicionarAba(cad) {
    const nova = prompt("Nome do novo Separador / Aba:");
    if (!nova || !nova.trim()) return;
    const limpo = nova.trim();
    if (!notebooks[cad]) return;
    if (!notebooks[cad].tabs) notebooks[cad].tabs = [];
    if (notebooks[cad].tabs.includes(limpo)) {
        alert("Já existe um separador com este nome.");
        return;
    }
    notebooks[cad].tabs.push(limpo);
    const pages = [];
    for (let i = 0; i < 10; i++) {
        pages.push({ strokes: [], blocks: [], circuits: [], templateIdx: templateIdx ?? 0 });
    }
    notebooks[cad][limpo] = { pages: pages, currentPage: 0 };
    carregarPagina(cad, limpo, 0);
    renderCadernosSidebar();
    salvarNoLocalStorage();
}

// ========================================================
// Posicionamento Interativo na Folha
// ========================================================
let pendingPlacement = null;

function activatePlacementMode(type, data, name = '') {
    pendingPlacement = { type, data, name };
    paintCanvas.style.cursor = 'crosshair';
}

function cancelPendingPlacement() {
    pendingPlacement = null;
    paintCanvas.style.cursor = 'default';
}

function executePlacementAt(x, y) {
    if (!pendingPlacement) return;
    const { type, data } = pendingPlacement;

    if (type === 'formula' || type === 'symbol') {
        criarBlocoTexto(data, x, y, 22, 0);
    } else if (type === 'text') {
        criarBlocoTexto(data || 'Novo texto...', x, y, 18, 0);
    }

    cancelPendingPlacement();
    salvarNoLocalStorage();
}

function renderCadernosSidebar() {
    const lista = document.getElementById('cadernos-lista');
    const selectAtivo = document.getElementById('selectCadernoAtivo');
    if (!lista) return;
    lista.innerHTML = '';

    if (selectAtivo) {
        selectAtivo.innerHTML = '';
        for (let cad in notebooks) {
            const opt = document.createElement('option');
            opt.value = cad;
            opt.textContent = cad;
            if (cad === activeNotebook) opt.selected = true;
            selectAtivo.appendChild(opt);
        }
    }

    for (let cad in notebooks) {
        const card = document.createElement('div');
        card.className = 'notebook-card' + (cad === activeNotebook ? ' active' : '');

        const tabs = (notebooks[cad] && Array.isArray(notebooks[cad].tabs)) ? notebooks[cad].tabs : ["Teoria", "Exercícios"];
        let tabsHTML = '';
        tabs.forEach(tab => {
            const isTabActive = (cad === activeNotebook && tab === activeTab);
            const delBtn = tabs.length > 1
                ? `<button class="tab-del-btn" onclick="event.stopPropagation(); removerAba('${cad}', '${tab}')" title="Apagar separador ${tab}">✕</button>`
                : '';
            tabsHTML += `<span class="tab-chip ${isTabActive ? 'active' : ''}" onclick="event.stopPropagation(); carregarPagina('${cad}', '${tab}', 0); renderCadernosSidebar();">${tab}${delBtn}</span>`;
        });

        card.innerHTML = `
            <div class="notebook-header">
                <span style="display:flex; align-items:center; gap:8px;">
                    <svg viewBox="0 0 24 28" width="18" height="21" fill="none" style="flex-shrink:0;">
                        <rect x="2" y="1" width="20" height="26" rx="3.5" fill="#3b82f6" stroke="#93c5fd" stroke-width="1.2"/>
                        <rect x="2" y="1" width="5.5" height="26" rx="1" fill="#1d4ed8"/>
                        <line x1="10" y1="8" x2="19" y2="8" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"/>
                        <line x1="10" y1="13" x2="19" y2="13" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"/>
                        <line x1="10" y1="18" x2="16" y2="18" stroke="#bfdbfe" stroke-width="1.3" stroke-linecap="round"/>
                    </svg>
                    <strong>${cad}</strong>
                </span>
                <span style="display:flex; align-items:center; gap:6px;">
                    <span style="font-size:11px; cursor:pointer; color:#38bdf8; font-weight:700;" onclick="event.stopPropagation(); adicionarAba('${cad}')" title="Adicionar Separador">+ Tab</span>
                    <button class="nb-remove-btn" onclick="event.stopPropagation(); tirarCadernoDaBarra('${cad}')" title="Tirar da barra lateral / Organizar">✕</button>
                </span>
            </div>
            <div class="notebook-tabs">${tabsHTML}</div>
        `;
        card.onclick = () => {
            carregarPagina(cad, tabs[0], 0);
        };
        lista.appendChild(card);
    }
    if (window.lucide) lucide.createIcons();
}

function selecionarCadernoDropdown(cad) {
    if (!notebooks[cad]) return;
    const tabs = (notebooks[cad] && Array.isArray(notebooks[cad].tabs)) ? notebooks[cad].tabs : ["Teoria", "Exercícios"];
    const tabToLoad = tabs.includes(activeTab) ? activeTab : tabs[0];
    carregarPagina(cad, tabToLoad, 0);
    renderCadernosSidebar();
}

function tirarCadernoDaBarra(cad) {
    const keys = Object.keys(notebooks);
    if (keys.length <= 1) {
        alert("Deve manter pelo menos um caderno ativo na barra lateral.");
        return;
    }
    if (!confirm(`Deseja retirar o caderno "${cad}" da barra lateral?`)) return;
    delete notebooks[cad];
    if (cad === activeNotebook) {
        const remaining = Object.keys(notebooks)[0];
        const tabs = notebooks[remaining].tabs || ["Teoria", "Exercícios"];
        carregarPagina(remaining, tabs[0], 0);
    }
    renderCadernosSidebar();
    salvarNoLocalStorage();
}

function removerAba(cad, tab) {
    if (!notebooks[cad] || !notebooks[cad].tabs) return;
    if (notebooks[cad].tabs.length <= 1) {
        alert("O caderno deve ter pelo menos um separador.");
        return;
    }
    if (!confirm(`Tem a certeza que deseja apagar o separador "${tab}" e todo o seu conteúdo?`)) return;
    notebooks[cad].tabs = notebooks[cad].tabs.filter(t => t !== tab);
    delete notebooks[cad][tab];
    if (activeNotebook === cad && activeTab === tab) {
        const nextTab = notebooks[cad].tabs[0];
        carregarPagina(cad, nextTab, 0);
    }
    renderCadernosSidebar();
    salvarNoLocalStorage();
}

// ========================================================
// STUDIO CCnotes: Biblioteca Completa de Componentes e Símbolos de Circuito
// (Componentes Concentrados, Fontes, Sondas, Linhas de Transmissão e Semicondutores)
// ========================================================
const CC_GRID = 20;
const ccSnap = v => Math.round(v / CC_GRID) * CC_GRID;
const ccUid = () => Math.random().toString(36).slice(2, 9);
const CC_NS = 'http://www.w3.org/2000/svg';

const QUCS_SYMBOLS = {
    // ----------------------------------------------------
    // Categoria 1: Componentes Concentrados (Imagem 1)
    // ----------------------------------------------------
    res_eu: {
        name: 'Resistência (EU)', pre: 'R', defVal: '1k',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h + 6, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('rect', { x: -h + 6, y: -6, width: Math.max(10, s - 12), height: 12, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
            ccSvgEl('line', { x1: h - 6, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    res_us: {
        name: 'Resistência (US)', pre: 'R', defVal: '1k',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            const step = (s - 12) / 6;
            let d = `M${-h} 0H${-h + 6}`;
            let curX = -h + 6;
            for (let i = 0; i < 6; i++) {
                const up = (i % 2 === 0) ? -7 : 7;
                d += `L${curX + step / 2} ${up}`;
                curX += step;
            }
            d += `L${h - 6} 0H${h}`;
            ccSvgEl('path', { d: d, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
        }
    },
    cap: {
        name: 'Condensador', pre: 'C', defVal: '100nF',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: -4, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -4, y1: -h * 0.75, x2: -4, y2: h * 0.75, stroke: '#111827', 'stroke-width': 2.5 }, g);
            ccSvgEl('line', { x1: 4, y1: -h * 0.75, x2: 4, y2: h * 0.75, stroke: '#111827', 'stroke-width': 2.5 }, g);
            ccSvgEl('line', { x1: 4, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    ind: {
        name: 'Inductor', pre: 'L', defVal: '10mH',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            const r = (s - 12) / 6;
            let d = `M${-h} 0H${-h + 6}`;
            let cx = -h + 6;
            for (let i = 0; i < 3; i++) {
                d += `A${r} ${r} 0 0 1 ${cx + r * 2} 0`;
                cx += r * 2;
            }
            d += `H${h}`;
            ccSvgEl('path', { d: d, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
        }
    },
    gnd: {
        name: 'Massa (GND)', pre: 'GND', defVal: '',
        terminals: (s) => [[0, -s/2]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: 0, y1: -h, x2: 0, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h * 0.7, y1: 0, x2: h * 0.7, y2: 0, stroke: '#111827', 'stroke-width': 2.5 }, g);
            ccSvgEl('line', { x1: -h * 0.45, y1: 4, x2: h * 0.45, y2: 4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h * 0.2, y1: 8, x2: h * 0.2, y2: 8, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    subcircuit_port: {
        name: 'Subcircuito (Porta)', pre: 'P', defVal: 'in',
        terminals: (s) => [[s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('circle', { cx: -4, cy: 0, r: 6, stroke: '#111827', 'stroke-width': 2, fill: '#fff' }, g);
            ccSvgEl('line', { x1: 2, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    xfmr: {
        name: 'Transformador 2E', pre: 'T', defVal: '1:1',
        terminals: (s) => [[-s/2, -s/2*0.6], [-s/2, s/2*0.6], [s/2, -s/2*0.6], [s/2, s/2*0.6]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: -h*0.6, x2: -6, y2: -h*0.6, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h, y1: h*0.6, x2: -6, y2: h*0.6, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('path', { d: `M-6,${-h*0.6} A6,6 0 0 1 -6,0 A6,6 0 0 1 -6,${h*0.6}`, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
            ccSvgEl('line', { x1: -1.5, y1: -h*0.7, x2: -1.5, y2: h*0.7, stroke: '#111827', 'stroke-width': 1.5 }, g);
            ccSvgEl('line', { x1: 1.5, y1: -h*0.7, x2: 1.5, y2: h*0.7, stroke: '#111827', 'stroke-width': 1.5 }, g);
            ccSvgEl('line', { x1: h, y1: -h*0.6, x2: 6, y2: -h*0.6, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h, y1: h*0.6, x2: 6, y2: h*0.6, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('path', { d: `M6,${-h*0.6} A6,6 0 0 0 6,0 A6,6 0 0 0 6,${h*0.6}`, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
        }
    },
    xfmr_tap: {
        name: 'Transf. Derivação', pre: 'T', defVal: '1:1:1',
        terminals: (s) => [[-s/2, -s/2*0.6], [-s/2, s/2*0.6], [s/2, -s/2*0.6], [s/2, 0], [s/2, s/2*0.6]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: -h*0.6, x2: -6, y2: -h*0.6, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h, y1: h*0.6, x2: -6, y2: h*0.6, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('path', { d: `M-6,${-h*0.6} A6,6 0 0 1 -6,0 A6,6 0 0 1 -6,${h*0.6}`, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
            ccSvgEl('line', { x1: -1.5, y1: -h*0.7, x2: -1.5, y2: h*0.7, stroke: '#111827', 'stroke-width': 1.5 }, g);
            ccSvgEl('line', { x1: 1.5, y1: -h*0.7, x2: 1.5, y2: h*0.7, stroke: '#111827', 'stroke-width': 1.5 }, g);
            ccSvgEl('line', { x1: h, y1: -h*0.6, x2: 6, y2: -h*0.6, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h, y1: 0, x2: 6, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h, y1: h*0.6, x2: 6, y2: h*0.6, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('path', { d: `M6,${-h*0.6} A6,6 0 0 0 6,0 A6,6 0 0 0 6,${h*0.6}`, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
        }
    },
    dc_block: {
        name: 'DC Block', pre: 'C_dc', defVal: '10nF',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('rect', { x: -8, y: -h*0.7, width: 16, height: h*1.4, stroke: '#94a3b8', 'stroke-width': 1.2, 'stroke-dasharray': '2,2', fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: 0, x2: -3, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -3, y1: -h*0.5, x2: -3, y2: h*0.5, stroke: '#111827', 'stroke-width': 2.5 }, g);
            ccSvgEl('line', { x1: 3, y1: -h*0.5, x2: 3, y2: h*0.5, stroke: '#111827', 'stroke-width': 2.5 }, g);
            ccSvgEl('line', { x1: 3, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    dc_feed: {
        name: 'DC Feed', pre: 'L_dc', defVal: '10uH',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('rect', { x: -10, y: -h*0.6, width: 20, height: h*1.2, stroke: '#94a3b8', 'stroke-width': 1.2, 'stroke-dasharray': '2,2', fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: 0, x2: -6, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('path', { d: `M-6,0 A3,3 0 0 1 0,0 A3,3 0 0 1 6,0`, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
            ccSvgEl('line', { x1: 6, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    amplifier: {
        name: 'Amplificador', pre: 'Amp', defVal: '20dB',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h*0.6, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('polygon', { points: `${-h*0.6},${-h*0.7} ${h*0.6},0 ${-h*0.6},${h*0.7}`, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
            ccSvgEl('line', { x1: h*0.6, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    gyrator: {
        name: 'Gyrator', pre: 'Gy', defVal: '1k',
        terminals: (s) => [[-s/2, -s/2*0.5], [-s/2, s/2*0.5], [s/2, -s/2*0.5], [s/2, s/2*0.5]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: -h*0.5, x2: -6, y2: -h*0.5, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h, y1: h*0.5, x2: -6, y2: h*0.5, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h, y1: -h*0.5, x2: 6, y2: -h*0.5, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h, y1: h*0.5, x2: 6, y2: h*0.5, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('circle', { cx: -2, cy: 0, r: 7, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
            ccSvgEl('circle', { cx: 2, cy: 0, r: 7, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
        }
    },
    switch: {
        name: 'Switch (Chave)', pre: 'SW', defVal: '',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('circle', { cx: -h + 6, cy: 0, r: 2.5, stroke: '#111827', 'stroke-width': 2, fill: '#fff' }, g);
            ccSvgEl('circle', { cx: h - 6, cy: 0, r: 2.5, stroke: '#111827', 'stroke-width': 2, fill: '#fff' }, g);
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h + 4, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h + 6, y1: 0, x2: h - 8, y2: -8, stroke: '#111827', 'stroke-width': 2.5 }, g);
            ccSvgEl('line', { x1: h - 4, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    mutual_ind: {
        name: 'Mutual Inductor', pre: 'M', defVal: '1mH',
        terminals: (s) => [[-s/2, -s/2*0.5], [-s/2, s/2*0.5], [s/2, -s/2*0.5], [s/2, s/2*0.5]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: -h*0.5, x2: -6, y2: -h*0.5, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h, y1: h*0.5, x2: -6, y2: h*0.5, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('path', { d: `M-6,${-h*0.5} A5,5 0 0 1 -6,0 A5,5 0 0 1 -6,${h*0.5}`, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
            ccSvgEl('line', { x1: h, y1: -h*0.5, x2: 6, y2: -h*0.5, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h, y1: h*0.5, x2: 6, y2: h*0.5, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('path', { d: `M6,${-h*0.5} A5,5 0 0 0 6,0 A5,5 0 0 0 6,${h*0.5}`, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
            ccSvgEl('circle', { cx: -9, cy: -h*0.5 - 4, r: 1.8, fill: '#111827' }, g);
            ccSvgEl('circle', { cx: 9, cy: -h*0.5 - 4, r: 1.8, fill: '#111827' }, g);
        }
    },

    // ----------------------------------------------------
    // Categoria 2: Fontes (Imagem 2)
    // ----------------------------------------------------
    v_dc: {
        name: 'Fonte Vdc (+ -)', pre: 'V', defVal: '12V',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: -6, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 6, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -6, y1: -h * 0.8, x2: -6, y2: h * 0.8, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 6, y1: -h * 0.45, x2: 6, y2: h * 0.45, stroke: '#111827', 'stroke-width': 4 }, g);
            const p = ccSvgEl('text', { x: -14, y: -8, 'font-size': '10', fill: '#111827', 'font-weight': 'bold' }, g); p.textContent = '+';
            const m = ccSvgEl('text', { x: 10, y: -8, 'font-size': '10', fill: '#111827', 'font-weight': 'bold' }, g); m.textContent = '-';
        }
    },
    i_dc: {
        name: 'Fonte Idc (→)', pre: 'I', defVal: '2A',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('circle', { cx: 0, cy: 0, r: h * 0.7, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h * 0.7, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h * 0.7, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h * 0.35, y1: 0, x2: h * 0.35, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('polygon', { points: `${h * 0.35},0 ${h * 0.15},${-h * 0.18} ${h * 0.15},${h * 0.18}`, fill: '#111827' }, g);
        }
    },
    v_ac: {
        name: 'Fonte Vac (~)', pre: 'V', defVal: '230V',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('circle', { cx: 0, cy: 0, r: h * 0.7, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h * 0.7, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h * 0.7, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            const w = h * 0.35;
            ccSvgEl('path', { d: `M${-w} 0 Q${-w/2} ${-w} 0 0 T${w} 0`, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
        }
    },
    i_ac: {
        name: 'Fonte Iac', pre: 'I', defVal: '1A',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('circle', { cx: 0, cy: 0, r: h * 0.7, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h * 0.7, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h * 0.7, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h * 0.35, y1: 0, x2: h * 0.35, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('polygon', { points: `${h * 0.35},0 ${h * 0.15},${-h * 0.18} ${h * 0.15},${h * 0.18}`, fill: '#111827' }, g);
        }
    },
    v_pulse: {
        name: 'Pulso V', pre: 'V', defVal: '5V',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('circle', { cx: 0, cy: 0, r: h * 0.7, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h * 0.7, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h * 0.7, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            const w = h * 0.25;
            ccSvgEl('path', { d: `M${-w} ${w} V${-w} H0 V${w} H${w}`, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
        }
    },
    i_pulse: {
        name: 'Pulso I', pre: 'I', defVal: '10mA',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('circle', { cx: 0, cy: 0, r: h * 0.7, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h * 0.7, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h * 0.7, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h * 0.35, y1: 0, x2: h * 0.35, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('polygon', { points: `${h * 0.35},0 ${h * 0.15},${-h * 0.18} ${h * 0.15},${h * 0.18}`, fill: '#111827' }, g);
        }
    },
    vcvs: {
        name: 'Fonte VCVS', pre: 'E', defVal: 'G=10',
        terminals: (s) => [[-s/2, -s/2*0.5], [-s/2, s/2*0.5], [s/2, -s/2*0.5], [s/2, s/2*0.5]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: -h*0.5, x2: -h*0.4, y2: -h*0.5, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h, y1: h*0.5, x2: -h*0.4, y2: h*0.5, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('polygon', { points: `0,${-h*0.6} ${h*0.5},0 0,${h*0.6} ${-h*0.5},0`, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
            ccSvgEl('line', { x1: h*0.5, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    vccs: {
        name: 'Fonte VCCS', pre: 'G', defVal: 'gm=1m',
        terminals: (s) => [[-s/2, -s/2*0.5], [-s/2, s/2*0.5], [s/2, -s/2*0.5], [s/2, s/2*0.5]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: -h*0.5, x2: -h*0.4, y2: -h*0.5, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h, y1: h*0.5, x2: -h*0.4, y2: h*0.5, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('polygon', { points: `0,${-h*0.6} ${h*0.5},0 0,${h*0.6} ${-h*0.5},0`, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
            ccSvgEl('line', { x1: -4, y1: 0, x2: 4, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    ccvs: {
        name: 'Fonte CCVS', pre: 'H', defVal: 'r=100',
        terminals: (s) => [[-s/2, -s/2*0.5], [-s/2, s/2*0.5], [s/2, -s/2*0.5], [s/2, s/2*0.5]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('polygon', { points: `0,${-h*0.6} ${h*0.5},0 0,${h*0.6} ${-h*0.5},0`, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
        }
    },
    cccs: {
        name: 'Fonte CCCS', pre: 'F', defVal: 'A=50',
        terminals: (s) => [[-s/2, -s/2*0.5], [-s/2, s/2*0.5], [s/2, -s/2*0.5], [s/2, s/2*0.5]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('polygon', { points: `0,${-h*0.6} ${h*0.5},0 0,${h*0.6} ${-h*0.5},0`, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
        }
    },
    v_noise: {
        name: 'Fonte Ruído V', pre: 'Vn', defVal: '1nV',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('circle', { cx: 0, cy: 0, r: h * 0.7, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h * 0.7, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h * 0.7, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            for (let i = -2; i <= 2; i++) {
                ccSvgEl('line', { x1: i * 3, y1: -h * 0.4, x2: i * 3, y2: h * 0.4, stroke: '#111827', 'stroke-width': 1.2 }, g);
            }
        }
    },
    i_noise: {
        name: 'Fonte Ruído I', pre: 'In', defVal: '1pA',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('circle', { cx: 0, cy: 0, r: h * 0.7, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h * 0.7, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h * 0.7, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            for (let i = -2; i <= 2; i++) {
                ccSvgEl('line', { x1: i * 3, y1: -h * 0.4, x2: i * 3, y2: h * 0.4, stroke: '#111827', 'stroke-width': 1.2 }, g);
            }
            ccSvgEl('polygon', { points: `0,${-h * 0.5} 3,${-h * 0.1} -3,${-h * 0.1}`, fill: '#111827' }, g);
        }
    },

    // ----------------------------------------------------
    // Categoria 3: Sondas & Medidores (Imagem 3)
    // ----------------------------------------------------
    probe_i: {
        name: 'Sonda Corrente', pre: 'PrI', defVal: '',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('rect', { x: -h*0.6, y: -h*0.5, width: h*1.2, height: h, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('path', { d: `M${-h*0.3} ${h*0.1} Q0 ${-h*0.2} ${h*0.3} ${h*0.1}`, stroke: '#111827', 'stroke-width': 1.5, fill: 'none' }, g);
            ccSvgEl('line', { x1: 0, y1: h*0.2, x2: h*0.2, y2: -h*0.3, stroke: '#111827', 'stroke-width': 1.8 }, g);
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h*0.6, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h*0.6, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    probe_v: {
        name: 'Sonda Tensão', pre: 'PrV', defVal: '',
        terminals: (s) => [[-s/2*0.4, s/2], [s/2*0.4, s/2]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('rect', { x: -h*0.6, y: -h*0.6, width: h*1.2, height: h*1.1, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('path', { d: `M${-h*0.3} ${-h*0.1} Q0 ${-h*0.4} ${h*0.3} ${-h*0.1}`, stroke: '#111827', 'stroke-width': 1.5, fill: 'none' }, g);
            ccSvgEl('line', { x1: 0, y1: 0, x2: h*0.2, y2: -h*0.4, stroke: '#111827', 'stroke-width': 1.8 }, g);
            ccSvgEl('line', { x1: -h*0.4, y1: h*0.5, x2: -h*0.4, y2: h, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h*0.4, y1: h*0.5, x2: h*0.4, y2: h, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    ohmmeter: {
        name: 'Ohmmeter (Z)', pre: 'Ohm', defVal: '',
        terminals: (s) => [[-s/2*0.4, s/2], [s/2*0.4, s/2]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('rect', { x: -h*0.6, y: -h*0.6, width: h*1.2, height: h*1.1, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            const z = ccSvgEl('text', { x: 0, y: -h*0.1, 'font-size': '12', 'font-weight': 'bold', 'text-anchor': 'middle', fill: '#111827' }, g);
            z.textContent = 'Z';
            ccSvgEl('line', { x1: -h*0.4, y1: h*0.5, x2: -h*0.4, y2: h, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h*0.4, y1: h*0.5, x2: h*0.4, y2: h, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    power_probe: {
        name: 'Power Probe (W)', pre: 'PrW', defVal: '',
        terminals: (s) => [[-s/2, 0], [s/2, 0], [0, s/2]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('rect', { x: -h*0.6, y: -h*0.6, width: h*1.2, height: h*1.1, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            const w = ccSvgEl('text', { x: 0, y: -h*0.1, 'font-size': '11', 'font-weight': 'bold', 'text-anchor': 'middle', fill: '#111827' }, g);
            w.textContent = 'W';
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h*0.6, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h*0.6, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 0, y1: h*0.5, x2: 0, y2: h, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },

    // ----------------------------------------------------
    // Categoria 4: Linhas de Transmissão (Imagens 4 e 5)
    // ----------------------------------------------------
    tline: {
        name: 'Linha Transmissão', pre: 'TL', defVal: 'Z0=50',
        terminals: (s) => [[-s/2, -s/2*0.5], [-s/2, s/2*0.5], [s/2, -s/2*0.5], [s/2, s/2*0.5]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: -h*0.5, x2: h, y2: -h*0.5, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h, y1: h*0.5, x2: h, y2: h*0.5, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('rect', { x: -h*0.6, y: -h*0.3, width: h*1.2, height: h*0.6, stroke: '#94a3b8', 'stroke-width': 1, fill: 'none' }, g);
        }
    },
    coaxial: {
        name: 'Cabo Coaxial', pre: 'Coax', defVal: 'RG58',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('rect', { x: -h*0.6, y: -6, width: h*1.2, height: 12, stroke: '#111827', 'stroke-width': 2, rx: 6, fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h*0.6, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h*0.6, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    twisted_pair: {
        name: 'Par-Entrançado', pre: 'TP', defVal: '100R',
        terminals: (s) => [[-s/2, -s/2*0.4], [-s/2, s/2*0.4], [s/2, -s/2*0.4], [s/2, s/2*0.4]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('path', { d: `M${-h},${-h*0.4} Q0,${h*0.4} ${h},${-h*0.4}`, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
            ccSvgEl('path', { d: `M${-h},${h*0.4} Q0,${-h*0.4} ${h},${h*0.4}`, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
        }
    },
    microstrip: {
        name: 'Microstrip Line', pre: 'MS', defVal: 'W=1mm',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h*0.6, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('polygon', { points: `${-h*0.6},-6 ${h*0.6},-6 ${h*0.4},6 ${-h*0.4},6`, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
            ccSvgEl('line', { x1: h*0.6, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    mstrip_bend: {
        name: 'Canto Microstrip', pre: 'MBend', defVal: '',
        terminals: (s) => [[-s/2, 0], [0, s/2]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: -4, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 0, y1: 4, x2: 0, y2: h, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('path', { d: `M-4,-6 L6,-6 L6,4 L-4,0 Z`, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
        }
    },
    mstrip_tee: {
        name: 'Tê Microstrip', pre: 'MTee', defVal: '',
        terminals: (s) => [[-s/2, 0], [s/2, 0], [0, s/2]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 0, y1: 0, x2: 0, y2: h, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('rect', { x: -6, y: -4, width: 12, height: 8, stroke: '#111827', 'stroke-width': 1.5, fill: 'none' }, g);
        }
    },
    mstrip_cross: {
        name: 'Cruz Microstrip', pre: 'MCross', defVal: '',
        terminals: (s) => [[-s/2, 0], [s/2, 0], [0, -s/2], [0, s/2]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 0, y1: -h, x2: 0, y2: h, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('rect', { x: -5, y: -5, width: 10, height: 10, stroke: '#111827', 'stroke-width': 1.5, fill: 'none' }, g);
        }
    },
    substrate: {
        name: 'Substrato (MSUB)', pre: 'Sub', defVal: 'er=4.4',
        terminals: () => [],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('rect', { x: -h*0.7, y: -h*0.35, width: h*1.4, height: h*0.7, stroke: '#111827', 'stroke-width': 1.8, fill: '#f8fafc' }, g);
            ccSvgEl('line', { x1: -h*0.7, y1: 0, x2: h*0.7, y2: 0, stroke: '#475569', 'stroke-width': 1.2, 'stroke-dasharray': '2,2' }, g);
            const sub = ccSvgEl('text', { x: 0, y: -h*0.4, 'font-size': '8', 'text-anchor': 'middle', fill: '#475569', 'font-weight': 'bold' }, g);
            sub.textContent = 'SUB';
        }
    },
    mstrip_open: {
        name: 'Open Stub Microstrip', pre: 'Stub', defVal: '',
        terminals: (s) => [[-s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: -4, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('rect', { x: -4, y: -6, width: h + 2, height: 12, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
        }
    },
    mstrip_radial: {
        name: 'Radial Stub', pre: 'RStub', defVal: 'r=3mm',
        terminals: (s) => [[0, s/2]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: 0, y1: 4, x2: 0, y2: h, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('path', { d: `M0,4 L${-h*0.7},${-h*0.7} A${h},${h} 0 0 1 ${h*0.7},${-h*0.7} Z`, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
        }
    },
    bond_wire: {
        name: 'Bond Wire', pre: 'BW', defVal: '1nH',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('path', { d: `M${-h},0 Q0,${-h} ${h},0`, stroke: '#111827', 'stroke-width': 2.2, fill: 'none' }, g);
            ccSvgEl('circle', { cx: -h + 2, cy: 0, r: 2, fill: '#111827' }, g);
            ccSvgEl('circle', { cx: h - 2, cy: 0, r: 2, fill: '#111827' }, g);
        }
    },

    // ----------------------------------------------------
    // Categoria 5: Semicondutores
    // ----------------------------------------------------
    diode: {
        name: 'Díodo', pre: 'D', defVal: '1N4148',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: -6, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('polygon', { points: `-6,${-h * 0.6} 6,0 -6,${h * 0.6}`, stroke: '#111827', 'stroke-width': 2, fill: '#111827' }, g);
            ccSvgEl('line', { x1: 6, y1: -h * 0.6, x2: 6, y2: h * 0.6, stroke: '#111827', 'stroke-width': 2.5 }, g);
            ccSvgEl('line', { x1: 6, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    zener: {
        name: 'Zener', pre: 'D', defVal: 'BZX55',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: -6, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('polygon', { points: `-6,${-h * 0.6} 6,0 -6,${h * 0.6}`, stroke: '#111827', 'stroke-width': 2, fill: '#111827' }, g);
            ccSvgEl('path', { d: `M3,${-h*0.6} H6 V${h*0.6} H9`, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
            ccSvgEl('line', { x1: 6, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    led: {
        name: 'LED', pre: 'D', defVal: 'LED',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: -6, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('polygon', { points: `-6,${-h * 0.6} 6,0 -6,${h * 0.6}`, stroke: '#111827', 'stroke-width': 2, fill: '#111827' }, g);
            ccSvgEl('line', { x1: 6, y1: -h * 0.6, x2: 6, y2: h * 0.6, stroke: '#111827', 'stroke-width': 2.5 }, g);
            ccSvgEl('line', { x1: 6, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 2, y1: -h*0.7, x2: 8, y2: -h*1.1, stroke: '#111827', 'stroke-width': 1.5 }, g);
            ccSvgEl('polygon', { points: `8,${-h*1.1} 5,${-h*0.95} 9,${-h*0.9}`, fill: '#111827' }, g);
        }
    },
    bjt_npn: {
        name: 'BJT NPN', pre: 'Q', defVal: 'BC547',
        terminals: (s) => [[-s/2, 0], [s/2 * 0.6, -s/2 * 0.8], [s/2 * 0.6, s/2 * 0.8]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: -3, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -3, y1: -h * 0.7, x2: -3, y2: h * 0.7, stroke: '#111827', 'stroke-width': 3 }, g);
            ccSvgEl('line', { x1: -3, y1: -h * 0.35, x2: h * 0.6, y2: -h * 0.8, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -3, y1: h * 0.35, x2: h * 0.6, y2: h * 0.8, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('polygon', { points: `${h * 0.6},${h * 0.8} ${h * 0.3},${h * 0.7} ${h * 0.5},${h * 0.5}`, fill: '#111827' }, g);
        }
    },
    bjt_pnp: {
        name: 'BJT PNP', pre: 'Q', defVal: 'BC557',
        terminals: (s) => [[-s/2, 0], [s/2 * 0.6, -s/2 * 0.8], [s/2 * 0.6, s/2 * 0.8]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: -3, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -3, y1: -h * 0.7, x2: -3, y2: h * 0.7, stroke: '#111827', 'stroke-width': 3 }, g);
            ccSvgEl('line', { x1: -3, y1: -h * 0.35, x2: h * 0.6, y2: -h * 0.8, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -3, y1: h * 0.35, x2: h * 0.6, y2: h * 0.8, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('polygon', { points: `-3,${h * 0.35} ${h * 0.1},${h * 0.45} ${h * 0.05},${h * 0.65}`, fill: '#111827' }, g);
        }
    },
    mosfet_n: {
        name: 'N-MOSFET', pre: 'M', defVal: 'IRF540',
        terminals: (s) => [[-s/2, -s/2*0.3], [s/2*0.6, -s/2*0.8], [s/2*0.6, s/2*0.8]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: -h*0.3, x2: -5, y2: -h*0.3, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -5, y1: -h*0.7, x2: -5, y2: h*0.7, stroke: '#111827', 'stroke-width': 2.5 }, g);
            ccSvgEl('line', { x1: -1, y1: -h*0.7, x2: -1, y2: -h*0.3, stroke: '#111827', 'stroke-width': 2.5 }, g);
            ccSvgEl('line', { x1: -1, y1: -h*0.15, x2: -1, y2: h*0.15, stroke: '#111827', 'stroke-width': 2.5 }, g);
            ccSvgEl('line', { x1: -1, y1: h*0.3, x2: -1, y2: h*0.7, stroke: '#111827', 'stroke-width': 2.5 }, g);
            ccSvgEl('line', { x1: -1, y1: -h*0.5, x2: h*0.6, y2: -h*0.5, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h*0.6, y1: -h*0.5, x2: h*0.6, y2: -h*0.8, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -1, y1: h*0.5, x2: h*0.6, y2: h*0.5, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h*0.6, y1: h*0.5, x2: h*0.6, y2: h*0.8, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('polygon', { points: `-1,0 ${h*0.35},${-h*0.15} ${h*0.35},${h*0.15}`, fill: '#111827' }, g);
        }
    },
    opamp: {
        name: 'Op-Amp (741)', pre: 'U', defVal: 'LM741',
        terminals: (s) => [[-s/2, -s/2*0.4], [-s/2, s/2*0.4], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: -h*0.4, x2: -h*0.6, y2: -h*0.4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h, y1: h*0.4, x2: -h*0.6, y2: h*0.4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('polygon', { points: `${-h*0.6},${-h*0.8} ${h*0.8},0 ${-h*0.6},${h*0.8}`, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
            ccSvgEl('line', { x1: h*0.8, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            const m = ccSvgEl('text', { x: -h*0.4, y: -h*0.2, 'font-size': '10', fill: '#111827', 'font-weight': 'bold' }, g); m.textContent = '-';
            const p = ccSvgEl('text', { x: -h*0.4, y: h*0.4, 'font-size': '10', fill: '#111827', 'font-weight': 'bold' }, g); p.textContent = '+';
        }
    },

    // Extensões de Semicondutores (Imagem 1)
    edd: {
        name: 'Dispositivo Não-Linear EDD', pre: 'EDD', defVal: 'f(u)',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('rect', { x: -h*0.6, y: -h*0.5, width: h*1.2, height: h, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h*0.6, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h*0.6, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            const t = ccSvgEl('text', { x: 0, y: -2, 'font-size': '7', 'text-anchor': 'middle', fill: '#111827', 'font-weight': 'bold' }, g);
            t.textContent = 'f(u)';
            const t2 = ccSvgEl('text', { x: 0, y: 7, 'font-size': '6', 'text-anchor': 'middle', fill: '#111827' }, g);
            t2.textContent = '=u+4';
        }
    },
    diac: {
        name: 'Diac', pre: 'DIAC', defVal: 'DB3',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: -5, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 5, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('polygon', { points: `-5,${-h*0.5} 3,0 -5,${h*0.5}`, fill: '#111827' }, g);
            ccSvgEl('polygon', { points: `5,${h*0.5} -3,0 5,${-h*0.5}`, fill: '#111827' }, g);
            ccSvgEl('line', { x1: 3, y1: -h*0.5, x2: 3, y2: h*0.5, stroke: '#111827', 'stroke-width': 1.8 }, g);
            ccSvgEl('line', { x1: -3, y1: -h*0.5, x2: -3, y2: h*0.5, stroke: '#111827', 'stroke-width': 1.8 }, g);
        }
    },
    triac: {
        name: 'Triac', pre: 'TR', defVal: 'BT136',
        terminals: (s) => [[-s/2, 0], [s/2, 0], [0, s/2]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: -5, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 5, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('polygon', { points: `-5,${-h*0.5} 3,0 -5,${h*0.5}`, fill: '#111827' }, g);
            ccSvgEl('polygon', { points: `5,${h*0.5} -3,0 5,${-h*0.5}`, fill: '#111827' }, g);
            ccSvgEl('line', { x1: 3, y1: -h*0.5, x2: 3, y2: h*0.5, stroke: '#111827', 'stroke-width': 1.8 }, g);
            ccSvgEl('line', { x1: -3, y1: -h*0.5, x2: -3, y2: h*0.5, stroke: '#111827', 'stroke-width': 1.8 }, g);
            ccSvgEl('line', { x1: 0, y1: h*0.3, x2: 0, y2: h, stroke: '#111827', 'stroke-width': 1.8 }, g);
        }
    },
    thyristor: {
        name: 'Tiristor (SCR)', pre: 'THY', defVal: 'TIC106',
        terminals: (s) => [[-s/2, 0], [s/2, 0], [s/4, s/2]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: -5, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('polygon', { points: `-5,${-h*0.5} 5,0 -5,${h*0.5}`, fill: '#111827' }, g);
            ccSvgEl('line', { x1: 5, y1: -h*0.5, x2: 5, y2: h*0.5, stroke: '#111827', 'stroke-width': 2.2 }, g);
            ccSvgEl('line', { x1: 5, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 5, y1: h*0.3, x2: h*0.5, y2: h, stroke: '#111827', 'stroke-width': 1.8 }, g);
        }
    },
    tunnel_diode: {
        name: 'Díodo de Túnel', pre: 'D', defVal: '1N3712',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: -5, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('polygon', { points: `-5,${-h*0.5} 5,0 -5,${h*0.5}`, fill: '#111827' }, g);
            ccSvgEl('path', { d: `M2,${-h*0.5} H5 V${h*0.5} H2`, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
            ccSvgEl('line', { x1: 5, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },

    // Categoria 6: Componentes RF (Imagem 2)
    rf_ind: {
        name: 'Indutor RF', pre: 'LRF', defVal: '10nH',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('rect', { x: -h*0.5, y: -h*0.4, width: h, height: h*0.8, stroke: '#64748b', 'stroke-dasharray': '2,2', fill: 'none' }, g);
            ccSvgEl('path', { d: `M${-h},0 H${-h*0.4} A3,3 0 0 1 0,0 A3,3 0 0 1 ${h*0.4},0 H${h}`, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
        }
    },
    rf_cap: {
        name: 'Capacitor RF', pre: 'CRF', defVal: '1pF',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('rect', { x: -h*0.5, y: -h*0.4, width: h, height: h*0.8, stroke: '#64748b', 'stroke-dasharray': '2,2', fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: 0, x2: -3, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -3, y1: -h*0.4, x2: -3, y2: h*0.4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 3, y1: -h*0.4, x2: 3, y2: h*0.4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 3, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    spiral_ind: {
        name: 'Spiral Inductor', pre: 'Lsp', defVal: '5nH',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('circle', { cx: -2, cy: 0, r: 5, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('circle', { cx: 2, cy: 0, r: 7, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: 0, x2: -7, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 9, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    circular_ind: {
        name: 'Circular Inductor', pre: 'Lcir', defVal: '2nH',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('path', { d: `M${-h},0 H${-h*0.3} A${h*0.35},${h*0.35} 0 1 1 ${h*0.3},0 H${h}`, stroke: '#111827', 'stroke-width': 2, fill: 'none' }, g);
        }
    },
    isolator: {
        name: 'Isolador RF', pre: 'ISO', defVal: '50R',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('rect', { x: -h*0.5, y: -h*0.4, width: h, height: h*0.8, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h*0.5, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h*0.5, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h*0.25, y1: 0, x2: h*0.25, y2: 0, stroke: '#111827', 'stroke-width': 1.8 }, g);
            ccSvgEl('polygon', { points: `${h*0.25},0 ${h*0.05},${-3} ${h*0.05},${3}`, fill: '#111827' }, g);
        }
    },
    circulator: {
        name: 'Circulador RF', pre: 'CIRC', defVal: '50R',
        terminals: (s) => [[-s/2, 0], [s/2, 0], [0, s/2]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('circle', { cx: 0, cy: 0, r: h*0.5, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h*0.5, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h*0.5, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 0, y1: h*0.5, x2: 0, y2: h, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('path', { d: `M-3,-2 A4,4 0 1 1 3,-2`, stroke: '#111827', 'stroke-width': 1.4, fill: 'none' }, g);
        }
    },
    phase_shifter: {
        name: 'Phase Shifter', pre: 'PS', defVal: '45°',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('rect', { x: -h*0.5, y: -h*0.4, width: h, height: h*0.8, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h*0.5, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h*0.5, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            const t = ccSvgEl('text', { x: 0, y: 3, 'font-size': '10', 'text-anchor': 'middle', fill: '#111827' }, g);
            t.textContent = 'Ø';
        }
    },
    coupler: {
        name: 'Coupler (Acoplador)', pre: 'CPL', defVal: '20dB',
        terminals: (s) => [[-s/2, -s/4], [-s/2, s/4], [s/2, -s/4], [s/2, s/4]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: -h*0.4, x2: h, y2: -h*0.4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h, y1: h*0.4, x2: h, y2: h*0.4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h*0.3, y1: -h*0.2, x2: h*0.3, y2: h*0.2, stroke: '#111827', 'stroke-width': 1.5 }, g);
            ccSvgEl('line', { x1: -h*0.3, y1: h*0.2, x2: h*0.3, y2: -h*0.2, stroke: '#111827', 'stroke-width': 1.5 }, g);
        }
    },
    hybrid: {
        name: 'Hybrid (Acoplador)', pre: 'HYB', defVal: '3dB',
        terminals: (s) => [[-s/2, -s/4], [-s/2, s/4], [s/2, -s/4], [s/2, s/4]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('rect', { x: -h*0.4, y: -h*0.4, width: h*0.8, height: h*0.8, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('circle', { cx: 0, cy: 0, r: h*0.25, stroke: '#111827', 'stroke-width': 1.2, fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: -h*0.4, x2: -h*0.4, y2: -h*0.4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h, y1: h*0.4, x2: -h*0.4, y2: h*0.4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h*0.4, y1: -h*0.4, x2: h, y2: -h*0.4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h*0.4, y1: h*0.4, x2: h, y2: h*0.4, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    bias_t: {
        name: 'Bias T', pre: 'BT', defVal: 'DC+RF',
        terminals: (s) => [[-s/2, 0], [s/2, 0], [0, -s/2]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('rect', { x: -h*0.5, y: -h*0.5, width: h, height: h, stroke: '#64748b', 'stroke-dasharray': '2,2', fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: 0, x2: -2, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 2, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 0, y1: 0, x2: 0, y2: -h, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    attenuator: {
        name: 'Atenuador RF', pre: 'ATT', defVal: '10dB',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('rect', { x: -h*0.5, y: -h*0.4, width: h, height: h*0.8, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h*0.5, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h*0.5, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            const t = ccSvgEl('text', { x: 0, y: 3, 'font-size': '8', 'text-anchor': 'middle', fill: '#111827', 'font-weight': 'bold' }, g);
            t.textContent = 'dB';
        }
    },
    rf_device: {
        name: 'Dispositivo RF', pre: 'RF1', defVal: '50R',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('rect', { x: -h*0.5, y: -h*0.4, width: h, height: h*0.8, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h*0.5, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h*0.5, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            const t = ccSvgEl('text', { x: 0, y: 3, 'font-size': '8', 'text-anchor': 'middle', fill: '#111827', 'font-weight': 'bold' }, g);
            t.textContent = 'RF';
        }
    },
    rf_2port: {
        name: 'Quadripolo RF (2P)', pre: 'RF2', defVal: 'S2P',
        terminals: (s) => [[-s/2, -s/4], [-s/2, s/4], [s/2, -s/4], [s/2, s/4]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('rect', { x: -h*0.5, y: -h*0.5, width: h, height: h, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: -s/4, x2: -h*0.5, y2: -s/4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h, y1: s/4, x2: -h*0.5, y2: s/4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h*0.5, y1: -s/4, x2: h, y2: -s/4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h*0.5, y1: s/4, x2: h, y2: s/4, stroke: '#111827', 'stroke-width': 2 }, g);
            const t = ccSvgEl('text', { x: 0, y: 3, 'font-size': '8', 'text-anchor': 'middle', fill: '#111827', 'font-weight': 'bold' }, g);
            t.textContent = 'RF';
        }
    },

    // Categoria 7: Dispositivos Verilog-A / Especiais (Imagem 3)
    potentiometer: {
        name: 'Potenciómetro', pre: 'POT', defVal: '10k',
        terminals: (s) => [[-s/2, 0], [s/2, 0], [0, -s/2]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h+6, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('rect', { x: -h+6, y: -5, width: s-12, height: 10, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('line', { x1: h-6, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 0, y1: -h, x2: 0, y2: -6, stroke: '#111827', 'stroke-width': 1.8 }, g);
            ccSvgEl('polygon', { points: `0,-5 -3,-9 3,-9`, fill: '#111827' }, g);
        }
    },
    mesfet: {
        name: 'MESFET (GaAs)', pre: 'MES', defVal: 'CFY67',
        terminals: (s) => [[-s/2, 0], [s/4, -s/2], [s/4, s/2]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: -4, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -4, y1: -h*0.6, x2: -4, y2: h*0.6, stroke: '#111827', 'stroke-width': 2.5 }, g);
            ccSvgEl('line', { x1: 0, y1: -h*0.6, x2: 0, y2: h*0.6, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 0, y1: -h*0.4, x2: s/4, y2: -h*0.4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: s/4, y1: -h*0.4, x2: s/4, y2: -h, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 0, y1: h*0.4, x2: s/4, y2: h*0.4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: s/4, y1: h*0.4, x2: s/4, y2: h, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    epfl_ekv: {
        name: 'EPFL-EKV NMOS', pre: 'EKV', defVal: 'EKV3',
        terminals: (s) => [[-s/2, 0], [s/4, -s/2], [s/4, s/2], [s/4, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: -4, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -4, y1: -h*0.6, x2: -4, y2: h*0.6, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 0, y1: -h*0.5, x2: s/4, y2: -h*0.5, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: s/4, y1: -h*0.5, x2: s/4, y2: -h, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 0, y1: h*0.5, x2: s/4, y2: h*0.5, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: s/4, y1: h*0.5, x2: s/4, y2: h, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    photodiode: {
        name: 'Photodiode', pre: 'PD', defVal: 'BPW34',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('circle', { cx: 0, cy: 0, r: h*0.65, stroke: '#111827', 'stroke-width': 1.5, fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: 0, x2: -5, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('polygon', { points: `-5,${-h*0.4} 4,0 -5,${h*0.4}`, fill: '#111827' }, g);
            ccSvgEl('line', { x1: 4, y1: -h*0.4, x2: 4, y2: h*0.4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 4, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h*0.6, y1: -h*0.7, x2: -h*0.2, y2: -h*0.4, stroke: '#16a34a', 'stroke-width': 1.5 }, g);
            ccSvgEl('polygon', { points: `${-h*0.2},${-h*0.4} ${-h*0.3},${-h*0.5} ${-h*0.25},${-h*0.3}`, fill: '#16a34a' }, g);
        }
    },
    phototransistor: {
        name: 'Foto-Transístor', pre: 'PT', defVal: 'BPX81',
        terminals: (s) => [[s/4, -s/2], [s/4, s/2]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('circle', { cx: 0, cy: 0, r: h*0.65, stroke: '#111827', 'stroke-width': 1.5, fill: 'none' }, g);
            ccSvgEl('line', { x1: -4, y1: -h*0.5, x2: -4, y2: h*0.5, stroke: '#111827', 'stroke-width': 2.5 }, g);
            ccSvgEl('line', { x1: -4, y1: -h*0.3, x2: s/4, y2: -h*0.6, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: s/4, y1: -h*0.6, x2: s/4, y2: -h, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -4, y1: h*0.3, x2: s/4, y2: h*0.6, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: s/4, y1: h*0.6, x2: s/4, y2: h, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h*0.7, y1: -h*0.4, x2: -h*0.3, y2: -h*0.1, stroke: '#16a34a', 'stroke-width': 1.5 }, g);
        }
    },
    igbt: {
        name: 'IGBT (NIGBT)', pre: 'IGBT', defVal: 'IRG4BC20',
        terminals: (s) => [[-s/2, 0], [s/4, -s/2], [s/4, s/2]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: -6, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -6, y1: -h*0.6, x2: -6, y2: h*0.6, stroke: '#111827', 'stroke-width': 2.5 }, g);
            ccSvgEl('line', { x1: -2, y1: -h*0.6, x2: -2, y2: h*0.6, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -2, y1: -h*0.3, x2: s/4, y2: -h*0.6, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: s/4, y1: -h*0.6, x2: s/4, y2: -h, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -2, y1: h*0.3, x2: s/4, y2: h*0.6, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: s/4, y1: h*0.6, x2: s/4, y2: h, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('polygon', { points: `${s/4},${h*0.6} ${s/4-6},${h*0.5} ${s/4-3},${h*0.3}`, fill: '#111827' }, g);
        }
    },
    res_nonlinear: {
        name: 'Resistor Não Linear', pre: 'NTC', defVal: '10k',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h+6, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('rect', { x: -h+6, y: -5, width: s-12, height: 10, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('line', { x1: h-6, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('path', { d: `M${-h*0.4},${h*0.6} L${h*0.4},${-h*0.6} H${h*0.6}`, stroke: '#111827', 'stroke-width': 1.5, fill: 'none' }, g);
        }
    },
    amp_modular: {
        name: 'Amplificador Modular', pre: 'AMPM', defVal: 'log',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h*0.5, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('polygon', { points: `${-h*0.5},${-h*0.7} ${h*0.5},0 ${-h*0.5},${h*0.7}`, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('line', { x1: h*0.5, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            const t = ccSvgEl('text', { x: -h*0.1, y: 3, 'font-size': '8', 'text-anchor': 'middle', fill: '#111827', 'font-weight': 'bold' }, g);
            t.textContent = 'M';
        }
    },

    // Categoria 8: Componentes Digitais (Imagem 4)
    digi_source: {
        name: 'Fonte Digital (Clock)', pre: 'CLK', defVal: '1MHz',
        terminals: (s) => [[s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('rect', { x: -h*0.6, y: -h*0.6, width: h*1.2, height: h*1.2, stroke: '#16a34a', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('path', { d: `M${-h*0.3},${h*0.2} V${-h*0.2} H0 V${h*0.2} H${h*0.3}`, stroke: '#16a34a', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('line', { x1: h*0.6, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    digi_inv: {
        name: 'Inversor (Porta NOT)', pre: 'NOT', defVal: '7404',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h*0.5, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('polygon', { points: `${-h*0.5},${-h*0.6} ${h*0.3},0 ${-h*0.5},${h*0.6}`, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('circle', { cx: h*0.4, cy: 0, r: 2.5, stroke: '#111827', 'stroke-width': 1.5, fill: '#fff' }, g);
            ccSvgEl('line', { x1: h*0.55, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    digi_and: {
        name: 'Porta AND (E)', pre: 'AND', defVal: '7408',
        terminals: (s) => [[-s/2, -s/4], [-s/2, s/4], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: -s/4, x2: -h*0.4, y2: -s/4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h, y1: s/4, x2: -h*0.4, y2: s/4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('path', { d: `M${-h*0.4},${-h*0.6} H0 A${h*0.4},${h*0.6} 0 0 1 0,${h*0.6} H${-h*0.4} Z`, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('line', { x1: h*0.4, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    digi_nand: {
        name: 'Porta NAND (NÃO-E)', pre: 'NAND', defVal: '7400',
        terminals: (s) => [[-s/2, -s/4], [-s/2, s/4], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: -s/4, x2: -h*0.4, y2: -s/4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h, y1: s/4, x2: -h*0.4, y2: s/4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('path', { d: `M${-h*0.4},${-h*0.6} H0 A${h*0.4},${h*0.6} 0 0 1 0,${h*0.6} H${-h*0.4} Z`, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('circle', { cx: h*0.45, cy: 0, r: 2.5, stroke: '#111827', 'stroke-width': 1.5, fill: '#fff' }, g);
            ccSvgEl('line', { x1: h*0.6, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    digi_or: {
        name: 'Porta OR (OU)', pre: 'OR', defVal: '7432',
        terminals: (s) => [[-s/2, -s/4], [-s/2, s/4], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: -s/4, x2: -h*0.3, y2: -s/4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h, y1: s/4, x2: -h*0.3, y2: s/4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('path', { d: `M${-h*0.5},${-h*0.6} Q${-h*0.1},0 ${-h*0.5},${h*0.6} Q0,${h*0.6} ${h*0.4},0 Q0,${-h*0.6} ${-h*0.5},${-h*0.6} Z`, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('line', { x1: h*0.4, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    digi_nor: {
        name: 'Porta NOR (NÃO-OU)', pre: 'NOR', defVal: '7402',
        terminals: (s) => [[-s/2, -s/4], [-s/2, s/4], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: -s/4, x2: -h*0.3, y2: -s/4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h, y1: s/4, x2: -h*0.3, y2: s/4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('path', { d: `M${-h*0.5},${-h*0.6} Q${-h*0.1},0 ${-h*0.5},${h*0.6} Q0,${h*0.6} ${h*0.4},0 Q0,${-h*0.6} ${-h*0.5},${-h*0.6} Z`, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('circle', { cx: h*0.48, cy: 0, r: 2.5, stroke: '#111827', 'stroke-width': 1.5, fill: '#fff' }, g);
            ccSvgEl('line', { x1: h*0.62, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    digi_xor: {
        name: 'Porta XOR (OU-Exclusivo)', pre: 'XOR', defVal: '7486',
        terminals: (s) => [[-s/2, -s/4], [-s/2, s/4], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('path', { d: `M${-h*0.6},${-h*0.6} Q${-h*0.2},0 ${-h*0.6},${h*0.6}`, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: -s/4, x2: -h*0.4, y2: -s/4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h, y1: s/4, x2: -h*0.4, y2: s/4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('path', { d: `M${-h*0.4},${-h*0.6} Q0,0 ${-h*0.4},${h*0.6} Q0,${h*0.6} ${h*0.4},0 Q0,${-h*0.6} ${-h*0.4},${-h*0.6} Z`, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('line', { x1: h*0.4, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    digi_xnor: {
        name: 'Porta XNOR (NÃO-XOR)', pre: 'XNOR', defVal: '747266',
        terminals: (s) => [[-s/2, -s/4], [-s/2, s/4], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('path', { d: `M${-h*0.6},${-h*0.6} Q${-h*0.2},0 ${-h*0.6},${h*0.6}`, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: -s/4, x2: -h*0.4, y2: -s/4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h, y1: s/4, x2: -h*0.4, y2: s/4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('path', { d: `M${-h*0.4},${-h*0.6} Q0,0 ${-h*0.4},${h*0.6} Q0,${h*0.6} ${h*0.4},0 Q0,${-h*0.6} ${-h*0.4},${-h*0.6} Z`, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('circle', { cx: h*0.48, cy: 0, r: 2.5, stroke: '#111827', 'stroke-width': 1.5, fill: '#fff' }, g);
            ccSvgEl('line', { x1: h*0.62, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    digi_buffer: {
        name: 'Buffer Digital', pre: 'BUF', defVal: '7407',
        terminals: (s) => [[-s/2, 0], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h*0.5, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('polygon', { points: `${-h*0.5},${-h*0.6} ${h*0.4},0 ${-h*0.5},${h*0.6}`, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('line', { x1: h*0.4, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
        }
    },
    mux_2to1: {
        name: 'Multiplexer 2:1', pre: 'MUX', defVal: '74157',
        terminals: (s) => [[-s/2, -s/4], [-s/2, s/4], [0, s/2], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('polygon', { points: `${-h*0.5},${-h*0.7} ${h*0.5},${-h*0.4} ${h*0.5},${h*0.4} ${-h*0.5},${h*0.7}`, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: -s/4, x2: -h*0.5, y2: -s/4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h, y1: s/4, x2: -h*0.5, y2: s/4, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h*0.5, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 0, y1: h*0.5, x2: 0, y2: h, stroke: '#111827', 'stroke-width': 2 }, g);
            const t = ccSvgEl('text', { x: 0, y: 3, 'font-size': '7', 'text-anchor': 'middle', fill: '#111827', 'font-weight': 'bold' }, g);
            t.textContent = 'MUX';
        }
    },
    mux_4to1: {
        name: 'Multiplexer 4:1', pre: 'MUX', defVal: '74153',
        terminals: (s) => [[-s/2, -3*s/8], [-s/2, -s/8], [-s/2, s/8], [-s/2, 3*s/8], [0, s/2], [s/2, 0]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('polygon', { points: `${-h*0.5},${-h*0.8} ${h*0.5},${-h*0.5} ${h*0.5},${h*0.5} ${-h*0.5},${h*0.8}`, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: -3*s/8, x2: -h*0.5, y2: -3*s/8, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h, y1: -s/8, x2: -h*0.5, y2: -s/8, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h, y1: s/8, x2: -h*0.5, y2: s/8, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: -h, y1: 3*s/8, x2: -h*0.5, y2: 3*s/8, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h*0.5, y1: 0, x2: h, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 0, y1: h*0.6, x2: 0, y2: h, stroke: '#111827', 'stroke-width': 2 }, g);
            const t = ccSvgEl('text', { x: 0, y: 3, 'font-size': '7', 'text-anchor': 'middle', fill: '#111827', 'font-weight': 'bold' }, g);
            t.textContent = '4:1';
        }
    },
    demux_2to4: {
        name: 'Demux 2:4', pre: 'DMUX', defVal: '74139',
        terminals: (s) => [[-s/2, 0], [0, s/2], [s/2, -3*s/8], [s/2, -s/8], [s/2, s/8], [s/2, 3*s/8]],
        render: (g, s) => {
            const h = s / 2;
            ccSvgEl('polygon', { points: `${-h*0.5},${-h*0.5} ${h*0.5},${-h*0.8} ${h*0.5},${h*0.8} ${-h*0.5},${h*0.5}`, stroke: '#111827', 'stroke-width': 1.8, fill: 'none' }, g);
            ccSvgEl('line', { x1: -h, y1: 0, x2: -h*0.5, y2: 0, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: 0, y1: h*0.5, x2: 0, y2: h, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h*0.5, y1: -3*s/8, x2: h, y2: -3*s/8, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h*0.5, y1: -s/8, x2: h, y2: -s/8, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h*0.5, y1: s/8, x2: h, y2: s/8, stroke: '#111827', 'stroke-width': 2 }, g);
            ccSvgEl('line', { x1: h*0.5, y1: 3*s/8, x2: h, y2: 3*s/8, stroke: '#111827', 'stroke-width': 2 }, g);
            const t = ccSvgEl('text', { x: 0, y: 3, 'font-size': '7', 'text-anchor': 'middle', fill: '#111827', 'font-weight': 'bold' }, g);
            t.textContent = 'DMUX';
        }
    },
    xfmr_3mutual: {
        name: '3 Indutores Mútuos', pre: 'Tr', defVal: '1:1:1',
        terminals: (s) => [[-s, -s/2], [s, -s/2], [-s, 0], [s, 0], [-s, s/2], [s, s/2]],
        render: (ctx, s, d) => {
            ctx.beginPath();
            ctx.moveTo(-s, -s/2); ctx.lineTo(-s/3, -s/2);
            ctx.moveTo(s, -s/2); ctx.lineTo(s/3, -s/2);
            ctx.moveTo(-s, 0); ctx.lineTo(-s/3, 0);
            ctx.moveTo(s, 0); ctx.lineTo(s/3, 0);
            ctx.moveTo(-s, s/2); ctx.lineTo(-s/3, s/2);
            ctx.moveTo(s, s/2); ctx.lineTo(s/3, s/2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(-s/4, -s/2, s/6, -Math.PI/2, Math.PI/2, false);
            ctx.arc(-s/4, 0, s/6, -Math.PI/2, Math.PI/2, false);
            ctx.arc(-s/4, s/2, s/6, -Math.PI/2, Math.PI/2, false);
            ctx.arc(s/4, -s/2, s/6, Math.PI/2, -Math.PI/2, false);
            ctx.arc(s/4, 0, s/6, Math.PI/2, -Math.PI/2, false);
            ctx.arc(s/4, s/2, s/6, Math.PI/2, -Math.PI/2, false);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-s/10, -s*0.7); ctx.lineTo(-s/10, s*0.7);
            ctx.moveTo(s/10, -s*0.7); ctx.lineTo(s/10, s*0.7);
            ctx.stroke();
        }
    },
    xfmr_nmutual: {
        name: 'N Indutores Mútuos', pre: 'TrN', defVal: '1:N',
        terminals: (s) => [[-s, -s/2], [s, -s/2], [-s, s/2], [s, s/2]],
        render: (ctx, s, d) => {
            ctx.beginPath();
            ctx.moveTo(-s, -s/2); ctx.lineTo(-s/3, -s/2);
            ctx.moveTo(s, -s/2); ctx.lineTo(s/3, -s/2);
            ctx.moveTo(-s, s/2); ctx.lineTo(-s/3, s/2);
            ctx.moveTo(s, s/2); ctx.lineTo(s/3, s/2);
            ctx.stroke();
            for (let i = -2; i <= 2; i++) {
                ctx.beginPath();
                ctx.arc(-s/4, i * (s/5), s/8, -Math.PI/2, Math.PI/2, false);
                ctx.arc(s/4, i * (s/5), s/8, Math.PI/2, -Math.PI/2, false);
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.moveTo(0, -s*0.6); ctx.lineTo(0, s*0.6);
            ctx.stroke();
        }
    },
    v_step: {
        name: 'Tensão em Degrau', pre: 'Vstep', defVal: '5V',
        terminals: (s) => [[0, -s], [0, s]],
        render: (ctx, s, d) => {
            ctx.beginPath(); ctx.arc(0, 0, s*0.5, 0, Math.PI*2); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, -s); ctx.lineTo(0, -s*0.5);
            ctx.moveTo(0, s*0.5); ctx.lineTo(0, s);
            ctx.moveTo(-s*0.3, s*0.2); ctx.lineTo(0, s*0.2); ctx.lineTo(0, -s*0.2); ctx.lineTo(s*0.3, -s*0.2);
            ctx.stroke();
        }
    },
    tline_4term: {
        name: 'Linha Transm. 4-Term', pre: 'TL4', defVal: 'Z0=50',
        terminals: (s) => [[-s, -s/3], [s, -s/3], [-s, s/3], [s, s/3]],
        render: (ctx, s, d) => {
            ctx.beginPath();
            ctx.moveTo(-s, -s/3); ctx.lineTo(s, -s/3);
            ctx.moveTo(-s, s/3); ctx.lineTo(s, s/3);
            ctx.stroke();
            ctx.strokeRect(-s/2, -s/2, s, s);
        }
    },
    tline_coupled: {
        name: 'Linha Transm. Acoplada', pre: 'CLin', defVal: 'Z0=50',
        terminals: (s) => [[-s, -s/3], [s, -s/3], [-s, s/3], [s, s/3]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.7, -s*0.4, s*1.4, s*0.25);
            ctx.strokeRect(-s*0.7, s*0.15, s*1.4, s*0.25);
            ctx.beginPath();
            ctx.moveTo(-s, -s*0.275); ctx.lineTo(-s*0.7, -s*0.275);
            ctx.moveTo(s*0.7, -s*0.275); ctx.lineTo(s, -s*0.275);
            ctx.moveTo(-s, s*0.275); ctx.lineTo(-s*0.7, s*0.275);
            ctx.moveTo(s*0.7, s*0.275); ctx.lineTo(s, s*0.275);
            ctx.stroke();
        }
    },
    waveguide_circ: {
        name: 'Guia de Onda Circular', pre: 'WGc', defVal: 'r=10mm',
        terminals: (s) => [[-s, 0], [s, 0]],
        render: (ctx, s, d) => {
            ctx.beginPath(); ctx.ellipse(0, 0, s*0.4, s*0.6, 0, 0, Math.PI*2); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-s, 0); ctx.lineTo(-s*0.4, 0);
            ctx.moveTo(s*0.4, 0); ctx.lineTo(s, 0);
            ctx.stroke();
        }
    },
    waveguide_rect: {
        name: 'Guia de Onda Retangular', pre: 'WGr', defVal: 'WR-90',
        terminals: (s) => [[-s, 0], [s, 0]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.5, -s*0.35, s, s*0.7);
            ctx.beginPath();
            ctx.moveTo(-s, 0); ctx.lineTo(-s*0.5, 0);
            ctx.moveTo(s*0.5, 0); ctx.lineTo(s, 0);
            ctx.stroke();
        }
    },
    tline_rlcg: {
        name: 'Linha RLCG', pre: 'RLCG', defVal: '1m',
        terminals: (s) => [[-s, 0], [s, 0]],
        render: (ctx, s, d) => {
            ctx.beginPath();
            ctx.moveTo(-s, 0); ctx.lineTo(s, 0);
            ctx.moveTo(-s/2, s/3); ctx.lineTo(s/2, s/3);
            ctx.stroke();
            ctx.font = '8px sans-serif'; ctx.fillText('RLCG', -10, -4);
        }
    },
    mstrip_interdigital: {
        name: 'Microstrip Interdigital', pre: 'IDC', defVal: 'C=1pF',
        terminals: (s) => [[-s, 0], [s, 0]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.3, s*1.2, s*0.6);
            ctx.beginPath();
            ctx.moveTo(-s*0.4, -s*0.2); ctx.lineTo(-s*0.4, s*0.1);
            ctx.moveTo(-s*0.1, s*0.2); ctx.lineTo(-s*0.1, -s*0.1);
            ctx.moveTo(s*0.2, -s*0.2); ctx.lineTo(s*0.2, s*0.1);
            ctx.moveTo(-s, 0); ctx.lineTo(-s*0.6, 0);
            ctx.moveTo(s*0.6, 0); ctx.lineTo(s, 0);
            ctx.stroke();
        }
    },
    coplanar: {
        name: 'Linha Coplanar (CPW)', pre: 'CPW', defVal: 'Z0=50',
        terminals: (s) => [[-s, 0], [s, 0]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.25, s*1.2, s*0.5);
            ctx.beginPath();
            ctx.moveTo(-s, 0); ctx.lineTo(-s*0.6, 0);
            ctx.moveTo(s*0.6, 0); ctx.lineTo(s, 0);
            ctx.moveTo(-s*0.6, -s*0.35); ctx.lineTo(s*0.6, -s*0.35);
            ctx.moveTo(-s*0.6, s*0.35); ctx.lineTo(s*0.6, s*0.35);
            ctx.stroke();
        }
    },
    coplanar_open: {
        name: 'Aberto Coplanar', pre: 'CPWo', defVal: 'Open',
        terminals: (s) => [[-s, 0]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.25, s*0.8, s*0.5);
            ctx.beginPath();
            ctx.moveTo(-s, 0); ctx.lineTo(-s*0.6, 0);
            ctx.stroke();
        }
    },
    coplanar_short: {
        name: 'Curto Coplanar', pre: 'CPWs', defVal: 'Short',
        terminals: (s) => [[-s, 0]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.25, s*0.8, s*0.5);
            ctx.beginPath();
            ctx.moveTo(-s, 0); ctx.lineTo(-s*0.6, 0);
            ctx.moveTo(s*0.2, -s*0.4); ctx.lineTo(s*0.2, s*0.4);
            ctx.stroke();
        }
    },
    coplanar_step: {
        name: 'Degrau Coplanar', pre: 'CPWstep', defVal: 'Step',
        terminals: (s) => [[-s, 0], [s, 0]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.3, s*0.6, s*0.6);
            ctx.strokeRect(0, -s*0.15, s*0.6, s*0.3);
            ctx.beginPath();
            ctx.moveTo(-s, 0); ctx.lineTo(-s*0.6, 0);
            ctx.moveTo(s*0.6, 0); ctx.lineTo(s, 0);
            ctx.stroke();
        }
    },
    mosfet_p: {
        name: 'MOSFET (P)', pre: 'Qp', defVal: 'P-CH',
        terminals: (s) => [[-s, 0], [s/2, -s], [s/2, s]],
        render: (ctx, s, d) => {
            ctx.beginPath();
            ctx.moveTo(-s, 0); ctx.lineTo(-s/3, 0);
            ctx.moveTo(-s/3, -s*0.6); ctx.lineTo(-s/3, s*0.6);
            ctx.moveTo(0, -s*0.5); ctx.lineTo(0, -s*0.2);
            ctx.moveTo(0, -s*0.1); ctx.lineTo(0, s*0.1);
            ctx.moveTo(0, s*0.2); ctx.lineTo(0, s*0.5);
            ctx.moveTo(0, -s*0.35); ctx.lineTo(s/2, -s*0.35); ctx.lineTo(s/2, -s);
            ctx.moveTo(0, s*0.35); ctx.lineTo(s/2, s*0.35); ctx.lineTo(s/2, s);
            ctx.moveTo(0, 0); ctx.lineTo(s/2, 0); ctx.lineTo(s/2, s*0.35);
            ctx.moveTo(s/4, -s*0.1); ctx.lineTo(s/4, s*0.1); ctx.lineTo(0, 0);
            ctx.stroke();
        }
    },
    log_amp: {
        name: 'Amplificador Logarítmico', pre: 'LogA', defVal: 'Log',
        terminals: (s) => [[-s, -s/3], [-s, s/3], [s, 0]],
        render: (ctx, s, d) => {
            ctx.beginPath();
            ctx.moveTo(-s/2, -s*0.6); ctx.lineTo(s*0.6, 0); ctx.lineTo(-s/2, s*0.6); ctx.closePath();
            ctx.moveTo(-s, -s/3); ctx.lineTo(-s/2, -s/3);
            ctx.moveTo(-s, s/3); ctx.lineTo(-s/2, s/3);
            ctx.moveTo(s*0.6, 0); ctx.lineTo(s, 0);
            ctx.stroke();
            ctx.font = 'bold 9px sans-serif'; ctx.fillText('L', -2, 3);
        }
    },
    epfl_ekv_pmos: {
        name: 'EPFL-EKV PMOS', pre: 'T', defVal: 'PMOS',
        terminals: (s) => [[-s, 0], [s/2, -s], [s/2, s], [s, 0]],
        render: (ctx, s, d) => {
            ctx.beginPath();
            ctx.moveTo(-s, 0); ctx.lineTo(-s/3, 0);
            ctx.moveTo(-s/3, -s*0.5); ctx.lineTo(-s/3, s*0.5);
            ctx.moveTo(0, -s*0.5); ctx.lineTo(0, s*0.5);
            ctx.moveTo(0, -s*0.35); ctx.lineTo(s/2, -s*0.35); ctx.lineTo(s/2, -s);
            ctx.moveTo(0, s*0.35); ctx.lineTo(s/2, s*0.35); ctx.lineTo(s/2, s);
            ctx.moveTo(0, 0); ctx.lineTo(s, 0);
            ctx.stroke();
            ctx.beginPath(); ctx.arc(-s/6, 0, s/10, 0, Math.PI*2); ctx.stroke();
        }
    },
    andor_4x2: {
        name: '4x2 AndOr', pre: 'AO', defVal: '4x2',
        terminals: (s) => [[-s, -s/2], [-s, -s/6], [-s, s/6], [-s, s/2], [s, 0]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.7, s*1.2, s*1.4);
            ctx.font = '8px sans-serif'; ctx.fillText('&/≥1', -s*0.4, 3);
            [-s/2, -s/6, s/6, s/2].forEach(y => {
                ctx.beginPath(); ctx.moveTo(-s, y); ctx.lineTo(-s*0.6, y); ctx.stroke();
            });
            ctx.beginPath(); ctx.moveTo(s*0.6, 0); ctx.lineTo(s, 0); ctx.stroke();
        }
    },
    andor_4x3: {
        name: '4x3 AndOr', pre: 'AO', defVal: '4x3',
        terminals: (s) => [[-s, -s/2], [-s, -s/6], [-s, s/6], [-s, s/2], [s, -s/4], [s, s/4]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.7, s*1.2, s*1.4);
            ctx.font = '8px sans-serif'; ctx.fillText('4x3', -s*0.4, 3);
            [-s/2, -s/6, s/6, s/2].forEach(y => {
                ctx.beginPath(); ctx.moveTo(-s, y); ctx.lineTo(-s*0.6, y); ctx.stroke();
            });
            ctx.beginPath(); ctx.moveTo(s*0.6, -s/4); ctx.lineTo(s, -s/4); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(s*0.6, s/4); ctx.lineTo(s, s/4); ctx.stroke();
        }
    },
    andor_4x4: {
        name: '4x4 AndOr', pre: 'AO', defVal: '4x4',
        terminals: (s) => [[-s, -s/2], [-s, -s/6], [-s, s/6], [-s, s/2], [s, -s/3], [s, 0], [s, s/3]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.7, s*1.2, s*1.4);
            ctx.font = '8px sans-serif'; ctx.fillText('4x4', -s*0.4, 3);
            [-s/2, -s/6, s/6, s/2].forEach(y => {
                ctx.beginPath(); ctx.moveTo(-s, y); ctx.lineTo(-s*0.6, y); ctx.stroke();
            });
            [-s/3, 0, s/3].forEach(y => {
                ctx.beginPath(); ctx.moveTo(s*0.6, y); ctx.lineTo(s, y); ctx.stroke();
            });
        }
    },
    mux_8to1: {
        name: '8to1 Mux', pre: 'MUX', defVal: '8:1',
        terminals: (s) => [[-s, -s*0.7], [-s, -s*0.5], [-s, -s*0.3], [-s, -s*0.1], [-s, s*0.1], [-s, s*0.3], [-s, s*0.5], [-s, s*0.7], [s, 0]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.85, s*1.2, s*1.7);
            ctx.font = '8px sans-serif'; ctx.fillText('8:1 MUX', -s*0.5, 3);
            for (let i = 0; i < 8; i++) {
                const y = -s*0.7 + i * (s*0.2);
                ctx.beginPath(); ctx.moveTo(-s, y); ctx.lineTo(-s*0.6, y); ctx.stroke();
            }
            ctx.beginPath(); ctx.moveTo(s*0.6, 0); ctx.lineTo(s, 0); ctx.stroke();
        }
    },
    demux_3to8: {
        name: '3to8 Demux', pre: 'DMUX', defVal: '3:8',
        terminals: (s) => [[-s, -s/3], [-s, 0], [-s, s/3], [s, -s*0.7], [s, -s*0.5], [s, -s*0.3], [s, -s*0.1], [s, s*0.1], [s, s*0.3], [s, s*0.5], [s, s*0.7]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.85, s*1.2, s*1.7);
            ctx.font = '8px sans-serif'; ctx.fillText('3:8 DMUX', -s*0.5, 3);
            [-s/3, 0, s/3].forEach(y => {
                ctx.beginPath(); ctx.moveTo(-s, y); ctx.lineTo(-s*0.6, y); ctx.stroke();
            });
            for (let i = 0; i < 8; i++) {
                const y = -s*0.7 + i * (s*0.2);
                ctx.beginPath(); ctx.moveTo(s*0.6, y); ctx.lineTo(s, y); ctx.stroke();
            }
        }
    },
    demux_4to16: {
        name: '4to16 Demux', pre: 'DMUX', defVal: '4:16',
        terminals: (s) => [[-s, -s/2], [-s, -s/6], [-s, s/6], [-s, s/2], [s, -s/2], [s, 0], [s, s/2]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.85, s*1.2, s*1.7);
            ctx.font = '7px sans-serif'; ctx.fillText('4:16 DMUX', -s*0.55, 3);
            [-s/2, -s/6, s/6, s/2].forEach(y => {
                ctx.beginPath(); ctx.moveTo(-s, y); ctx.lineTo(-s*0.6, y); ctx.stroke();
            });
            [-s/2, 0, s/2].forEach(y => {
                ctx.beginPath(); ctx.moveTo(s*0.6, y); ctx.lineTo(s, y); ctx.stroke();
            });
        }
    }
,
    // --- Digitais Adicionais (Imagens 1 e 2) ---
    half_adder: {
        name: '1Bit Half Adder', pre: 'HA', defVal: '1Bit',
        terminals: (s) => [[-s, -s/3], [-s, s/3], [s, -s/3], [s, s/3]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.7, s*1.2, s*1.4);
            ctx.font = '8px sans-serif'; ctx.fillText('HALF', -s*0.4, -2); ctx.fillText('ADD', -s*0.35, 8);
            ctx.beginPath(); ctx.moveTo(-s, -s/3); ctx.lineTo(-s*0.6, -s/3); ctx.moveTo(-s, s/3); ctx.lineTo(-s*0.6, s/3);
            ctx.moveTo(s*0.6, -s/3); ctx.lineTo(s, -s/3); ctx.moveTo(s*0.6, s/3); ctx.lineTo(s, s/3); ctx.stroke();
        }
    },
    full_adder_1bit: {
        name: '1Bit Full Adder', pre: 'FA', defVal: '1Bit',
        terminals: (s) => [[-s, -s/2], [-s, 0], [-s, s/2], [s, -s/3], [s, s/3]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.8, s*1.2, s*1.6);
            ctx.font = '8px sans-serif'; ctx.fillText('FULL', -s*0.4, -2); ctx.fillText('ADD', -s*0.35, 8);
            ctx.beginPath(); ctx.moveTo(-s, -s/2); ctx.lineTo(-s*0.6, -s/2); ctx.moveTo(-s, 0); ctx.lineTo(-s*0.6, 0); ctx.moveTo(-s, s/2); ctx.lineTo(-s*0.6, s/2);
            ctx.moveTo(s*0.6, -s/3); ctx.lineTo(s, -s/3); ctx.moveTo(s*0.6, s/3); ctx.lineTo(s, s/3); ctx.stroke();
        }
    },
    full_adder_2bit: {
        name: '2Bit Full Adder', pre: 'FA2', defVal: '2Bit',
        terminals: (s) => [[-s, -s*0.6], [-s, -s*0.2], [-s, s*0.2], [-s, s*0.6], [s, -s/3], [s, s/3]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.85, s*1.2, s*1.7);
            ctx.font = '7.5px sans-serif'; ctx.fillText('2B-ADD', -s*0.5, 3);
            [-s*0.6, -s*0.2, s*0.2, s*0.6].forEach(y => {
                ctx.beginPath(); ctx.moveTo(-s, y); ctx.lineTo(-s*0.6, y); ctx.stroke();
            });
            ctx.beginPath(); ctx.moveTo(s*0.6, -s/3); ctx.lineTo(s, -s/3); ctx.moveTo(s*0.6, s/3); ctx.lineTo(s, s/3); ctx.stroke();
        }
    },
    rs_flipflop: {
        name: 'RS-FlipFlop', pre: 'RS', defVal: 'RS-FF',
        terminals: (s) => [[-s, -s/3], [-s, s/3], [s, -s/3], [s, s/3]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.7, s*1.2, s*1.4);
            ctx.font = '8px sans-serif'; ctx.fillText('R', -s*0.4, -s/4); ctx.fillText('S', -s*0.4, s/2);
            ctx.fillText('Q', s*0.2, -s/4); ctx.fillText('!Q', s*0.1, s/2);
            ctx.beginPath(); ctx.moveTo(-s, -s/3); ctx.lineTo(-s*0.6, -s/3); ctx.moveTo(-s, s/3); ctx.lineTo(-s*0.6, s/3);
            ctx.moveTo(s*0.6, -s/3); ctx.lineTo(s, -s/3); ctx.moveTo(s*0.6, s/3); ctx.lineTo(s, s/3); ctx.stroke();
        }
    },
    d_flipflop: {
        name: 'D-FlipFlop', pre: 'DFF', defVal: 'D-FF',
        terminals: (s) => [[-s, -s/3], [-s, s/3], [s, -s/3], [s, s/3]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.7, s*1.2, s*1.4);
            ctx.font = '8px sans-serif'; ctx.fillText('D', -s*0.4, -s/4);
            ctx.fillText('Q', s*0.2, -s/4); ctx.fillText('!Q', s*0.1, s/2);
            ctx.beginPath(); ctx.moveTo(-s, -s/3); ctx.lineTo(-s*0.6, -s/3);
            ctx.moveTo(-s, s/3); ctx.lineTo(-s*0.6, s/3);
            // Clock triangle
            ctx.moveTo(-s*0.6, s/3 - 4); ctx.lineTo(-s*0.4, s/3); ctx.lineTo(-s*0.6, s/3 + 4);
            ctx.moveTo(s*0.6, -s/3); ctx.lineTo(s, -s/3); ctx.moveTo(s*0.6, s/3); ctx.lineTo(s, s/3); ctx.stroke();
        }
    },
    d_flipflop_sr: {
        name: 'D-FlipFlop (SR)', pre: 'DFF', defVal: 'D-FF(SR)',
        terminals: (s) => [[-s, -s/3], [-s, s/3], [0, -s*0.7], [0, s*0.7], [s, -s/3], [s, s/3]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.7, s*1.2, s*1.4);
            ctx.font = '7px sans-serif'; ctx.fillText('D', -s*0.4, -s/4); ctx.fillText('S', -2, -s*0.45); ctx.fillText('R', -2, s*0.55);
            ctx.fillText('Q', s*0.2, -s/4); ctx.fillText('!Q', s*0.1, s/2);
            ctx.beginPath(); ctx.moveTo(-s, -s/3); ctx.lineTo(-s*0.6, -s/3); ctx.moveTo(-s, s/3); ctx.lineTo(-s*0.6, s/3);
            ctx.moveTo(0, -s); ctx.lineTo(0, -s*0.7); ctx.moveTo(0, s*0.7); ctx.lineTo(0, s);
            ctx.moveTo(s*0.6, -s/3); ctx.lineTo(s, -s/3); ctx.moveTo(s*0.6, s/3); ctx.lineTo(s, s/3); ctx.stroke();
        }
    },
    jk_flipflop: {
        name: 'JK-FlipFlop', pre: 'JK', defVal: 'JK-FF',
        terminals: (s) => [[-s, -s/2], [-s, 0], [-s, s/2], [s, -s/3], [s, s/3]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.8, s*1.2, s*1.6);
            ctx.font = '8px sans-serif'; ctx.fillText('J', -s*0.4, -s*0.35); ctx.fillText('K', -s*0.4, s*0.6);
            ctx.fillText('Q', s*0.2, -s/4); ctx.fillText('!Q', s*0.1, s/2);
            ctx.beginPath(); ctx.moveTo(-s, -s/2); ctx.lineTo(-s*0.6, -s/2); ctx.moveTo(-s, 0); ctx.lineTo(-s*0.6, 0);
            ctx.moveTo(-s*0.6, -4); ctx.lineTo(-s*0.4, 0); ctx.lineTo(-s*0.6, 4);
            ctx.moveTo(-s, s/2); ctx.lineTo(-s*0.6, s/2);
            ctx.moveTo(s*0.6, -s/3); ctx.lineTo(s, -s/3); ctx.moveTo(s*0.6, s/3); ctx.lineTo(s, s/3); ctx.stroke();
        }
    },
    jk_flipflop_sr: {
        name: 'JK-FlipFlop (SR)', pre: 'JK', defVal: 'JK-FF(SR)',
        terminals: (s) => [[-s, -s/2], [-s, 0], [-s, s/2], [0, -s*0.8], [0, s*0.8], [s, -s/3], [s, s/3]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.8, s*1.2, s*1.6);
            ctx.font = '7px sans-serif'; ctx.fillText('J', -s*0.4, -s*0.35); ctx.fillText('K', -s*0.4, s*0.6);
            ctx.fillText('S', -2, -s*0.55); ctx.fillText('R', -2, s*0.65);
            ctx.fillText('Q', s*0.2, -s/4); ctx.fillText('!Q', s*0.1, s/2);
            ctx.beginPath(); ctx.moveTo(-s, -s/2); ctx.lineTo(-s*0.6, -s/2); ctx.moveTo(-s, 0); ctx.lineTo(-s*0.6, 0);
            ctx.moveTo(-s*0.6, -4); ctx.lineTo(-s*0.4, 0); ctx.lineTo(-s*0.6, 4);
            ctx.moveTo(-s, s/2); ctx.lineTo(-s*0.6, s/2);
            ctx.moveTo(0, -s); ctx.lineTo(0, -s*0.8); ctx.moveTo(0, s*0.8); ctx.lineTo(0, s);
            ctx.moveTo(s*0.6, -s/3); ctx.lineTo(s, -s/3); ctx.moveTo(s*0.6, s/3); ctx.lineTo(s, s/3); ctx.stroke();
        }
    },
    t_flipflop: {
        name: 'T-FlipFlop', pre: 'TFF', defVal: 'T-FF',
        terminals: (s) => [[-s, -s/3], [-s, s/3], [s, -s/3], [s, s/3]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.7, s*1.2, s*1.4);
            ctx.font = '8px sans-serif'; ctx.fillText('T', -s*0.4, -s/4);
            ctx.fillText('Q', s*0.2, -s/4); ctx.fillText('!Q', s*0.1, s/2);
            ctx.beginPath(); ctx.moveTo(-s, -s/3); ctx.lineTo(-s*0.6, -s/3); ctx.moveTo(-s, s/3); ctx.lineTo(-s*0.6, s/3);
            ctx.moveTo(-s*0.6, s/3 - 4); ctx.lineTo(-s*0.4, s/3); ctx.lineTo(-s*0.6, s/3 + 4);
            ctx.moveTo(s*0.6, -s/3); ctx.lineTo(s, -s/3); ctx.moveTo(s*0.6, s/3); ctx.lineTo(s, s/3); ctx.stroke();
        }
    },
    gated_dlatch: {
        name: 'Gated D-Latch', pre: 'DL', defVal: 'Latch',
        terminals: (s) => [[-s, -s/3], [-s, s/3], [s, -s/3], [s, s/3]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.7, s*1.2, s*1.4);
            ctx.font = '8px sans-serif'; ctx.fillText('D', -s*0.4, -s/4); ctx.fillText('E', -s*0.4, s/2);
            ctx.fillText('Q', s*0.2, -s/4); ctx.fillText('!Q', s*0.1, s/2);
            ctx.beginPath(); ctx.moveTo(-s, -s/3); ctx.lineTo(-s*0.6, -s/3); ctx.moveTo(-s, s/3); ctx.lineTo(-s*0.6, s/3);
            ctx.moveTo(s*0.6, -s/3); ctx.lineTo(s, -s/3); ctx.moveTo(s*0.6, s/3); ctx.lineTo(s, s/3); ctx.stroke();
        }
    },
    logic_0: {
        name: 'Logic 0', pre: 'L0', defVal: '0',
        terminals: (s) => [[s, 0]],
        render: (ctx, s, d) => {
            ctx.beginPath();
            ctx.moveTo(-s*0.5, -s*0.3); ctx.lineTo(s*0.2, -s*0.3); ctx.lineTo(s*0.5, 0); ctx.lineTo(s*0.2, s*0.3); ctx.lineTo(-s*0.5, s*0.3); ctx.closePath();
            ctx.strokeStyle = '#15803d'; ctx.stroke();
            ctx.beginPath(); ctx.arc(-s*0.1, 0, s*0.18, 0, Math.PI*2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(s*0.5, 0); ctx.lineTo(s, 0); ctx.strokeStyle = '#000'; ctx.stroke();
        }
    },
    logic_1: {
        name: 'Logic 1', pre: 'L1', defVal: '1',
        terminals: (s) => [[s, 0]],
        render: (ctx, s, d) => {
            ctx.beginPath();
            ctx.moveTo(-s*0.5, -s*0.3); ctx.lineTo(s*0.2, -s*0.3); ctx.lineTo(s*0.5, 0); ctx.lineTo(s*0.2, s*0.3); ctx.lineTo(-s*0.5, s*0.3); ctx.closePath();
            ctx.strokeStyle = '#15803d'; ctx.stroke();
            ctx.font = 'bold 9px sans-serif'; ctx.fillStyle = '#15803d'; ctx.fillText('1', -s*0.15, 3);
            ctx.beginPath(); ctx.moveTo(s*0.5, 0); ctx.lineTo(s, 0); ctx.strokeStyle = '#000'; ctx.stroke();
        }
    },
    pattern_2bit: {
        name: '2Bit Pattern', pre: 'Pat2', defVal: '0-3',
        terminals: (s) => [[s, -s/4], [s, s/4]],
        render: (ctx, s, d) => {
            ctx.strokeStyle = '#15803d'; ctx.strokeRect(-s*0.6, -s*0.4, s*1.2, s*0.8);
            ctx.font = '7px sans-serif'; ctx.fillStyle = '#15803d'; ctx.fillText('0 1 2 3', -s*0.5, 3);
            ctx.beginPath(); ctx.moveTo(s*0.6, -s/4); ctx.lineTo(s, -s/4); ctx.moveTo(s*0.6, s/4); ctx.lineTo(s, s/4); ctx.strokeStyle = '#000'; ctx.stroke();
        }
    },
    pattern_3bit: {
        name: '3Bit Pattern', pre: 'Pat3', defVal: '0-7',
        terminals: (s) => [[s, -s/3], [s, 0], [s, s/3]],
        render: (ctx, s, d) => {
            ctx.strokeStyle = '#15803d'; ctx.strokeRect(-s*0.6, -s*0.6, s*1.2, s*1.2);
            ctx.font = '6.5px sans-serif'; ctx.fillStyle = '#15803d'; ctx.fillText('0 1 2 3', -s*0.5, -2); ctx.fillText('4 5 6 7', -s*0.5, 7);
            ctx.beginPath(); ctx.moveTo(s*0.6, -s/3); ctx.lineTo(s, -s/3); ctx.moveTo(s*0.6, 0); ctx.lineTo(s, 0); ctx.moveTo(s*0.6, s/3); ctx.lineTo(s, s/3); ctx.strokeStyle = '#000'; ctx.stroke();
        }
    },
    pattern_4bit: {
        name: '4Bit Pattern', pre: 'Pat4', defVal: '0-15',
        terminals: (s) => [[s, -s*0.6], [s, -s*0.2], [s, s*0.2], [s, s*0.6]],
        render: (ctx, s, d) => {
            ctx.strokeStyle = '#15803d'; ctx.strokeRect(-s*0.6, -s*0.8, s*1.2, s*1.6);
            ctx.font = '6px sans-serif'; ctx.fillStyle = '#15803d'; ctx.fillText('0..3', -s*0.4, -s*0.3); ctx.fillText('4..7', -s*0.4, 0); ctx.fillText('8..15', -s*0.45, s*0.4);
            [-s*0.6, -s*0.2, s*0.2, s*0.6].forEach(y => {
                ctx.beginPath(); ctx.moveTo(s*0.6, y); ctx.lineTo(s, y); ctx.strokeStyle = '#000'; ctx.stroke();
            });
        }
    },
    a2d_level: {
        name: 'A2D Level Shifter', pre: 'A2D', defVal: 'ADC',
        terminals: (s) => [[-s, 0], [s, 0]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.6, s*1.2, s*1.2);
            ctx.beginPath(); ctx.moveTo(-s*0.6, s*0.6); ctx.lineTo(s*0.6, -s*0.6); ctx.stroke();
            ctx.font = '7px sans-serif'; ctx.fillText('A', -s*0.4, s*0.3); ctx.fillText('D', s*0.1, -s*0.1);
            ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(-s*0.6, 0); ctx.moveTo(s*0.6, 0); ctx.lineTo(s, 0); ctx.stroke();
        }
    },
    d2a_level: {
        name: 'D2A Level Shifter', pre: 'D2A', defVal: 'DAC',
        terminals: (s) => [[-s, 0], [s, 0]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.6, s*1.2, s*1.2);
            ctx.beginPath(); ctx.moveTo(-s*0.6, s*0.6); ctx.lineTo(s*0.6, -s*0.6); ctx.stroke();
            ctx.font = '7px sans-serif'; ctx.fillText('D', -s*0.4, s*0.3); ctx.fillText('A', s*0.1, -s*0.1);
            ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(-s*0.6, 0); ctx.moveTo(s*0.6, 0); ctx.lineTo(s, 0); ctx.stroke();
        }
    },
    bin2gray_4bit: {
        name: '4Bit Bin2Gray', pre: 'B2G', defVal: '4Bit',
        terminals: (s) => [[-s, -s/2], [-s, -s/6], [-s, s/6], [-s, s/2], [s, -s/2], [s, -s/6], [s, s/6], [s, s/2]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.75, s*1.2, s*1.5);
            ctx.font = '7px sans-serif'; ctx.fillText('B/G', -s*0.3, 3);
            [-s/2, -s/6, s/6, s/2].forEach(y => {
                ctx.beginPath(); ctx.moveTo(-s, y); ctx.lineTo(-s*0.6, y); ctx.moveTo(s*0.6, y); ctx.lineTo(s, y); ctx.stroke();
            });
        }
    },
    gray2bin_4bit: {
        name: '4Bit Gray2Bin', pre: 'G2B', defVal: '4Bit',
        terminals: (s) => [[-s, -s/2], [-s, -s/6], [-s, s/6], [-s, s/2], [s, -s/2], [s, -s/6], [s, s/6], [s, s/2]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.75, s*1.2, s*1.5);
            ctx.font = '7px sans-serif'; ctx.fillText('G/B', -s*0.3, 3);
            [-s/2, -s/6, s/6, s/2].forEach(y => {
                ctx.beginPath(); ctx.moveTo(-s, y); ctx.lineTo(-s*0.6, y); ctx.moveTo(s*0.6, y); ctx.lineTo(s, y); ctx.stroke();
            });
        }
    },
    comp_1bit: {
        name: '1Bit Comparator', pre: 'CMP', defVal: '1Bit',
        terminals: (s) => [[-s, -s/3], [-s, s/3], [s, -s/3], [s, 0], [s, s/3]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.7, s*1.2, s*1.4);
            ctx.font = '7px sans-serif'; ctx.fillText('COMP', -s*0.45, -s*0.3); ctx.fillText('X,Y', -s*0.3, 3);
            ctx.beginPath(); ctx.moveTo(-s, -s/3); ctx.lineTo(-s*0.6, -s/3); ctx.moveTo(-s, s/3); ctx.lineTo(-s*0.6, s/3);
            ctx.moveTo(s*0.6, -s/3); ctx.lineTo(s, -s/3); ctx.moveTo(s*0.6, 0); ctx.lineTo(s, 0); ctx.moveTo(s*0.6, s/3); ctx.lineTo(s, s/3); ctx.stroke();
        }
    },
    comp_2bit: {
        name: '2Bit Comparator', pre: 'CMP2', defVal: '2Bit',
        terminals: (s) => [[-s, -s/2], [-s, 0], [-s, s/2], [s, -s/3], [s, 0], [s, s/3]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.8, s*1.2, s*1.6);
            ctx.font = '7px sans-serif'; ctx.fillText('COMP2', -s*0.5, 3);
            ctx.beginPath(); ctx.moveTo(-s, -s/2); ctx.lineTo(-s*0.6, -s/2); ctx.moveTo(-s, 0); ctx.lineTo(-s*0.6, 0); ctx.moveTo(-s, s/2); ctx.lineTo(-s*0.6, s/2);
            ctx.moveTo(s*0.6, -s/3); ctx.lineTo(s, -s/3); ctx.moveTo(s*0.6, 0); ctx.lineTo(s, 0); ctx.moveTo(s*0.6, s/3); ctx.lineTo(s, s/3); ctx.stroke();
        }
    },
    comp_4bit: {
        name: '4Bit Comparator', pre: 'CMP4', defVal: '4Bit',
        terminals: (s) => [[-s, -s*0.6], [-s, -s*0.2], [-s, s*0.2], [-s, s*0.6], [s, -s/3], [s, 0], [s, s/3]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.85, s*1.2, s*1.7);
            ctx.font = '7px sans-serif'; ctx.fillText('COMP4', -s*0.5, 3);
            [-s*0.6, -s*0.2, s*0.2, s*0.6].forEach(y => {
                ctx.beginPath(); ctx.moveTo(-s, y); ctx.lineTo(-s*0.6, y); ctx.stroke();
            });
            ctx.beginPath(); ctx.moveTo(s*0.6, -s/3); ctx.lineTo(s, -s/3); ctx.moveTo(s*0.6, 0); ctx.lineTo(s, 0); ctx.moveTo(s*0.6, s/3); ctx.lineTo(s, s/3); ctx.stroke();
        }
    },
    hpri_bin_4bit: {
        name: '4Bit HPRI/BIN', pre: 'HPRI', defVal: '4Bit',
        terminals: (s) => [[-s, -s/2], [-s, -s/6], [-s, s/6], [-s, s/2], [s, -s/3], [s, s/3]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.75, s*1.2, s*1.5);
            ctx.font = '6px sans-serif'; ctx.fillText('HPRI', -s*0.4, -2); ctx.fillText('BIN', -s*0.35, 7);
            [-s/2, -s/6, s/6, s/2].forEach(y => {
                ctx.beginPath(); ctx.moveTo(-s, y); ctx.lineTo(-s*0.6, y); ctx.stroke();
            });
            ctx.beginPath(); ctx.moveTo(s*0.6, -s/3); ctx.lineTo(s, -s/3); ctx.moveTo(s*0.6, s/3); ctx.lineTo(s, s/3); ctx.stroke();
        }
    },
    digital_file: {
        name: 'Ficheiro Digital (V)', pre: 'Vfile', defVal: 'file.dat',
        terminals: (s) => [[-s, 0], [s, 0]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.5, -s*0.4, s, s*0.8);
            ctx.font = 'bold 9px sans-serif'; ctx.fillText('V', -3, 3);
            ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(-s*0.5, 0); ctx.moveTo(s*0.5, 0); ctx.lineTo(s, 0); ctx.stroke();
        }
    },
    digital_file2: {
        name: 'Ficheiro Digital 2', pre: 'Vfile2', defVal: 'file.vec',
        terminals: (s) => [[-s, 0], [s, 0]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.5, -s*0.4, s, s*0.8);
            ctx.font = 'bold 8px sans-serif'; ctx.fillText('V2', -5, 3);
            ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(-s*0.5, 0); ctx.moveTo(s*0.5, 0); ctx.lineTo(s, 0); ctx.stroke();
        }
    },
    digi_sim: {
        name: 'Simulação Digital', pre: 'Digi', defVal: 'TR=10ns',
        terminals: (s) => [],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.7, -s*0.45, s*1.4, s*0.9);
            ctx.font = 'bold 9px sans-serif'; ctx.fillText('Digi', -s*0.35, 3);
        }
    },

    // --- Componentes Baseados em Ficheiro (Imagem 3 - Nova Categoria 9) ---
    netlist_s: {
        name: 'Netlist Parâmetros S', pre: 'Snet', defVal: 'S_param',
        terminals: (s) => [[-s, 0], [s, 0]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.5, -s*0.4, s, s*0.8);
            ctx.font = 'bold 9px sans-serif'; ctx.fillText('S', -3, 3);
            ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(-s*0.5, 0); ctx.moveTo(s*0.5, 0); ctx.lineTo(s, 0); ctx.stroke();
        }
    },
    file_1port: {
        name: 'Ficheiro 1-Port', pre: 'F1P', defVal: '1port.s1p',
        terminals: (s) => [[-s, 0]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.5, -s*0.45, s*0.8, s*0.9);
            ctx.font = 'bold 9px sans-serif'; ctx.fillText('1', -s*0.2, 3);
            ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(-s*0.5, 0); ctx.stroke();
        }
    },
    file_2port: {
        name: 'Ficheiro 2-Port', pre: 'F2P', defVal: '2port.s2p',
        terminals: (s) => [[-s, 0], [s, 0]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.5, -s*0.45, s, s*0.9);
            ctx.font = 'bold 9px sans-serif'; ctx.fillText('2', -3, 3);
            ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(-s*0.5, 0); ctx.moveTo(s*0.5, 0); ctx.lineTo(s, 0); ctx.stroke();
        }
    },
    file_nport: {
        name: 'n-port S-Parâmetros', pre: 'FNP', defVal: 'nport.snp',
        terminals: (s) => [[-s, -s/3], [-s, s/3], [s, -s/3], [s, s/3]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.6, s*1.2, s*1.2);
            ctx.font = 'bold 9px sans-serif'; ctx.fillText('N', -3, 3);
            ctx.beginPath(); ctx.moveTo(-s, -s/3); ctx.lineTo(-s*0.6, -s/3); ctx.moveTo(-s, s/3); ctx.lineTo(-s*0.6, s/3);
            ctx.moveTo(s*0.6, -s/3); ctx.lineTo(s, -s/3); ctx.moveTo(s*0.6, s/3); ctx.lineTo(s, s/3); ctx.stroke();
        }
    },
    subcircuit: {
        name: 'Subcircuit (Sub)', pre: 'Sub', defVal: 'sub.sch',
        terminals: (s) => [[-s, 0], [s, 0]],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.6, -s*0.4, s*1.2, s*0.8);
            ctx.font = 'bold 8px sans-serif'; ctx.fillText('Sub', -s*0.35, 3);
            ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(-s*0.6, 0); ctx.moveTo(s*0.6, 0); ctx.lineTo(s, 0); ctx.stroke();
        }
    },

    // --- Controladores de Simulação (Imagem 4 - Nova Categoria 10) ---
    sim_dc: {
        name: 'Simulação DC', pre: 'DC', defVal: 'DC1',
        terminals: (s) => [],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.7, -s*0.5, s*1.4, s);
            ctx.font = 'bold 10px sans-serif'; ctx.fillText('.DC', -s*0.4, 3);
        }
    },
    sim_tr: {
        name: 'Simulação Transitória', pre: 'Tra', defVal: 'TR1',
        terminals: (s) => [],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.7, -s*0.5, s*1.4, s);
            ctx.font = 'bold 10px sans-serif'; ctx.fillText('.Tra', -s*0.45, 3);
        }
    },
    sim_ac: {
        name: 'Simulação AC', pre: 'AC', defVal: 'AC1',
        terminals: (s) => [],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.7, -s*0.5, s*1.4, s);
            ctx.font = 'bold 10px sans-serif'; ctx.fillText('.AC', -s*0.4, 3);
        }
    },
    sim_sp: {
        name: 'Simulação Parâmetros S', pre: 'SP', defVal: 'SP1',
        terminals: (s) => [],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.7, -s*0.5, s*1.4, s);
            ctx.font = 'bold 10px sans-serif'; ctx.fillText('.SP', -s*0.4, 3);
        }
    },
    sim_hb: {
        name: 'Equilíbrio Harmónico', pre: 'HB', defVal: 'HB1',
        terminals: (s) => [],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.7, -s*0.5, s*1.4, s);
            ctx.font = 'bold 10px sans-serif'; ctx.fillText('.HB', -s*0.4, 3);
        }
    },
    sim_swp: {
        name: 'Varrer Parâmetro', pre: 'Swp', defVal: 'SW1',
        terminals: (s) => [],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.7, -s*0.5, s*1.4, s);
            ctx.font = 'bold 9px sans-serif'; ctx.fillText('.Swp', -s*0.45, 3);
        }
    },
    sim_digi_ctrl: {
        name: 'Simulação Digital (Ctrl)', pre: 'Digi', defVal: 'DIG1',
        terminals: (s) => [],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.7, -s*0.5, s*1.4, s);
            ctx.font = 'bold 9px sans-serif'; ctx.fillText('.Digi', -s*0.45, 3);
        }
    },
    sim_opt: {
        name: 'Optimização', pre: 'Opt', defVal: 'OPT1',
        terminals: (s) => [],
        render: (ctx, s, d) => {
            ctx.strokeRect(-s*0.7, -s*0.5, s*1.4, s);
            ctx.font = 'bold 10px sans-serif'; ctx.fillText('.Opt', -s*0.45, 3);
        }
    }

};

let ccState = {
    parts: [],
    wires: [],
    annotations: []
};

let ccTool = 'select'; // 'select', 'wire', 'part', 'eraser' (Ponto 1)
let ccSelectedSymbol = null;
let ccSelectedPart = null;
let ccSelectedWire = null;
let ccWireStart = null;
let ccDrag = null;
let ccIsFixed = true;
let ccDimDragHandle = null;
let ccIsWritingLabel = false;

function ccSvgEl(tag, attrs, parent) {
    const el = document.createElementNS(CC_NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
}

function abrirCCnotesModal() {
    if (!ccEditingBlock) {
        resetComponentCounters();
    }
    wordSymbolsTarget = 'ccnotes'; // Permite inserir fórmulas e símbolos no CCnotes reaberto (Item 8)
    ccSetTool('select'); // Garante que a ferramenta de seleção está ativa para mover componentes (Item 8)
    document.getElementById('ccnotesModal').classList.add('active');
    ccRenderAll();
    if (window.lucide) lucide.createIcons();
}

function fecharCCnotesModal() {
    document.getElementById('ccnotesModal').classList.remove('active');
    ccEditingBlock = null;
}

function ccGetNextLabel(symbol) {
    const meta = QUCS_SYMBOLS[symbol];
    if (!meta) return '';
    let counterKey = 'res';
    if (symbol.startsWith('res')) counterKey = 'res';
    else if (symbol.startsWith('v')) counterKey = 'v';
    else if (symbol.startsWith('i')) counterKey = 'i';
    else if (symbol.startsWith('cap')) counterKey = 'cap';
    else if (symbol === 'ind') counterKey = 'ind';
    else if (symbol.includes('diode') || symbol === 'zener' || symbol === 'led') counterKey = 'diode';
    else if (symbol.startsWith('bjt')) counterKey = 'q';
    else if (symbol.startsWith('mosfet')) counterKey = 'm';
    else if (symbol.startsWith('jfet')) counterKey = 'j';
    else if (symbol === 'opamp') counterKey = 'u';
    else if (symbol.startsWith('switch')) counterKey = 'sw';
    else if (symbol.startsWith('xfmr')) counterKey = 'x';
    else if (symbol.startsWith('probe')) counterKey = 'p';

    const num = componentCounters[counterKey]++;
    salvarNoLocalStorage();

    if (symbol === 'gnd') return 'GND';
    let def = meta.defVal || '';
    if (meta.pre === 'R' && !def.includes('Ω')) def += 'Ω';
    else if (meta.pre === 'V' && !def.includes('V')) def += 'V';
    else if (meta.pre === 'I' && !def.includes('A')) def += 'mA';
    else if (meta.pre === 'C' && !def.includes('F')) def += 'µF';
    else if (meta.pre === 'L' && !def.includes('H')) def += 'mH';
    else if (meta.pre === 'P' && !def.includes('W')) def += 'W';
    return `${meta.pre}${num} ${def}`.trim();
}

function ccGetPartAbsoluteTerminals(p) {
    const meta = QUCS_SYMBOLS[p.symbol];
    if (!meta || !meta.terminals) return [];
    const localTerms = meta.terminals(p.size);
    const rad = ((p.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    return localTerms.map(([lx, ly], idx) => {
        return {
            id: `${p.id}_t${idx}`,
            partId: p.id,
            index: idx,
            x: Math.round(p.x + lx * cos - ly * sin),
            y: Math.round(p.y + lx * sin + ly * cos),
            localX: lx,
            localY: ly
        };
    });
}

function ccGetAllTerminals() {
    const all = [];
    ccState.parts.forEach(p => {
        all.push(...ccGetPartAbsoluteTerminals(p));
    });
    return all;
}

function ccFindNearbyTerminal(x, y, radius = 16) {
    const terms = ccGetAllTerminals();
    let closest = null;
    let minDist = radius;
    for (let t of terms) {
        const d = Math.hypot(t.x - x, t.y - y);
        if (d < minDist) {
            minDist = d;
            closest = t;
        }
    }
    return closest;
}

function ccAutoCutWiresUnderPart(cx, cy, size) {
    const half = size / 2;
    const newWires = [];
    ccState.wires = ccState.wires.filter(w => {
        const isHoriz = Math.abs(w.y1 - w.y2) < 2;
        const isVert = Math.abs(w.x1 - w.x2) < 2;

        if (isHoriz && Math.abs(w.y1 - cy) < 6) {
            const minX = Math.min(w.x1, w.x2);
            const maxX = Math.max(w.x1, w.x2);
            if (cx - half > minX && cx + half < maxX) {
                newWires.push({ id: ccUid(), x1: minX, y1: w.y1, x2: cx - half, y2: w.y1 });
                newWires.push({ id: ccUid(), x1: cx + half, y1: w.y1, x2: maxX, y2: w.y1 });
                return false;
            }
        } else if (isVert && Math.abs(w.x1 - cx) < 6) {
            const minY = Math.min(w.y1, w.y2);
            const maxY = Math.max(w.y1, w.y2);
            if (cy - half > minY && cy + half < maxY) {
                newWires.push({ id: ccUid(), x1: w.x1, y1: minY, x2: w.x1, y2: cy - half });
                newWires.push({ id: ccUid(), x1: w.x1, y1: cy + half, x2: w.x1, y2: maxY });
                return false;
            }
        }
        return true;
    });

    if (newWires.length > 0) {
        ccState.wires.push(...newWires);
    }
}

// Inserir anotação técnica no CCnotes (Ponto 5)
let ccSelectedAnnotation = null;

function ccAddTextAnnotation(tex) {
    ccState.annotations = ccState.annotations || [];
    const newAnn = {
        id: ccUid(),
        tex: tex,
        x: ccSnap(220),
        y: ccSnap(160)
    };
    ccState.annotations.push(newAnn);
    ccSelectedAnnotation = newAnn;
    ccRenderAll();
}

function ccRenderAll() {
    const W = document.getElementById('ccWiresLayer');
    const J = document.getElementById('ccJunctionsLayer');
    const P = document.getElementById('ccComponentsLayer');
    const A = document.getElementById('ccAnnotationsLayer');
    W.innerHTML = ''; J.innerHTML = ''; P.innerHTML = ''; A.innerHTML = '';

    // Render de Fios
    ccState.wires.forEach(w => {
        const isSel = (ccSelectedWire?.id === w.id);
        ccSvgEl('line', {
            x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2,
            stroke: isSel ? '#0284c7' : '#111827',
            'stroke-width': isSel ? 3.5 : 2,
            'stroke-linecap': 'round'
        }, W);

        const hit = ccSvgEl('line', {
            x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2,
            stroke: 'transparent',
            'stroke-width': 14,
            cursor: ccTool === 'eraser' ? 'pointer' : 'pointer'
        }, W);

        hit.addEventListener('pointerdown', (e) => {
            // Borracha no CCnotes: apaga ao toque (Ponto 1)
            if (ccTool === 'eraser') {
                e.stopPropagation();
                ccState.wires = ccState.wires.filter(x => x !== w);
                ccRenderAll();
                return;
            }
            if (ccTool === 'select') {
                e.stopPropagation();
                ccSelectedWire = w;
                ccSelectedPart = null;
                ccUpdateLabelButton();
                ccRenderAll();
            }
        });
    });

    // Junções (bolinhas pretas nos nós)
    const pointsCount = {};
    ccState.wires.forEach(w => {
        [[w.x1, w.y1], [w.x2, w.y2]].forEach(pt => {
            const k = pt.join(',');
            pointsCount[k] = (pointsCount[k] || 0) + 1;
        });
    });
    Object.entries(pointsCount).filter(([, count]) => count >= 3).forEach(([key]) => {
        const [x, y] = key.split(',');
        ccSvgEl('circle', { cx: x, cy: y, r: 4.5, fill: '#111827' }, J);
    });

    // Render de Anotações e Fórmulas no CCnotes (KaTeX Escolar Limpo e Escalável)
    (ccState.annotations || []).forEach(ann => {
        const isSel = (ccSelectedAnnotation?.id === ann.id);
        const fSize = ann.fontSize || 18;
        const fo = document.createElementNS(CC_NS, 'foreignObject');
        fo.setAttribute('x', ann.x);
        fo.setAttribute('y', ann.y);
        fo.setAttribute('width', Math.max(220, fSize * 10));
        fo.setAttribute('height', Math.max(50, fSize * 2.5));
        fo.style.overflow = 'visible';
        fo.style.cursor = 'move';

        const div = document.createElement('div');
        div.className = 'cc-annotation-math';
        div.style.cssText = `
            display: inline-flex;
            align-items: center;
            padding: 3px 6px;
            background: ${isSel ? 'rgba(56, 189, 248, 0.15)' : 'transparent'};
            border: ${isSel ? '1.5px dashed #0284c7' : '1px solid transparent'};
            border-radius: 4px;
            color: #0369a1;
            font-size: ${fSize}px;
            font-weight: 600;
            user-select: none;
            white-space: nowrap;
        `;

        try {
            if (window.katex && (ann.tex.includes('\\') || ann.tex.includes('^') || ann.tex.includes('_') || ann.tex.includes('{') || ann.tex.includes('=') || ann.tex.includes('/'))) {
                katex.render(ann.tex, div, { output: 'html', throwOnError: false });
            } else {
                div.textContent = ann.tex;
            }
        } catch(e) {
            div.textContent = ann.tex;
        }

        fo.appendChild(div);

        fo.addEventListener('pointerdown', (e) => {
            if (ccTool === 'eraser') {
                e.stopPropagation();
                ccState.annotations = ccState.annotations.filter(a => a !== ann);
                if (ccSelectedAnnotation === ann) ccSelectedAnnotation = null;
                ccRenderAll();
                return;
            }
            if (ccTool === 'select') {
                e.stopPropagation();
                ccSelectedAnnotation = ann;
                ccSelectedPart = null;
                ccSelectedWire = null;
                const sizeInput = document.getElementById('ccPartSizeInput');
                if (sizeInput) sizeInput.value = fSize;
                const pt = ccPos(e);
                ccDrag = {
                    annotation: ann,
                    dx: ann.x - pt.x,
                    dy: ann.y - pt.y
                };
                document.getElementById('ccSvgCanvas').setPointerCapture(e.pointerId);
                ccRenderAll();
            }
        });

        A.appendChild(fo);
    });

    // Render de Componentes
    ccState.parts.forEach(p => {
        const isSel = (ccSelectedPart?.id === p.id);
        const meta = QUCS_SYMBOLS[p.symbol];
        const g = ccSvgEl('g', {
            transform: `translate(${p.x}, ${p.y}) rotate(${p.rotation || 0})`,
            cursor: ccTool === 'eraser' ? 'pointer' : 'move'
        }, P);

        const h = p.size / 2;
        ccSvgEl('rect', {
            x: -h - 4, y: -h - 4, width: p.size + 8, height: p.size + 8,
            fill: isSel ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
            stroke: isSel ? '#0284c7' : 'transparent',
            'stroke-width': 1.5,
            'stroke-dasharray': isSel ? '4,4' : 'none',
            rx: 4
        }, g);

        if (meta && meta.render) {
            meta.render(g, p.size);
        }

        // Pinos de conexão (terminais com ponto azul no CCnotes)
        const terminals = meta ? meta.terminals(p.size) : [];
        terminals.forEach(([px, py]) => {
            ccSvgEl('circle', { cx: px, cy: py, r: 3, fill: '#0284c7', class: 'cc-pin-dot' }, g);
        });

        // Alças de dimensão no modo Dim
        if (!ccIsFixed && isSel && terminals.length >= 2) {
            const t0 = terminals[0];
            const t1 = terminals[1];
            const h1 = ccSvgEl('circle', { cx: t0[0], cy: t0[1], class: 'cc-dim-handle' }, g);
            const h2 = ccSvgEl('circle', { cx: t1[0], cy: t1[1], class: 'cc-dim-handle' }, g);

            [h1, h2].forEach(handle => {
                handle.addEventListener('pointerdown', (e) => {
                    e.stopPropagation();
                    ccDimDragHandle = { part: p, startSize: p.size, startX: e.clientX };
                    document.getElementById('ccSvgCanvas').setPointerCapture(e.pointerId);
                });
            });
        }

        // LEGENDA TÉCNICA: NUNCA FICA NO CAMINHO DOS FIOS (Livre de sobreposição)
        if (p.label && p.label.trim()) {
            const rot = (p.rotation || 0) % 360;
            const isVertical = (rot === 90 || rot === 270);
            let lx, ly, anchor;

            if (isVertical) {
                // Ao rodar na vertical, os terminais ficam no topo e na base.
                // Colocamos a legenda SEMPRE à direita (lateral), centrado no eixo Y do componente!
                // Assim os fios verticais nunca cruzam nem passam por cima da legenda!
                lx = p.x + h + 18;
                ly = p.y + 4;
                anchor = 'start';
            } else {
                // Na horizontal, os fios passam nos terminais esquerdo e direito.
                // Colocamos acima do componente, centrado horizontalmente
                const isGnd = (p.symbol === 'gnd');
                lx = p.x;
                ly = isGnd ? p.y + h + 22 : p.y - h - 14;
                anchor = 'middle';
            }

            const textEl = ccSvgEl('text', {
                x: lx, y: ly,
                'text-anchor': anchor,
                'font-family': 'Segoe UI, sans-serif',
                'font-size': '11',
                'font-weight': 'bold',
                fill: '#0f172a'
            }, P);
            textEl.textContent = p.label;
        }

        // Eventos de clique do componente
        g.addEventListener('pointerdown', (e) => {
            // Borracha apaga componente ao toque (Ponto 1)
            if (ccTool === 'eraser') {
                e.stopPropagation();
                ccState.parts = ccState.parts.filter(x => x !== p);
                ccRenderAll();
                return;
            }
            if (ccTool === 'select') {
                e.stopPropagation();
                ccSelectedPart = p;
                ccSelectedWire = null;
                ccUpdateLabelButton();

                const pt = ccPos(e);
                const termsBefore = ccGetPartAbsoluteTerminals(p);
                ccDrag = {
                    part: p,
                    dx: p.x - pt.x,
                    dy: p.y - pt.y,
                    oldX: p.x,
                    oldY: p.y,
                    termsBefore: termsBefore
                };
                document.getElementById('ccSvgCanvas').setPointerCapture(e.pointerId);
                // Não limpa o DOM para manter o arrasto fluido (Item 8)
            }
        });

        g.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            ccSelectedPart = p;
            ccToggleEditLabel();
        });
    });
}

function ccPos(e) {
    const svg = document.getElementById('ccSvgCanvas');
    const r = svg.getBoundingClientRect();
    return {
        x: e.clientX - r.left,
        y: e.clientY - r.top
    };
}


// ========================================================
// CCnotes Category Filter, Search & Accordion
// ========================================================
function ccFilterCategory(catId) {
    const sections = document.querySelectorAll('.cc-cat-section');
    const searchInput = document.getElementById('ccCompSearch');
    if (searchInput) searchInput.value = '';

    sections.forEach(sec => {
        if (catId === 'all') {
            sec.style.display = 'block';
            const grid = sec.querySelector('.palette-grid');
            if (grid) grid.style.display = 'none'; // Início colapsado por defeito
            const arrow = sec.querySelector('.cat-arrow');
            if (arrow) arrow.textContent = '►';
        } else if (sec.id === catId) {
            sec.style.display = 'block';
            const grid = sec.querySelector('.palette-grid');
            if (grid) grid.style.display = 'grid'; // Categoria selecionada expandida
            const arrow = sec.querySelector('.cat-arrow');
            if (arrow) arrow.textContent = '▼';
        } else {
            sec.style.display = 'none';
        }
    });

    document.querySelectorAll('.cc-cat-section .comp-btn').forEach(btn => {
        btn.style.display = 'inline-flex';
    });
}

function ccToggleAccordion(catId) {
    const sec = document.getElementById(catId);
    if (!sec) return;
    const grid = sec.querySelector('.palette-grid');
    const arrow = sec.querySelector('.cat-arrow');
    if (!grid) return;

    if (grid.style.display === 'none') {
        grid.style.display = 'grid';
        if (arrow) arrow.textContent = '▼';
    } else {
        grid.style.display = 'none';
        if (arrow) arrow.textContent = '►';
    }
}

function ccSearchComponents(query) {
    query = (query || '').trim().toLowerCase();
    const dropdown = document.getElementById('ccCatDropdown');
    const sections = document.querySelectorAll('.cc-cat-section');

    if (!query) {
        const activeCat = dropdown ? dropdown.value : 'all';
        ccFilterCategory(activeCat);
        return;
    }

    // When searching, show all sections that contain matching components
    sections.forEach(sec => {
        let hasMatch = false;
        const buttons = sec.querySelectorAll('.comp-btn');
        buttons.forEach(btn => {
            const text = (btn.textContent + ' ' + (btn.dataset.symbol || '')).toLowerCase();
            if (text.includes(query)) {
                btn.style.display = 'inline-flex';
                hasMatch = true;
            } else {
                btn.style.display = 'none';
            }
        });

        if (hasMatch) {
            sec.style.display = 'block';
            const grid = sec.querySelector('.palette-grid');
            if (grid) grid.style.display = 'grid';
            const arrow = sec.querySelector('.cat-arrow');
            if (arrow) arrow.textContent = '▼';
        } else {
            sec.style.display = 'none';
        }
    });
}

function ccClearSearch() {
    const searchInput = document.getElementById('ccCompSearch');
    if (searchInput) searchInput.value = '';
    const dropdown = document.getElementById('ccCatDropdown');
    const activeCat = dropdown ? dropdown.value : 'all';
    ccFilterCategory(activeCat);
}

function ccSelectComp(symbol) {
    ccSelectedSymbol = symbol;
    document.querySelectorAll('.comp-btn').forEach(b => b.classList.toggle('active', b.dataset.symbol === symbol));
    ccSetTool('part');
}

function ccSetTool(t) {
    ccTool = t;
    ccWireStart = null;
    document.getElementById('ccPreviewLayer').innerHTML = '';
    document.getElementById('ccSnapPinIndicator').innerHTML = '';
    document.getElementById('cc-tool-select').classList.toggle('active', t === 'select');
    document.getElementById('cc-tool-wire').classList.toggle('active', t === 'wire');
    document.getElementById('cc-tool-eraser').classList.toggle('active', t === 'eraser');
}

function ccSetPartSizeFromInput(val) {
    const s = parseInt(val) || 30;
    const clamped = Math.max(10, Math.min(200, s));
    const input = document.getElementById('ccPartSizeInput');
    if (input) input.value = clamped;

    // Se estiver selecionada uma anotação, fórmula ou símbolo, ajusta a escala deste elemento
    if (ccSelectedAnnotation) {
        ccSelectedAnnotation.fontSize = clamped;
        ccRenderAll();
        return;
    }

    if (ccSelectedPart) {
        const oldTerms = ccGetPartAbsoluteTerminals(ccSelectedPart);
        ccSelectedPart.size = clamped;
        const newTerms = ccGetPartAbsoluteTerminals(ccSelectedPart);

        // Atualiza fios conectados
        ccState.wires.forEach(w => {
            oldTerms.forEach((oldT, idx) => {
                const newT = newTerms[idx];
                if (newT) {
                    if (Math.hypot(w.x1 - oldT.x, w.y1 - oldT.y) <= 4) {
                        w.x1 = newT.x;
                        w.y1 = newT.y;
                    }
                    if (Math.hypot(w.x2 - oldT.x, w.y2 - oldT.y) <= 4) {
                        w.x2 = newT.x;
                        w.y2 = newT.y;
                    }
                }
            });
        });
        ccRenderAll();
    }
}

function ccStepPartSize(delta) {
    const input = document.getElementById('ccPartSizeInput');
    const cur = parseInt(input ? input.value : 30) || 30;
    ccSetPartSizeFromInput(cur + delta);
}

function ccResetPartSize30() {
    ccSetPartSizeFromInput(30);
    ccIsFixed = true;
    const btn = document.getElementById('cc-comp-mode-btn');
    const txt = document.getElementById('cc-comp-mode-text');
    if (btn && txt) {
        btn.className = 'btn-dim-mode active-fixo';
        txt.innerText = 'Fixo (30px)';
    }
}

function ccToggleDimMode() {
    ccIsFixed = !ccIsFixed;
    const btn = document.getElementById('cc-comp-mode-btn');
    const txt = document.getElementById('cc-comp-mode-text');
    if (ccIsFixed) {
        btn.className = 'btn-dim-mode active-fixo';
        txt.innerText = 'Fixo (30px)';
        ccSetPartSizeFromInput(30);
    } else {
        btn.className = 'btn-dim-mode active-dim';
        txt.innerText = 'Dim Livre';
    }
    ccRenderAll();
}

function ccFormatComponentLabel(part, text) {
    if (!text) return '';
    let t = text.trim();
    if (!part) return t;

    const sym = (part.symbol || '').toLowerCase();
    const originalLabel = (part.label || '').trim();

    const isResistor = sym.includes('res') || sym === 'r' || originalLabel.includes('Ω') || /^[rR]\d*/.test(t);
    const isVoltage = sym.includes('volt') || sym.includes('vdc') || sym.includes('vac') || sym.includes('source') || sym.includes('battery') || originalLabel.endsWith('V') || /^[vVuU]\d*/.test(t);
    const isCapacitor = sym.includes('cap') || sym === 'c' || originalLabel.endsWith('F') || /^[cC]\d*/.test(t);
    const isInductor = sym.includes('ind') || sym === 'l' || originalLabel.endsWith('H') || /^[lL]\d*/.test(t);

    if (isResistor) {
        // Converte K para k e limpa variações prévias de ohm
        t = t.replace(/\s*(ohm|ohms|kohm|mohm|Ω|kΩ|MΩ)\s*$/gi, '');
        t = t.replace(/K$/, 'k');
        return t + 'Ω';
    } else if (isVoltage) {
        t = t.replace(/\s*(v|mv|kv|volts?)\s*$/gi, '');
        return t + 'V';
    } else if (isCapacitor) {
        if (!/(f|µf|uf|nf|pf)$/i.test(t)) {
            t = t.replace(/\s*f\s*$/gi, '');
            t = t.replace(/u$/, 'µ');
            return t + 'F';
        }
    } else if (isInductor) {
        if (!/(h|mh|µh|uh)$/i.test(t)) {
            t = t.replace(/\s*h\s*$/gi, '');
            return t + 'H';
        }
    }
    return t;
}

function ccToggleEditLabel() {
    if (!ccSelectedPart) return;
    const input = document.getElementById('ccInlineLabelInput');
    const btn = document.getElementById('cc-btn-label-edit');
    const txt = document.getElementById('cc-btn-label-text');
    const icon = document.getElementById('cc-icon-label-state');

    if (ccIsWritingLabel) {
        ccIsWritingLabel = false;
        btn.classList.remove('active-writing');
        const formatted = ccFormatComponentLabel(ccSelectedPart, input.value.trim());
        ccSelectedPart.label = formatted;
        txt.innerText = formatted ? `Legenda: ${formatted}` : 'Escrever Legenda';
        icon.setAttribute('data-lucide', 'edit-3');
        if (window.lucide) lucide.createIcons();

        input.style.display = 'none';
        ccRenderAll();
    } else {
        ccIsWritingLabel = true;
        btn.classList.add('active-writing');
        txt.innerText = 'Concluir (OK)';
        icon.setAttribute('data-lucide', 'check');
        if (window.lucide) lucide.createIcons();

        input.value = ccSelectedPart.label || '';
        input.style.left = ccSelectedPart.x + 'px';
        input.style.top = (ccSelectedPart.y - 30) + 'px';
        input.style.display = 'block';
        input.focus();
        input.select();
    }
}

document.getElementById('ccInlineLabelInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        ccToggleEditLabel();
    } else if (e.key === 'Escape') {
        ccIsWritingLabel = false;
        document.getElementById('ccInlineLabelInput').style.display = 'none';
        document.getElementById('cc-btn-label-edit').classList.remove('active-writing');
    }
});

function ccUpdateLabelButton() {
    const btn = document.getElementById('cc-btn-label-edit');
    const txt = document.getElementById('cc-btn-label-text');
    if (ccSelectedPart) {
        btn.style.display = 'flex';
        txt.innerText = ccSelectedPart.label ? `Legenda: ${ccSelectedPart.label}` : 'Escrever Legenda';
    } else {
        btn.style.display = 'none';
        if (ccIsWritingLabel) {
            ccIsWritingLabel = false;
            document.getElementById('ccInlineLabelInput').style.display = 'none';
        }
    }
}

function ccRotateSelected() {
    if (ccSelectedPart) {
        const oldTerms = ccGetPartAbsoluteTerminals(ccSelectedPart);
        ccSelectedPart.rotation = ((ccSelectedPart.rotation || 0) + 90) % 360;
        const newTerms = ccGetPartAbsoluteTerminals(ccSelectedPart);

        oldTerms.forEach((ot, idx) => {
            const nt = newTerms[idx];
            ccState.wires.forEach(w => {
                if (Math.hypot(w.x1 - ot.x, w.y1 - ot.y) <= 4) { w.x1 = nt.x; w.y1 = nt.y; }
                if (Math.hypot(w.x2 - ot.x, w.y2 - ot.y) <= 4) { w.x2 = nt.x; w.y2 = nt.y; }
            });
        });

        ccRenderAll();
    }
}

function ccDeleteSelected() {
    if (ccSelectedPart) {
        ccState.parts = ccState.parts.filter(p => p !== ccSelectedPart);
        ccSelectedPart = null;
        ccUpdateLabelButton();
        ccRenderAll();
    } else if (ccSelectedWire) {
        ccState.wires = ccState.wires.filter(w => w !== ccSelectedWire);
        ccSelectedWire = null;
        ccRenderAll();
    }
}

function ccClearCircuit() {
    if (confirm("Limpar todo o circuito no CCnotes?")) {
        ccState.parts = [];
        ccState.wires = [];
        ccState.annotations = [];
        ccSelectedPart = null;
        ccSelectedWire = null;
        ccWireStart = null;
        resetComponentCounters(); // Reinicia legendas (R1, V1, etc.)
        ccUpdateLabelButton();
        ccRenderAll();
    }
}

// Eventos de Ponteiro do CCnotes SVG Canvas
const ccSvg = document.getElementById('ccSvgCanvas');

ccSvg.addEventListener('pointerdown', (e) => {
    // Rejeição rigorosa de palma e toque com a mão: só permite caneta stylus (pen) ou rato/touchpad (mouse) para inserir componentes e traçar fios
    if (ccTool === 'part' && ccSelectedSymbol && e.pointerType === 'touch') {
        return;
    }
    if (ccTool === 'wire' && e.pointerType === 'touch') {
        return;
    }

    const p = ccPos(e);
    let sn = { x: ccSnap(p.x), y: ccSnap(p.y) };

    const nearby = ccFindNearbyTerminal(p.x, p.y, 18);
    if (nearby) {
        sn = { x: nearby.x, y: nearby.y };
    }

    if (ccTool === 'part' && ccSelectedSymbol) {
        const size = ccIsFixed ? 30 : 50;
        const nextLbl = ccGetNextLabel(ccSelectedSymbol);
        const newPart = {
            id: ccUid(),
            symbol: ccSelectedSymbol,
            x: sn.x,
            y: sn.y,
            size: size,
            rotation: 0,
            label: nextLbl
        };
        ccAutoCutWiresUnderPart(sn.x, sn.y, size);
        ccState.parts.push(newPart);
        ccSelectedPart = newPart;
        // Mantém ccTool = 'part' para inserção contínua de múltiplos componentes seguidos (Item 5)
        ccUpdateLabelButton();
        ccRenderAll();
        return;
    }

    if (ccTool === 'wire') {
        if (!ccWireStart) {
            // 1º Clique: fixa o ponto de início do fio
            ccWireStart = sn;
            ccDrawWirePreview(sn);
        } else {
            // 2º Clique: coneta o fio no destino e CONCLUI imediatamente!
            ccAddOrthogonalWire(ccWireStart, sn);
            ccWireStart = null;
            ccSelectedWire = null;
            document.getElementById('ccPreviewLayer').innerHTML = '';
            document.getElementById('ccSnapPinIndicator').innerHTML = '';
            ccRenderAll();
        }
        return;
    }

    ccSelectedPart = null;
    ccSelectedWire = null;
    ccUpdateLabelButton();
    ccRenderAll();
});

ccSvg.addEventListener('pointermove', (e) => {
    const p = ccPos(e);

    if (ccDimDragHandle) {
        const delta = Math.abs(e.clientX - ccDimDragHandle.startX);
        const newSize = Math.max(20, Math.min(160, ccDimDragHandle.startSize + delta));
        const oldTerms = ccGetPartAbsoluteTerminals(ccDimDragHandle.part);
        ccDimDragHandle.part.size = newSize;
        const newTerms = ccGetPartAbsoluteTerminals(ccDimDragHandle.part);

        oldTerms.forEach((ot, idx) => {
            const nt = newTerms[idx];
            if (nt) {
                ccState.wires.forEach(w => {
                    if (Math.hypot(w.x1 - ot.x, w.y1 - ot.y) <= 4) { w.x1 = nt.x; w.y1 = nt.y; }
                    if (Math.hypot(w.x2 - ot.x, w.y2 - ot.y) <= 4) { w.x2 = nt.x; w.y2 = nt.y; }
                });
            }
        });
        ccRenderAll();
        return;
    }

    if (ccDrag) {
        if (ccDrag.annotation) {
            ccDrag.annotation.x = ccSnap(p.x + ccDrag.dx);
            ccDrag.annotation.y = ccSnap(p.y + ccDrag.dy);
            ccRenderAll();
            return;
        }

        const oldTerms = ccGetPartAbsoluteTerminals(ccDrag.part);
        const newX = ccSnap(p.x + ccDrag.dx);
        const newY = ccSnap(p.y + ccDrag.dy);
        ccDrag.part.x = newX;
        ccDrag.part.y = newY;
        const newTerms = ccGetPartAbsoluteTerminals(ccDrag.part);

        oldTerms.forEach((ot, idx) => {
            const nt = newTerms[idx];
            ccState.wires.forEach(w => {
                if (Math.hypot(w.x1 - ot.x, w.y1 - ot.y) <= 4) {
                    w.x1 = nt.x; w.y1 = nt.y;
                }
                if (Math.hypot(w.x2 - ot.x, w.y2 - ot.y) <= 4) {
                    w.x2 = nt.x; w.y2 = nt.y;
                }
            });
        });

        ccRenderAll();
        return;
    }

    if (ccTool === 'wire') {
        const snapIndicatorG = document.getElementById('ccSnapPinIndicator');
        snapIndicatorG.innerHTML = '';
        const nearby = ccFindNearbyTerminal(p.x, p.y, 18);
        const targetPoint = nearby ? { x: nearby.x, y: nearby.y } : { x: ccSnap(p.x), y: ccSnap(p.y) };
        ccLastWireTarget = targetPoint;

        if (nearby) {
            ccSvgEl('circle', { cx: nearby.x, cy: nearby.y, r: 6, fill: '#22c55e', stroke: '#fff', 'stroke-width': 2 }, snapIndicatorG);
        }

        if (ccWireStart) {
            ccDrawWirePreview(targetPoint);
        }
    }
});

window.addEventListener('pointerup', () => {
    if (ccDrag) ccDrag = null;
    if (ccDimDragHandle) ccDimDragHandle = null;
});

let ccWireCornerMode = 'auto'; // 'auto', 'HV', 'VH'
let ccLastWireTarget = null;

function ccGetWirePath(a, b, preferredMode = ccWireCornerMode) {
    if (a.x === b.x || a.y === b.y) {
        return [[a.x, a.y, b.x, b.y]];
    }

    let isVH = false;
    if (preferredMode === 'VH') {
        isVH = true;
    } else if (preferredMode === 'HV') {
        isVH = false;
    } else {
        // Modo inteligente 'auto': verifica rotação dos componentes conectados
        const termA = ccFindNearbyTerminal(a.x, a.y, 8);
        if (termA && termA.part) {
            const rot = (termA.part.rotation || 0) % 360;
            if (rot === 90 || rot === 270) {
                isVH = true; // Componente vertical: sai na vertical
            } else {
                isVH = false; // Componente horizontal: sai na horizontal
            }
        } else {
            const termB = ccFindNearbyTerminal(b.x, b.y, 8);
            if (termB && termB.part) {
                const rot = (termB.part.rotation || 0) % 360;
                if (rot === 90 || rot === 270) {
                    isVH = false; // Entra na vertical
                } else {
                    isVH = true; // Entra na horizontal
                }
            }
        }
    }

    if (isVH) {
        // Vertical depois Horizontal
        return [
            [a.x, a.y, a.x, b.y],
            [a.x, b.y, b.x, b.y]
        ];
    } else {
        // Horizontal depois Vertical
        return [
            [a.x, a.y, b.x, a.y],
            [b.x, a.y, b.x, b.y]
        ];
    }
}

function ccAddOrthogonalWire(a, b) {
    if (a.x === b.x && a.y === b.y) return;
    const segs = ccGetWirePath(a, b);
    segs.forEach(([x1, y1, x2, y2]) => {
        if (x1 !== x2 || y1 !== y2) {
            ccState.wires.push({ id: ccUid(), x1, y1, x2, y2 });
        }
    });
    ccRenderAll();
}

function ccDrawWirePreview(b) {
    const pv = document.getElementById('ccPreviewLayer');
    pv.innerHTML = '';
    if (!ccWireStart || !b) return;
    const a = ccWireStart;
    const segs = ccGetWirePath(a, b);
    let d = '';
    segs.forEach(([x1, y1, x2, y2], idx) => {
        if (idx === 0) d += `M${x1} ${y1}L${x2} ${y2}`;
        else d += `L${x2} ${y2}`;
    });
    ccSvgEl('path', {
        d: d,
        stroke: '#0284c7',
        'stroke-dasharray': '4,4',
        fill: 'none',
        'stroke-width': 2.5
    }, pv);
    ccSvgEl('circle', { cx: a.x, cy: a.y, r: 4.5, fill: '#0284c7' }, pv);
    ccSvgEl('circle', { cx: b.x, cy: b.y, r: 4, fill: '#22c55e', stroke: '#fff', 'stroke-width': 1.5 }, pv);
}

// --------------------------------------------------------
// Inserir / Atualizar Circuito na Folha de Notas (Ponto 2 & 4)
// Totalmente limpo: sem caixas, sem bordas e sem pontos azuis!
// --------------------------------------------------------
function inserirCircuitoNaNota() {
    if (ccState.parts.length === 0 && ccState.wires.length === 0) {
        alert("Desenhe primeiro algum componente ou fio no circuito antes de o inserir.");
        return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ccState.wires.forEach(w => {
        minX = Math.min(minX, w.x1, w.x2);
        minY = Math.min(minY, w.y1, w.y2);
        maxX = Math.max(maxX, w.x1, w.x2);
        maxY = Math.max(maxY, w.y1, w.y2);
    });
    ccState.parts.forEach(p => {
        const h = p.size / 2;
        minX = Math.min(minX, p.x - h - 16);
        minY = Math.min(minY, p.y - h - 25);
        maxX = Math.max(maxX, p.x + h + 30);
        maxY = Math.max(maxY, p.y + h + 25);
    });
    (ccState.annotations || []).forEach(ann => {
        minX = Math.min(minX, ann.x - 10);
        minY = Math.min(minY, ann.y - 20);
        maxX = Math.max(maxX, ann.x + 120);
        maxY = Math.max(maxY, ann.y + 20);
    });

    const pad = 16;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const width = Math.max(100, maxX - minX);
    const height = Math.max(80, maxY - minY);

    const svgClone = document.createElementNS(CC_NS, 'svg');
    svgClone.setAttribute('width', width);
    svgClone.setAttribute('height', height);
    svgClone.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);
    svgClone.style.background = 'transparent';

    const gWires = document.getElementById('ccWiresLayer').cloneNode(true);
    const gJunc = document.getElementById('ccJunctionsLayer').cloneNode(true);
    const gParts = document.getElementById('ccComponentsLayer').cloneNode(true);
    const gAnn = document.getElementById('ccAnnotationsLayer').cloneNode(true);

    // REMOVER BORDAS E PONTOS AZUIS COMPLETAMENTE (Ponto 2)
    gParts.querySelectorAll('rect[stroke="#0284c7"], circle.cc-dim-handle, circle.cc-pin-dot').forEach(r => r.remove());

    svgClone.appendChild(gWires);
    svgClone.appendChild(gJunc);
    svgClone.appendChild(gParts);
    svgClone.appendChild(gAnn);

    const svgXml = new XMLSerializer().serializeToString(svgClone);
    const snapshotData = JSON.parse(JSON.stringify(ccState));

    // Se estiver a editar um bloco existente, atualiza o próprio bloco (Ponto 4)
    if (ccEditingBlock && document.body.contains(ccEditingBlock)) {
        ccEditingBlock.dataset.svgRaw = svgXml;
        ccEditingBlock.dataset.circuitData = JSON.stringify(snapshotData);
        const inner = ccEditingBlock.querySelector('.circuit-inner-svg');
        if (inner) inner.innerHTML = svgXml;
        ccEditingBlock = null;
    } else {
        const spawnX = Math.max(40, (A4_WIDTH - width) / 2);
        const spawnY = Math.max(80, Math.min(A4_HEIGHT - height - 100, workspace.scrollTop + 140));
        criarBlocoCircuitoNaFolha(svgXml, spawnX, spawnY, 1.0, 0, snapshotData);
    }

    resetComponentCounters(); // Novo circuito elétrico futuro começará do início (R1, V1, etc.)
    fecharCCnotesModal();
    salvarNoLocalStorage();
}

// --------------------------------------------------------
// Inicialização ao Carregar a Página
// --------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
    carregarDoLocalStorage();
    const tabData = getTabData(activeNotebook, activeTab);
    const initialPage = tabData.pages[tabData.currentPage || 0];
    if (initialPage) {
        templateIdx = initialPage.templateIdx ?? 0;
        currentStrokes = JSON.parse(JSON.stringify(initialPage.strokes || []));
        (initialPage.blocks || []).forEach(b => {
            criarBlocoTexto(b.text, b.left, b.top, b.fontSize, b.rotation);
        });
        (initialPage.circuits || []).forEach(c => {
            criarBlocoCircuitoNaFolha(c.svg, c.left, c.top, c.scale, c.rotation, c.circuitData);
        });
    }
    renderBackground();
    renderCadernosSidebar();
    redrawStrokes();
    aplicarZoom();
    atualizarContadorFolhas();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
});

// Fechar dropdowns e modais ao clicar fora
window.addEventListener('click', (e) => {
    if (!e.target.closest('.tool-group') && !e.target.closest('.dropdown-menu')) {
        closeAllDropdowns();
    }
    if (!e.target.closest('.word-symbols-modal') && !e.target.closest('#btn-word-symbols') && !e.target.closest('[onclick*="toggleWordSymbolsModal"]')) {
        document.getElementById('wordSymbolsModal').classList.remove('active');
    }
});
