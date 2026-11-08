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

// Sistema de Sensibilidade à Pressão do Traço
let isPressureEnabled = localStorage.getItem('mignotes_pressure_enabled') !== 'false';

function setPressureSensitivity(enabled) {
    isPressureEnabled = !!enabled;
    try {
        localStorage.setItem('mignotes_pressure_enabled', isPressureEnabled ? 'true' : 'false');
    } catch(e) {}
    const globalChk = document.getElementById('chk-pressure-global');
    if (globalChk) globalChk.checked = isPressureEnabled;
    document.querySelectorAll('.chk-pressure-input').forEach(chk => {
        chk.checked = isPressureEnabled;
    });
}

let isDrawing = false; esconderApagadorQuadro();
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
const TEMPLATES = ['blank', 'grid_5mm', 'lines_margin', 'dots', 'milimetrico'];
const TEMPLATE_NAMES = {
    'grid_5mm': 'Quadriculada 5mm',
    'lines_margin': 'Pautada c/ Margem',
    'dots': 'Pontilhada',
    'blank': 'Lisa',
    'milimetrico': 'Milimétrico Engenharia'
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
    } else if (mode === 'milimetrico') {
        // Papel Milimétrico Técnico de Engenharia (Milimétrico fino 5px e maior 25px)
        templateCtx.strokeStyle = '#fed7aa';
        templateCtx.lineWidth = 0.5;
        for (let x = 0; x <= templateCanvas.width; x += 5) {
            templateCtx.beginPath();
            templateCtx.moveTo(x + 0.5, 0);
            templateCtx.lineTo(x + 0.5, templateCanvas.height);
            templateCtx.stroke();
        }
        for (let y = 0; y <= templateCanvas.height; y += 5) {
            templateCtx.beginPath();
            templateCtx.moveTo(0, y + 0.5);
            templateCtx.lineTo(templateCanvas.width, y + 0.5);
            templateCtx.stroke();
        }
        templateCtx.strokeStyle = '#f97316';
        templateCtx.lineWidth = 1;
        for (let x = 0; x <= templateCanvas.width; x += 25) {
            templateCtx.beginPath();
            templateCtx.moveTo(x + 0.5, 0);
            templateCtx.lineTo(x + 0.5, templateCanvas.height);
            templateCtx.stroke();
        }
        for (let y = 0; y <= templateCanvas.height; y += 25) {
            templateCtx.beginPath();
            templateCtx.moveTo(0, y + 0.5);
            templateCtx.lineTo(templateCanvas.width, y + 0.5);
            templateCtx.stroke();
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
// Controlo de Zoom Calibrado e Contínuo (-20% e +25% até 300%)
// --------------------------------------------------------
let currentZoomScale = 1.0;
let panX = 0;
let panY = 0;

function atualizarTransformFolha() {
    if (!paperWrapper) return;
    paperWrapper.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoomScale})`;
    paperWrapper.style.transformOrigin = 'center top';
}

function aplicarZoom(smoothScale = null) {
    if (smoothScale !== null) {
        currentZoomScale = Math.max(0.4, Math.min(3.0, smoothScale));
        // Atualiza o índice mais próximo do nível
        let closestIdx = 0, minDiff = Infinity;
        ZOOM_LEVELS.forEach((z, idx) => {
            const diff = Math.abs(z - currentZoomScale);
            if (diff < minDiff) { minDiff = diff; closestIdx = idx; }
        });
        currentZoomIdx = closestIdx;
    } else {
        currentZoomScale = ZOOM_LEVELS[currentZoomIdx] || 1.0;
    }
    atualizarTransformFolha();
    const txt = document.getElementById('zoom-level-text');
    if (txt) txt.innerText = `${Math.round(currentZoomScale * 100)}%`;
}

function zoomAumentar() {
    if (currentZoomIdx < ZOOM_LEVELS.length - 1) {
        currentZoomIdx++;
        currentZoomScale = ZOOM_LEVELS[currentZoomIdx];
        aplicarZoom();
    }
}

function zoomDiminuir() {
    if (currentZoomIdx > 0) {
        currentZoomIdx--;
        currentZoomScale = ZOOM_LEVELS[currentZoomIdx];
        aplicarZoom();
    }
}

function zoomReset() {
    currentZoomIdx = 3; // 1.0 (100%)
    currentZoomScale = 1.0;
    panX = 0;
    panY = 0;
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
// Motor de Traço Fluido Suave & Redesenho
// --------------------------------------------------------
function renderSmoothFreeStroke(ctx, stroke) {
    if (!stroke.segments || stroke.segments.length === 0) return;

    ctx.save();
    const isPencil = (stroke.tool === 'pencil');
    const isHigh = stroke.isHighlighter || (stroke.tool === 'highlighter');

    if (isHigh) {
        ctx.globalAlpha = 0.42;
        ctx.strokeStyle = stroke.color;
        ctx.fillStyle = stroke.color;
    } else if (isPencil) {
        ctx.globalAlpha = 0.72;
        ctx.strokeStyle = stroke.color;
        ctx.fillStyle = stroke.color;
    } else {
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = stroke.color;
        ctx.fillStyle = stroke.color;
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let seg of stroke.segments) {
        if (!seg || seg.length === 0) continue;
        if (seg.length === 1) {
            const p = seg[0];
            const w = p.width || stroke.size;
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(0.5, w / 2), 0, Math.PI * 2);
            ctx.fill();
            continue;
        }

        if (seg.length === 2) {
            const p0 = seg[0], p1 = seg[1];
            ctx.lineWidth = ((p0.width || stroke.size) + (p1.width || stroke.size)) / 2;
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
            continue;
        }

        // Interpolação Spline com Curvas Quadráticas de Ponto Médio
        ctx.beginPath();
        ctx.moveTo(seg[0].x, seg[0].y);

        for (let i = 1; i < seg.length - 1; i++) {
            const curr = seg[i];
            const next = seg[i + 1];
            const midX = (curr.x + next.x) / 2;
            const midY = (curr.y + next.y) / 2;
            ctx.lineWidth = curr.width || stroke.size;
            ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
        }

        const last = seg[seg.length - 1];
        const prev = seg[seg.length - 2];
        ctx.lineWidth = last.width || stroke.size;
        ctx.quadraticCurveTo(prev.x, prev.y, last.x, last.y);
        ctx.stroke();
    }
    ctx.restore();
}

function redrawStrokes() {
    paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    highlighterCtx.clearRect(0, 0, highlighterCanvas.width, highlighterCanvas.height);

    for (let s of currentStrokes) {
        const targetCtx = s.isHighlighter ? highlighterCtx : paintCtx;

        if (s.type === 'free') {
            renderSmoothFreeStroke(targetCtx, s);
        } else if (s.type === 'shape') {
            targetCtx.save();
            targetCtx.strokeStyle = s.color;
            targetCtx.fillStyle = s.color;
            targetCtx.lineWidth = s.size;
            targetCtx.lineCap = 'round';
            targetCtx.lineJoin = 'round';
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
    if (eraserMode === 'box') {
        eraseBox(x, y, 68, 48);
        return;
    }
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
// Suporte total a Stylus (escrita fina) e Gestos Táteis com Dedos (Pan e Pinch-to-zoom sem riscos)
// --------------------------------------------------------
const activeTouchMap = new Map();
let touchPinchDist0 = 0;
let touchPinchZoom0 = 1.0;
let touchLastMid = null;

paintCanvas.addEventListener('pointerdown', (e) => {
    closeAllDropdowns();

    // Toque com dedos/palma da mão: reservado para navegação fluida e Apagador de Quadro (Item 8)
    if (e.pointerType === 'touch') {
        activeTouchMap.set(e.pointerId, { x: e.clientX, y: e.clientY });
        
        // Item 8: Ao tocar com 1 dedo com a borracha em modo Apagador de Quadro, apaga o que estiver por baixo
        if (activeTouchMap.size === 1 && currentTool === 'eraser' && eraserMode === 'box') {
            isDrawing = true;
            cadernoSalvarHistorico();
            const rawTouch = getCoordinates(e);
            lastCoord = rawTouch;
            handleEraser(rawTouch.x, rawTouch.y);
            mostrarApagadorQuadro(e.clientX, e.clientY);
            return;
        }

        if (activeTouchMap.size === 1) {
            touchLastMid = { x: e.clientX, y: e.clientY };
        } else if (activeTouchMap.size >= 2) {
            esconderApagadorQuadro();
            const pts = Array.from(activeTouchMap.values());
            touchPinchDist0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            touchPinchZoom0 = currentZoomScale;
            touchLastMid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        }
        return;
    }

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
        cadernoSalvarHistorico();
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
        cadernoSalvarHistorico();
        isDrawing = true;
        handleEraser(raw.x, raw.y);
        return;
    }

    if (currentTool === 'select') {
        const shape = findShapeAt(raw.x, raw.y);
        if (shape) {
            cadernoSalvarHistorico();
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
    cadernoSalvarHistorico();

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
        const isPencil = (currentTool === 'pencil');
        let initialWidth = currentSize;

        if (isHigh) {
            initialWidth = Math.max(14, currentSize * 3.5);
        } else if (isPencil) {
            initialWidth = Math.max(0.8, currentSize * 0.75 * (isPressureEnabled && raw.pressure > 0 && e.pointerType !== 'mouse' ? (0.45 + raw.pressure * 1.1) : 1));
        } else {
            if (isPressureEnabled && raw.pressure > 0 && e.pointerType !== 'mouse') {
                initialWidth = Math.max(1, currentSize * (0.35 + raw.pressure * 1.3));
            } else {
                initialWidth = currentSize;
            }
        }

        const stroke = {
            type: 'free',
            tool: currentTool,
            color: currentColor,
            size: currentSize,
            isHighlighter: isHigh,
            segments: [[{ x: raw.x, y: raw.y, pressure: raw.pressure, width: initialWidth, time: Date.now() }]]
        };
        currentStrokes.push(stroke);
    }
});

paintCanvas.addEventListener('pointermove', (e) => {
    // Toque com os dedos: nunca desenha, navegação tátil é delegada ao window
    if (e.pointerType === 'touch') return;

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
        if (eraserMode === 'box') mostrarApagadorQuadro(e.clientX, e.clientY);
        return;
    }

    if (currentTool === 'pen' || currentTool === 'pencil' || currentTool === 'highlighter') {
        const activeStroke = currentStrokes[currentStrokes.length - 1];
        if (activeStroke && activeStroke.type === 'free') {
            const lastSeg = activeStroke.segments[activeStroke.segments.length - 1];
            const prevPt = lastSeg[lastSeg.length - 1];
            const isHigh = activeStroke.isHighlighter || (activeStroke.tool === 'highlighter');
            const isPencil = (activeStroke.tool === 'pencil');

            let ptWidth = activeStroke.size;
            if (isHigh) {
                ptWidth = Math.max(14, activeStroke.size * 3.5);
            } else if (isPencil) {
                if (isPressureEnabled && raw.pressure > 0 && e.pointerType !== 'mouse') {
                    ptWidth = Math.max(0.8, activeStroke.size * 0.75 * (0.45 + raw.pressure * 1.1));
                } else {
                    ptWidth = Math.max(0.8, activeStroke.size * 0.75);
                }
            } else {
                // Caneta de alta precisão com suporte dinâmico a pressão e velocidade
                if (isPressureEnabled && raw.pressure > 0 && e.pointerType !== 'mouse') {
                    ptWidth = Math.max(1, activeStroke.size * (0.35 + raw.pressure * 1.3));
                } else {
                    const dt = Math.max(1, Date.now() - (prevPt.time || Date.now()));
                    const dist = Math.hypot(raw.x - prevPt.x, raw.y - prevPt.y);
                    const speed = dist / dt;
                    const speedFactor = Math.max(0.65, Math.min(1.25, 1.0 - (speed * 0.08)));
                    ptWidth = Math.max(1, activeStroke.size * speedFactor);
                }
            }

            const newPt = { x: raw.x, y: raw.y, pressure: raw.pressure, width: ptWidth, time: Date.now() };
            lastSeg.push(newPt);

            const targetCtx = isHigh ? highlighterCtx : paintCtx;
            targetCtx.save();
            if (isHigh) targetCtx.globalAlpha = 0.42;
            else if (isPencil) targetCtx.globalAlpha = 0.72;
            else targetCtx.globalAlpha = 1.0;

            targetCtx.strokeStyle = activeStroke.color;
            targetCtx.fillStyle = activeStroke.color;
            targetCtx.lineCap = 'round';
            targetCtx.lineJoin = 'round';

            const len = lastSeg.length;
            if (len === 2) {
                const p0 = lastSeg[0], p1 = lastSeg[1];
                targetCtx.lineWidth = (p0.width + p1.width) / 2;
                targetCtx.beginPath();
                targetCtx.moveTo(p0.x, p0.y);
                targetCtx.lineTo(p1.x, p1.y);
                targetCtx.stroke();
            } else if (len >= 3) {
                // Curva quadrática com ponto médio (Midpoint Quadratic Bezier)
                const pPrev2 = lastSeg[len - 3];
                const pPrev = lastSeg[len - 2];
                const pCurr = lastSeg[len - 1];

                const mid1X = (pPrev2.x + pPrev.x) / 2;
                const mid1Y = (pPrev2.y + pPrev.y) / 2;
                const mid2X = (pPrev.x + pCurr.x) / 2;
                const mid2Y = (pPrev.y + pCurr.y) / 2;

                targetCtx.lineWidth = pPrev.width;
                targetCtx.beginPath();
                targetCtx.moveTo(mid1X, mid1Y);
                targetCtx.quadraticCurveTo(pPrev.x, pPrev.y, mid2X, mid2Y);
                targetCtx.stroke();
            }
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

// Manipulação Global de Gestos Táteis (1 Dedo = Pan Livre / 2 Dedos = Pinch-to-Zoom Contínuo)
const workspaceElement = document.getElementById('workspace');
if (workspaceElement) {
    workspaceElement.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') {
            activeTouchMap.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (activeTouchMap.size === 1) {
                touchLastMid = { x: e.clientX, y: e.clientY };
            } else if (activeTouchMap.size >= 2) {
                const pts = Array.from(activeTouchMap.values());
                touchPinchDist0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
                touchPinchZoom0 = currentZoomScale;
                touchLastMid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
            }
        }
    });
}

window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') {
        if (!activeTouchMap.has(e.pointerId)) return;
        activeTouchMap.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (activeTouchMap.size === 1) {
            // 1 dedo: arrastar a folha para os lados e para cima/baixo livremente (Pan livre na vertical e horizontal)
            const currentPt = activeTouchMap.get(e.pointerId);
            if (touchLastMid) {
                const dx = currentPt.x - touchLastMid.x;
                const dy = currentPt.y - touchLastMid.y;
                panX += dx;
                panY += dy;
                atualizarTransformFolha();
            }
            touchLastMid = { x: currentPt.x, y: currentPt.y };
        } else if (activeTouchMap.size >= 2) {
            // 2 dedos: pinch-to-zoom contínuo (ampliar e reduzir a folha) + deslocamento conjunto
            const pts = Array.from(activeTouchMap.values());
            const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            const currentMid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };

            if (touchPinchDist0 > 0) {
                const scaleFactor = currentDist / touchPinchDist0;
                currentZoomScale = Math.max(0.4, Math.min(3.0, touchPinchZoom0 * scaleFactor));
            }

            if (touchLastMid) {
                const dx = currentMid.x - touchLastMid.x;
                const dy = currentMid.y - touchLastMid.y;
                panX += dx;
                panY += dy;
            }
            touchLastMid = currentMid;
            atualizarTransformFolha();
            const txt = document.getElementById('zoom-level-text');
            if (txt) txt.innerText = `${Math.round(currentZoomScale * 100)}%`;
        }
    }
});

window.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') {
        activeTouchMap.delete(e.pointerId);
        if (activeTouchMap.size === 1) {
            const remaining = Array.from(activeTouchMap.values())[0];
            touchLastMid = { x: remaining.x, y: remaining.y };
        } else if (activeTouchMap.size === 0) {
            touchLastMid = null;
            touchPinchDist0 = 0;
        }
        return;
    }

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
        if (currentTool === 'pen' || currentTool === 'pencil' || currentTool === 'highlighter') {
            const activeStroke = currentStrokes[currentStrokes.length - 1];
            if (activeStroke && activeStroke.type === 'free' && activeStroke.segments) {
                const lastSeg = activeStroke.segments[activeStroke.segments.length - 1];
                if (lastSeg && lastSeg.length === 1) {
                    const targetCtx = activeStroke.isHighlighter ? highlighterCtx : paintCtx;
                    targetCtx.save();
                    if (activeStroke.isHighlighter) targetCtx.globalAlpha = 0.42;
                    else if (activeStroke.tool === 'pencil') targetCtx.globalAlpha = 0.72;
                    targetCtx.fillStyle = activeStroke.color;
                    targetCtx.beginPath();
                    targetCtx.arc(lastSeg[0].x, lastSeg[0].y, Math.max(0.5, (lastSeg[0].width || activeStroke.size) / 2), 0, Math.PI * 2);
                    targetCtx.fill();
                    targetCtx.restore();
                } else if (lastSeg && lastSeg.length >= 3) {
                    const pPrev = lastSeg[lastSeg.length - 2];
                    const pLast = lastSeg[lastSeg.length - 1];
                    const midX = (pPrev.x + pLast.x) / 2;
                    const midY = (pPrev.y + pLast.y) / 2;
                    const targetCtx = activeStroke.isHighlighter ? highlighterCtx : paintCtx;
                    targetCtx.save();
                    if (activeStroke.isHighlighter) targetCtx.globalAlpha = 0.42;
                    else if (activeStroke.tool === 'pencil') targetCtx.globalAlpha = 0.72;
                    targetCtx.strokeStyle = activeStroke.color;
                    targetCtx.lineWidth = pLast.width || activeStroke.size;
                    targetCtx.lineCap = 'round';
                    targetCtx.beginPath();
                    targetCtx.moveTo(midX, midY);
                    targetCtx.lineTo(pLast.x, pLast.y);
                    targetCtx.stroke();
                    targetCtx.restore();
                }
            }
        }
        salvarNoLocalStorage();
    }
});

window.addEventListener('pointercancel', (e) => {
    if (e.pointerType === 'touch') {
        activeTouchMap.delete(e.pointerId);
        if (activeTouchMap.size === 0) {
            touchLastMid = null;
            touchPinchDist0 = 0;
        }
    }
});

// --------------------------------------------------------
// Motor de OCR Fiel dos Traços Manuscritos (Reconhecimento Real Online/Offline)
// --------------------------------------------------------

// Correção Ortográfica Inteligente para Escrita e Apontamentos Escolares/Técnicos
function corrigirOrtografia(texto) {
    if (!texto) return '';
    let t = texto;

    // Correções de confusões de caracteres comuns de OCR dentro de palavras
    t = t.replace(/(\b[a-záàâãéèêíóôõúç]+)0([a-záàâãéèêíóôõúç]+\b)/gi, '$1o$2');
    t = t.replace(/(\b[a-záàâãéèêíóôõúç]+)1([a-záàâãéèêíóôõúç]+\b)/gi, '$1i$2');
    t = t.replace(/(\b[a-záàâãéèêíóôõúç]+)5([a-záàâãéèêíóôõúç]+\b)/gi, '$1s$2');

    // Dicionário de termos comuns escolares e técnicos com acentuação e ortografia correta
    const dic = {
        'tensao': 'tensão', 'tensoes': 'tensões',
        'resistencia': 'resistência', 'resistencias': 'resistências',
        'potencia': 'potência', 'potencias': 'potências',
        'eletrica': 'elétrica', 'eletrico': 'elétrico', 'eletricas': 'elétricas', 'eletricos': 'elétricos',
        'circuito': 'circuito', 'circuitos': 'circuitos',
        'corrente': 'corrente', 'correntes': 'correntes',
        'indutancia': 'indutância', 'capacitancia': 'capacitância',
        'frequencia': 'frequência', 'frequencias': 'frequências',
        'calculo': 'cálculo', 'calculos': 'cálculos',
        'formula': 'fórmula', 'formulas': 'fórmulas',
        'fisica': 'física', 'quimica': 'química', 'matematica': 'matemática',
        'laboratorio': 'laboratório', 'relatorio': 'relatório',
        'exercicio': 'exercício', 'exercicios': 'exercícios',
        'horario': 'horário', 'horarios': 'horários',
        'modulo': 'módulo', 'modulos': 'módulos',
        'teoria': 'teoria', 'teorico': 'teórico', 'teoricos': 'teóricos',
        'ligacao': 'ligação', 'ligacoes': 'ligações',
        'conclusao': 'conclusão', 'conclusoes': 'conclusões',
        'diodo': 'díodo', 'diodos': 'díodos',
        'analise': 'análise', 'ohmico': 'óhmico',
        'paragrafo': 'parágrafo', 'paragrafos': 'parágrafos',
        'numero': 'número', 'numeros': 'números',
        'pagina': 'página', 'paginas': 'páginas',
        'periodo': 'período', 'periodos': 'períodos'
    };

    for (const [err, corr] of Object.entries(dic)) {
        const re = new RegExp('\\b' + err + '\\b', 'gi');
        t = t.replace(re, corr);
    }
    return t;
}

// ========================================================
// Formatação Gramatical Inteligente para OCR
// Regras Estritas: 
// 1. A primeira letra é sempre maiúscula (início de frase/parágrafo).
// 2. Respeita normas gramaticais (nomes próprios, países, cientistas com maiúscula inicial).
// 3. O restante é estritamente minúsculo.
// ========================================================
function formatarTextoGramatical(texto) {
    if (!texto) return '';
    // Aplica correção ortográfica primeiro
    let s = corrigirOrtografia(texto.trim());
    // Converte tudo para minúsculas primeiro para garantir que o resto fica estritamente minúsculo
    s = s.toLowerCase();

    // 1. Primeira letra de cada frase em maiúscula (início do texto, quebras de linha ou após . ! ?)
    s = s.replace(/(^|[.!?\n]\s*)([a-záàâãéèêíóôõúç])/gu, (match, prefix, char) => {
        return prefix + char.toUpperCase();
    });

    // 2. Nomes próprios, países, cidades e cientistas com maiúscula inicial e acentuação gramatical rigorosa
    const properNounsMap = {
        'portugal': 'Portugal', 'brasil': 'Brasil', 'espanha': 'Espanha',
        'franca': 'França', 'frança': 'França', 'alemanha': 'Alemanha',
        'italia': 'Itália', 'itália': 'Itália', 'inglaterra': 'Inglaterra', 'reino unido': 'Reino Unido',
        'lisboa': 'Lisboa', 'porto': 'Porto', 'coimbra': 'Coimbra', 'braga': 'Braga', 'aveiro': 'Aveiro', 'faro': 'Faro',
        'setubal': 'Setúbal', 'setúbal': 'Setúbal', 'viseu': 'Viseu', 'leiria': 'Leiria',
        'evora': 'Évora', 'évora': 'Évora', 'guimaraes': 'Guimarães', 'guimarães': 'Guimarães',
        'madrid': 'Madrid', 'paris': 'Paris', 'londres': 'Londres', 'berlim': 'Berlim', 'roma': 'Roma', 'washington': 'Washington',
        'europa': 'Europa', 'america': 'América', 'américa': 'América', 'asia': 'Ásia', 'ásia': 'Ásia', 'africa': 'África', 'áfrica': 'África', 'oceania': 'Oceania',
        'maria': 'Maria', 'joao': 'João', 'joão': 'João', 'jose': 'José', 'josé': 'José',
        'manuel': 'Manuel', 'antonio': 'António', 'antónio': 'António', 'ana': 'Ana', 'carlos': 'Carlos', 'pedro': 'Pedro', 'miguel': 'Miguel',
        'tiago': 'Tiago', 'diogo': 'Diogo', 'rui': 'Rui', 'luis': 'Luís', 'luís': 'Luís',
        'andre': 'André', 'andré': 'André', 'jorge': 'Jorge', 'francisco': 'Francisco', 'paulo': 'Paulo',
        'ines': 'Inês', 'inês': 'Inês', 'mariana': 'Mariana', 'beatriz': 'Beatriz', 'carolina': 'Carolina',
        'goncalo': 'Gonçalo', 'gonçalo': 'Gonçalo', 'bernardo': 'Bernardo', 'rita': 'Rita', 'sofia': 'Sofia',
        'ohm': 'Ohm', 'kirchhoff': 'Kirchhoff', 'thevenin': 'Thévenin', 'thévenin': 'Thévenin', 'norton': 'Norton',
        'ampere': 'Ampère', 'ampère': 'Ampère', 'volta': 'Volta',
        'coulomb': 'Coulomb', 'faraday': 'Faraday', 'henry': 'Henry', 'watt': 'Watt', 'hertz': 'Hertz',
        'fourier': 'Fourier', 'laplace': 'Laplace', 'maxwell': 'Maxwell', 'gauss': 'Gauss',
        'joule': 'Joule', 'tesla': 'Tesla', 'siemens': 'Siemens', 'weber': 'Weber', 'nyquist': 'Nyquist', 'bode': 'Bode',
        'newton': 'Newton', 'einstein': 'Einstein'
    };

    for (const [err, corr] of Object.entries(properNounsMap)) {
        const re = new RegExp('\\b' + err + '\\b', 'gi');
        s = s.replace(re, corr);
    }

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

    const minX = bounds.minX ?? 0;
    const minY = bounds.minY ?? 0;
    const areaW = Math.max(100, Math.round((bounds.maxX - minX) + 30));
    const areaH = Math.max(60, Math.round((bounds.maxY - minY) + 30));

    // Ordenar traços horizontalmente (da esquerda para a direita)
    const sortedStrokes = [...strokes].sort((a, b) => {
        const ax = a.segments?.[0]?.[0]?.x ?? 0;
        const bx = b.segments?.[0]?.[0]?.x ?? 0;
        return ax - bx;
    });

    const ink = [];
    let currentT = 0;
    sortedStrokes.forEach(s => {
        if (s.segments) {
            s.segments.forEach(seg => {
                if (seg.length > 0) {
                    const xs = [], ys = [], ts = [];
                    seg.forEach((pt, i) => {
                        xs.push(Math.round(Math.max(5, pt.x - minX + 15)));
                        ys.push(Math.round(Math.max(5, pt.y - minY + 15)));
                        ts.push(currentT + i * 20);
                    });
                    if (seg.length === 1) {
                        // Traço de ponto único (pingo no i, acento ou ponto final)
                        xs.push(xs[0]);
                        ys.push(ys[0]);
                        ts.push(currentT + 20);
                    }
                    currentT += Math.max(40, seg.length * 20 + 30);
                    ink.push([xs, ys, ts]);
                }
            });
        }
    });

    // 1. Tentar Google Handwriting Input API com múltiplos endpoints
    if (ink.length > 0) {
        const endpoints = [
            'https://inputtools.google.com/request?ime=handwriting&app=mobilesearch',
            'https://www.google.com/inputtools/request?ime=handwriting&app=mobilesearch',
            'https://www.google.com.tw/inputtools/request?ime=handwriting&app=mobilesearch'
        ];

        for (let ep of endpoints) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 4000);

                const res = await fetch(ep, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        options: 'enable_pre_space',
                        requests: [{
                            writing_guide: {
                                writing_area_width: areaW,
                                writing_area_height: areaH
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
                        const candidates = data[1][0][1];
                        for (let cand of candidates) {
                            if (cand && cand.trim()) {
                                return cand.trim();
                            }
                        }
                    }
                }
            } catch (e) {}
        }
    }

    // 2. Fallback baseado na geometria dos traços
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
        cadernoSalvarHistorico();
        const textoFormatado = formatarTextoGramatical(input.trim());
        criarBlocoTexto(textoFormatado, minX, minY, 18, 0);
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

    cadernoSalvarHistorico();
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

    // Ordenar linhas de cima para baixo
    linhas.sort((a, b) => a.avgY - b.avgY);

    for (let linha of linhas) {
        // Ordenar traços da linha da esquerda para a direita
        linha.strokes.sort((a, b) => {
            const ax = a.segments?.[0]?.[0]?.x ?? 0;
            const bx = b.segments?.[0]?.[0]?.x ?? 0;
            return ax - bx;
        });
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
// Blocos de Circuito na Folha A4 (Caixa Compacta & Escrita Integrada)
// --------------------------------------------------------
function criarBlocoCircuitoNaFolha(svgContent, left = 200, top = 200, scale = 1, rotation = 0, circuitData = null, caption = '', captionX = 0, captionY = 0) {
    const div = document.createElement('div');
    div.className = 'circuit-placed-block';
    div.style.left = left + 'px';
    div.style.top = top + 'px';
    div.dataset.scale = String(scale);
    div.dataset.rotation = String(rotation);
    div.dataset.svgRaw = svgContent;
    div.dataset.circuitData = JSON.stringify(circuitData || ccState);
    div.dataset.caption = caption || '';
    div.dataset.captionX = String(captionX || 0);
    div.dataset.captionY = String(captionY || 0);

    // Barra / Caixa de Legenda NO TOPO do circuito e com alça para movimentar livremente
    const captionWrap = document.createElement('div');
    captionWrap.className = 'circuit-caption-bar';
    captionWrap.style.transform = `translate(${captionX || 0}px, ${captionY || 0}px)`;

    const dragHandle = document.createElement('span');
    dragHandle.className = 'circuit-caption-handle';
    dragHandle.title = 'Arrastar legenda para qualquer posição';
    dragHandle.innerText = '⠿';

    const captionBox = document.createElement('div');
    captionBox.className = 'circuit-caption-box';
    captionBox.contentEditable = 'true';
    captionBox.spellcheck = true;
    captionBox.setAttribute('placeholder', 'Título / Legenda do circuito...');
    captionBox.innerHTML = caption || '';

    captionBox.addEventListener('input', () => {
        div.dataset.caption = captionBox.innerHTML;
        salvarNoLocalStorage();
    });
    captionBox.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
    });

    // Mover a legenda do circuito livremente
    let isMovingCaption = false, startCapX = 0, startCapY = 0, initOffX = 0, initOffY = 0;
    dragHandle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        isMovingCaption = true;
        startCapX = e.clientX;
        startCapY = e.clientY;
        initOffX = parseFloat(div.dataset.captionX) || 0;
        initOffY = parseFloat(div.dataset.captionY) || 0;
        dragHandle.setPointerCapture(e.pointerId);
    });

    dragHandle.addEventListener('pointermove', (e) => {
        if (!isMovingCaption) return;
        const dx = e.clientX - startCapX;
        const dy = e.clientY - startCapY;
        const newX = Math.round(initOffX + dx);
        const newY = Math.round(initOffY + dy);
        div.dataset.captionX = String(newX);
        div.dataset.captionY = String(newY);
        captionWrap.style.transform = `translate(${newX}px, ${newY}px)`;
    });

    dragHandle.addEventListener('pointerup', (e) => {
        if (isMovingCaption) {
            isMovingCaption = false;
            try { dragHandle.releasePointerCapture(e.pointerId); } catch(err){}
            salvarNoLocalStorage();
        }
    });

    captionWrap.appendChild(dragHandle);
    captionWrap.appendChild(captionBox);
    div.appendChild(captionWrap);

    const wrap = document.createElement('div');
    wrap.className = 'circuit-inner-svg';
    wrap.innerHTML = svgContent;
    div.appendChild(wrap);

    div.addEventListener('dblclick', (e) => {
        captionBox.focus();
        e.stopPropagation();
    });

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
        if (e.target.closest('.ctrl-btn') || e.target.classList.contains('resize-handle') || e.target.closest('.circuit-caption-bar')) return;
        if (currentTool === 'eraser') {
            div.remove();
            salvarNoLocalStorage();
            return;
        }

        document.querySelectorAll('.text-block, .circuit-placed-block, .placed-title-block, .placed-postit, .placed-page-marker, .placed-label-card, .placed-template-block').forEach(b => b.classList.remove('selected'));
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
// Histórico e Desfazer/Refazer (Undo/Redo) para Caderno e CCnotes
// --------------------------------------------------------
const cadernoUndoStack = [];
const cadernoRedoStack = [];
let cadernoClipboard = null;

function cadernoSnapshot() {
    guardarEstadoAtual();
    const tabData = getTabData(activeNotebook, activeTab);
    const pIdx = tabData.currentPage || 0;
    return JSON.stringify(tabData.pages[pIdx]);
}

function cadernoSalvarHistorico() {
    try {
        const snap = cadernoSnapshot();
        if (cadernoUndoStack.length === 0 || cadernoUndoStack[cadernoUndoStack.length - 1] !== snap) {
            cadernoUndoStack.push(snap);
            if (cadernoUndoStack.length > 35) cadernoUndoStack.shift();
            cadernoRedoStack.length = 0;
        }
    } catch(e) {}
}

function cadernoDesfazer() {
    if (cadernoUndoStack.length === 0) return;
    const cur = cadernoSnapshot();
    cadernoRedoStack.push(cur);
    const prev = cadernoUndoStack.pop();
    cadernoRestaurarSnapshot(prev);
}

function cadernoRefazer() {
    if (cadernoRedoStack.length === 0) return;
    const cur = cadernoSnapshot();
    cadernoUndoStack.push(cur);
    const next = cadernoRedoStack.pop();
    cadernoRestaurarSnapshot(next);
}

function cadernoRestaurarSnapshot(jsonStr) {
    if (!jsonStr) return;
    const pageData = JSON.parse(jsonStr);
    const tabData = getTabData(activeNotebook, activeTab);
    const pIdx = tabData.currentPage || 0;
    tabData.pages[pIdx] = pageData;

    document.querySelectorAll('.text-block, .circuit-placed-block, .placed-title-block, .placed-postit, .placed-page-marker, .placed-label-card, .placed-template-block').forEach(b => b.remove());

    templateIdx = pageData.templateIdx ?? 0;
    currentStrokes = JSON.parse(JSON.stringify(pageData.strokes || []));

    (pageData.blocks || []).forEach(b => {
        criarBlocoTexto(b.text, b.left, b.top, b.fontSize || 18, b.rotation || 0);
    });

    (pageData.circuits || []).forEach(c => {
        criarBlocoCircuitoNaFolha(c.svg, c.left, c.top, c.scale || 1, c.rotation || 0, c.circuitData, c.caption || '', c.captionX || 0, c.captionY || 0);
    });

    (pageData.titles || []).forEach(t => restaurarTituloBlock(t));
    (pageData.postits || []).forEach(p => restaurarPostIt(p));
    (pageData.markers || []).forEach(m => restaurarMarcadorPagina(m));
    (pageData.labels || []).forEach(l => restaurarEtiquetaCard(l));
    (pageData.templates || []).forEach(t => restaurarTemplateBlock(t));

    renderBackground();
    redrawStrokes();
    salvarNoLocalStorage();
}

function cadernoCopiar() {
    const selBlock = document.querySelector('.text-block.selected, .circuit-placed-block.selected, .placed-title-block.selected, .placed-postit.selected, .placed-page-marker.selected, .placed-label-card.selected, .placed-template-block.selected');
    if (selBlock) {
        if (selBlock.classList.contains('text-block')) {
            cadernoClipboard = {
                type: 'text',
                text: selBlock.dataset.raw || selBlock.innerText,
                fontSize: parseInt(selBlock.style.fontSize) || 18,
                rotation: parseInt(selBlock.dataset.rotation) || 0
            };
        } else if (selBlock.classList.contains('circuit-placed-block')) {
            let cData = null;
            try { if (selBlock.dataset.circuitData) cData = JSON.parse(selBlock.dataset.circuitData); } catch(e){}
            cadernoClipboard = {
                type: 'circuit',
                svg: selBlock.dataset.svgRaw || '',
                scale: parseFloat(selBlock.dataset.scale) || 1,
                rotation: parseInt(selBlock.dataset.rotation) || 0,
                circuitData: cData,
                caption: selBlock.dataset.caption || '',
                captionX: parseFloat(selBlock.dataset.captionX) || 0,
                captionY: parseFloat(selBlock.dataset.captionY) || 0
            };
        } else if (selBlock.classList.contains('placed-title-block')) {
            const cnt = selBlock.querySelector('.title-content');
            let cfg = null;
            try { if (selBlock.dataset.titleConfig) cfg = JSON.parse(selBlock.dataset.titleConfig); } catch(e){}
            cadernoClipboard = {
                type: 'title',
                html: cnt ? cnt.innerHTML : 'Título',
                config: cfg
            };
        } else if (selBlock.classList.contains('placed-postit')) {
            const content = selBlock.querySelector('.postit-content');
            cadernoClipboard = {
                type: 'postit',
                color: selBlock.dataset.color || 'yellow',
                html: content ? content.innerHTML : '',
                width: selBlock.offsetWidth,
                height: selBlock.offsetHeight
            };
        } else if (selBlock.classList.contains('placed-page-marker')) {
            const txt = selBlock.querySelector('.marker-text');
            cadernoClipboard = {
                type: 'marker',
                color: selBlock.dataset.color || 'yellow',
                text: txt ? txt.innerText : ''
            };
        } else if (selBlock.classList.contains('placed-label-card')) {
            const vals = Array.from(selBlock.querySelectorAll('.label-val')).map(v => v.innerText);
            cadernoClipboard = {
                type: 'label',
                labelType: selBlock.dataset.type || 'escola',
                vals: vals
            };
        } else if (selBlock.classList.contains('placed-template-block')) {
            cadernoClipboard = {
                type: 'template',
                templateType: selBlock.dataset.templateType || 'horario',
                html: selBlock.innerHTML
            };
        }
        return;
    }

    if (selectedShapeStroke) {
        cadernoClipboard = {
            type: 'stroke',
            stroke: JSON.parse(JSON.stringify(selectedShapeStroke))
        };
    }
}

function cadernoCortar() {
    cadernoCopiar();
    cadernoSalvarHistorico();
    const selBlock = document.querySelector('.text-block.selected, .circuit-placed-block.selected, .placed-title-block.selected, .placed-postit.selected, .placed-page-marker.selected, .placed-label-card.selected, .placed-template-block.selected');
    if (selBlock) {
        selBlock.remove();
        salvarNoLocalStorage();
    } else if (selectedShapeStroke) {
        currentStrokes = currentStrokes.filter(s => s !== selectedShapeStroke);
        selectedShapeStroke = null;
        redrawStrokes();
        salvarNoLocalStorage();
    }
}

function cadernoColar() {
    if (!cadernoClipboard) return;
    cadernoSalvarHistorico();

    const offset = 25;
    if (cadernoClipboard.type === 'text') {
        criarBlocoTexto(cadernoClipboard.text, 100 + offset, 150 + offset, cadernoClipboard.fontSize, cadernoClipboard.rotation);
    } else if (cadernoClipboard.type === 'circuit') {
        criarBlocoCircuitoNaFolha(cadernoClipboard.svg, 100 + offset, 150 + offset, cadernoClipboard.scale, cadernoClipboard.rotation, cadernoClipboard.circuitData, cadernoClipboard.caption, cadernoClipboard.captionX, cadernoClipboard.captionY);
    } else if (cadernoClipboard.type === 'title') {
        restaurarTituloBlock({ left: 100 + offset, top: 100 + offset, html: cadernoClipboard.html, config: cadernoClipboard.config });
    } else if (cadernoClipboard.type === 'postit') {
        const p = inserirPostIt(cadernoClipboard.color, 'Post-it', 120 + offset, 160 + offset);
        if (p) {
            const cnt = p.querySelector('.postit-content');
            if (cnt) cnt.innerHTML = cadernoClipboard.html;
        }
    } else if (cadernoClipboard.type === 'marker') {
        inserirMarcadorPagina(cadernoClipboard.color, cadernoClipboard.text, 20 + offset, 100 + offset);
    } else if (cadernoClipboard.type === 'label') {
        restaurarEtiquetaCard({ type: cadernoClipboard.labelType, left: 100 + offset, top: 100 + offset, vals: cadernoClipboard.vals });
    } else if (cadernoClipboard.type === 'template') {
        restaurarTemplateBlock({ templateType: cadernoClipboard.templateType, left: 40 + offset, top: 100 + offset, html: cadernoClipboard.html });
    } else if (cadernoClipboard.type === 'stroke') {
        const s = JSON.parse(JSON.stringify(cadernoClipboard.stroke));
        if (s.x0 !== undefined) { s.x0 += offset; s.x1 += offset; }
        if (s.y0 !== undefined) { s.y0 += offset; s.y1 += offset; }
        currentStrokes.push(s);
        selectedShapeStroke = s;
        redrawStrokes();
    }
    salvarNoLocalStorage();
}

// Histórico e Operações para CCnotes
const ccUndoStack = [];
const ccRedoStack = [];
let ccClipboard = null;

function ccSalvarHistorico() {
    try {
        const snap = JSON.stringify(ccState);
        if (ccUndoStack.length === 0 || ccUndoStack[ccUndoStack.length - 1] !== snap) {
            ccUndoStack.push(snap);
            if (ccUndoStack.length > 35) ccUndoStack.shift();
            ccRedoStack.length = 0;
        }
    } catch(e) {}
}

function ccDesfazer() {
    if (ccUndoStack.length === 0) return;
    ccRedoStack.push(JSON.stringify(ccState));
    const prev = JSON.parse(ccUndoStack.pop());
    ccState.parts = prev.parts || [];
    ccState.wires = prev.wires || [];
    ccState.annotations = prev.annotations || [];
    ccSelectedPart = null;
    ccSelectedWire = null;
    ccSelectedAnnotation = null;
    ccUpdateLabelButton();
    ccRenderAll();
}

function ccRefazer() {
    if (ccRedoStack.length === 0) return;
    ccUndoStack.push(JSON.stringify(ccState));
    const next = JSON.parse(ccRedoStack.pop());
    ccState.parts = next.parts || [];
    ccState.wires = next.wires || [];
    ccState.annotations = next.annotations || [];
    ccSelectedPart = null;
    ccSelectedWire = null;
    ccSelectedAnnotation = null;
    ccUpdateLabelButton();
    ccRenderAll();
}

function ccCopiar() {
    if (ccSelectedPart) {
        ccClipboard = { type: 'part', data: JSON.parse(JSON.stringify(ccSelectedPart)) };
    } else if (ccSelectedWire) {
        ccClipboard = { type: 'wire', data: JSON.parse(JSON.stringify(ccSelectedWire)) };
    } else if (ccSelectedAnnotation) {
        ccClipboard = { type: 'annotation', data: JSON.parse(JSON.stringify(ccSelectedAnnotation)) };
    }
}

function ccCortar() {
    if (!ccSelectedPart && !ccSelectedWire && !ccSelectedAnnotation) return;
    ccSalvarHistorico();
    ccCopiar();
    ccDeleteSelected();
}

function ccColar() {
    if (!ccClipboard) return;
    ccSalvarHistorico();

    if (ccClipboard.type === 'part') {
        const p = JSON.parse(JSON.stringify(ccClipboard.data));
        p.id = ccUid();
        p.x = (p.x || 100) + 20;
        p.y = (p.y || 100) + 20;
        p.label = ccGetNextLabel(p.symbol);
        ccState.parts.push(p);
        ccSelectedPart = p;
        ccSelectedWire = null;
        ccSelectedAnnotation = null;
    } else if (ccClipboard.type === 'wire') {
        const w = JSON.parse(JSON.stringify(ccClipboard.data));
        w.x1 += 20; w.y1 += 20;
        w.x2 += 20; w.y2 += 20;
        ccState.wires.push(w);
        ccSelectedWire = w;
        ccSelectedPart = null;
        ccSelectedAnnotation = null;
    } else if (ccClipboard.type === 'annotation') {
        const a = JSON.parse(JSON.stringify(ccClipboard.data));
        a.id = ccUid();
        a.x = (a.x || 100) + 20;
        a.y = (a.y || 100) + 20;
        ccState.annotations.push(a);
        ccSelectedAnnotation = a;
        ccSelectedPart = null;
        ccSelectedWire = null;
    }
    ccUpdateLabelButton();
    ccRenderAll();
}

// --------------------------------------------------------
// Post-its, Marcadores de Página e Etiquetas Escolares/Trabalho
// --------------------------------------------------------
const POSTIT_COLORS = {
    'yellow': { bg: '#fef08a', border: '#facc15', text: '#713f12', name: 'Amarelo', key: 'yellow' },
    '#fef08a': { bg: '#fef08a', border: '#facc15', text: '#713f12', name: 'Amarelo', key: 'yellow' },
    'pink': { bg: '#fbcfe8', border: '#f472b6', text: '#831843', name: 'Rosa Pastel', key: 'pink' },
    '#fbcfe8': { bg: '#fbcfe8', border: '#f472b6', text: '#831843', name: 'Rosa Pastel', key: 'pink' },
    'green': { bg: '#bbf7d0', border: '#4ade80', text: '#14532d', name: 'Verde Pastel', key: 'green' },
    '#bbf7d0': { bg: '#bbf7d0', border: '#4ade80', text: '#14532d', name: 'Verde Pastel', key: 'green' },
    'blue': { bg: '#bae6fd', border: '#38bdf8', text: '#0c4a6e', name: 'Azul Celeste', key: 'blue' },
    '#bfdbfe': { bg: '#bfdbfe', border: '#60a5fa', text: '#1e40af', name: 'Azul Celeste', key: 'blue' },
    '#bae6fd': { bg: '#bae6fd', border: '#38bdf8', text: '#0c4a6e', name: 'Azul Celeste', key: 'blue' },
    'orange': { bg: '#fed7aa', border: '#fb923c', text: '#7c2d12', name: 'Laranja Salmão', key: 'orange' },
    '#fed7aa': { bg: '#fed7aa', border: '#fb923c', text: '#7c2d12', name: 'Laranja Salmão', key: 'orange' }
};

function getPostItConfig(cor) {
    if (POSTIT_COLORS[cor]) return POSTIT_COLORS[cor];
    if (typeof cor === 'string' && (cor.startsWith('#') || cor.startsWith('rgb'))) {
        return { bg: cor, border: cor, text: '#0f172a', name: 'Post-it', key: 'custom' };
    }
    return POSTIT_COLORS['yellow'];
}

const MARKER_COLORS = {
    'urgente': { bg: '#ef4444', border: '#b91c1c', text: '#ffffff', key: 'urgente' },
    '#ef4444': { bg: '#ef4444', border: '#b91c1c', text: '#ffffff', key: 'urgente' },
    'importante': { bg: '#eab308', border: '#a16207', text: '#ffffff', key: 'importante' },
    '#eab308': { bg: '#eab308', border: '#a16207', text: '#ffffff', key: 'importante' },
    'formula': { bg: '#16a34a', border: '#15803d', text: '#ffffff', key: 'formula' },
    '#22c55e': { bg: '#16a34a', border: '#15803d', text: '#ffffff', key: 'formula' },
    '#2563eb': { bg: '#2563eb', border: '#1d4ed8', text: '#ffffff', key: 'formula' },
    'duvida': { bg: '#2563eb', border: '#1d4ed8', text: '#ffffff', key: 'duvida' },
    '#3b82f6': { bg: '#2563eb', border: '#1d4ed8', text: '#ffffff', key: 'duvida' },
    '#ea580c': { bg: '#ea580c', border: '#c2410c', text: '#ffffff', key: 'duvida' },
    'tarefa': { bg: '#9333ea', border: '#7e22ce', text: '#ffffff', key: 'tarefa' },
    '#a855f7': { bg: '#9333ea', border: '#7e22ce', text: '#ffffff', key: 'tarefa' },
    '#059669': { bg: '#059669', border: '#047857', text: '#ffffff', key: 'tarefa' }
};

function getMarkerConfig(cor) {
    if (MARKER_COLORS[cor]) return MARKER_COLORS[cor];
    if (typeof cor === 'string' && (cor.startsWith('#') || cor.startsWith('rgb'))) {
        return { bg: cor, border: cor, text: '#ffffff', key: 'custom' };
    }
    return MARKER_COLORS['urgente'];
}

function togglePostItModal() {
    const modal = document.getElementById('postItModal');
    if (modal) modal.classList.toggle('active');
}

function inserirPostIt(cor = 'yellow', nomeCor = 'Post-it Amarelo', left = 120, top = 160) {
    cadernoSalvarHistorico();
    const cfg = getPostItConfig(cor);
    const div = document.createElement('div');
    div.className = `placed-postit postit-${cfg.key}`;
    div.dataset.color = cor;
    div.style.left = left + 'px';
    div.style.top = top + 'px';
    div.style.backgroundColor = cfg.bg;
    div.style.borderTop = `14px solid ${cfg.border}`;
    div.style.color = cfg.text;

    div.innerHTML = `
        <div class="postit-bar">
            <span class="postit-title">📌 ${nomeCor || cfg.name}</span>
            <button class="postit-btn-del" onclick="this.closest('.placed-postit').remove(); cadernoSalvarHistorico(); salvarNoLocalStorage();" title="Apagar Post-it">✕</button>
        </div>
        <div class="postit-content" contenteditable="true" spellcheck="true" placeholder="Escrever nota...">Nota rápida...</div>
    `;

    ativarInteracaoPostIt(div);
    placedBlocksContainer.appendChild(div);
    salvarNoLocalStorage();
    return div;
}

function restaurarPostIt(p) {
    const cfg = getPostItConfig(p.color || 'yellow');
    const div = document.createElement('div');
    div.className = `placed-postit postit-${cfg.key}`;
    div.dataset.color = p.color || 'yellow';
    div.style.left = (p.left || 120) + 'px';
    div.style.top = (p.top || 160) + 'px';
    div.style.backgroundColor = cfg.bg;
    div.style.borderTop = `14px solid ${cfg.border}`;
    div.style.color = cfg.text;
    if (p.width) div.style.width = p.width + 'px';
    if (p.height) div.style.height = p.height + 'px';

    div.innerHTML = `
        <div class="postit-bar">
            <span class="postit-title">📌 ${cfg.name}</span>
            <button class="postit-btn-del" onclick="this.closest('.placed-postit').remove(); cadernoSalvarHistorico(); salvarNoLocalStorage();" title="Apagar Post-it">✕</button>
        </div>
        <div class="postit-content" contenteditable="true" spellcheck="true">${p.html || 'Nota rápida...'}</div>
    `;

    ativarInteracaoPostIt(div);
    placedBlocksContainer.appendChild(div);
}

function ativarInteracaoPostIt(div) {
    let isDragging = false, ox = 0, oy = 0;

    div.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.postit-btn-del, .postit-content')) return;
        document.querySelectorAll('.text-block, .circuit-placed-block, .placed-title-block, .placed-postit, .placed-page-marker, .placed-label-card, .placed-template-block').forEach(b => b.classList.remove('selected'));
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
        div.style.left = Math.max(0, Math.min(A4_WIDTH - 50, pos.x - ox)) + 'px';
        div.style.top = Math.max(0, Math.min(A4_HEIGHT - 50, pos.y - oy)) + 'px';
    });

    window.addEventListener('pointerup', () => {
        if (isDragging) {
            isDragging = false;
            salvarNoLocalStorage();
        }
    });
}

function inserirMarcadorPagina(cor = 'urgente', texto = 'Urgente', left = 20, top = 120) {
    cadernoSalvarHistorico();
    const cfg = getMarkerConfig(cor);
    const div = document.createElement('div');
    div.className = `placed-page-marker marker-${cfg.key}`;
    div.dataset.color = cor;
    div.style.left = left + 'px';
    div.style.top = top + 'px';
    div.style.backgroundColor = cfg.bg;
    div.style.borderLeft = `6px solid ${cfg.border}`;
    div.style.color = cfg.text;

    div.innerHTML = `
        <span class="marker-ribbon">🏷️</span>
        <span class="marker-text" contenteditable="true">${texto}</span>
        <button class="marker-btn-del" onclick="this.closest('.placed-page-marker').remove(); cadernoSalvarHistorico(); salvarNoLocalStorage();" title="Remover Marcador">✕</button>
    `;

    ativarInteracaoMarcador(div);
    placedBlocksContainer.appendChild(div);
    salvarNoLocalStorage();
    return div;
}

function restaurarMarcadorPagina(m) {
    const cfg = getMarkerConfig(m.color || 'urgente');
    const div = document.createElement('div');
    div.className = `placed-page-marker marker-${cfg.key}`;
    div.dataset.color = m.color || 'urgente';
    div.style.left = (m.left || 20) + 'px';
    div.style.top = (m.top || 120) + 'px';
    div.style.backgroundColor = cfg.bg;
    div.style.borderLeft = `6px solid ${cfg.border}`;
    div.style.color = cfg.text;

    div.innerHTML = `
        <span class="marker-ribbon">🏷️</span>
        <span class="marker-text" contenteditable="true">${m.text || 'Marcador'}</span>
        <button class="marker-btn-del" onclick="this.closest('.placed-page-marker').remove(); cadernoSalvarHistorico(); salvarNoLocalStorage();" title="Remover Marcador">✕</button>
    `;

    ativarInteracaoMarcador(div);
    placedBlocksContainer.appendChild(div);
}

function ativarInteracaoMarcador(div) {
    let isDragging = false, ox = 0, oy = 0;

    div.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.marker-btn-del')) return;
        document.querySelectorAll('.text-block, .circuit-placed-block, .placed-title-block, .placed-postit, .placed-page-marker, .placed-label-card, .placed-template-block').forEach(b => b.classList.remove('selected'));
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
}

function inserirEtiquetaCard(tipo = 'escola', left = 60, top = 80) {
    cadernoSalvarHistorico();
    const curDate = new Date().toLocaleDateString('pt-PT');
    return restaurarEtiquetaCard({ type: tipo, left, top, vals: ['Aluno / Utilizador', tipo === 'escola' ? '12º A / Nº 15' : 'Dpto. Técnico', tipo === 'escola' ? 'Eletrotecnia e Circuitos' : 'Engenharia', curDate] });
}

function restaurarEtiquetaCard(l) {
    const div = document.createElement('div');
    const tipo = l.type || 'escola';
    div.className = `placed-label-card label-${tipo}`;
    div.dataset.type = tipo;
    div.style.left = (l.left || 60) + 'px';
    div.style.top = (l.top || 80) + 'px';

    const title = tipo === 'escola' ? '🎓 IDENTIFICAÇÃO ESCOLAR' : (tipo === 'trabalho' ? '💼 FICHA DE TRABALHO' : '📁 PROJETO / MÓDULO');
    const f2 = tipo === 'escola' ? 'Turma / Nº:' : (tipo === 'trabalho' ? 'Departamento:' : 'Código:');
    const f3 = tipo === 'escola' ? 'Disciplina:' : (tipo === 'trabalho' ? 'Função:' : 'Módulo:');
    const vals = l.vals || ['Aluno / Utilizador', '12º A / Nº 15', 'Eletrotecnia e Circuitos', new Date().toLocaleDateString('pt-PT')];

    div.innerHTML = `
        <div class="label-card-header">
            <span>${title}</span>
            <button class="label-btn-del" onclick="this.closest('.placed-label-card').remove(); cadernoSalvarHistorico(); salvarNoLocalStorage();" title="Remover Etiqueta">✕</button>
        </div>
        <div class="label-card-body">
            <div class="label-row"><span class="label-tag">Nome:</span><span class="label-val" contenteditable="true">${vals[0] || ''}</span></div>
            <div class="label-row"><span class="label-tag">${f2}</span><span class="label-val" contenteditable="true">${vals[1] || ''}</span></div>
            <div class="label-row"><span class="label-tag">${f3}</span><span class="label-val" contenteditable="true">${vals[2] || ''}</span></div>
            <div class="label-row"><span class="label-tag">Data:</span><span class="label-val" contenteditable="true">${vals[3] || ''}</span></div>
        </div>
    `;

    ativarInteracaoEtiqueta(div);
    placedBlocksContainer.appendChild(div);
    salvarNoLocalStorage();
    return div;
}

function ativarInteracaoEtiqueta(div) {
    let isDragging = false, ox = 0, oy = 0;

    div.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.label-btn-del, .label-val')) return;
        document.querySelectorAll('.text-block, .circuit-placed-block, .placed-postit, .placed-page-marker, .placed-label-card, .placed-template-block').forEach(b => b.classList.remove('selected'));
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
        div.style.left = Math.max(0, Math.min(A4_WIDTH - 80, pos.x - ox)) + 'px';
        div.style.top = Math.max(0, Math.min(A4_HEIGHT - 60, pos.y - oy)) + 'px';
    });

    window.addEventListener('pointerup', () => {
        if (isDragging) {
            isDragging = false;
            salvarNoLocalStorage();
        }
    });
}

// --------------------------------------------------------
// Menu Criar & Templates Editáveis (Horário, Exercícios, Laboratório, Planeamento, Ficheiro)
// --------------------------------------------------------
function toggleCriarDropdown(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const m = document.getElementById('menuCriarDropdown');
    if (m) {
        m.classList.toggle('show');
        m.classList.toggle('open');
    }
}

function criarTemplateHorario() {
    cadernoSalvarHistorico();
    const div = document.createElement('div');
    div.className = 'placed-template-block template-horario';
    div.dataset.templateType = 'horario';
    div.style.left = '40px';
    div.style.top = '100px';

    div.innerHTML = `
        <div class="template-header">
            <span class="template-title">📅 HORÁRIO SEMANAL / ESCOLAR</span>
            <div class="template-actions">
                <button class="template-btn-del" onclick="this.closest('.placed-template-block').remove(); cadernoSalvarHistorico(); salvarNoLocalStorage();" title="Remover Template">✕</button>
            </div>
        </div>
        <table class="template-table">
            <thead>
                <tr>
                    <th style="width:70px;">Hora</th>
                    <th>Segunda</th>
                    <th>Terça</th>
                    <th>Quarta</th>
                    <th>Quinta</th>
                    <th>Sexta</th>
                </tr>
            </thead>
            <tbody>
                <tr><td>08:30 - 09:30</td><td contenteditable="true">Eletrotecnia</td><td contenteditable="true">Matemática</td><td contenteditable="true">Laboratório</td><td contenteditable="true">Física</td><td contenteditable="true">Sistemas</td></tr>
                <tr><td>09:35 - 10:35</td><td contenteditable="true">Eletrotecnia</td><td contenteditable="true">Matemática</td><td contenteditable="true">Laboratório</td><td contenteditable="true">Física</td><td contenteditable="true">Sistemas</td></tr>
                <tr><td>10:50 - 11:50</td><td contenteditable="true">Circuitos</td><td contenteditable="true">Português</td><td contenteditable="true">Eletrónica</td><td contenteditable="true">Química</td><td contenteditable="true">Programação</td></tr>
                <tr><td>11:55 - 12:55</td><td contenteditable="true">Circuitos</td><td contenteditable="true">Inglês</td><td contenteditable="true">Eletrónica</td><td contenteditable="true">Filosofia</td><td contenteditable="true">Programação</td></tr>
                <tr><td>14:00 - 15:30</td><td contenteditable="true">Oficina</td><td contenteditable="true">Estudo</td><td contenteditable="true">Projeto</td><td contenteditable="true">Educação Fís.</td><td contenteditable="true">Apoio</td></tr>
                <tr><td>15:45 - 17:15</td><td contenteditable="true">Oficina</td><td contenteditable="true">Estudo</td><td contenteditable="true">Projeto</td><td contenteditable="true">TIC</td><td contenteditable="true">Revisão</td></tr>
            </tbody>
        </table>
    `;
    ativarInteracaoTemplate(div);
    placedBlocksContainer.appendChild(div);
    salvarNoLocalStorage();
}

function criarTemplateExercicios() {
    cadernoSalvarHistorico();
    const div = document.createElement('div');
    div.className = 'placed-template-block template-exercicios';
    div.dataset.templateType = 'exercicios';
    div.style.left = '40px';
    div.style.top = '100px';

    div.innerHTML = `
        <div class="template-header">
            <span class="template-title">📝 FOLHA DE EXERCÍCIOS / RESUMO TEÓRICO</span>
            <div class="template-actions">
                <button class="template-btn-del" onclick="this.closest('.placed-template-block').remove(); cadernoSalvarHistorico(); salvarNoLocalStorage();" title="Remover Template">✕</button>
            </div>
        </div>
        <div class="template-body">
            <div class="template-section">
                <div class="template-section-title">Enunciado do Problema / Teoria:</div>
                <div class="template-editable-box" contenteditable="true">Escreva aqui o enunciado do exercício ou apontamento teórico...</div>
            </div>
            <div class="template-section">
                <div class="template-section-title">Dados & Fórmulas Aplicadas:</div>
                <div class="template-editable-box" contenteditable="true">U = R · I | P = U · I | R_total = R1 + R2</div>
            </div>
            <div class="template-section">
                <div class="template-section-title">Resolução & Desenvolvimento:</div>
                <div class="template-editable-box" contenteditable="true">1. Cálculo das grandezas fundamentais...\n2. Aplicação das leis de Kirchhoff...</div>
            </div>
            <div class="template-section">
                <div class="template-section-title" style="color:#10b981;">Resultado Final:</div>
                <div class="template-editable-box" contenteditable="true" style="font-weight:700;">I = 2,5 A | U = 12 V | P = 30 W</div>
            </div>
        </div>
    `;
    ativarInteracaoTemplate(div);
    placedBlocksContainer.appendChild(div);
    salvarNoLocalStorage();
}

function criarTemplateLaboratorio() {
    cadernoSalvarHistorico();
    const div = document.createElement('div');
    div.className = 'placed-template-block template-laboratorio';
    div.dataset.templateType = 'laboratorio';
    div.style.left = '40px';
    div.style.top = '100px';

    div.innerHTML = `
        <div class="template-header">
            <span class="template-title">🔬 RELATÓRIO DE LABORATÓRIO / ENSAIO PRÁTICO</span>
            <div class="template-actions">
                <button class="template-btn-del" onclick="this.closest('.placed-template-block').remove(); cadernoSalvarHistorico(); salvarNoLocalStorage();" title="Remover Template">✕</button>
            </div>
        </div>
        <div class="template-body">
            <div class="template-section">
                <div class="template-section-title">1. Objetivo do Ensaio:</div>
                <div class="template-editable-box" contenteditable="true">Verificação experimental da Lei de Ohm e medição da curva V-I em componentes passivos.</div>
            </div>
            <div class="template-section">
                <div class="template-section-title">2. Equipamento & Material Utilizado:</div>
                <div class="template-editable-box" contenteditable="true">• Fonte de Alimentação DC regulável (0-30V)\n• Multímetro Digital (Amperímetro e Voltímetro)\n• Resistores: 100 Ω, 1 kΩ, 10 kΩ\n• Cabos de conexão tipo banana-jacaré</div>
            </div>
            <div class="template-section">
                <div class="template-section-title">3. Tabela de Medições Experimentais:</div>
                <table class="template-table">
                    <thead>
                        <tr><th>Ensaio</th><th>Tensão U (V)</th><th>Corrente I (mA)</th><th>Resistência Calculada (Ω)</th><th>Potência P (mW)</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>#1</td><td contenteditable="true">2,0</td><td contenteditable="true">20,0</td><td contenteditable="true">100</td><td contenteditable="true">40</td></tr>
                        <tr><td>#2</td><td contenteditable="true">4,0</td><td contenteditable="true">40,1</td><td contenteditable="true">99,8</td><td contenteditable="true">160</td></tr>
                        <tr><td>#3</td><td contenteditable="true">6,0</td><td contenteditable="true">60,2</td><td contenteditable="true">99,7</td><td contenteditable="true">361</td></tr>
                        <tr><td>#4</td><td contenteditable="true">8,0</td><td contenteditable="true">79,9</td><td contenteditable="true">100,1</td><td contenteditable="true">639</td></tr>
                    </tbody>
                </table>
            </div>
            <div class="template-section">
                <div class="template-section-title">4. Conclusões & Análise dos Resultados:</div>
                <div class="template-editable-box" contenteditable="true">Os resultados medidos confirmam uma relação estritamente linear entre a tensão e a intensidade de corrente, com desvio percentual inferior a 1%.</div>
            </div>
        </div>
    `;
    ativarInteracaoTemplate(div);
    placedBlocksContainer.appendChild(div);
    salvarNoLocalStorage();
}

function criarTemplatePlaneamento() {
    cadernoSalvarHistorico();
    const div = document.createElement('div');
    div.className = 'placed-template-block template-planeamento';
    div.dataset.templateType = 'planeamento';
    div.style.left = '40px';
    div.style.top = '100px';

    div.innerHTML = `
        <div class="template-header">
            <span class="template-title">📋 TABELA DE TAREFAS / PLANEAMENTO DE ESTUDO</span>
            <div class="template-actions">
                <button class="template-btn-del" onclick="this.closest('.placed-template-block').remove(); cadernoSalvarHistorico(); salvarNoLocalStorage();" title="Remover Template">✕</button>
            </div>
        </div>
        <div class="template-body">
            <div class="planner-task-row"><input type="checkbox"> <span class="planner-task-text" contenteditable="true">Rever teoremas de Thevenin e Norton</span> <span class="planner-tag tag-urgente">Alta</span></div>
            <div class="planner-task-row"><input type="checkbox"> <span class="planner-task-text" contenteditable="true">Resolver lista de 5 exercícios de circuitos AC</span> <span class="planner-tag tag-normal">Média</span></div>
            <div class="planner-task-row"><input type="checkbox"> <span class="planner-task-text" contenteditable="true">Concluir esquema no CCnotes e inserir no caderno</span> <span class="planner-tag tag-urgente">Alta</span></div>
            <div class="planner-task-row"><input type="checkbox"> <span class="planner-task-text" contenteditable="true">Elaborar relatório do ensaio de laboratório</span> <span class="planner-tag tag-baixa">Baixa</span></div>
            <div class="planner-task-row"><input type="checkbox"> <span class="planner-task-text" contenteditable="true">Estudar apontamentos para o teste de avaliação</span> <span class="planner-tag tag-urgente">Alta</span></div>
        </div>
    `;
    ativarInteracaoTemplate(div);
    placedBlocksContainer.appendChild(div);
    salvarNoLocalStorage();
}

function criarTemplateProjeto() {
    cadernoSalvarHistorico();
    const div = document.createElement('div');
    div.className = 'placed-template-block template-projeto';
    div.dataset.templateType = 'projeto';
    div.style.left = '40px';
    div.style.top = '100px';

    div.innerHTML = `
        <div class="template-header">
            <span class="template-title">📁 FICHA DE PROJETO / MÓDULO TÉCNICO</span>
            <div class="template-actions">
                <button class="template-btn-del" onclick="this.closest('.placed-template-block').remove(); cadernoSalvarHistorico(); salvarNoLocalStorage();" title="Remover Template">✕</button>
            </div>
        </div>
        <div class="template-body">
            <div class="template-section">
                <div class="template-section-title">Designação do Projeto & Módulo:</div>
                <div class="template-editable-box" contenteditable="true">Fonte de Alimentação Regulada DC com Proteção Ativa (Módulo 5)</div>
            </div>
            <div class="template-section">
                <div class="template-section-title">Especificações e Requisitos Técnicos:</div>
                <div class="template-editable-box" contenteditable="true">• Tensão de Entrada: 230V AC ± 10%, 50Hz\n• Tensão de Saída Regulável: 1.25V a 24V DC\n• Corrente Máxima: 2.5A com limitação eletrónica ativa\n• Ondulação residual (Ripple) < 10mV RMS</div>
            </div>
            <div class="template-section">
                <div class="template-section-title">Lista de Materiais e Componentes Principais (BOM):</div>
                <div class="template-editable-box" contenteditable="true">1. Regulador LM317T / Dissipador de Calor TO-220\n2. Transformador 230V -> 18V AC 50VA\n3. Ponte Retificadora 4A / Condensador 4700µF 50V\n4. Potenciómetro multivoltas 5kΩ / Resistores de precisão 1%</div>
            </div>
            <div class="template-section">
                <div class="template-section-title" style="color:#2563eb;">Etapas de Validação & Testes:</div>
                <div class="template-editable-box" contenteditable="true">1. [x] Simulação do esquema e verificação de tensões\n2. [ ] Montagem em breadboard e medição térmica\n3. [ ] Conceção do PCB e ensaio em carga máxima</div>
            </div>
        </div>
    `;
    ativarInteracaoTemplate(div);
    placedBlocksContainer.appendChild(div);
    salvarNoLocalStorage();
}

function aplicarPapelLisa() {
    templateIdx = TEMPLATES.indexOf('blank');
    if (templateIdx === -1) templateIdx = 0;
    salvarNoLocalStorage();
    desenharTemplate();
    atualizarNomeTemplate();
}

function aplicarPapelMilimetrico() {
    cadernoSalvarHistorico();
    templateIdx = TEMPLATES.indexOf('milimetrico');
    if (templateIdx === -1) {
        TEMPLATES.push('milimetrico');
        TEMPLATE_NAMES['milimetrico'] = 'Milimétrico Engenharia';
        templateIdx = TEMPLATES.indexOf('milimetrico');
    }
    const btn = document.getElementById('btn-template');
    if (btn) btn.innerHTML = `<i data-lucide="grid"></i> Folha: Milimétrico Engenharia`;
    if (window.lucide) lucide.createIcons();
    renderBackground();
    salvarNoLocalStorage();
}

function aplicarPapelPautado() {
    cadernoSalvarHistorico();
    templateIdx = TEMPLATES.indexOf('lines_margin');
    if (templateIdx === -1) templateIdx = 1;
    const btn = document.getElementById('btn-template');
    if (btn) btn.innerHTML = `<i data-lucide="grid"></i> Folha: Pautada c/ Margem`;
    if (window.lucide) lucide.createIcons();
    renderBackground();
    salvarNoLocalStorage();
}

function aplicarPapelQuadriculado() {
    cadernoSalvarHistorico();
    templateIdx = TEMPLATES.indexOf('grid_5mm');
    if (templateIdx === -1) templateIdx = 0;
    const btn = document.getElementById('btn-template');
    if (btn) btn.innerHTML = `<i data-lucide="grid"></i> Folha: Quadriculada 5mm`;
    if (window.lucide) lucide.createIcons();
    renderBackground();
    salvarNoLocalStorage();
}

function importarTemplateFicheiro(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    cadernoSalvarHistorico();

    const fileName = file.name.toLowerCase();
    const reader = new FileReader();

    if (fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.svg')) {
        reader.onload = function(evt) {
            const div = document.createElement('div');
            div.className = 'placed-template-block template-ficheiro';
            div.dataset.templateType = 'ficheiro-img';
            div.style.left = '60px';
            div.style.top = '100px';
            div.innerHTML = `
                <div class="template-header">
                    <span class="template-title">🖼️ ${file.name}</span>
                    <div class="template-actions">
                        <button class="template-btn-del" onclick="this.closest('.placed-template-block').remove(); cadernoSalvarHistorico(); salvarNoLocalStorage();" title="Remover Imagem">✕</button>
                    </div>
                </div>
                <div style="padding:10px; display:flex; justify-content:center; background:#ffffff;">
                    <img src="${evt.target.result}" style="max-width:100%; max-height:450px; object-fit:contain; border-radius:4px;" />
                </div>
            `;
            ativarInteracaoTemplate(div);
            placedBlocksContainer.appendChild(div);
            salvarNoLocalStorage();
        };
        reader.readAsDataURL(file);
    } else if (fileName.endsWith('.json')) {
        reader.onload = function(evt) {
            try {
                const data = JSON.parse(evt.target.result);
                if (data.blocks || data.strokes || data.circuits) {
                    if (data.strokes) currentStrokes.push(...data.strokes);
                    redrawStrokes();
                }
                alert(`Template JSON "${file.name}" importado com sucesso.`);
                salvarNoLocalStorage();
            } catch(err) {
                alert("Erro ao ler ficheiro JSON.");
            }
        };
        reader.readAsText(file);
    } else if (fileName.endsWith('.txt')) {
        reader.onload = function(evt) {
            criarBlocoTexto(evt.target.result, 60, 120, 16, 0);
            salvarNoLocalStorage();
        };
        reader.readAsText(file);
    } else if (fileName.endsWith('.pdf')) {
        reader.onload = function(evt) {
            const div = document.createElement('div');
            div.className = 'placed-template-block template-ficheiro';
            div.dataset.templateType = 'ficheiro-pdf';
            div.style.left = '60px';
            div.style.top = '100px';
            div.innerHTML = `
                <div class="template-header">
                    <span class="template-title">📄 Documento PDF: ${file.name}</span>
                    <div class="template-actions">
                        <button class="template-btn-del" onclick="this.closest('.placed-template-block').remove(); cadernoSalvarHistorico(); salvarNoLocalStorage();" title="Remover PDF">✕</button>
                    </div>
                </div>
                <div style="padding:12px; font-size:14px; color:#1e293b;">
                    Ficheiro PDF carregado. <a href="${evt.target.result}" target="_blank" style="color:#2563eb; font-weight:700; text-decoration:underline;">Abrir PDF numa nova aba</a>
                </div>
            `;
            ativarInteracaoTemplate(div);
            placedBlocksContainer.appendChild(div);
            salvarNoLocalStorage();
        };
        reader.readAsDataURL(file);
    }
    e.target.value = '';
}

function restaurarTemplateBlock(t) {
    const div = document.createElement('div');
    div.className = `placed-template-block template-${t.templateType || 'geral'}`;
    div.dataset.templateType = t.templateType || 'geral';
    div.style.left = (t.left || 40) + 'px';
    div.style.top = (t.top || 100) + 'px';
    div.innerHTML = t.html || '';

    ativarInteracaoTemplate(div);
    placedBlocksContainer.appendChild(div);
}

function ativarInteracaoTemplate(div) {
    let isDragging = false, ox = 0, oy = 0;

    div.addEventListener('pointerdown', (e) => {
        if (e.target.closest('input, button, a, [contenteditable="true"]')) return;
        document.querySelectorAll('.text-block, .circuit-placed-block, .placed-postit, .placed-page-marker, .placed-label-card, .placed-template-block').forEach(b => b.classList.remove('selected'));
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
}

// --------------------------------------------------------
// Rotação e Eliminação por Teclado e Atalhos (Ctrl+Z, Ctrl+Y, Ctrl+X, Ctrl+C, Ctrl+V)
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
    // Atalhos Universais Undo/Redo/Cut/Copy/Paste
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    const isCC = document.getElementById('ccnotesModal') && document.getElementById('ccnotesModal').classList.contains('active');
    const isInputActive = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable;

    if (isCtrlOrCmd && (e.key === 'z' || e.key === 'Z')) {
        if (e.shiftKey) {
            e.preventDefault();
            if (isCC) ccRefazer();
            else cadernoRefazer();
            return;
        } else {
            e.preventDefault();
            if (isCC) ccDesfazer();
            else cadernoDesfazer();
            return;
        }
    }

    if (isCtrlOrCmd && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        if (isCC) ccRefazer();
        else cadernoRefazer();
        return;
    }

    if (isCtrlOrCmd && (e.key === 'c' || e.key === 'C') && !isInputActive) {
        e.preventDefault();
        if (isCC) ccCopiar();
        else cadernoCopiar();
        return;
    }

    if (isCtrlOrCmd && (e.key === 'x' || e.key === 'X') && !isInputActive) {
        e.preventDefault();
        if (isCC) ccCortar();
        else cadernoCortar();
        return;
    }

    if (isCtrlOrCmd && (e.key === 'v' || e.key === 'V') && !isInputActive) {
        e.preventDefault();
        if (isCC) ccColar();
        else cadernoColar();
        return;
    }

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
        if (isCC) {
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
    if (e.code === 'Space' && isCC) {
        if (ccTool === 'wire' && ccWireStart && ccLastWireTarget) {
            e.preventDefault();
            ccWireCornerMode = (ccWireCornerMode === 'VH') ? 'HV' : 'VH';
            ccDrawWirePreview(ccLastWireTarget);
            return;
        }
    }

    if (isInputActive) return;

    if (e.key === 'r' || e.key === 'R') {
        if (isCC) {
            ccRotateSelected(e.shiftKey ? -90 : 90);
        } else {
            rotateCurrentSelection();
        }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (isCC) {
            ccDeleteSelected();
        } else {
            if (selectedShapeStroke) {
                cadernoSalvarHistorico();
                currentStrokes = currentStrokes.filter(s => s !== selectedShapeStroke);
                selectedShapeStroke = null;
                redrawStrokes();
                salvarNoLocalStorage();
                return;
            }
            const selEl = document.querySelector('.text-block.selected, .circuit-placed-block.selected, .placed-postit.selected, .placed-page-marker.selected, .placed-label-card.selected, .placed-template-block.selected') || selectedElement;
            if (selEl) {
                cadernoSalvarHistorico();
                selEl.remove();
                selectedElement = null;
                salvarNoLocalStorage();
            }
        }
    }
});

// --------------------------------------------------------
// Gestão de Títulos & Cabeçalhos Estilo Word (Ponto 4)
// --------------------------------------------------------
let titleConfig = {
    font: "'Segoe UI', system-ui, sans-serif",
    size: '26px',
    textColor: '#0f172a',
    bg: 'transparent',
    borderStyle: 'solid 2px',
    borderRadius: '8px',
    borderColor: '#3b82f6'
};

function setTitleTextColor(el, color) {
    titleConfig.textColor = color;
    if (el) {
        document.querySelectorAll('.title-color-swatch').forEach(s => s.classList.remove('active'));
        el.classList.add('active');
    }
    const picker = document.getElementById('title-text-color-picker');
    if (picker) picker.value = color.startsWith('#') && color.length === 7 ? color : '#0f172a';
    atualizarPreviewTitulo();
}

function setTitleBgColor(el, color) {
    titleConfig.bg = color;
    if (el) {
        document.querySelectorAll('.title-bg-swatch').forEach(s => s.classList.remove('active'));
        el.classList.add('active');
    }
    const picker = document.getElementById('title-bg-color-picker');
    if (picker && color !== 'transparent') picker.value = color.startsWith('#') && color.length === 7 ? color : '#dbeafe';
    atualizarPreviewTitulo();
}

function setTitleBorderColor(el, color) {
    titleConfig.borderColor = color;
    if (el) {
        document.querySelectorAll('.title-border-color-swatch').forEach(s => s.classList.remove('active'));
        el.classList.add('active');
    }
    const picker = document.getElementById('title-border-color-picker');
    if (picker) picker.value = color.startsWith('#') && color.length === 7 ? color : '#3b82f6';
    atualizarPreviewTitulo();
}

function atualizarPreviewTitulo() {
    const fFam = document.getElementById('title-font-family');
    const fSize = document.getElementById('title-font-size');
    const bStyle = document.getElementById('title-border-style');
    const bRadius = document.getElementById('title-border-radius');

    if (fFam) titleConfig.font = fFam.value;
    if (fSize) titleConfig.size = fSize.value;
    if (bStyle) titleConfig.borderStyle = bStyle.value;
    if (bRadius) titleConfig.borderRadius = bRadius.value;

    const preview = document.getElementById('title-preview-box');
    if (!preview) return;

    preview.style.fontFamily = titleConfig.font;
    preview.style.fontSize = Math.min(20, parseInt(titleConfig.size)) + 'px';
    preview.style.color = titleConfig.textColor;
    preview.style.backgroundColor = titleConfig.bg;
    preview.style.borderRadius = titleConfig.borderRadius;

    aplicarEstiloBordaTitulo(preview, titleConfig.borderStyle, titleConfig.borderColor);
}

function aplicarEstiloBordaTitulo(el, borderStyle, borderColor) {
    el.style.border = 'none';
    el.style.borderLeft = 'none';
    el.style.borderBottom = 'none';

    if (borderStyle === 'none') {
        el.style.border = 'none';
    } else if (borderStyle === 'left-bar 6px') {
        el.style.borderLeft = `6px solid ${borderColor}`;
    } else if (borderStyle === 'bottom-bar 3px') {
        el.style.borderBottom = `3px solid ${borderColor}`;
    } else if (borderStyle === 'dashed 2px') {
        el.style.border = `2px dashed ${borderColor}`;
    } else if (borderStyle === 'solid 1px') {
        el.style.border = `1px solid ${borderColor}`;
    } else if (borderStyle === 'solid 4px') {
        el.style.border = `4px solid ${borderColor}`;
    } else {
        el.style.border = `2px solid ${borderColor}`;
    }
}

function inserirTituloNaFolha(cfg = null, left = 80, top = 100, text = 'Título do Documento') {
    cadernoSalvarHistorico();
    const config = cfg ? Object.assign({}, titleConfig, cfg) : Object.assign({}, titleConfig);

    const div = document.createElement('div');
    div.className = 'placed-title-block';
    div.style.left = left + 'px';
    div.style.top = top + 'px';
    div.dataset.titleConfig = JSON.stringify(config);

    div.style.fontFamily = config.font;
    div.style.fontSize = config.size;
    div.style.color = config.textColor;
    div.style.backgroundColor = config.bg;
    div.style.borderRadius = config.borderRadius;
    aplicarEstiloBordaTitulo(div, config.borderStyle, config.borderColor);

    div.innerHTML = `
        <div class="title-controls-overlay">
            <button class="ctrl-btn" onclick="event.stopPropagation(); scaleTitleBlock(this, 1.15)" title="Aumentar Fonte">🔍 +</button>
            <button class="ctrl-btn" onclick="event.stopPropagation(); scaleTitleBlock(this, 0.85)" title="Diminuir Fonte">🔍 -</button>
            <button class="ctrl-btn" style="color:#f87171;" onclick="event.stopPropagation(); this.closest('.placed-title-block').remove(); cadernoSalvarHistorico(); salvarNoLocalStorage();" title="Apagar Título">✕</button>
        </div>
        <div class="title-content" contenteditable="true" spellcheck="true" placeholder="Escrever Título...">${text}</div>
    `;

    ativarInteracaoTitulo(div);
    placedBlocksContainer.appendChild(div);
    closeAllDropdowns();
    salvarNoLocalStorage();

    const cnt = div.querySelector('.title-content');
    if (cnt) {
        cnt.focus();
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(cnt);
        sel.removeAllRanges();
        sel.addRange(range);
    }
    return div;
}

function scaleTitleBlock(btn, factor) {
    const block = btn.closest('.placed-title-block');
    if (!block) return;
    cadernoSalvarHistorico();
    const curSize = parseInt(block.style.fontSize) || 26;
    const newSize = Math.max(12, Math.min(64, Math.round(curSize * factor)));
    block.style.fontSize = newSize + 'px';
    salvarNoLocalStorage();
}

function restaurarTituloBlock(t) {
    const div = document.createElement('div');
    div.className = 'placed-title-block';
    div.style.left = (t.left || 80) + 'px';
    div.style.top = (t.top || 100) + 'px';
    const cfg = t.config || titleConfig;
    div.dataset.titleConfig = JSON.stringify(cfg);

    div.style.fontFamily = cfg.font || titleConfig.font;
    div.style.fontSize = cfg.size || titleConfig.size;
    div.style.color = cfg.textColor || titleConfig.textColor;
    div.style.backgroundColor = cfg.bg || titleConfig.bg;
    div.style.borderRadius = cfg.borderRadius || titleConfig.borderRadius;
    aplicarEstiloBordaTitulo(div, cfg.borderStyle || titleConfig.borderStyle, cfg.borderColor || titleConfig.borderColor);

    div.innerHTML = `
        <div class="title-controls-overlay">
            <button class="ctrl-btn" onclick="event.stopPropagation(); scaleTitleBlock(this, 1.15)" title="Aumentar Fonte">🔍 +</button>
            <button class="ctrl-btn" onclick="event.stopPropagation(); scaleTitleBlock(this, 0.85)" title="Diminuir Fonte">🔍 -</button>
            <button class="ctrl-btn" style="color:#f87171;" onclick="event.stopPropagation(); this.closest('.placed-title-block').remove(); cadernoSalvarHistorico(); salvarNoLocalStorage();" title="Apagar Título">✕</button>
        </div>
        <div class="title-content" contenteditable="true" spellcheck="true">${t.html || 'Título'}</div>
    `;

    ativarInteracaoTitulo(div);
    placedBlocksContainer.appendChild(div);
}

function ativarInteracaoTitulo(div) {
    let isDragging = false, ox = 0, oy = 0;

    div.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.title-controls-overlay') || e.target.classList.contains('title-content')) return;
        document.querySelectorAll('.text-block, .circuit-placed-block, .placed-title-block, .placed-postit, .placed-page-marker, .placed-label-card, .placed-template-block').forEach(b => b.classList.remove('selected'));
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
        div.style.top = Math.max(0, Math.min(A4_HEIGHT - 30, pos.y - oy)) + 'px';
    });

    window.addEventListener('pointerup', () => {
        if (isDragging) {
            isDragging = false;
            salvarNoLocalStorage();
        }
    });

    const cnt = div.querySelector('.title-content');
    if (cnt) {
        cnt.addEventListener('input', () => {
            salvarNoLocalStorage();
        });
    }
}

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

    // Permite desenhar livremente por cima de circuitos na folha quando em modo de caneta/lápis/formas
    document.body.classList.toggle('tool-select-active', tool === 'select');
    document.body.classList.toggle('tool-is-drawing', tool === 'pen' || tool === 'pencil' || tool === 'highlighter' || tool === 'eraser');

    if (tool !== 'select') {
        document.querySelectorAll('.text-block, .circuit-placed-block, .placed-title-block, .placed-postit, .placed-page-marker, .placed-label-card, .placed-template-block').forEach(b => b.classList.remove('selected'));
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
    document.body.classList.toggle('tool-select-active', false);
    document.body.classList.toggle('tool-is-drawing', false);
    document.querySelectorAll('.toolbar .tool-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('btn-shape-menu').classList.add('active');
    document.getElementById('active-shape-icon').setAttribute('data-lucide', iconName);
    document.querySelectorAll('#shape-dropdown .dropdown-item').forEach(i => i.classList.remove('active'));
    if (event.currentTarget) event.currentTarget.classList.add('active');
    if (window.lucide) lucide.createIcons();
    closeAllDropdowns();
}

let lastEraserType = localStorage.getItem('ccnotes_last_eraser') || 'stroke';

function clicarBotaoBorracha(event) {
    // Se o utilizador clicou no botão da borracha e ela não estava ativa,
    // ativa imediatamente o último modo de borracha usado (Item 7)
    if (currentTool !== 'eraser') {
        setEraserType(lastEraserType || 'stroke');
    } else {
        // Se já está ativa, abre/fecha o menu dropdown de seleção
        toggleDropdown('eraser-dropdown');
    }
}

function setEraserType(type) {
    eraserMode = type;
    lastEraserType = type;
    localStorage.setItem('ccnotes_last_eraser', type);
    currentTool = 'eraser';
    document.body.classList.toggle('tool-select-active', false);
    document.body.classList.toggle('tool-is-drawing', true);
    document.querySelectorAll('.toolbar .tool-btn').forEach(btn => btn.classList.remove('active'));
    const btnEraser = document.getElementById('btn-eraser-menu');
    if (btnEraser) btnEraser.classList.add('active');
    document.querySelectorAll('#eraser-dropdown .dropdown-item').forEach(i => i.classList.remove('active'));
    const item = document.getElementById(`item-eraser-${type}`);
    if (item) item.classList.add('active');
    closeAllDropdowns();
}

function mostrarApagadorQuadro(clientX, clientY) {
    const el = document.getElementById('chalkboardEraserBox');
    if (!el) return;
    el.style.display = 'block';
    el.style.left = `${clientX}px`;
    el.style.top = `${clientY}px`;
}

function esconderApagadorQuadro() {
    const el = document.getElementById('chalkboardEraserBox');
    if (el) el.style.display = 'none';
}

// Apagador de Quadro (Quadrado Picotado - Item 8)
function eraseBox(px, py, boxW = 68, boxH = 48) {
    const minX = px - boxW / 2;
    const maxX = px + boxW / 2;
    const minY = py - boxH / 2;
    const maxY = py + boxH / 2;

    let initialCount = currentStrokes.length;
    currentStrokes = currentStrokes.filter(s => {
        if (s.type === 'shape') {
            const sMinX = Math.min(s.x0, s.x1);
            const sMaxX = Math.max(s.x0, s.x1);
            const sMinY = Math.min(s.y0, s.y1);
            const sMaxY = Math.max(s.y0, s.y1);
            return (sMaxX < minX || sMinX > maxX || sMaxY < minY || sMinY > maxY);
        } else if (s.type === 'free' && s.segments) {
            for (let seg of s.segments) {
                for (let pt of seg) {
                    if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) {
                        return false;
                    }
                }
            }
        }
        return true;
    });

    // Apagar também elementos colocados se a caixa passar por cima
    document.querySelectorAll('.text-block, .circuit-placed-block, .placed-title-block, .placed-postit, .placed-page-marker, .placed-label-card, .placed-template-block').forEach(b => {
        const left = parseFloat(b.style.left) || 0;
        const top = parseFloat(b.style.top) || 0;
        const w = b.offsetWidth || 50;
        const h = b.offsetHeight || 50;
        if (!(left + w < minX || left > maxX || top + h < minY || top > maxY)) {
            b.remove();
        }
    });

    if (currentStrokes.length !== initialCount) {
        redrawStrokes();
        salvarNoLocalStorage();
    }
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

function posicionarToolbarAoCentroDaFolha() {
    const ws = document.getElementById('workspace');
    const tb = document.getElementById('toolbar');
    if (!ws || !tb) return;
    const r = ws.getBoundingClientRect();
    const centerX = Math.round(r.left + r.width / 2);
    tb.style.left = `${centerX}px`;
}

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    isSidebarOpen = !isSidebarOpen;
    if (sb) sb.classList.toggle('collapsed', !isSidebarOpen);
    document.body.classList.toggle('sidebar-is-collapsed', !isSidebarOpen);
    posicionarToolbarAoCentroDaFolha();
    setTimeout(posicionarToolbarAoCentroDaFolha, 220);
}

window.addEventListener('resize', () => {
    posicionarToolbarAoCentroDaFolha();
});

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
// LEGENDAS ELÉTRICAS PREDEFINIDAS (I1 com 4 setas, U1, R1, Nós...)
// ========================================================
const CIRCUIT_PRESET_LABELS = {
    currents: [
        // I1 com as 4 direções de seta
        { label: "I₁ →", dir: "direita", desc: "Corrente I1 para a direita" },
        { label: "I₁ ←", dir: "esquerda", desc: "Corrente I1 para a esquerda" },
        { label: "I₁ ↑", dir: "cima", desc: "Corrente I1 para cima" },
        { label: "I₁ ↓", dir: "baixo", desc: "Corrente I1 para baixo" },

        // I2 com as 4 direções de seta
        { label: "I₂ →", dir: "direita", desc: "Corrente I2 para a direita" },
        { label: "I₂ ←", dir: "esquerda", desc: "Corrente I2 para a esquerda" },
        { label: "I₂ ↑", dir: "cima", desc: "Corrente I2 para cima" },
        { label: "I₂ ↓", dir: "baixo", desc: "Corrente I2 para baixo" },

        // I3 com as 4 direções de seta
        { label: "I₃ →", dir: "direita", desc: "Corrente I3 para a direita" },
        { label: "I₃ ←", dir: "esquerda", desc: "Corrente I3 para a esquerda" },
        { label: "I₃ ↑", dir: "cima", desc: "Corrente I3 para cima" },
        { label: "I₃ ↓", dir: "baixo", desc: "Corrente I3 para baixo" },

        // I4 com as 4 direções de seta
        { label: "I₄ →", dir: "direita", desc: "Corrente I4 para a direita" },
        { label: "I₄ ←", dir: "esquerda", desc: "Corrente I4 para a esquerda" },
        { label: "I₄ ↑", dir: "cima", desc: "Corrente I4 para cima" },
        { label: "I₄ ↓", dir: "baixo", desc: "Corrente I4 para baixo" },

        // I5 com as 4 direções de seta
        { label: "I₅ →", dir: "direita", desc: "Corrente I5 para a direita" },
        { label: "I₅ ←", dir: "esquerda", desc: "Corrente I5 para a esquerda" },
        { label: "I₅ ↑", dir: "cima", desc: "Corrente I5 para cima" },
        { label: "I₅ ↓", dir: "baixo", desc: "Corrente I5 para baixo" },

        // Correntes gerais e de ramos
        { label: "Iin →", dir: "direita", desc: "Corrente de entrada" },
        { label: "Iout →", dir: "direita", desc: "Corrente de saída" },
        { label: "Itot →", dir: "direita", desc: "Corrente total" },
        { label: "IN →", dir: "direita", desc: "Corrente do neutro" },
        { label: "i(t)", dir: "geral", desc: "Corrente instantânea" },
        { label: "Irms", dir: "geral", desc: "Corrente eficaz (RMS)" },
        { label: "Icc", dir: "geral", desc: "Corrente de curto-circuito" }
    ],
    voltages: [
        // Tensões U
        { label: "U₁", desc: "Tensão U1" },
        { label: "U₂", desc: "Tensão U2" },
        { label: "U₃", desc: "Tensão U3" },
        { label: "U₄", desc: "Tensão U4" },
        { label: "U₅", desc: "Tensão U5" },
        { label: "Uin", desc: "Tensão de entrada (Uin)" },
        { label: "Uout", desc: "Tensão de saída (Uout)" },
        { label: "Uth", desc: "Tensão de Thévenin (Uth)" },
        { label: "u(t)", desc: "Tensão instantânea u(t)" },

        // Polaridades de Tensão (+ -)
        { label: "+ U₁ -", desc: "Polaridade U1 (+ à esq / - à dir)" },
        { label: "- U₁ +", desc: "Polaridade U1 (- à esq / + à dir)" },
        { label: "+ U₂ -", desc: "Polaridade U2 (+ à esq / - à dir)" },
        { label: "- U₂ +", desc: "Polaridade U2 (- à esq / + à dir)" },
        { label: "+ U₃ -", desc: "Polaridade U3 (+ à esq / - à dir)" },
        { label: "+ Us -", desc: "Tensão da fonte Us" },

        // Tensões V e Alimentação
        { label: "V₁", desc: "Potencial / Tensão V1" },
        { label: "V₂", desc: "Potencial / Tensão V2" },
        { label: "V₃", desc: "Potencial / Tensão V3" },
        { label: "Vin", desc: "Tensão de entrada (Vin)" },
        { label: "Vout", desc: "Tensão de saída (Vout)" },
        { label: "+ V₁ -", desc: "Polaridade V1" },
        { label: "Vcc", desc: "Alimentação positiva Vcc" },
        { label: "Vdd", desc: "Alimentação positiva Vdd" },
        { label: "Vss", desc: "Alimentação Vss" },
        { label: "+ 5V", desc: "Alimentação +5V" },
        { label: "+ 12V", desc: "Alimentação +12V" },
        { label: "+ 24V", desc: "Alimentação +24V" },
        { label: "0V", desc: "Referência 0V" },
        { label: "GND", desc: "Massa / Ground" },
        { label: "E₁", desc: "F.E.M. E1" },
        { label: "E₂", desc: "F.E.M. E2" },
        { label: "e(t)", desc: "F.E.M. instantânea" }
    ],
    components: [
        // Resistências e Valores
        { label: "R₁", desc: "Resistência R1" },
        { label: "R₂", desc: "Resistência R2" },
        { label: "R₃", desc: "Resistência R3" },
        { label: "R₄", desc: "Resistência R4" },
        { label: "R₅", desc: "Resistência R5" },
        { label: "RL", desc: "Resistência de Carga (RL)" },
        { label: "Rth", desc: "Resistência de Thévenin" },
        { label: "Req", desc: "Resistência Equivalente" },
        { label: "10 Ω", desc: "10 Ohm" },
        { label: "100 Ω", desc: "100 Ohm" },
        { label: "1 kΩ", desc: "1 Quilo-Ohm" },
        { label: "4.7 kΩ", desc: "4.7 Quilo-Ohm" },
        { label: "10 kΩ", desc: "10 Quilo-Ohm" },
        { label: "100 kΩ", desc: "100 Quilo-Ohm" },
        { label: "1 MΩ", desc: "1 Mega-Ohm" },

        // Condensadores
        { label: "C₁", desc: "Condensador C1" },
        { label: "C₂", desc: "Condensador C2" },
        { label: "C₃", desc: "Condensador C3" },
        { label: "C₄", desc: "Condensador C4" },
        { label: "Cin", desc: "Condensador de entrada" },
        { label: "Cout", desc: "Condensador de saída" },
        { label: "100 nF", desc: "100 Nanofarad" },
        { label: "10 µF", desc: "10 Microfarad" },
        { label: "100 µF", desc: "100 Microfarad" },

        // Bobinas e Impedâncias
        { label: "L₁", desc: "Indutância L1" },
        { label: "L₂", desc: "Indutância L2" },
        { label: "L₃", desc: "Indutância L3" },
        { label: "1 mH", desc: "1 Milihenry" },
        { label: "10 mH", desc: "10 Milihenry" },
        { label: "Z₁", desc: "Impedância Z1" },
        { label: "Z₂", desc: "Impedância Z2" },
        { label: "Z₃", desc: "Impedância Z3" },
        { label: "ZL", desc: "Impedância de Carga" },
        { label: "Zth", desc: "Impedância de Thévenin" },
        { label: "XL", desc: "Reatância Indutiva" },
        { label: "XC", desc: "Reatância Capacitiva" }
    ],
    nodes: [
        // Nós do Circuito
        { label: "A", desc: "Nó A" },
        { label: "B", desc: "Nó B" },
        { label: "C", desc: "Nó C" },
        { label: "D", desc: "Nó D" },
        { label: "N", desc: "Nó Neutro (N)" },
        { label: "Nó 1", desc: "Nó 1" },
        { label: "Nó 2", desc: "Nó 2" },
        { label: "⏚", desc: "Símbolo de Terra (Earth)" },
        { label: "⏛", desc: "Símbolo de Chassis" },

        // Potências e Grandezas
        { label: "P", desc: "Potência Ativa (W)" },
        { label: "P₁", desc: "Potência P1" },
        { label: "P₂", desc: "Potência P2" },
        { label: "Ptot", desc: "Potência Total" },
        { label: "S", desc: "Potência Aparente (VA)" },
        { label: "Q", desc: "Potência Reativa (VAr)" },
        { label: "cos φ", desc: "Fator de Potência (cos φ)" },
        { label: "φ", desc: "Ângulo de Fase (φ)" },
        { label: "50 Hz", desc: "Frequência de Rede 50 Hz" },
        { label: "60 Hz", desc: "Frequência de Rede 60 Hz" },
        { label: "230 V", desc: "Tensão de Rede 230 V" },
        { label: "400 V", desc: "Tensão Trifásica 400 V" },
        { label: "τ = RC", desc: "Constante RC" },
        { label: "τ = L/R", desc: "Constante L/R" }
    ]
};

let circuitLabelsTarget = 'ccnotes';

function toggleCircuitLabelsModal(target = 'ccnotes') {
    circuitLabelsTarget = target;
    const modal = document.getElementById('circuitLabelsModal');
    if (!modal) return;
    const isActive = modal.classList.contains('active');
    if (!isActive) {
        renderCircuitPresetLabels();
        modal.classList.add('active');
    } else {
        modal.classList.remove('active');
    }
}

function fecharModalLegendasEletricas() {
    const modal = document.getElementById('circuitLabelsModal');
    if (modal) modal.classList.remove('active');
}

function switchCircuitLabelTab(tab) {
    const tabs = ['currents', 'voltages', 'components', 'nodes'];
    tabs.forEach(t => {
        const btn = document.getElementById(`cl-tab-${t}`);
        const content = document.getElementById(`cl-content-${t}`);
        if (btn) btn.classList.toggle('active', t === tab);
        if (content) content.style.display = (t === tab) ? 'block' : 'none';
    });
}

function renderCircuitPresetLabels() {
    // Tab Correntes
    const wrapCurrents = document.getElementById('cl-content-currents');
    if (wrapCurrents) {
        wrapCurrents.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'cl-grid';

        CIRCUIT_PRESET_LABELS.currents.forEach(item => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'cl-label-card';
            card.title = item.desc || item.label;
            card.innerHTML = `
                <span class="cl-card-text">${item.label}</span>
                <span class="cl-card-sub">${item.dir || 'geral'}</span>
            `;
            card.onclick = () => {
                inserirLegendaEletrica(item.label);
            };
            grid.appendChild(card);
        });
        wrapCurrents.appendChild(grid);
    }

    // Tab Tensões
    const wrapVoltages = document.getElementById('cl-content-voltages');
    if (wrapVoltages) {
        wrapVoltages.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'cl-grid';

        CIRCUIT_PRESET_LABELS.voltages.forEach(item => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'cl-label-card';
            card.title = item.desc || item.label;
            card.innerHTML = `
                <span class="cl-card-text">${item.label}</span>
                <span class="cl-card-sub">tensão</span>
            `;
            card.onclick = () => {
                inserirLegendaEletrica(item.label);
            };
            grid.appendChild(card);
        });
        wrapVoltages.appendChild(grid);
    }

    // Tab Componentes
    const wrapComponents = document.getElementById('cl-content-components');
    if (wrapComponents) {
        wrapComponents.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'cl-grid';

        CIRCUIT_PRESET_LABELS.components.forEach(item => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'cl-label-card';
            card.title = item.desc || item.label;
            card.innerHTML = `
                <span class="cl-card-text">${item.label}</span>
                <span class="cl-card-sub">comp</span>
            `;
            card.onclick = () => {
                inserirLegendaEletrica(item.label);
            };
            grid.appendChild(card);
        });
        wrapComponents.appendChild(grid);
    }

    // Tab Nós e Potências
    const wrapNodes = document.getElementById('cl-content-nodes');
    if (wrapNodes) {
        wrapNodes.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'cl-grid';

        CIRCUIT_PRESET_LABELS.nodes.forEach(item => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'cl-label-card';
            card.title = item.desc || item.label;
            card.innerHTML = `
                <span class="cl-card-text">${item.label}</span>
                <span class="cl-card-sub">nó / pot</span>
            `;
            card.onclick = () => {
                inserirLegendaEletrica(item.label);
            };
            grid.appendChild(card);
        });
        wrapNodes.appendChild(grid);
    }
}

function clAppendArrow(arrow) {
    const input = document.getElementById('clCustomInput');
    if (!input) return;
    input.value = input.value.trim() + ' ' + arrow;
    input.focus();
}

function clInserirCustom() {
    const input = document.getElementById('clCustomInput');
    if (!input || !input.value.trim()) return;
    inserirLegendaEletrica(input.value.trim());
}

function inserirLegendaEletrica(texto) {
    const ccModal = document.getElementById('ccnotesModal');
    const isCcOpen = (ccModal && ccModal.classList.contains('active')) || circuitLabelsTarget === 'ccnotes';

    if (isCcOpen) {
        if (ccSelectedPart) {
            ccSelectedPart.label = texto;
            const btn = document.getElementById('cc-btn-label-edit');
            const txt = document.getElementById('cc-btn-label-text');
            if (txt) txt.innerText = `Legenda: ${texto}`;
            ccRenderAll();
        } else {
            ccAdicionarLegendaCircuito(texto);
        }
        fecharModalLegendasEletricas();
    } else {
        activatePlacementMode('circuit_label', texto, 'Legenda de Circuito');
        fecharModalLegendasEletricas();
    }
}

function ccAdicionarLegendaCircuito(texto) {
    ccState.annotations = ccState.annotations || [];
    const newAnn = {
        id: ccUid(),
        tex: texto,
        fontSize: 11, // EXATAMENTE a mesma dimensão das legendas dos componentes (11px Segoe UI bold)
        isCircuitLabel: true,
        x: ccSnap(220),
        y: ccSnap(160)
    };
    ccState.annotations.push(newAnn);
    ccSelectedAnnotation = newAnn;
    ccSelectedPart = null;
    ccSelectedWire = null;
    ccRenderAll();
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
            circuitData: circuitData,
            caption: b.dataset.caption || b.querySelector('.circuit-caption-box')?.innerHTML || '',
            captionX: parseFloat(b.dataset.captionX) || 0,
            captionY: parseFloat(b.dataset.captionY) || 0
        });
    });

    const titles = [];
    document.querySelectorAll('.placed-title-block').forEach(tb => {
        const cnt = tb.querySelector('.title-content');
        let cfg = null;
        try { if (tb.dataset.titleConfig) cfg = JSON.parse(tb.dataset.titleConfig); } catch(e) {}
        if (!cfg) {
            cfg = {
                font: tb.style.fontFamily,
                size: tb.style.fontSize,
                textColor: tb.style.color,
                bg: tb.style.backgroundColor,
                borderRadius: tb.style.borderRadius,
                borderStyle: 'solid 2px',
                borderColor: '#3b82f6'
            };
        }
        cfg.size = tb.style.fontSize || cfg.size;
        titles.push({
            left: parseFloat(tb.style.left) || 0,
            top: parseFloat(tb.style.top) || 0,
            html: cnt ? cnt.innerHTML : 'Título',
            config: cfg
        });
    });

    const postits = [];
    document.querySelectorAll('.placed-postit').forEach(p => {
        const cnt = p.querySelector('.postit-content');
        postits.push({
            color: p.dataset.color || 'yellow',
            left: parseFloat(p.style.left) || 0,
            top: parseFloat(p.style.top) || 0,
            width: parseFloat(p.style.width) || 200,
            height: parseFloat(p.style.height) || 180,
            html: cnt ? cnt.innerHTML : ''
        });
    });

    const markers = [];
    document.querySelectorAll('.placed-page-marker').forEach(m => {
        const txt = m.querySelector('.marker-text');
        markers.push({
            color: m.dataset.color || 'urgente',
            left: parseFloat(m.style.left) || 0,
            top: parseFloat(m.style.top) || 0,
            text: txt ? txt.innerText : ''
        });
    });

    const labels = [];
    document.querySelectorAll('.placed-label-card').forEach(l => {
        const vals = Array.from(l.querySelectorAll('.label-val')).map(v => v.innerText);
        labels.push({
            type: l.dataset.type || 'escola',
            left: parseFloat(l.style.left) || 0,
            top: parseFloat(l.style.top) || 0,
            vals: vals
        });
    });

    const templates = [];
    document.querySelectorAll('.placed-template-block').forEach(t => {
        templates.push({
            templateType: t.dataset.templateType || 'geral',
            left: parseFloat(t.style.left) || 0,
            top: parseFloat(t.style.top) || 0,
            html: t.innerHTML
        });
    });

    tabData.pages[pIdx] = {
        strokes: JSON.parse(JSON.stringify(currentStrokes || [])),
        templateIdx: templateIdx ?? 0,
        blocks: blocks,
        circuits: circuits,
        titles: titles,
        postits: postits,
        markers: markers,
        labels: labels,
        templates: templates
    };
}

function carregarPagina(cad, tab, pageIdx = 0, guardarAnterior = true) {
    if (guardarAnterior) guardarEstadoAtual();

    activeNotebook = cad;
    activeTab = tab;
    if (notebooks[cad]) notebooks[cad].activeTab = tab;

    const tabData = getTabData(cad, tab);
    if (pageIdx < 0) pageIdx = 0;
    if (pageIdx >= tabData.pages.length) pageIdx = tabData.pages.length - 1;
    tabData.currentPage = pageIdx;

    const page = tabData.pages[pageIdx];

    // Limpar elementos visuais da folha anterior
    document.querySelectorAll('.text-block, .circuit-placed-block, .placed-title-block, .placed-postit, .placed-page-marker, .placed-label-card, .placed-template-block').forEach(b => b.remove());

    templateIdx = page.templateIdx ?? 0;
    currentStrokes = JSON.parse(JSON.stringify(page.strokes || []));

    (page.blocks || []).forEach(b => {
        criarBlocoTexto(b.text, b.left, b.top, b.fontSize || 18, b.rotation || 0);
    });

    (page.circuits || []).forEach(c => {
        criarBlocoCircuitoNaFolha(c.svg, c.left, c.top, c.scale || 1, c.rotation || 0, c.circuitData, c.caption || '', c.captionX || 0, c.captionY || 0);
    });

    (page.titles || []).forEach(t => restaurarTituloBlock(t));
    (page.postits || []).forEach(p => restaurarPostIt(p));
    (page.markers || []).forEach(m => restaurarMarcadorPagina(m));
    (page.labels || []).forEach(l => restaurarEtiquetaCard(l));
    (page.templates || []).forEach(t => restaurarTemplateBlock(t));

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

    if (type === 'circuit_label') {
        criarBlocoTexto(data, x, y, 11, 0);
    } else if (type === 'formula' || type === 'symbol') {
        criarBlocoTexto(data, x, y, 22, 0);
    } else if (type === 'text') {
        criarBlocoTexto(data || 'Novo texto...', x, y, 18, 0);
    }

    cancelPendingPlacement();
    salvarNoLocalStorage();
}

let activeSidebarNotebooks = [];

function carregarCadernosIniciais() {
    try {
        const saved = localStorage.getItem('activeSidebarNotebooks');
        if (saved) activeSidebarNotebooks = JSON.parse(saved);
    } catch(e) {}
    if (!Array.isArray(activeSidebarNotebooks) || activeSidebarNotebooks.length === 0) {
        activeSidebarNotebooks = Object.keys(notebooks);
    }
    activeSidebarNotebooks = activeSidebarNotebooks.filter(c => notebooks[c]);
    if (!activeSidebarNotebooks.includes(activeNotebook) && notebooks[activeNotebook]) {
        activeSidebarNotebooks.push(activeNotebook);
    }
}

function renderCadernosSidebar() {
    const lista = document.getElementById('cadernos-lista');
    const selectAtivo = document.getElementById('selectCadernoAtivo');
    if (!lista) return;
    lista.innerHTML = '';

    if (activeSidebarNotebooks.length === 0) {
        carregarCadernosIniciais();
    }

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

    activeSidebarNotebooks.forEach(cad => {
        if (!notebooks[cad]) return;
        const card = document.createElement('div');
        

        const tabs = (notebooks[cad] && Array.isArray(notebooks[cad].tabs)) ? notebooks[cad].tabs : ["Teoria", "Exercícios"];
        let tabsHTML = '';
        tabs.forEach(tab => {
            const isTabActive = (cad === activeNotebook && tab === activeTab);
            const delBtn = tabs.length > 1
                ? `<button class="tab-del-btn" onclick="event.stopPropagation(); removerAba('${cad}', '${tab}')" title="Apagar separador ${tab}">✕</button>`
                : '';
            tabsHTML += `<span class="tab-chip ${isTabActive ? 'active' : ''}" onclick="event.stopPropagation(); carregarPagina('${cad}', '${tab}', 0); renderCadernosSidebar();">${tab}${delBtn}</span>`;
        });

        let collapsedNotebooks = {};
try { collapsedNotebooks = JSON.parse(localStorage.getItem('ccnotes_collapsed_notebooks') || '{}'); } catch(e) {}
const isCardCollapsed = !!collapsedNotebooks[cad];
card.className = 'notebook-card' + (cad === activeNotebook ? ' active' : '') + (isCardCollapsed ? ' card-collapsed' : '');

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
                    <button class="nb-collapse-btn" onclick="event.stopPropagation(); alternarMinimizarCaderno('${cad}')" title="${isCardCollapsed ? 'Expandir Caderno' : 'Minimizar Caderno'}">${isCardCollapsed ? '▶' : '▼'}</button>
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
    });

    if (window.lucide) lucide.createIcons();
}

function selecionarCadernoDropdown(cad) {
    if (!notebooks[cad]) return;
    if (!activeSidebarNotebooks.includes(cad)) {
        activeSidebarNotebooks.push(cad);
        localStorage.setItem('activeSidebarNotebooks', JSON.stringify(activeSidebarNotebooks));
    }
    const tabs = (notebooks[cad] && Array.isArray(notebooks[cad].tabs)) ? notebooks[cad].tabs : ["Teoria", "Exercícios"];
    const tabToLoad = tabs.includes(activeTab) ? activeTab : tabs[0];
    carregarPagina(cad, tabToLoad, 0);
    renderCadernosSidebar();
}

function tirarCadernoDaBarra(cad) {
    if (activeSidebarNotebooks.length <= 1) {
        alert("Deve manter pelo menos um caderno ativo na barra lateral.");
        return;
    }
    activeSidebarNotebooks = activeSidebarNotebooks.filter(c => c !== cad);
    localStorage.setItem('activeSidebarNotebooks', JSON.stringify(activeSidebarNotebooks));
    if (cad === activeNotebook) {
        const nextCad = activeSidebarNotebooks[0];
        const tabs = (notebooks[nextCad] && notebooks[nextCad].tabs) || ["Teoria", "Exercícios"];
        carregarPagina(nextCad, tabs[0], 0);
    } else {
        renderCadernosSidebar();
    }
}

function apagarCadernoDefinitivamente() {
    const selectAtivo = document.getElementById('selectCadernoAtivo');
    const cad = selectAtivo ? selectAtivo.value : activeNotebook;
    if (!cad || !notebooks[cad]) return;

    const totalCad = Object.keys(notebooks).length;
    if (totalCad <= 1) {
        alert("Não é possível apagar o único caderno existente.");
        return;
    }

    if (!confirm(`Tem a certeza absoluta que deseja APAGAR DEFINITIVAMENTE o caderno "${cad}" e todas as suas folhas? Esta operação não pode ser desfeita.`)) {
        return;
    }

    // 1. Determinar o próximo caderno ativo antes de eliminar
    const remainingKeys = Object.keys(notebooks).filter(k => k !== cad);
    activeSidebarNotebooks = activeSidebarNotebooks.filter(c => c !== cad);
    const nextCad = activeSidebarNotebooks[0] || remainingKeys[0];
    if (!activeSidebarNotebooks.includes(nextCad)) activeSidebarNotebooks.push(nextCad);
    localStorage.setItem('activeSidebarNotebooks', JSON.stringify(activeSidebarNotebooks));

    // 2. Apagar do objeto notebooks em memória
    delete notebooks[cad];

    // 3. Atualizar as variáveis globais para o novo caderno
    const nextTabs = (notebooks[nextCad] && notebooks[nextCad].tabs) || ["Teoria", "Exercícios"];
    activeNotebook = nextCad;
    activeTab = nextTabs[0];

    // 4. Carregar página sem gravar estado do caderno eliminado
    carregarPagina(nextCad, nextTabs[0], 0, false);

    // 5. Salvar base de dados e renderizar dropdown e sidebar atualizados
    salvarNoLocalStorage();
    renderCadernosSidebar();
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

    // Render de Anotações, Legendas Elétricas e Fórmulas no CCnotes
    (ccState.annotations || []).forEach(ann => {
        const isSel = (ccSelectedAnnotation?.id === ann.id);
        const fSize = ann.fontSize || (ann.isCircuitLabel ? 11 : 18);
        const isCircLabel = ann.isCircuitLabel || fSize <= 12;
        const fo = document.createElementNS(CC_NS, 'foreignObject');
        fo.setAttribute('x', ann.x);
        fo.setAttribute('y', ann.y);
        fo.setAttribute('width', Math.max(120, fSize * 8));
        fo.setAttribute('height', Math.max(30, fSize * 2.2));
        fo.style.overflow = 'visible';
        fo.style.cursor = 'move';

        const div = document.createElement('div');
        div.className = isCircLabel ? 'cc-annotation-circuit-label' : 'cc-annotation-math';
        div.style.cssText = `
            display: inline-flex;
            align-items: center;
            padding: ${isCircLabel ? '1px 4px' : '3px 6px'};
            background: ${isSel ? 'rgba(56, 189, 248, 0.15)' : 'transparent'};
            border: ${isSel ? '1.5px dashed #0284c7' : '1px solid transparent'};
            border-radius: 4px;
            color: ${isCircLabel ? '#0f172a' : '#0369a1'};
            font-family: 'Segoe UI', sans-serif;
            font-size: ${fSize}px;
            font-weight: bold;
            user-select: none;
            white-space: nowrap;
            line-height: 1.1;
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

function ccToggleSidebar() {
    const pal = document.getElementById('ccnotesSidebar') || document.querySelector('.ccnotes-palette');
    if (pal) {
        pal.classList.toggle('collapsed');
        if (pal.classList.contains('collapsed')) {
            pal.style.display = 'none';
        } else {
            pal.style.display = 'flex';
        }
    }
}

function ccToggleDimMode() {
    ccIsFixed = !ccIsFixed;
    const btn = document.getElementById('cc-comp-mode-btn');
    const txt = document.getElementById('cc-comp-mode-text');
    if (ccIsFixed) {
        if (btn) {
            btn.className = 'btn-dim-mode active-fixo';
            btn.title = 'Tamanho Fixo (30px)';
        }
        if (txt) txt.innerText = 'Fixo (30px)';
        ccSetPartSizeFromInput(30);
    } else {
        if (btn) {
            btn.className = 'btn-dim-mode active-dim';
            btn.title = 'Tamanho Livre (Dim)';
        }
        if (txt) txt.innerText = 'Dim Livre';
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

function ccRotateSelected(direction = 90) {
    if (ccSelectedPart) {
        ccSalvarHistorico();
        const oldTerms = ccGetPartAbsoluteTerminals(ccSelectedPart);
        const curRot = ccSelectedPart.rotation || 0;
        let newRot = (curRot + direction) % 360;
        if (newRot < 0) newRot += 360;
        ccSelectedPart.rotation = newRot;
        const newTerms = ccGetPartAbsoluteTerminals(ccSelectedPart);

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
    }
}

function ccDeleteSelected() {
    if (ccSelectedPart) {
        ccSalvarHistorico();
        ccState.parts = ccState.parts.filter(p => p !== ccSelectedPart);
        ccSelectedPart = null;
        ccUpdateLabelButton();
        ccRenderAll();
    } else if (ccSelectedWire) {
        ccSalvarHistorico();
        ccState.wires = ccState.wires.filter(w => w !== ccSelectedWire);
        ccSelectedWire = null;
        ccRenderAll();
    } else if (ccSelectedAnnotation) {
        ccSalvarHistorico();
        ccState.annotations = ccState.annotations.filter(a => a !== ccSelectedAnnotation);
        ccSelectedAnnotation = null;
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
    try {
        if (ccState.parts.length === 0 && ccState.wires.length === 0) {
            alert("Desenhe primeiro algum componente ou fio no circuito antes de o inserir.");
            return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        // Bounds dos fios
        ccState.wires.forEach(w => {
            minX = Math.min(minX, w.x1, w.x2);
            minY = Math.min(minY, w.y1, w.y2);
            maxX = Math.max(maxX, w.x1, w.x2);
            maxY = Math.max(maxY, w.y1, w.y2);
        });

        // Bounds dos componentes, terminais e legendas completas
        ccState.parts.forEach(p => {
            const h = (p.size || 50) / 2;
            minX = Math.min(minX, p.x - h);
            maxX = Math.max(maxX, p.x + h);
            minY = Math.min(minY, p.y - h);
            maxY = Math.max(maxY, p.y + h);

            // Terminais absolutos reais (objetos com {x, y})
            const terms = ccGetPartAbsoluteTerminals(p);
            terms.forEach(t => {
                const tx = t.x, ty = t.y;
                minX = Math.min(minX, tx - 5);
                maxX = Math.max(maxX, tx + 5);
                minY = Math.min(minY, ty - 5);
                maxY = Math.max(maxY, ty + 5);
            });

            // Bounding box das legendas de componentes (NUNCA cortar R1, 10k, V1, etc.)
            if (p.label && p.label.trim()) {
                const rot = (p.rotation || 0) % 360;
                const isVertical = (rot === 90 || rot === 270);
                const approxLen = p.label.trim().length * 8.5; // ~8.5px por caractere Segoe UI bold 11px

                if (isVertical) {
                    const lx = p.x + h + 18;
                    const ly = p.y + 4;
                    minX = Math.min(minX, lx);
                    maxX = Math.max(maxX, lx + approxLen + 12);
                    minY = Math.min(minY, ly - 14);
                    maxY = Math.max(maxY, ly + 6);
                } else {
                    const isGnd = (p.symbol === 'gnd');
                    const lx = p.x;
                    const ly = isGnd ? p.y + h + 22 : p.y - h - 14;
                    const halfW = (approxLen / 2) + 8;
                    minX = Math.min(minX, lx - halfW);
                    maxX = Math.max(maxX, lx + halfW);
                    minY = Math.min(minY, ly - 14);
                    maxY = Math.max(maxY, ly + 6);
                }
            }
        });

        // Bounds de anotações técnicas e legendas elétricas no circuito
        (ccState.annotations || []).forEach(ann => {
            const text = ann.tex || ann.text || '';
            if (!text.trim()) return;
            const fSize = ann.fontSize || 11;
            const approxW = Math.max(28, text.length * (fSize * 0.8) + 16);
            const approxH = fSize * 1.5 + 8;
            minX = Math.min(minX, ann.x - 4);
            minY = Math.min(minY, ann.y - 4);
            maxX = Math.max(maxX, ann.x + approxW);
            maxY = Math.max(maxY, ann.y + approxH);
        });

        if (minX === Infinity) { minX = 0; maxX = 100; minY = 0; maxY = 80; }

        // Margem de segurança adequada para NUNCA cortar legendas nem terminais
        const pad = 22;
        minX -= pad; minY -= pad; maxX += pad; maxY += pad;
        const width = Math.max(30, Math.round(maxX - minX));
        const height = Math.max(30, Math.round(maxY - minY));

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
        gAnn.querySelectorAll('.cc-annotation-math, .cc-annotation-circuit-label').forEach(el => {
            el.style.border = 'none';
            el.style.background = 'transparent';
        });

        svgClone.appendChild(gWires);
        svgClone.appendChild(gJunc);
        svgClone.appendChild(gParts);
        svgClone.appendChild(gAnn);

        const svgXml = new XMLSerializer().serializeToString(svgClone);
        const snapshotData = JSON.parse(JSON.stringify(ccState));

        // Se estiver a editar um bloco existente, atualiza o próprio bloco
        if (ccEditingBlock && document.body.contains(ccEditingBlock)) {
            ccEditingBlock.dataset.svgRaw = svgXml;
            ccEditingBlock.dataset.circuitData = JSON.stringify(snapshotData);
            const inner = ccEditingBlock.querySelector('.circuit-inner-svg');
            if (inner) inner.innerHTML = svgXml;
            ccEditingBlock = null;
        } else {
            const spawnX = Math.max(40, (A4_WIDTH - width) / 2);
            const wsTop = workspace ? (workspace.scrollTop || 0) : 0;
            const spawnY = Math.max(80, Math.min(A4_HEIGHT - height - 100, wsTop + 140));
            criarBlocoCircuitoNaFolha(svgXml, spawnX, spawnY, 1.0, 0, snapshotData);
        }

        resetComponentCounters(); // Novo circuito elétrico futuro começará do início (R1, V1, etc.)
        fecharCCnotesModal();
        salvarNoLocalStorage();
    } catch (err) {
        console.error("Erro ao inserir circuito na nota:", err);
        alert("Erro ao inserir circuito na folha: " + err.message);
    }
}

// --------------------------------------------------------
// Inicialização ao Carregar a Página
// --------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
    carregarDoLocalStorage();
    carregarCadernosIniciais();
    setPressureSensitivity(isPressureEnabled);
    atualizarPreviewTitulo();

    const tabData = getTabData(activeNotebook, activeTab);
    const initialPage = tabData.pages[tabData.currentPage || 0];
    if (initialPage) {
        templateIdx = initialPage.templateIdx ?? 0;
        currentStrokes = JSON.parse(JSON.stringify(initialPage.strokes || []));
        (initialPage.blocks || []).forEach(b => {
            criarBlocoTexto(b.text, b.left, b.top, b.fontSize, b.rotation);
        });
        (initialPage.circuits || []).forEach(c => {
            criarBlocoCircuitoNaFolha(c.svg, c.left, c.top, c.scale, c.rotation, c.circuitData, c.caption || '', c.captionX || 0, c.captionY || 0);
        });
        (initialPage.titles || []).forEach(t => restaurarTituloBlock(t));
        (initialPage.postits || []).forEach(p => restaurarPostIt(p));
        (initialPage.markers || []).forEach(m => restaurarMarcadorPagina(m));
        (initialPage.labels || []).forEach(l => restaurarEtiquetaCard(l));
        (initialPage.templates || []).forEach(t => restaurarTemplateBlock(t));
    }
    renderBackground();
    renderCadernosSidebar();
    redrawStrokes();
    aplicarZoom();
    atualizarContadorFolhas();
    setTool('pen');
    posicionarToolbarAoCentroDaFolha();

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
        const sm = document.getElementById('wordSymbolsModal');
        if (sm) sm.classList.remove('active');
    }
    if (!e.target.closest('.sidebar-create-group')) {
        const cm = document.getElementById('menuCriarDropdown');
        if (cm) {
            cm.classList.remove('open');
            cm.classList.remove('show');
        }
    }
    if (!e.target.closest('#postItModal') && !e.target.closest('#btn-postit-menu') && !e.target.closest('[onclick*="togglePostItModal"]')) {
        const pm = document.getElementById('postItModal');
        if (pm) pm.classList.remove('active');
    }
    if (!e.target.closest('#circuitLabelsModal') && !e.target.closest('#btn-circuit-preset-labels') && !e.target.closest('#cc-btn-preset-labels') && !e.target.closest('[onclick*="toggleCircuitLabelsModal"]')) {
        const clm = document.getElementById('circuitLabelsModal');
        if (clm) clm.classList.remove('active');
    }
});

function alternarMinimizarCaderno(cad) {
    let collapsedNotebooks = {};
    try { collapsedNotebooks = JSON.parse(localStorage.getItem('ccnotes_collapsed_notebooks') || '{}'); } catch(e) {}
    collapsedNotebooks[cad] = !collapsedNotebooks[cad];
    localStorage.setItem('ccnotes_collapsed_notebooks', JSON.stringify(collapsedNotebooks));
    renderCadernosSidebar();
}

// ========================================================
// ITEM 4: JANELA ENORME DE CRIAÇÃO (CREATION HUB MODAL)
// ========================================================
function abrirModalCentralCriar() {
    closeAllDropdowns();
    const modal = document.getElementById('modalCentralCriar');
    if (modal) modal.style.display = 'flex';
    if (window.lucide) lucide.createIcons();
}

function fecharModalCentralCriar() {
    const modal = document.getElementById('modalCentralCriar');
    if (modal) modal.style.display = 'none';
}

function filtrarHubCriar(cat, btn) {
    document.querySelectorAll('.hub-nav-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    
    document.querySelectorAll('#hubCardsGrid .hub-card').forEach(card => {
        if (cat === 'tudo' || card.dataset.cat === cat) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

// ========================================================
// ITEM 3: VISUALIZADOR DEDICADO DE HORÁRIO COM IMPRESSÃO
// ========================================================
let horarioTemaAtual = 'modern-blue';

function abrirVisualizadorHorario(tema = 'modern-blue') {
    closeAllDropdowns();
    const modal = document.getElementById('modalVisualizadorHorario');
    if (!modal) return;
    
    modal.style.display = 'flex';
    mudarEstiloHorario(tema);
    
    const sel = document.getElementById('horarioEstiloSelect');
    if (sel) sel.value = tema;

    if (window.lucide) lucide.createIcons();
}

function fecharVisualizadorHorario() {
    const modal = document.getElementById('modalVisualizadorHorario');
    if (modal) modal.style.display = 'none';
}

function mudarEstiloHorario(tema) {
    horarioTemaAtual = tema;
    const bodyContainer = document.getElementById('horarioFullscreenContainer');
    if (!bodyContainer) return;
    
    bodyContainer.className = 'horario-fullscreen-body theme-' + tema;
}

function imprimirHorarioDedicado() {
    document.body.classList.add('imprimindo-horario');
    window.print();
    setTimeout(() => {
        document.body.classList.remove('imprimindo-horario');
    }, 500);
}

function inserirHorarioDedicadoNaNota() {
    const container = document.getElementById('horarioFullscreenContainer');
    if (!container) return;
    const sheet = container.querySelector('.horario-sheet-container');
    if (!sheet) return;

    cadernoSalvarHistorico();
    const div = document.createElement('div');
    div.className = 'placed-template-block template-horario';
    div.dataset.templateType = 'horario';
    div.style.left = '30px';
    div.style.top = '80px';
    div.style.width = '730px';

    div.innerHTML = `
        <div class="template-header">
            <span class="template-title">📅 ${document.getElementById('horarioTituloInput')?.value || 'HORÁRIO ESCOLAR'}</span>
            <div class="template-actions">
                <button class="template-btn-del" onclick="this.closest('.placed-template-block').remove(); cadernoSalvarHistorico(); salvarNoLocalStorage();" title="Remover Template">✕</button>
            </div>
        </div>
        ${sheet.querySelector('table').outerHTML}
    `;

    ativarInteracaoTemplate(div);
    placedBlocksContainer.appendChild(div);
    salvarNoLocalStorage();
    fecharVisualizadorHorario();
    alert("Horário inserido na folha de notas!");
}
