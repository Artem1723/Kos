// ===== ДИАГНОСТИКА =====
window.addEventListener('error', function (e) {
    var banner = document.getElementById('error-banner');
    if (banner) {
        banner.style.display = 'block';
        banner.textContent = 'Ошибка JS: ' + e.message + ' (строка ' + e.lineno + ')';
    }
});

// =========================================================
// УПРАВЛЕНИЕ ЭКРАНАМИ (загрузка -> меню -> игра)
// =========================================================
var loadingBar = document.getElementById('loading-bar');
var loadingText = document.getElementById('loading-text');
var loadingScreen = document.getElementById('loading-screen');
var menuScreen = document.getElementById('menu-screen');
var gameScreen = document.getElementById('game-screen');
var howtoModal = document.getElementById('howto-modal');

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
}

function startGame() {
    menuScreen.style.display = 'none';
    gameScreen.style.display = 'block';
    newGame();
}

function showHowTo() { howtoModal.style.display = 'flex'; }
function closeHowTo() { howtoModal.style.display = 'none'; }

function backToMenu() {
    stopTimer();
    gameScreen.style.display = 'none';
    document.getElementById('win').style.display = 'none';
    document.getElementById('lose-screen').style.display = 'none';
    menuScreen.style.display = 'flex';
}

document.getElementById('play-btn').addEventListener('click', startGame);
document.getElementById('howto-btn').addEventListener('click', showHowTo);
document.getElementById('close-howto').addEventListener('click', closeHowTo);
document.getElementById('menu-btn').addEventListener('click', backToMenu);
document.getElementById('win-menu-btn').addEventListener('click', backToMenu);

simulateLoading();

// ===== ДАННЫЕ =====
var SUITS = [
    { sym: '♠', color: 'black' },
    { sym: '♥', color: 'red' },
    { sym: '♦', color: 'red' },
    { sym: '♣', color: 'black' }
];
var RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

var stock, waste, foundations, tableau, moves;
var drag = null;
var dragLayer = null;

// ===== УРОВНИ СЛОЖНОСТИ =====
var difficulty = 'easy';
var DRAW_COUNT    = { easy: 1, medium: 3, hard: 3, impossible: 3 };
var REDEALS       = { easy: 9999, medium: 9999, hard: 1, impossible: 0 };
var HINTS_ALLOWED = { easy: true, medium: true, hard: true, impossible: false };
var IMPOSSIBLE_TIME = 300; // сек: среднее время победы (~5 мин) = дедлайн
var redealsLeft = 9999;
var timerInterval = null;
var timeLeft = 0;

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

    // Настройки выбранной сложности
    redealsLeft = REDEALS[difficulty];
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
        el.style.background = 'radial-gradient(circle at 30% 20%, rgba(255,255,255,.10), transparent 46%), repeating-linear-gradient(45deg, rgba(227,199,154,.05) 0 1px, transparent 1px 9px), repeating-linear-gradient(-45deg, rgba(227,199,154,.05) 0 1px, transparent 1px 9px), linear-gradient(160deg, #2a2f45 0%, #1d2233 55%, #141826 100%)';
        el.style.border = '1px solid rgba(227,199,154,.22)';
        el.addEventListener('click', function (e) {
            for (var c = 0; c < 7; c++) {
                var pile = tableau[c];
                if (pile.length && pile[pile.length - 1] === card) {
                    e.stopPropagation();
                    card.faceUp = true;
                    render();
                    return;
                }
            }
        });
    } else {
        el.style.color = (card.color === 'red') ? '#c62828' : '#212121';
        el.innerHTML =
            '<div class="corner top">' + card.rank + '<br>' + card.suit + '</div>' +
            faceArt(card) +
            '<div class="corner bottom">' + card.rank + '<br>' + card.suit + '</div>';
        el.addEventListener('pointerdown', function (e) {
            startDrag(e, card);
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
    // Показываем до 3 последних карт сброса со смещением (веер)
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
        for (var k = 0; k < tableau[c].length; k++) {
            var card = tableau[c][k];
            var el = makeCardEl(card);
            el.style.top = (k * 26) + 'px';
            el.style.zIndex = k + 1;
            colEl.appendChild(el);
        }
    }
}

// ===== ПЕРЕТАСКИВАНИЕ =====
function startDrag(e, card) {
    if (drag) return;
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
    removeDragFromSource();
    for (var k = 0; k < drag.cards.length; k++) tableau[col].push(drag.cards[k]);
    moves++;
    return true;
}

function tryMoveToFoundation(i) {
    if (!drag || drag.cards.length !== 1) return false;
    if (drag.source === 'foundation' && drag.fIndex === i) return false;
    var card = drag.cards[0];
    var f = foundations[i];
    var ok = (f.length === 0) ? (card.value === 1)
        : (f[f.length - 1].suit === card.suit && f[f.length - 1].value === card.value - 1);
    if (!ok) return false;
    removeDragFromSource();
    f.push(card);
    moves++;
    return true;
}

function canPlaceTableau(card, pile) {
    if (pile.length === 0) return card.value === 13; // на пустой — только король
    var top = pile[pile.length - 1];
    return top.faceUp && top.color !== card.color && top.value === card.value + 1;
}

function checkWin() {
    for (var i = 0; i < 4; i++) {
        if (foundations[i].length !== 13) return;
    }
    stopTimer();
    document.getElementById('win').style.display = 'flex';
}

// ===== КНОПКИ И КОЛОДА =====
function initListeners() {
    document.getElementById('stock').addEventListener('click', function (e) {
        e.stopPropagation();
        if (stock.length > 0) {
            var n = Math.min(DRAW_COUNT[difficulty], stock.length);
            for (var d = 0; d < n; d++) {
                var c = stock.pop();
                c.faceUp = true;
                waste.push(c);
            }
            moves++;
            render();
        } else if (waste.length > 0 && redealsLeft > 0) {
            stock = waste.reverse();
            for (var i = 0; i < stock.length; i++) stock[i].faceUp = false;
            waste = [];
            redealsLeft--;
            moves++;
            render();
        } else if (waste.length > 0) {
            flashMessage('Проходы колоды закончились!');
        }
    });
    document.getElementById('new-game-btn').addEventListener('click', newGame);
    document.getElementById('again-btn').addEventListener('click', newGame);
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
// ПОДСКАЗКИ
// =========================================================
function canPlaceFoundation(card, f) {
    if (f.length === 0) return card.value === 1;
    var top = f[f.length - 1];
    return top.suit === card.suit && top.value === card.value - 1;
}

function findHint() {
    var c, i, k, t, pile, card;

    for (c = 0; c < 7; c++) {
        pile = tableau[c];
        if (pile.length) {
            card = pile[pile.length - 1];
            for (i = 0; i < 4; i++) {
                if (canPlaceFoundation(card, foundations[i])) {
                    return { cards: [card], targetType: 'foundation', targetIndex: i };
                }
            }
        }
    }
    if (waste.length) {
        card = waste[waste.length - 1];
        for (i = 0; i < 4; i++) {
            if (canPlaceFoundation(card, foundations[i])) {
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

function showHint() {
    if (!HINTS_ALLOWED[difficulty]) return; // на «Невозможном» подсказок нет
    clearHint();
    var hint = findHint();
    if (!hint) { flashMessage('Доступных ходов нет'); return; }

    var els = [];
    for (var k = 0; k < hint.cards.length; k++) {
        if (hint.cards[k].el) els.push(hint.cards[k].el);
    }

    var targetEl = null;
    var targetClass = 'hint';
    if (hint.targetType === 'column') {
        var pile = tableau[hint.targetIndex];
        if (pile.length > 0 && pile[pile.length - 1].el) {
            targetEl = pile[pile.length - 1].el;
        } else {
            targetEl = document.querySelector('.column[data-col="' + hint.targetIndex + '"]');
            targetClass = 'hint-empty';
        }
    } else if (hint.targetType === 'foundation') {
        var f = foundations[hint.targetIndex];
        if (f.length > 0 && f[f.length - 1].el) targetEl = f[f.length - 1].el;
        else targetEl = document.querySelector('.foundation[data-f="' + hint.targetIndex + '"]');
    } else if (hint.targetType === 'stock') {
        targetEl = document.getElementById('stock');
    }
    if (targetEl) targetEl.classList.add(targetClass);

    for (var i = 0; i < els.length; i++) els[i].classList.add('hint');
    hintTimer = setTimeout(clearHint, 1500);
}

function clearHint() {
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
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
// ТАЙМЕР (режим «Невозможный»)
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
// ВЫБОР СЛОЖНОСТИ И КНОПКИ ПОРАЖЕНИЯ
// =========================================================
document.querySelectorAll('.diff-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
        document.querySelectorAll('.diff-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        difficulty = btn.getAttribute('data-diff');
        // Показываем плашку с правилами в правом углу меню
        fillRulesPlate('menu-rules-title', 'menu-rules-list', difficulty);
        document.getElementById('menu-rules-plate').style.display = 'block';
    });
});

document.getElementById('retry-btn').addEventListener('click', function () {
    document.getElementById('lose-screen').style.display = 'none';
    newGame();
});
document.getElementById('lose-menu-btn').addEventListener('click', backToMenu);

// =========================================================
// СТАРТ
// =========================================================
initListeners();
document.getElementById('hint-btn').addEventListener('click', showHint);
// =========================================================
// МАСШТАБИРОВАНИЕ ИГРОВОГО ПОЛЯ ПОД ШИРИНУ ЭКРАНА
// =========================================================
function fitGameToScreen() {
    var gameEl = document.getElementById('game');
    if (!gameEl) return;
    var naturalWidth = 760;            // ширина поля в дизайне (max-width)
    var available = window.innerWidth - 16; // 8px отступов с каждой стороны
    var scale = Math.min(1, available / naturalWidth); // не увеличиваем больше 1
    gameEl.style.setProperty('--game-scale', scale);
}

// Пересчитываем при загрузке, повороте экрана и ресайзе
window.addEventListener('resize', fitGameToScreen);
window.addEventListener('orientationchange', function () {
    setTimeout(fitGameToScreen, 150); // чуть ждём, пока экран повернётся
});
fitGameToScreen();