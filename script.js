// ===== ДИАГНОСТИКА =====
window.addEventListener('error', function (e) {
    var banner = document.getElementById('error-banner');
    if (banner) {
        banner.style.display = 'block';
        banner.textContent = 'Ошибка JS: ' + e.message + ' (строка ' + e.lineno + ')';
    }
});

// =========================================================
// УПРАВЛЕНИЕ ЭКРАНАМИ
// =========================================================
var loadingBar = document.getElementById('loading-bar');
var loadingText = document.getElementById('loading-text');
var loadingScreen = document.getElementById('loading-screen');
var menuScreen = document.getElementById('menu-screen');
var difficultyScreen = document.getElementById('difficulty-screen');
var gameScreen = document.getElementById('game-screen');
var howtoModal = document.getElementById('howto-modal');

function isMobile() {
    return window.innerWidth <= 820;
}

function simulateLoading() {
    var progress = 0;
    var interval = setInterval(function () {
        progress += Math.random() * 15 + 5;
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            loadingBar.style.width = '100%';
            loadingText.textContent = 'Готово!';
            setTimeout(showMenu, 400);
        } else {
            loadingBar.style.width = progress + '%';
            loadingText.textContent = 'Загрузка... ' + Math.floor(progress) + '%';
        }
    }, 200);
}

function showMenu() {
    loadingScreen.style.display = 'none';
    menuScreen.style.display = 'flex';
    updateStatsUI();
}

function startGame() {
    if (isMobile()) {
        menuScreen.style.display = 'none';
        difficultyScreen.style.display = 'flex';
    } else {
        menuScreen.style.display = 'none';
        gameScreen.style.display = 'block';
        newGame();
    }
}

function startGameFromDifficulty() {
    difficultyScreen.style.display = 'none';
    gameScreen.style.display = 'block';
    newGame();
}

function backToMenuFromDifficulty() {
    difficultyScreen.style.display = 'none';
    menuScreen.style.display = 'flex';
    updateStatsUI();
}

function showHowTo() { howtoModal.style.display = 'flex'; }
function closeHowTo() { howtoModal.style.display = 'none'; }

function backToMenu() {
    stopTimer();
    closeSettings();
    gameScreen.style.display = 'none';
    difficultyScreen.style.display = 'none';
    document.getElementById('win').style.display = 'none';
    document.getElementById('lose-screen').style.display = 'none';
    menuScreen.style.display = 'flex';
    updateStatsUI();
}

document.getElementById('play-btn').addEventListener('click', function () { playSound('click'); startGame(); });
document.getElementById('howto-btn').addEventListener('click', function () { playSound('click'); showHowTo(); });
document.getElementById('close-howto').addEventListener('click', function () { playSound('click'); closeHowTo(); });
document.getElementById('menu-btn').addEventListener('click', function () { playSound('click'); backToMenu(); });
document.getElementById('win-menu-btn').addEventListener('click', function () { playSound('click'); backToMenu(); });
document.getElementById('start-game-btn').addEventListener('click', function () { playSound('click'); startGameFromDifficulty(); });
document.getElementById('back-to-menu-btn').addEventListener('click', function () { playSound('click'); backToMenuFromDifficulty(); });

simulateLoading();

// ===== ДАННЫЕ =====
var SUITS = [
    { sym: '♠', color: 'black' },
    { sym: '♥', color: 'red' },
    { sym: '♦', color: 'red' },
    { sym: '♣', color: 'black' }
];
var RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
var FOUNDATION_SUITS = ['♠', '♥', '♦', '♣']; // масти баз по номерам слотов

var stock, waste, foundations, tableau, moves;
var drag = null;
var dragLayer = null;

// =========================================================
// ЗВУКОВОЙ ДВИЖОК: РЕАЛИСТИЧНЫЕ КАРТЫ
// =========================================================
var audioCtx = null;
var noiseBuffer = null;
var soundEnabled = true;

function getAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

function getNoiseBuffer(ctx) {
    if (!noiseBuffer) {
        var len = Math.floor(ctx.sampleRate * 1.5);
        noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
        var data = noiseBuffer.getChannelData(0);
        for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
}

function cardSwish(ctx, when, dur, f0, f1, q, vol) {
    var src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer(ctx);
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(f0, when);
    bp.frequency.exponentialRampToValueAtTime(f1, when + dur);
    bp.Q.value = q;
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 400;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(vol, when + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(ctx.destination);
    var offset = Math.random() * 0.5;
    src.start(when, offset, dur + 0.02);
    src.stop(when + dur + 0.02);
}

function tableThud(ctx, when, vol) {
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, when);
    osc.frequency.exponentialRampToValueAtTime(55, when + 0.06);
    g.gain.setValueAtTime(vol * 0.35, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.08);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(when); osc.stop(when + 0.09);
}

function playSound(type) {
    if (!soundEnabled) return;
    try {
        var ctx = getAudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        var now = ctx.currentTime;
        var i, t;

        switch (type) {
            case 'place':
                cardSwish(ctx, now, 0.09, 3200, 1100, 1.2, 0.5);
                tableThud(ctx, now + 0.05, 0.25);
                break;

            case 'flip':
                cardSwish(ctx, now, 0.07, 1400, 4200, 1.5, 0.4);
                cardSwish(ctx, now + 0.05, 0.05, 3800, 1600, 1.5, 0.25);
                break;

            case 'draw':
                cardSwish(ctx, now, 0.08, 2600, 900, 1.3, 0.4);
                break;

            case 'deal':
                cardSwish(ctx, now, 0.05, 2400 + Math.random() * 600, 1000, 2.0, 0.12);
                break;

            case 'shuffle':
                t = now;
                for (i = 0; i < 8; i++) {
                    cardSwish(ctx, t, 0.045,
                        2000 + Math.random() * 2500,
                        900 + Math.random() * 800,
                        2.0, 0.3 + Math.random() * 0.15);
                    t += 0.055 + Math.random() * 0.04;
                }
                tableThud(ctx, t, 0.2);
                break;

            case 'win':
                t = now;
                for (i = 0; i < 14; i++) {
                    cardSwish(ctx, t, 0.04, 1800 + i * 220, 900 + i * 150, 2.2, 0.25 + i * 0.015);
                    t += 0.07 - i * 0.003;
                }
                var notes = [523, 659, 784, 1046];
                for (i = 0; i < notes.length; i++) {
                    var o = ctx.createOscillator();
                    var g2 = ctx.createGain();
                    o.type = 'sine';
                    o.frequency.setValueAtTime(notes[i], now + 0.9 + i * 0.12);
                    g2.gain.setValueAtTime(0.0001, now + 0.9 + i * 0.12);
                    g2.gain.linearRampToValueAtTime(0.12, now + 0.9 + i * 0.12 + 0.02);
                    g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.9 + i * 0.12 + 0.35);
                    o.connect(g2); g2.connect(ctx.destination);
                    o.start(now + 0.9 + i * 0.12);
                    o.stop(now + 0.9 + i * 0.12 + 0.4);
                }
                break;

            case 'lose':
                cardSwish(ctx, now, 0.25, 2200, 300, 1.0, 0.35);
                tableThud(ctx, now + 0.2, 0.3);
                break;

            case 'click':
                cardSwish(ctx, now, 0.035, 3000, 1800, 2.5, 0.25);
                break;

            case 'error':
                tableThud(ctx, now, 0.2);
                tableThud(ctx, now + 0.09, 0.15);
                break;
        }
    } catch (e) {}
}

// ===== УРОВНИ СЛОЖНОСТИ =====
var difficulty = 'easy';
var DRAW_COUNT    = { easy: 1, medium: 3, hard: 3, impossible: 3 };
var REDEALS       = { easy: 9999, medium: 9999, hard: 1, impossible: 0 };
var HINTS_ALLOWED = { easy: true, medium: true, hard: true, impossible: false };
var UNDO_LIMITS   = { easy: 15, medium: 10, hard: 5, impossible: 0 };
var IMPOSSIBLE_TIME = 300;
var redealsLeft = 9999;
var timerInterval = null;
var timeLeft = 0;

// ===== ФЛАГИ БЛОКИРОВКИ УПРАВЛЕНИЯ =====
var dealing = false;
var dealId = 0;
var autoFinishing = false;
var wonThisGame = false;

// ===== ОТМЕНА ХОДОВ =====
var undoStack = [];
var undosLeft = 0;

// =========================================================
// СТАТИСТИКА ПОБЕД
// =========================================================
var STATS_KEY = 'kosynka_stats_v1';
var stats = loadStats();

function loadStats() {
    try {
        var raw = localStorage.getItem(STATS_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { easy: { g: 0, w: 0 }, medium: { g: 0, w: 0 }, hard: { g: 0, w: 0 }, impossible: { g: 0, w: 0 } };
}

function saveStats() {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) {}
}

function recordGameStart() {
    stats[difficulty].g++;
    saveStats();
}

function recordWin() {
    stats[difficulty].w++;
    saveStats();
}

function statsText() {
    var keys = ['easy', 'medium', 'hard', 'impossible'];
    var parts = [];
    for (var i = 0; i < keys.length; i++) {
        parts.push(DIFF_RULES[keys[i]].title + ': ' + stats[keys[i]].w + '/' + stats[keys[i]].g);
    }
    return 'Статистика побед — ' + parts.join(' • ');
}

function updateStatsUI() {
    var sp = document.getElementById('stats-plate');
    if (sp) sp.textContent = statsText();
    var ws = document.getElementById('win-stats');
    if (ws) ws.textContent = 'Уровень «' + DIFF_RULES[difficulty].title + '»: побед ' + stats[difficulty].w + ' из ' + stats[difficulty].g;
}

// =========================================================
// НАСТРОЙКИ
// =========================================================
var settingsModal = document.getElementById('settings-modal');
var settingSound = document.getElementById('setting-sound');
var settingTapMove = document.getElementById('setting-tap-move');
var tapMoveEnabled = true;
var currentCardBack = 'onyx';

var CARD_BACKS = {
    onyx: 'linear-gradient(145deg, #2a2d3a 0%, #1a1d28 100%)',
    emerald: 'linear-gradient(145deg, #1a5c3a 0%, #0d3822 100%)',
    ruby: 'linear-gradient(145deg, #5c1a2a 0%, #380d18 100%)',
    sapphire: 'linear-gradient(145deg, #1a2a5c 0%, #0d1838 100%)',
    amber: 'linear-gradient(145deg, #5c3a1a 0%, #38220d 100%)',
    obsidian: 'linear-gradient(145deg, #1a1a1a 0%, #0a0a0a 100%)'
};

var CARD_BACK_BORDERS = {
    onyx: 'none',
    emerald: 'none',
    ruby: 'none',
    sapphire: 'none',
    amber: 'none',
    obsidian: 'none'
};

// Классическая красная рубашка в клетку
var CLASSIC_BACK = 'repeating-linear-gradient(45deg, rgba(255,255,255,.25) 0 2px, transparent 2px 6px), repeating-linear-gradient(-45deg, rgba(255,255,255,.25) 0 2px, transparent 2px 6px), linear-gradient(#c40000, #a00000)';

// ===== ТЕМА ОФОРМЛЕНИЯ =====
var currentTheme = (function () {
    try { return localStorage.getItem('kosynka_theme') || 'modern'; } catch (e) { return 'modern'; }
})();

function applyTheme() {
    document.body.classList.toggle('theme-classic', currentTheme === 'classic');
    if (gameScreen.style.display === 'block') render();
}

function openSettings() { settingsModal.style.display = 'flex'; }
function closeSettings() { settingsModal.style.display = 'none'; }

function applyCardBack(backName) {
    currentCardBack = backName;
    document.querySelectorAll('.card-back-option').forEach(function (opt) {
        opt.classList.toggle('active', opt.getAttribute('data-back') === backName);
    });
    if (gameScreen.style.display === 'block') {
        render();
    }
}

document.getElementById('settings-btn').addEventListener('click', function () { playSound('click'); openSettings(); });
document.getElementById('game-settings-btn').addEventListener('click', function () { playSound('click'); openSettings(); });
document.getElementById('close-settings').addEventListener('click', function () { playSound('click'); closeSettings(); });

document.getElementById('setting-sound').addEventListener('change', function () {
    soundEnabled = this.checked;
});

document.getElementById('setting-tap-move').addEventListener('change', function () {
    tapMoveEnabled = this.checked;
});

var settingTheme = document.getElementById('setting-theme');
settingTheme.checked = (currentTheme === 'classic');
settingTheme.addEventListener('change', function () {
    currentTheme = this.checked ? 'classic' : 'modern';
    try { localStorage.setItem('kosynka_theme', currentTheme); } catch (e) {}
    playSound('click');
    applyTheme();
});

document.querySelectorAll('.card-back-option').forEach(function (opt) {
    opt.addEventListener('click', function () {
        playSound('click');
        applyCardBack(opt.getAttribute('data-back'));
    });
});

// Правила уровней для плашек
var DIFF_RULES = {
    easy:       { title: 'Лёгкий',       rules: ['Из колоды тянем 1 карту', 'Проходы колоды: безлимитно', 'Подсказки: доступны'] },
    medium:     { title: 'Средний',      rules: ['Тянем 3 карты, играет только верхняя', 'Проходы колоды: безлимитно', 'Подсказки: доступны'] },
    hard:       { title: 'Сложный',      rules: ['Тянем 3 карты, играет только верхняя', 'Лишь 1 повторный проход колоды', 'Подсказки: доступны'] },
    impossible: { title: 'Невозможный',  rules: ['Тянем 3 карты, играет только верхняя', 'Только один проход колоды', 'Подсказок нет', 'Таймер: успей выиграть за 5:00'] }
};

function fillRulesPlate(titleId, listId, diff) {
    var info = DIFF_RULES[diff];
    document.getElementById(titleId).textContent = info.title + ': правила';
    var list = document.getElementById(listId);
    list.innerHTML = '';
    for (var i = 0; i < info.rules.length; i++) {
        var li = document.createElement('li');
        li.textContent = info.rules[i];
        list.appendChild(li);
    }
}

// =========================================================
// ПРОВЕРКА БАЗ: КЛАДЁМ ТОЛЬКО В СВОЮ МАСТЬ
// =========================================================
function canPlaceFoundationIndex(card, i) {
    if (card.suit !== FOUNDATION_SUITS[i]) return false;
    var f = foundations[i];
    if (f.length === 0) return card.value === 1;
    var top = f[f.length - 1];
    return top.suit === card.suit && top.value === card.value - 1;
}

// =========================================================
// ОТМЕНА ХОДОВ: снапшоты состояния
// =========================================================
function snapPile(pile) {
    var out = [];
    for (var i = 0; i < pile.length; i++) out.push({ c: pile[i], fu: pile[i].faceUp });
    return out;
}

function takeSnapshot() {
    return {
        stock: snapPile(stock),
        waste: snapPile(waste),
        foundations: [snapPile(foundations[0]), snapPile(foundations[1]), snapPile(foundations[2]), snapPile(foundations[3])],
        tableau: [snapPile(tableau[0]), snapPile(tableau[1]), snapPile(tableau[2]), snapPile(tableau[3]), snapPile(tableau[4]), snapPile(tableau[5]), snapPile(tableau[6])],
        moves: moves,
        redealsLeft: redealsLeft
    };
}

function restPile(snap) {
    var out = [];
    for (var i = 0; i < snap.length; i++) {
        snap[i].c.faceUp = snap[i].fu;
        out.push(snap[i].c);
    }
    return out;
}

function restoreSnapshot(s) {
    stock = restPile(s.stock);
    waste = restPile(s.waste);
    foundations = [restPile(s.foundations[0]), restPile(s.foundations[1]), restPile(s.foundations[2]), restPile(s.foundations[3])];
    tableau = [restPile(s.tableau[0]), restPile(s.tableau[1]), restPile(s.tableau[2]), restPile(s.tableau[3]), restPile(s.tableau[4]), restPile(s.tableau[5]), restPile(s.tableau[6])];
    moves = s.moves;
    redealsLeft = s.redealsLeft;
    render();
}

function pushUndo() {
    undoStack.push(takeSnapshot());
    if (undoStack.length > 300) undoStack.shift();
}

function updateUndoUI() {
    var btn = document.getElementById('undo-btn');
    btn.style.display = (UNDO_LIMITS[difficulty] === 0) ? 'none' : '';
    document.getElementById('undo-left').textContent = undosLeft;
}

function undoMove() {
    if (dealing || autoFinishing) return;
    if (UNDO_LIMITS[difficulty] === 0) return;
    if (undosLeft <= 0) { flashMessage('Отмены ходов закончились!'); return; }
    if (!undoStack.length) { flashMessage('Нет ходов для отмены'); return; }
    restoreSnapshot(undoStack.pop());
    undosLeft--;
    updateUndoUI();
    playSound('flip');
}

// =========================================================
// АВТО-ПЕРЕМЕЩЕНИЕ КАРТЫ (двойной клик)
// =========================================================
function autoMoveCard(card) {
    if (dealing) return;
    if (autoFinishing) return;
    var source = null;
    var col = -1;

    if (waste.length && waste[waste.length - 1] === card) {
        source = 'waste';
    } else {
        for (var c = 0; c < 7; c++) {
            if (tableau[c].length && tableau[c][tableau[c].length - 1] === card) {
                source = 'tableau';
                col = c;
                break;
            }
        }
    }

    if (!source) {
        for (var f = 0; f < 4; f++) {
            if (foundations[f].length && foundations[f][foundations[f].length - 1] === card) {
                source = 'foundation';
                col = f;
                break;
            }
        }
    }

    if (!source) return;

    // 1. Пробуем на базу (только в свою масть)
    for (var i = 0; i < 4; i++) {
        var f = foundations[i];
        if (canPlaceFoundationIndex(card, i)) {
            pushUndo();
            if (source === 'waste') waste.pop();
            else if (source === 'tableau') {
                tableau[col].pop();
                if (tableau[col].length && !tableau[col][tableau[col].length - 1].faceUp) {
                    tableau[col][tableau[col].length - 1].faceUp = true;
                }
            } else if (source === 'foundation') {
                foundations[col].pop();
            }
            f.push(card);
            moves++;
            playSound('place');
            render();
            checkWin();
            return;
        }
    }

    // 2. Пробуем на столбец
    for (var t = 0; t < 7; t++) {
        if (source === 'tableau' && t === col) continue;
        if (canPlaceTableau(card, tableau[t])) {
            pushUndo();
            if (source === 'waste') waste.pop();
            else if (source === 'tableau') {
                tableau[col].pop();
                if (tableau[col].length && !tableau[col][tableau[col].length - 1].faceUp) {
                    tableau[col][tableau[col].length - 1].faceUp = true;
                }
            } else if (source === 'foundation') {
                foundations[col].pop();
            }
            tableau[t].push(card);
            moves++;
            playSound('place');
            render();
            return;
        }
    }
}

// ===== НОВАЯ ИГРА =====
function newGame() {
    var deck = [];
    for (var s = 0; s < 4; s++) {
        for (var r = 0; r < 13; r++) {
            deck.push({
                suit: SUITS[s].sym,
                color: SUITS[s].color,
                rank: RANKS[r],
                value: r + 1,
                faceUp: false,
                el: null
            });
        }
    }
    for (var i = deck.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }

    stock = []; waste = [];
    foundations = [[], [], [], []];
    tableau = [[], [], [], [], [], [], []];
    moves = 0;
    drag = null;
    wonThisGame = false;

    for (var col = 0; col < 7; col++) {
        for (var row = 0; row <= col; row++) {
            var card = deck.pop();
            card.faceUp = (row === col);
            tableau[col].push(card);
        }
    }
    stock = deck;

    document.getElementById('win').style.display = 'none';
    document.getElementById('lose-screen').style.display = 'none';

    playSound('shuffle'); // перетасовка перед раздачей

    redealsLeft = REDEALS[difficulty];
    undoStack = [];
    undosLeft = UNDO_LIMITS[difficulty];
    updateUndoUI();
    recordGameStart();

    fillRulesPlate('game-rules-title', 'game-rules-list', difficulty);
    document.getElementById('hint-btn').style.display = HINTS_ALLOWED[difficulty] ? '' : 'none';
    var timerBox = document.getElementById('timer-box');
    if (difficulty === 'impossible') {
        timerBox.style.display = '';
        startTimer();
    } else {
        timerBox.style.display = 'none';
        stopTimer();
    }

    render();
    dealAnimation(); // карты вылетают из колоды по одной
}

// =========================================================
// АНИМАЦИЯ РАЗДАЧИ КАРТ
// =========================================================
function dealAnimation() {
    var myId = ++dealId;
    dealing = true;

    var scale = zoomLevels[currentZoom] || 1;
    var stockRect = document.getElementById('stock').getBoundingClientRect();

    var seq = [];
    for (var r = 0; r < 7; r++) {
        for (var c = r; c < 7; c++) {
            seq.push({ c: c, r: r });
        }
    }

    seq.forEach(function (item) {
        var card = tableau[item.c][item.r];
        var el = card.el;
        if (!el) return;
        var rect = el.getBoundingClientRect();
        var dx = (stockRect.left - rect.left) / scale;
        var dy = (stockRect.top - rect.top) / scale;
        el.style.transition = 'none';
        el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        el.style.opacity = '0';
        if (card.faceUp) {
            el.classList.add('face-down', 'dealing');
            el.style.background = (currentTheme === 'classic') ? CLASSIC_BACK : CARD_BACKS[currentCardBack];
        }
    });
    void document.body.offsetWidth;

    seq.forEach(function (item, i) {
        var card = tableau[item.c][item.r];
        var el = card.el;
        if (!el) return;
        setTimeout(function () {
            if (myId !== dealId) return;
            el.style.transition = 'transform .16s ease-out, opacity .06s linear';
            el.style.opacity = '1';
            el.style.transform = '';
            playSound('deal');
            setTimeout(function () {
                if (myId !== dealId) return;
                el.style.transition = '';
                if (card.faceUp) {
                    el.classList.remove('face-down', 'dealing');
                    el.style.background = '';
                    playSound('flip');
                }
                if (i === seq.length - 1) dealing = false;
            }, 170);
        }, i * 55);
    });
}

// =========================================================
// АВТО-ДОИГРЫВАНИЕ
// =========================================================
function allFaceUp() {
    for (var c = 0; c < 7; c++) {
        for (var k = 0; k < tableau[c].length; k++) {
            if (!tableau[c][k].faceUp) return false;
        }
    }
    return true;
}

function canAutoFinish() {
    return !dealing && !autoFinishing && stock.length === 0 && allFaceUp();
}

function autoFinishStep() {
    var i, c, f;
    if (waste.length) {
        var wc = waste[waste.length - 1];
        for (i = 0; i < 4; i++) {
            if (canPlaceFoundationIndex(wc, i)) {
                waste.pop();
                foundations[i].push(wc);
                moves++;
                playSound('place');
                render();
                return true;
            }
        }
    }
    for (c = 0; c < 7; c++) {
        var pile = tableau[c];
        if (!pile.length) continue;
        var top = pile[pile.length - 1];
        for (f = 0; f < 4; f++) {
            if (canPlaceFoundationIndex(top, f)) {
                pile.pop();
                foundations[f].push(top);
                moves++;
                playSound('place');
                render();
                return true;
            }
        }
    }
    return false;
}

function maybeAutoFinish() {
    if (!canAutoFinish()) return;
    autoFinishing = true;

    function step() {
        if (!autoFinishStep()) {
            autoFinishing = false;
            return;
        }
        var done = true;
        for (var i = 0; i < 4; i++) {
            if (foundations[i].length !== 13) done = false;
        }
        if (done) {
            autoFinishing = false;
            checkWin();
            return;
        }
        setTimeout(step, 120);
    }

    setTimeout(step, 350);
}

// ===== СЛОЙ ПЕРЕТАСКИВАНИЯ =====
function getLayer() {
    if (!dragLayer) {
        dragLayer = document.createElement('div');
        dragLayer.id = 'drag-layer';
        document.body.appendChild(dragLayer);
    }
    return dragLayer;
}

// ===== СОЗДАНИЕ ЭЛЕМЕНТА КАРТЫ =====
function makeCardEl(card) {
    var el = document.createElement('div');
    el.className = 'card';

    if (!card.faceUp) {
        el.classList.add('face-down');
        if (currentTheme === 'classic') {
            el.style.background = CLASSIC_BACK;
            el.style.border = '1px solid #000';
            el.style.boxShadow = 'inset 0 0 0 3px #fff';
        } else {
            el.style.background = CARD_BACKS[currentCardBack];
            el.style.border = CARD_BACK_BORDERS[currentCardBack];
        }
        el.addEventListener('click', function (e) {
            if (dealing) return;
            if (autoFinishing) return;
            for (var c = 0; c < 7; c++) {
                var pile = tableau[c];
                if (pile.length && pile[pile.length - 1] === card) {
                    e.stopPropagation();
                    pushUndo();
                    card.faceUp = true;
                    playSound('flip');
                    render();
                    return;
                }
            }
        });
    } else {
        el.style.color = (card.color === 'red') ? '#c62828' : '#212121';
        // В классике числовые карты рисуем пипсами, как в Windows
        var centerArt = (currentTheme === 'classic' && card.value <= 10) ? pipArt(card) : faceArt(card);
        el.innerHTML =
            '<div class="corner top">' + card.rank + '<br>' + card.suit + '</div>' +
            centerArt +
            '<div class="corner bottom">' + card.rank + '<br>' + card.suit + '</div>';

        var lastTapTime = 0;
        var dragTimeout = null;
        var pendingEvent = null;

        el.addEventListener('pointerdown', function (e) {
            if (dealing) return;
            if (autoFinishing) return;
            var now = Date.now();

            if (tapMoveEnabled && (now - lastTapTime) < 300) {
                if (dragTimeout) { clearTimeout(dragTimeout); dragTimeout = null; }
                e.preventDefault();
                e.stopPropagation();
                lastTapTime = 0;
                autoMoveCard(card);
                return;
            }

            lastTapTime = now;
            pendingEvent = e;

            dragTimeout = setTimeout(function () {
                dragTimeout = null;
                if (pendingEvent) {
                    startDrag(pendingEvent, card);
                    pendingEvent = null;
                }
            }, 200);
        });

        el.addEventListener('pointermove', function (e) {
            if (dragTimeout && pendingEvent) {
                clearTimeout(dragTimeout);
                dragTimeout = null;
                startDrag(pendingEvent, card);
                pendingEvent = null;
            }
        });
    }

    card.el = el;
    return el;
}

// =========================================================
// РИСУНКИ КАРТ (SVG)
// =========================================================
var SUIT_INNER = {
    '♥': '<path d="M50 88 C33 74 26 63 35 56 C42 51 48 56 50 62 C52 56 58 51 65 56 C74 63 67 74 50 88 Z"/>',
    '♦': '<path d="M50 12 L78 50 L50 88 L22 50 Z"/>',
    '♠': '<path d="M50 12 C24 40 22 58 36 64 C43 67 48 64 50 60 C52 64 57 67 64 64 C78 58 76 40 50 12 Z M50 58 C48 72 43 80 38 86 L62 86 C57 80 52 72 50 58 Z"/>',
    '♣': '<circle cx="50" cy="28" r="15"/><circle cx="33" cy="52" r="15"/><circle cx="67" cy="52" r="15"/><path d="M50 48 C48 66 44 76 38 86 L62 86 C56 76 52 66 50 48 Z"/>'
};

function suitAt(suit, x, y, s, fill) {
    return '<g fill="' + (fill || 'currentColor') + '" transform="translate(' + x + ',' + y + ') scale(' + s + ') translate(-50,-50)">' + SUIT_INNER[suit] + '</g>';
}

function faceArt(card) {
    var r = card.rank;
    if (r === 'A') {
        return '<svg class="face-art" viewBox="0 0 100 100">' +
            '<circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-width="2.5" opacity="0.30"/>' +
            '<circle cx="50" cy="50" r="36" fill="none" stroke="currentColor" stroke-width="1" opacity="0.20"/>' +
            suitAt(card.suit, 50, 50, 0.72) + '</svg>';
    }
    if (r === 'K') {
        return '<svg class="face-art" viewBox="0 0 100 100">' +
            '<path fill="currentColor" d="M16 60 L10 24 L31 40 L50 14 L69 40 L90 24 L84 60 Z"/>' +
            '<rect fill="currentColor" x="16" y="62" width="68" height="10" rx="5"/>' +
            '<circle fill="currentColor" cx="10" cy="20" r="4.5"/>' +
            '<circle fill="currentColor" cx="50" cy="10" r="4.5"/>' +
            '<circle fill="currentColor" cx="90" cy="20" r="4.5"/>' +
            suitAt(card.suit, 50, 86, 0.28) + '</svg>';
    }
    if (r === 'Q') {
        return '<svg class="face-art" viewBox="0 0 100 100">' +
            '<path fill="currentColor" d="M22 56 L18 26 L35 40 L50 18 L65 40 L82 26 L78 56 Z"/>' +
            '<rect fill="currentColor" x="22" y="58" width="56" height="9" rx="4.5"/>' +
            '<circle fill="currentColor" cx="18" cy="22" r="4"/>' +
            '<circle fill="currentColor" cx="50" cy="14" r="4"/>' +
            '<circle fill="currentColor" cx="82" cy="22" r="4"/>' +
            '<circle fill="#ffffff" opacity="0.9" cx="50" cy="62.5" r="3.2"/>' +
            suitAt(card.suit, 50, 86, 0.28) + '</svg>';
    }
    if (r === 'J') {
        return '<svg class="face-art" viewBox="0 0 100 100">' +
            '<path fill="currentColor" d="M50 6 L84 18 V46 C84 68 70 82 50 92 C30 82 16 68 16 46 V18 Z"/>' +
            suitAt(card.suit, 50, 46, 0.45, '#ffffff') + '</svg>';
    }
    return '<div class="middle">' + card.suit + '</div>';
}

// ===== КЛАССИЧЕСКИЕ ПИПСЫ (расположение мастей как в Windows) =====
var PIP_POS = {
    2: [[50,18],[50,82,1]],
    3: [[50,18],[50,50],[50,82,1]],
    4: [[30,18],[70,18],[30,82,1],[70,82,1]],
    5: [[30,18],[70,18],[50,50],[30,82,1],[70,82,1]],
    6: [[30,18],[70,18],[30,50],[70,50],[30,82,1],[70,82,1]],
    7: [[30,18],[70,18],[50,34],[30,50],[70,50],[30,82,1],[70,82,1]],
    8: [[30,18],[70,18],[50,34],[30,50],[70,50],[50,66,1],[30,82,1],[70,82,1]],
    9: [[30,18],[70,18],[30,39],[70,39],[50,50],[30,61,1],[70,61,1],[30,82,1],[70,82,1]],
    10:[[30,18],[70,18],[50,28],[30,39],[70,39],[30,61,1],[70,61,1],[50,72,1],[30,82,1],[70,82,1]]
};

function pipArt(card) {
    if (card.value === 1) {
        return '<svg class="pip-art" viewBox="0 0 100 100">' + suitAt(card.suit, 50, 50, 0.55) + '</svg>';
    }
    var pos = PIP_POS[card.value];
    var out = '<svg class="pip-art" viewBox="0 0 100 100">';
    for (var i = 0; i < pos.length; i++) {
        var x = pos[i][0], y = pos[i][1], flip = pos[i][2];
        if (flip) {
            out += '<g transform="rotate(180 ' + x + ' ' + y + ')">' + suitAt(card.suit, x, y, 0.2) + '</g>';
        } else {
            out += suitAt(card.suit, x, y, 0.2);
        }
    }
    out += '</svg>';
    return out;
}

// ===== ОТРИСОВКА =====
function render() {
    document.getElementById('moves').textContent = moves;

    var stockEl = document.getElementById('stock');
    stockEl.innerHTML = '';
    stockEl.classList.remove('empty');
    if (stock.length > 0) {
        stockEl.appendChild(makeCardEl({ faceUp: false, el: null }));
    } else if (waste.length > 0 && redealsLeft > 0) {
        stockEl.classList.add('empty');
    }

    var wasteEl = document.getElementById('waste');
    wasteEl.innerHTML = '';
    var wasteShow = Math.min(waste.length, 3);
    for (var w = waste.length - wasteShow; w < waste.length; w++) {
        var wEl = makeCardEl(waste[w]);
        var wOffset = (w - (waste.length - wasteShow)) * 18;
        wEl.style.left = wOffset + 'px';
        wEl.style.zIndex = w + 1;
        wasteEl.appendChild(wEl);
    }

    for (var i = 0; i < 4; i++) {
        var fEl = document.querySelector('.foundation[data-f="' + i + '"]');
        fEl.innerHTML = '';
        if (foundations[i].length > 0) {
            fEl.appendChild(makeCardEl(foundations[i][foundations[i].length - 1]));
        }
    }

    for (var c = 0; c < 7; c++) {
        var colEl = document.querySelector('.column[data-col="' + c + '"]');
        colEl.innerHTML = '';
        var cardW = colEl.offsetWidth || 90;
        var step = cardW < 70 ? Math.round(cardW * 0.3) : 30;
        for (var k = 0; k < tableau[c].length; k++) {
            var card = tableau[c][k];
            var el = makeCardEl(card);
            el.style.top = (k * step) + 'px';
            el.style.zIndex = k + 1;
            colEl.appendChild(el);
        }
    }

    // Проверяем, не пора ли авто-доигрывание
    maybeAutoFinish();
}

// ===== ПЕРЕТАСКИВАНИЕ =====
function startDrag(e, card) {
    if (drag) return;
    if (dealing) return;
    if (autoFinishing) return;
    if (e.button !== undefined && e.button !== 0) return;

    var source = null, col = -1, fIndex = -1, cards = null;

    if (waste.length && waste[waste.length - 1] === card) {
        source = 'waste';
        cards = [card];
    } else {
        for (var c = 0; c < 7; c++) {
            var idx = tableau[c].indexOf(card);
            if (idx !== -1) {
                source = 'tableau';
                col = c;
                cards = tableau[c].slice(idx);
                break;
            }
        }
    }
    if (!source) {
        for (var f = 0; f < 4; f++) {
            var fp = foundations[f];
            if (fp.length && fp[fp.length - 1] === card) {
                source = 'foundation';
                fIndex = f;
                cards = [card];
                break;
            }
        }
    }
    if (!source) return;

    var rect = card.el.getBoundingClientRect();
    var layer = getLayer();
    layer.innerHTML = '';
    for (var k = 0; k < cards.length; k++) {
        var el = cards[k].el;
        el.style.top = (k * 26) + 'px';
        el.style.left = '0px';
        el.style.zIndex = k + 1;
        layer.appendChild(el);
    }
    layer.style.display = 'block';

    drag = {
        cards: cards, source: source, col: col, fIndex: fIndex,
        offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top
    };
    positionLayer(e.clientX, e.clientY);
    e.preventDefault();
}

function positionLayer(x, y) {
    var layer = getLayer();
    layer.style.left = (x - drag.offsetX) + 'px';
    layer.style.top = (y - drag.offsetY) + 'px';
}

function getTarget(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el) return null;
    var col = el.closest ? el.closest('.column') : null;
    if (col) return { type: 'column', index: parseInt(col.getAttribute('data-col'), 10), el: col };
    var f = el.closest ? el.closest('.foundation') : null;
    if (f) return { type: 'foundation', index: parseInt(f.getAttribute('data-f'), 10), el: f };
    return null;
}

function clearHighlight() {
    var hs = document.querySelectorAll('.highlight, .highlight-empty');
    for (var i = 0; i < hs.length; i++) {
        hs[i].classList.remove('highlight');
        hs[i].classList.remove('highlight-empty');
    }
}

function highlightTarget(t) {
    if (!t) return;
    if (t.type === 'column') {
        var pile = tableau[t.index];
        if (pile.length > 0 && pile[pile.length - 1].el) {
            pile[pile.length - 1].el.classList.add('highlight');
        } else {
            t.el.classList.add('highlight-empty');
        }
    } else {
        var f = foundations[t.index];
        if (f.length > 0 && f[f.length - 1].el) {
            f[f.length - 1].el.classList.add('highlight');
        } else {
            t.el.classList.add('highlight');
        }
    }
}

document.addEventListener('pointermove', function (e) {
    if (!drag) return;
    positionLayer(e.clientX, e.clientY);
    clearHighlight();
    highlightTarget(getTarget(e.clientX, e.clientY));
});

document.addEventListener('pointerup', function (e) {
    if (!drag) return;
    var target = getTarget(e.clientX, e.clientY);
    if (target) {
        if (target.type === 'column') {
            tryMoveToColumn(target.index);
        } else if (drag.cards.length === 1) {
            tryMoveToFoundation(target.index);
        }
    }
    clearHighlight();
    var layer = getLayer();
    layer.style.display = 'none';
    layer.innerHTML = '';
    drag = null;
    render();
    checkWin();
});

// ===== ПРАВИЛА ПЕРЕМЕЩЕНИЯ =====
function removeDragFromSource() {
    if (drag.source === 'waste') {
        waste.pop();
    } else if (drag.source === 'foundation') {
        foundations[drag.fIndex].pop();
    } else {
        var pile = tableau[drag.col];
        var idx = pile.indexOf(drag.cards[0]);
        pile.splice(idx, pile.length - idx);
        if (pile.length && !pile[pile.length - 1].faceUp) pile[pile.length - 1].faceUp = true;
    }
}

function tryMoveToColumn(col) {
    if (!drag) return false;
    if (drag.source === 'tableau' && drag.col === col) return false;
    if (!canPlaceTableau(drag.cards[0], tableau[col])) return false;
    pushUndo();
    removeDragFromSource();
    for (var k = 0; k < drag.cards.length; k++) tableau[col].push(drag.cards[k]);
    moves++;
    playSound('place');
    return true;
}

function tryMoveToFoundation(i) {
    if (!drag || drag.cards.length !== 1) return false;
    if (drag.source === 'foundation' && drag.fIndex === i) return false;
    var card = drag.cards[0];
    if (!canPlaceFoundationIndex(card, i)) return false;
    pushUndo();
    removeDragFromSource();
    foundations[i].push(card);
    moves++;
    playSound('place');
    return true;
}

function canPlaceTableau(card, pile) {
    if (pile.length === 0) return card.value === 13;
    var top = pile[pile.length - 1];
    return top.faceUp && top.color !== card.color && top.value === card.value + 1;
}

function checkWin() {
    for (var i = 0; i < 4; i++) {
        if (foundations[i].length !== 13) return;
    }
    stopTimer();
    if (!wonThisGame) {
        wonThisGame = true;
        recordWin();
        updateStatsUI();
    }
    playSound('win');
    document.getElementById('win').style.display = 'flex';
}

// ===== КНОПКИ И КОЛОДА =====
function initListeners() {
    document.getElementById('stock').addEventListener('click', function (e) {
        e.stopPropagation();
        if (dealing) return;
        if (autoFinishing) return;
        if (stock.length > 0) {
            pushUndo();
            var n = Math.min(DRAW_COUNT[difficulty], stock.length);
            for (var d = 0; d < n; d++) {
                var c = stock.pop();
                c.faceUp = true;
                waste.push(c);
            }
            moves++;
            playSound('draw');
            render();
        } else if (waste.length > 0 && redealsLeft > 0) {
            pushUndo();
            stock = waste.reverse();
            for (var i = 0; i < stock.length; i++) stock[i].faceUp = false;
            waste = [];
            redealsLeft--;
            moves++;
            playSound('draw');
            render();
        } else if (waste.length > 0) {
            flashMessage('Проходы колоды закончились!');
        }
    });
    document.getElementById('new-game-btn').addEventListener('click', function () {
        playSound('click');
        showConfirmModal();
    });
    document.getElementById('again-btn').addEventListener('click', function () {
        playSound('click');
        newGame();
    });
}

// ===== ЯНДЕКС SDK =====
try {
    if (window.YaGames) {
        YaGames.init().then(function (ysdk) {
            window.ysdk = ysdk;
            if (ysdk.features && ysdk.features.LoadingAPI) ysdk.features.LoadingAPI.ready();
            ysdk.gameplay.start();
        }).catch(function () {});
    }
} catch (e) {}

// =========================================================
// ПОДСКАЗКИ (с призрачной анимацией)
// =========================================================
function findHint() {
    var c, i, k, t, pile, card;

    for (c = 0; c < 7; c++) {
        pile = tableau[c];
        if (pile.length) {
            card = pile[pile.length - 1];
            for (i = 0; i < 4; i++) {
                if (canPlaceFoundationIndex(card, i)) {
                    return { cards: [card], targetType: 'foundation', targetIndex: i };
                }
            }
        }
    }
    if (waste.length) {
        card = waste[waste.length - 1];
        for (i = 0; i < 4; i++) {
            if (canPlaceFoundationIndex(card, i)) {
                return { cards: [card], targetType: 'foundation', targetIndex: i };
            }
        }
    }
    for (c = 0; c < 7; c++) {
        pile = tableau[c];
        for (k = 0; k < pile.length; k++) {
            card = pile[k];
            if (!card.faceUp) continue;
            var reveals = (k > 0 && !pile[k - 1].faceUp);
            var empties = (k === 0);
            if (!reveals && !empties) continue;
            for (t = 0; t < 7; t++) {
                if (t === c) continue;
                if (empties && tableau[t].length === 0) continue;
                if (canPlaceTableau(card, tableau[t])) {
                    return { cards: pile.slice(k), targetType: 'column', targetIndex: t };
                }
            }
        }
    }
    if (waste.length) {
        card = waste[waste.length - 1];
        for (t = 0; t < 7; t++) {
            if (canPlaceTableau(card, tableau[t])) {
                return { cards: [card], targetType: 'column', targetIndex: t };
            }
        }
    }
    if (stock.length > 0 || waste.length > 0) {
        return { cards: [], targetType: 'stock', targetIndex: -1 };
    }
    return null;
}

var hintTimer = null;
var hintGhost = null;
var hintGhostTimers = [];

function clearHintGhost() {
    for (var i = 0; i < hintGhostTimers.length; i++) clearTimeout(hintGhostTimers[i]);
    hintGhostTimers = [];
    if (hintGhost && hintGhost.parentNode) hintGhost.parentNode.removeChild(hintGhost);
    hintGhost = null;
}

// Полупрозрачная копия карты летит к цели и возвращается
function showHintGhost(srcEl, targetEl) {
    clearHintGhost();
    var srcRect = srcEl.getBoundingClientRect();
    var tgtRect = targetEl.getBoundingClientRect();

    var ghost = srcEl.cloneNode(true);
    ghost.classList.remove('hint', 'highlight');
    ghost.style.position = 'fixed';
    ghost.style.left = srcRect.left + 'px';
    ghost.style.top = srcRect.top + 'px';
    ghost.style.width = srcRect.width + 'px';
    ghost.style.height = srcRect.height + 'px';
    ghost.style.margin = '0';
    ghost.style.zIndex = '9600';
    ghost.style.opacity = '0.7';
    ghost.style.pointerEvents = 'none';
    ghost.style.transition = 'transform .45s cubic-bezier(.45,.05,.35,1), opacity .3s ease';
    ghost.style.transform = 'translate(0,0)';
    ghost.style.boxShadow = '0 12px 30px rgba(0,0,0,.5)';
    document.body.appendChild(ghost);
    hintGhost = ghost;

    var dx = tgtRect.left - srcRect.left;
    var dy = tgtRect.top - srcRect.top;

    void ghost.offsetWidth; // применяем стили до кадра

    // Полёт к цели
    ghost.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    ghost.style.opacity = '0.85';

    // Возврат на место
    hintGhostTimers.push(setTimeout(function () {
        if (!hintGhost) return;
        hintGhost.style.transform = 'translate(0,0)';
        hintGhost.style.opacity = '0.7';
    }, 550));

    // Растворение
    hintGhostTimers.push(setTimeout(function () {
        if (!hintGhost) return;
        hintGhost.style.opacity = '0';
    }, 1150));

    // Уборка
    hintGhostTimers.push(setTimeout(function () {
        clearHintGhost();
    }, 1500));
}

function showHint() {
    if (!HINTS_ALLOWED[difficulty]) return;
    if (dealing) return;
    if (autoFinishing) return;
    playSound('click');
    clearHint();
    var hint = findHint();
    if (!hint) { flashMessage('Доступных ходов нет'); return; }

    var els = [];
    for (var k = 0; k < hint.cards.length; k++) {
        if (hint.cards[k].el) els.push(hint.cards[k].el);
    }

    var targetEl = null;
    if (hint.targetType === 'column') {
        var pile = tableau[hint.targetIndex];
        if (pile.length > 0 && pile[pile.length - 1].el) {
            targetEl = pile[pile.length - 1].el;
        } else {
            targetEl = document.querySelector('.column[data-col="' + hint.targetIndex + '"]');
        }
    } else if (hint.targetType === 'foundation') {
        var f = foundations[hint.targetIndex];
        if (f.length > 0 && f[f.length - 1].el) targetEl = f[f.length - 1].el;
        else targetEl = document.querySelector('.foundation[data-f="' + hint.targetIndex + '"]');
    } else if (hint.targetType === 'stock') {
        targetEl = document.getElementById('stock');
    }

    if (hint.targetType === 'stock' || !els.length) {
        // Лететь нечему — по-старому подсвечиваем колоду
        if (targetEl) targetEl.classList.add('hint');
        for (var i = 0; i < els.length; i++) els[i].classList.add('hint');
    } else {
        // Призрак: полупрозрачная карта летит к цели и возвращается
        showHintGhost(els[0], targetEl);
        // Цель слегка мигает, чтобы глаз цеплялся
        if (targetEl) targetEl.classList.add('hint');
    }
    hintTimer = setTimeout(clearHint, 1600);
}

function clearHint() {
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    clearHintGhost();
    var hs = document.querySelectorAll('.hint, .hint-empty');
    for (var i = 0; i < hs.length; i++) {
        hs[i].classList.remove('hint');
        hs[i].classList.remove('hint-empty');
    }
}

function flashMessage(text) {
    var m = document.getElementById('hint-message');
    if (!m) {
        m = document.createElement('div');
        m.id = 'hint-message';
        document.body.appendChild(m);
    }
    m.textContent = text;
    m.style.display = 'block';
    setTimeout(function () { m.style.display = 'none'; }, 1500);
}

// =========================================================
// ТАЙМЕР
// =========================================================
function startTimer() {
    stopTimer();
    timeLeft = IMPOSSIBLE_TIME;
    updateTimerDisplay();
    timerInterval = setInterval(function () {
        timeLeft--;
        updateTimerDisplay();
        if (timeLeft <= 0) {
            stopTimer();
            playSound('lose');
            document.getElementById('lose-screen').style.display = 'flex';
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function updateTimerDisplay() {
    var t = document.getElementById('timer');
    var left = Math.max(timeLeft, 0);
    var min = Math.floor(left / 60);
    var sec = left % 60;
    t.textContent = min + ':' + (sec < 10 ? '0' : '') + sec;
    t.classList.toggle('timer-low', timeLeft <= 30);
}

// =========================================================
// ВЫБОР СЛОЖНОСТИ (ПК + мобильные, синхронизация)
// =========================================================
document.querySelectorAll('.diff-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
        playSound('click');
        var selectedDiff = btn.getAttribute('data-diff');
        difficulty = selectedDiff;

        document.querySelectorAll('.diff-btn').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-diff') === selectedDiff);
        });

        if (!isMobile()) {
            fillRulesPlate('menu-rules-title', 'menu-rules-list', difficulty);
            document.getElementById('menu-rules-plate').style.display = 'block';
        } else {
            fillRulesPlate('mobile-rules-title', 'mobile-rules-list', difficulty);
            document.getElementById('mobile-rules-plate').style.display = 'block';
        }
    });
});

document.getElementById('retry-btn').addEventListener('click', function () {
    playSound('click');
    document.getElementById('lose-screen').style.display = 'none';
    newGame();
});
document.getElementById('lose-menu-btn').addEventListener('click', function () {
    playSound('click');
    backToMenu();
});

// =========================================================
// МАСШТАБИРОВАНИЕ (4 уровня)
// =========================================================
var zoomLevels = [0.75, 0.9, 1.0, 1.15];
var currentZoom = 2;

function applyZoom() {
    var gameEl = document.getElementById('game');
    var scale = zoomLevels[currentZoom];
    gameEl.style.transform = 'scale(' + scale + ')';
    gameEl.style.transformOrigin = 'top center';
    document.getElementById('zoom-in').classList.toggle('active', currentZoom === 3);
    document.getElementById('zoom-out').classList.toggle('active', currentZoom === 0);
}

document.getElementById('zoom-in').addEventListener('click', function () {
    playSound('click');
    if (currentZoom < zoomLevels.length - 1) {
        currentZoom++;
        applyZoom();
    }
});

document.getElementById('zoom-out').addEventListener('click', function () {
    playSound('click');
    if (currentZoom > 0) {
        currentZoom--;
        applyZoom();
    }
});

applyZoom();

// =========================================================
// МОДАЛЬНОЕ ОКНО ПОДТВЕРЖДЕНИЯ
// =========================================================
var confirmModal = document.getElementById('confirm-modal');

function showConfirmModal() {
    confirmModal.style.display = 'flex';
}

function hideConfirmModal() {
    confirmModal.style.display = 'none';
}

document.getElementById('confirm-yes').addEventListener('click', function () {
    playSound('click');
    hideConfirmModal();
    newGame();
});

document.getElementById('confirm-no').addEventListener('click', function () {
    playSound('click');
    hideConfirmModal();
});

confirmModal.addEventListener('click', function (e) {
    if (e.target === confirmModal) {
        hideConfirmModal();
    }
});

// =========================================================
// СТАРТ
// =========================================================
initListeners();
document.getElementById('hint-btn').addEventListener('click', showHint);
document.getElementById('undo-btn').addEventListener('click', function () {
    playSound('click');
    undoMove();
});
updateStatsUI();
applyTheme();
