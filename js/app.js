'use strict';

/* ================= ESTADO ================= */
const STORAGE_KEY = 'ciclo_data';

let state = {
    viewDate: new Date(),
    selectedDate: null,
    periods: [],           // [{start, end}]
    flow: {},              // { 'YYYY-MM-DD': 1|2|3 }
    symptoms: {},           // { 'YYYY-MM-DD': {mood, energy, physical, libido, notes} }
    appointments: [],       // [{id, date, type, note}]
    settings: {
        cycleLength: 28,
        periodLength: 5,
        lutealPhase: 14,
        perimenopauseMode: false,
        lang: 'pt',
        theme: 'auto',
        userName: ''
    }
};

const APPOINTMENT_TYPES = ['ginecologia', 'perimenopausa', 'analises', 'exame', 'outra'];
const APPOINTMENT_ICONS = {
    ginecologia: '🩺', perimenopausa: '🔄', analises: '🧪', exame: '🩻', outra: '📌'
};
const APPOINTMENT_TYPE_KEY = {
    ginecologia: 'typeGinecologia', perimenopausa: 'typePerimenopausa',
    analises: 'typeAnalises', exame: 'typeExame', outra: 'typeOutra'
};
const SYMPTOM_KEYS = ['mood', 'physical', 'energy', 'libido']; // ordem de prioridade de exibição no dia

/* ================= PERSISTÊNCIA ================= */
function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            state.periods = data.periods || [];
            state.symptoms = data.symptoms || {};
            state.flow = data.flow || {};
            state.appointments = data.appointments || [];
            if (data.settings) state.settings = { ...state.settings, ...data.settings };
        }
    } catch (e) {
        console.warn('Erro ao carregar dados:', e);
    }
    normalizeFlow();
}

// Garante que TODOS os dias de um período têm uma intensidade de fluxo
// explícita (médio, por omissão). Isto é o que permite que o botão de
// intensidade apareça já "ativo" e que um único toque o desligue (e encolha
// o período) — sem isto, dias de períodos criados antes desta correção
// ficavam sem registo explícito e não era possível marcar "sem fluxo".
function normalizeFlow() {
    state.periods.forEach((p) => {
        let d = parseDate(p.start);
        const end = parseDate(p.end);
        while (d <= end) {
            const ds = formatDate(d);
            if (state.flow[ds] === undefined) state.flow[ds] = 2;
            d = addDays(d, 1);
        }
    });
}

function saveState() {
    try {
        const data = {
            periods: state.periods,
            symptoms: state.symptoms,
            flow: state.flow,
            appointments: state.appointments,
            settings: state.settings
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        const status = document.getElementById('dataStatus');
        if (status) status.textContent = t('dataSavedAt', { time: new Date().toLocaleTimeString() });
    } catch (e) {
        console.error('Erro ao guardar:', e);
    }
}

/* ================= HELPERS DE DATA ================= */
function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
function parseDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}
function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}
function getDaysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
function getFirstDayOfMonth(year, month) { return new Date(year, month, 1).getDay(); }
function isFutureDate(dateStr) { return dateStr > formatDate(new Date()); }
function todayStr() { return formatDate(new Date()); }

/* ================= CÁLCULOS DO CICLO ================= */
function diffRange() {
    return state.settings.perimenopauseMode ? [15, 90] : [18, 60];
}

// Quantos ciclos recentes entram na média (em vez de usar TODO o
// histórico para sempre). 6 ciclos (~6 meses) dá um equilíbrio razoável
// entre estabilidade e capacidade de reagir a uma mudança real; em modo
// perimenopausa usamos uma janela mais curta (4), porque aí a mudança de
// padrão é precisamente o que interessa apanhar mais depressa.
function rollingWindowSize() {
    return state.settings.perimenopauseMode ? 4 : 6;
}

function getAverageCycleLength() {
    if (state.periods.length < 2) return state.settings.cycleLength;
    const [lo, hi] = diffRange();
    const sorted = [...state.periods].sort((a, b) => a.start.localeCompare(b.start)).slice(-(rollingWindowSize() + 1));
    let total = 0, count = 0;
    for (let i = 1; i < sorted.length; i++) {
        const diff = Math.round((parseDate(sorted[i].start) - parseDate(sorted[i - 1].start)) / 86400000);
        if (diff >= lo && diff <= hi) { total += diff; count++; }
    }
    return count === 0 ? state.settings.cycleLength : Math.round(total / count);
}

// Duração média do período (dias seguidos com fluxo registado), também
// limitada à mesma janela recente.
function getAveragePeriodLength() {
    if (state.periods.length === 0) return state.settings.periodLength;
    const recent = [...state.periods].sort((a, b) => a.start.localeCompare(b.start)).slice(-rollingWindowSize());
    const total = recent.reduce((sum, p) => sum + (Math.round((parseDate(p.end) - parseDate(p.start)) / 86400000) + 1), 0);
    return Math.max(1, Math.round(total / recent.length));
}

function getCycleDiffs() {
    const [lo, hi] = diffRange();
    const sorted = [...state.periods].sort((a, b) => a.start.localeCompare(b.start)).slice(-(rollingWindowSize() + 1));
    const diffs = [];
    for (let i = 1; i < sorted.length; i++) {
        const diff = Math.round((parseDate(sorted[i].start) - parseDate(sorted[i - 1].start)) / 86400000);
        if (diff >= lo && diff <= hi) diffs.push(diff);
    }
    return diffs;
}

function getCycleConfidence() {
    // CORRIGIDO: em modo perimenopausa, mostrava sempre "padrão variável"
    // mesmo com zero dados registados. Agora só usa essa mensagem quando
    // já há dados suficientes para ela fazer sentido.
    if (state.settings.perimenopauseMode) {
        if (state.periods.length < 2) return { level: 'low', emoji: '🟡', desc: t('confidenceLowFewData') };
        return { level: 'perimenopause', emoji: '🔄', desc: t('confidencePerimenopause') };
    }
    if (state.periods.length < 3) return { level: 'low', emoji: '🟡', desc: t('confidenceLowFewData') };
    const diffs = getCycleDiffs();
    if (diffs.length < 2) return { level: 'low', emoji: '🟡', desc: t('confidenceLowFewCycles') };
    const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const variance = diffs.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / diffs.length;
    const cv = Math.sqrt(variance) / avg;
    if (cv < 0.05) return { level: 'high', emoji: '🟢', desc: t('confidenceHigh') };
    if (cv < 0.10) return { level: 'medium', emoji: '🟠', desc: t('confidenceMedium') };
    return { level: 'low', emoji: '🔴', desc: t('confidenceLow') };
}

function getStdDevDays() {
    const diffs = getCycleDiffs();
    if (diffs.length < 2) return 0;
    const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const variance = diffs.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / diffs.length;
    return Math.sqrt(variance);
}

function getNextOvulation(fromDate) {
    const cycleLen = getAverageCycleLength();
    const luteal = state.settings.lutealPhase;
    const sorted = [...state.periods].sort((a, b) => a.start.localeCompare(b.start));
    let lastPeriod = null;
    for (const p of sorted) if (p.start <= fromDate) lastPeriod = p;
    if (!lastPeriod) return null;
    const lastStart = parseDate(lastPeriod.start);
    const ovDay = addDays(lastStart, cycleLen - luteal);
    if (ovDay < parseDate(fromDate)) {
        const nextStart = addDays(lastStart, cycleLen);
        return formatDate(addDays(nextStart, cycleLen - luteal));
    }
    return formatDate(ovDay);
}

function getNextPeriod(fromDate) {
    const cycleLen = getAverageCycleLength();
    const sorted = [...state.periods].sort((a, b) => a.start.localeCompare(b.start));
    let lastPeriod = null;
    for (const p of sorted) if (p.start <= fromDate) lastPeriod = p;
    if (!lastPeriod) return null;
    const lastStart = parseDate(lastPeriod.start);
    const nextStart = addDays(lastStart, cycleLen);
    if (nextStart < parseDate(fromDate)) return formatDate(addDays(nextStart, cycleLen));
    return formatDate(nextStart);
}

// Em modo perimenopausa (com dados suficientes), devolve um intervalo em
// vez de uma data fixa — evita falsa precisão quando os ciclos são irregulares.
function getNextPeriodDisplay(fromDate) {
    const exact = getNextPeriod(fromDate);
    if (!exact) return null;
    if (state.settings.perimenopauseMode && state.periods.length >= 3) {
        const sd = Math.max(2, Math.round(getStdDevDays()));
        const from = formatDate(addDays(parseDate(exact), -sd));
        const to = formatDate(addDays(parseDate(exact), sd));
        return t('nextPeriodRange', { from, to });
    }
    return exact;
}

function getFertilityInfo(dateStr) {
    const ovDate = getNextOvulation(dateStr);
    if (!ovDate) return { phase: 'unknown', label: t('noData') };
    const ov = parseDate(ovDate);
    const current = parseDate(dateStr);
    const diff = Math.round((current - ov) / 86400000);

    // BUG CORRIGIDO: a verificação "diff === 0" (dia exato da ovulação)
    // estava DEPOIS do bloco "-5..1", que já capturava diff===0 e o
    // classificava sempre como "fertilidade elevada" — o dia da ovulação
    // nunca era distinguido no calendário nem na ficha lateral. Agora o
    // dia exato é verificado primeiro.
    if (diff === 0) return { phase: 'ovulation', label: t('ovulation') };
    if (diff >= -2 && diff <= -1) return { phase: 'fertility-high', label: t('fertilityHigh') };
    if ((diff >= -5 && diff <= -3) || diff === 1) return { phase: 'fertility-moderate', label: t('fertilityModerate') };

    const nextPeriod = getNextPeriod(dateStr);
    if (nextPeriod) {
        const daysUntil = Math.round((parseDate(nextPeriod) - current) / 86400000);
        if (daysUntil >= 1 && daysUntil <= 7) return { phase: 'pms', label: t('pms') };
    }
    if (diff < -5) return { phase: 'follicular', label: t('follicular') };
    if (diff > 1) return { phase: 'luteal', label: t('luteal') };
    return { phase: 'unknown', label: t('unknown') };
}

// Gera as janelas de período PREVISTAS (ainda não reais) para os próximos
// meses, a partir do último período real registado — é isto que faltava
// para os dias futuros de período aparecerem assinalados no calendário.
function getPredictedPeriods() {
    if (state.periods.length === 0) return [];
    const sorted = [...state.periods].sort((a, b) => a.start.localeCompare(b.start));
    const lastStart = parseDate(sorted[sorted.length - 1].start);
    const cycleLen = getAverageCycleLength();
    const periodLen = getAveragePeriodLength();
    const limit = addDays(new Date(), (FUTURE_MONTH_LIMIT + 1) * 31);

    const results = [];
    let next = addDays(lastStart, cycleLen);
    while (next <= limit) {
        results.push({ start: formatDate(next), end: formatDate(addDays(next, periodLen - 1)) });
        next = addDays(next, cycleLen);
    }
    return results;
}

function isPredictedPeriodDay(dateStr) {
    if (!isFutureDate(dateStr)) return false;
    return getPredictedPeriods().some(p => dateStr >= p.start && dateStr <= p.end);
}

function isPeriodDay(dateStr) {
    return state.periods.some(p => dateStr >= p.start && dateStr <= p.end);
}
function getPeriodFor(dateStr) {
    return state.periods.find(p => dateStr >= p.start && dateStr <= p.end) || null;
}
function getFlowLevel(dateStr) {
    return state.flow[dateStr] || 2; // médio por omissão dentro de um período
}
function getCycleDay(dateStr) {
    const sorted = [...state.periods].sort((a, b) => a.start.localeCompare(b.start));
    let lastStart = null;
    for (const p of sorted) if (p.start <= dateStr) lastStart = p.start;
    if (!lastStart) return null;
    return Math.floor((parseDate(dateStr) - parseDate(lastStart)) / 86400000) + 1;
}

/* ================= INTERAÇÕES: PERÍODO / FLUXO ================= */
// O período já NÃO nasce com uma duração fixa (settings.periodLength) —
// nasce com 1 dia. É o registo diário de intensidade (setFlow) que o vai
// estendendo dia a dia, exatamente enquanto houver fluxo real. Isto resolve
// o problema de um período "de 5 dias" ser criado de repente mesmo que só
// tenha havido sangramento em 1, 2 ou 3 desses dias.
function togglePeriod() {
    const dateStr = state.selectedDate;
    if (!dateStr) return;
    if (isFutureDate(dateStr)) { alert(t('futurePeriodBlocked')); return; }

    const existingIdx = state.periods.findIndex(p => p.start === dateStr);
    if (existingIdx >= 0) {
        if (confirm(t('confirmRemovePeriod', { date: dateStr }))) {
            const period = state.periods[existingIdx];
            let d = parseDate(period.start);
            const end = parseDate(period.end);
            while (d <= end) { delete state.flow[formatDate(d)]; d = addDays(d, 1); }
            state.periods.splice(existingIdx, 1);
            render();
        }
        return;
    }
    for (const p of state.periods) {
        if (dateStr >= p.start && dateStr <= p.end) {
            alert(t('periodOverlapExisting', { start: p.start, end: p.end }));
            return;
        }
    }
    state.periods.push({ start: dateStr, end: dateStr });
    state.periods.sort((a, b) => a.start.localeCompare(b.start));
    state.flow[dateStr] = 2; // médio por omissão; ajustável logo a seguir
    render();
}

// Um dia "estende" um período existente quando é exatamente o dia seguinte
// ao fim desse período — é assim que o período cresce dia a dia com o
// registo real de fluxo, em vez de um bloco pré-atribuído.
function getExtendablePeriod(dateStr) {
    return state.periods.find(p => formatDate(addDays(parseDate(p.end), 1)) === dateStr) || null;
}

// Regista/altera a intensidade do fluxo num dia. Clicar na intensidade já
// ativa DESLIGA-a (= "sem fluxo" nesse dia): se for o último dia do
// período, encolhe-o (ou remove-o, se ficasse vazio). Em dias intermédios
// não se permite desligar, para não deixar um buraco ambíguo a meio de um
// período — nesse caso o registo diário nunca deveria ter chegado lá com
// fluxo a zero; corrige-se encolhendo a partir do fim.
function setFlow(level) {
    const dateStr = state.selectedDate;
    if (!dateStr || isFutureDate(dateStr)) { alert(t('futureSymptomBlocked')); return; }

    let period = getPeriodFor(dateStr);
    if (!period) {
        const ext = getExtendablePeriod(dateStr);
        if (!ext) return; // este dia não pertence nem estende nenhum período
        ext.end = dateStr;
        period = ext;
    }

    const current = state.flow[dateStr];
    if (current === level) {
        if (dateStr === period.end) {
            if (period.start === period.end) {
                state.periods = state.periods.filter(p => p !== period);
            } else {
                period.end = formatDate(addDays(parseDate(period.end), -1));
            }
            delete state.flow[dateStr];
        }
    } else {
        state.flow[dateStr] = level;
    }
    render();
}

/* ================= INTERAÇÕES: SINTOMAS ================= */
function setSymptom(symptom, value) {
    const dateStr = state.selectedDate;
    if (!dateStr || isFutureDate(dateStr)) { alert(t('futureSymptomBlocked')); return; }
    if (!state.symptoms[dateStr]) state.symptoms[dateStr] = {};
    const current = state.symptoms[dateStr][symptom];
    state.symptoms[dateStr][symptom] = (current === value) ? undefined : value;
    if (state.symptoms[dateStr][symptom] === undefined) {
        delete state.symptoms[dateStr][symptom];
        if (Object.keys(state.symptoms[dateStr]).length === 0) delete state.symptoms[dateStr];
    }
    render();
}

function saveNotes() {
    const dateStr = state.selectedDate;
    if (!dateStr || isFutureDate(dateStr)) return;
    const notes = document.getElementById('notesInput').value.trim();
    if (!state.symptoms[dateStr]) state.symptoms[dateStr] = {};
    if (notes) state.symptoms[dateStr].notes = notes;
    else {
        delete state.symptoms[dateStr].notes;
        if (Object.keys(state.symptoms[dateStr]).length === 0) delete state.symptoms[dateStr];
    }
    saveState();
}

/* ================= INTERAÇÕES: CONSULTAS ================= */
function addAppointment(type) {
    const dateStr = state.selectedDate;
    if (!dateStr) return;
    if (state.appointments.some(a => a.date === dateStr)) return; // já existe uma nesse dia
    state.appointments.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), date: dateStr, type, note: '' });
    state.appointments.sort((a, b) => a.date.localeCompare(b.date));
    render();
}

function removeAppointment(id) {
    const appt = state.appointments.find(a => a.id === id);
    if (!appt) return;
    if (confirm(t('appointmentConfirmRemove', { type: t(APPOINTMENT_TYPE_KEY[appt.type]), date: appt.date }))) {
        state.appointments = state.appointments.filter(a => a.id !== id);
        render();
    }
}

function getNextAppointment() {
    const today = todayStr();
    return state.appointments
        .filter(a => a.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
}

/* ================= DEFINIÇÕES ================= */
function updateSettings() {
    state.settings.cycleLength = parseInt(document.getElementById('cycleLengthInput').value) || 28;
    state.settings.periodLength = parseInt(document.getElementById('periodLengthInput').value) || 5;
    state.settings.lutealPhase = parseInt(document.getElementById('lutealPhaseInput').value) || 14;
    state.settings.perimenopauseMode = document.getElementById('perimenopauseMode').checked;
    render();
}

/* ================= BACKUP ================= */
function exportData() {
    const data = {
        version: '2.0',
        exportedAt: new Date().toISOString(),
        periods: state.periods,
        symptoms: state.symptoms,
        flow: state.flow,
        appointments: state.appointments,
        settings: state.settings
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const namePart = state.settings.userName ? `_${state.settings.userName.trim().replace(/[^\p{L}\p{N}]+/gu, '_')}` : '';
    a.download = `ciclo_backup${namePart}_${formatDate(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.periods || !data.symptoms) throw new Error(t('importInvalid'));
            if (confirm(t('importConfirm'))) {
                state.periods = data.periods || [];
                state.symptoms = data.symptoms || {};
                state.flow = data.flow || {};
                state.appointments = data.appointments || [];
                if (data.settings) state.settings = { ...state.settings, ...data.settings };
                normalizeFlow();
                render();
                syncSettingsInputs();
                alert(t('importSuccess'));
            }
        } catch (err) {
            alert(t('importError', { msg: err.message }));
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function clearAllData() {
    if (confirm(t('clearConfirm1'))) {
        if (confirm(t('clearConfirm2'))) {
            state.periods = [];
            state.symptoms = {};
            state.flow = {};
            state.appointments = [];
            state.settings = { ...state.settings, cycleLength: 28, periodLength: 5, lutealPhase: 14, perimenopauseMode: false, userName: '' };
            localStorage.removeItem(ONBOARDED_KEY); // volta a perguntar o nome
            syncSettingsInputs();
            render();
            showOnboarding();
        }
    }
}

function syncSettingsInputs() {
    document.getElementById('cycleLengthInput').value = state.settings.cycleLength;
    document.getElementById('periodLengthInput').value = state.settings.periodLength;
    document.getElementById('lutealPhaseInput').value = state.settings.lutealPhase;
    document.getElementById('perimenopauseMode').checked = state.settings.perimenopauseMode;
}

/* ================= NAVEGAÇÃO ================= */
const FUTURE_MONTH_LIMIT = 12;

function monthsDiffFromToday(date) {
    const today = new Date();
    return (date.getFullYear() - today.getFullYear()) * 12 + (date.getMonth() - today.getMonth());
}

function navigateMonth(delta) {
    const newDate = new Date(state.viewDate);
    newDate.setMonth(newDate.getMonth() + delta);
    if (monthsDiffFromToday(newDate) > FUTURE_MONTH_LIMIT) return;
    state.viewDate = newDate;
    render();
}

function goToToday() {
    state.viewDate = new Date();
    state.selectedDate = todayStr();
    render();
}

function selectDay(dateStr) {
    state.selectedDate = dateStr;
    render();
}

/* ================= RENDERIZAÇÃO ================= */
// Em ecrãs largos (PC, tablet, telemóvel em landscape) há espaço para
// mostrar os 4 emoji de sintomas em vez de só 2. matchMedia dispara render()
// apenas quando se cruza o limiar (não a cada pixel de redimensionamento).
const WIDE_SCREEN_MQ = window.matchMedia('(min-width: 600px)');
function maxDayEmojis() { return WIDE_SCREEN_MQ.matches ? 4 : 2; }

function getPredictedPhaseClass(dateStr) {
    const fi = getFertilityInfo(dateStr);
    if (fi.phase === 'fertility-high') return 'phase-fertility-high';
    if (fi.phase === 'fertility-moderate') return 'phase-fertility-moderate';
    if (fi.phase === 'ovulation') return 'phase-ovulation';
    if (fi.phase === 'pms') return 'phase-pms';
    return '';
}

function dayEmojis(dateStr) {
    const s = state.symptoms[dateStr];
    if (!s) return '';
    const EMOJI_MAP = {
        mood: ['😊', '😐', '😔'], energy: ['⚡', '🔋', '🪫'],
        physical: ['🙂', '😣', '😖'], libido: ['🔥', '❤️', '❄️']
    };
    const max = maxDayEmojis();
    const list = [];
    SYMPTOM_KEYS.forEach(key => {
        if (s[key] !== undefined && list.length < max) list.push(EMOJI_MAP[key][s[key]] || '');
    });
    return list.join('');
}

function buildDayCell(dateStr, dayNum, { selectable, showAppointment }) {
    const isToday = dateStr === todayStr();
    const isSelected = dateStr === state.selectedDate;
    const isFuture = isFutureDate(dateStr);
    const isPeriod = isPeriodDay(dateStr);
    let isOvulationDay = false;

    let cls = 'day';
    if (isPeriod) {
        cls += ` phase-period flow-${getFlowLevel(dateStr)}`;
    } else if (isFuture) {
        // Prioridade: período previsto > outras fases.
        if (isPredictedPeriodDay(dateStr)) {
            cls += ' predicted phase-period-predicted';
        } else {
            const phaseClass = getPredictedPhaseClass(dateStr);
            if (phaseClass) {
                cls += ' predicted ' + phaseClass;
                isOvulationDay = phaseClass === 'phase-ovulation';
            }
        }
    }
    if (isSelected) cls += ' selected';
    if (isToday) cls += ' today';

    // CORRIGIDO: os emoji de sintomas deixaram de aparecer nos dias de
    // período — agora aparecem sempre que há sintomas registados, também
    // sobre a cor de fluxo (cólicas/dor são precisamente mais comuns nesses
    // dias e a informação não devia desaparecer).
    const emojis = dayEmojis(dateStr);
    const appt = showAppointment ? state.appointments.find(a => a.date === dateStr) : null;
    const apptIcon = appt ? `<span class="day-appointment-icon">${APPOINTMENT_ICONS[appt.type]}</span>` : '';
    // Marcador extra no dia de ovulação prevista — o contorno tracejado
    // sozinho era pouco visível num ecrã pequeno.
    const ovulationIcon = isOvulationDay ? `<span class="day-ovulation-icon">🥚</span>` : '';
    const clickAttr = selectable ? ` data-date="${dateStr}"` : '';

    return `<div class="${cls}"${clickAttr}>${dayNum}${apptIcon}${ovulationIcon}${emojis ? `<span class="day-emojis">${emojis}</span>` : ''}${isToday && !isSelected ? '<span class="day-indicator"></span>' : ''}</div>`;
}

function renderMainCalendar() {
    const lang = I18N[state.settings.lang] || I18N.pt;
    const year = state.viewDate.getFullYear();
    const month = state.viewDate.getMonth();
    const grid = document.getElementById('calendarGrid');

    document.getElementById('monthLabel').textContent = `${lang.months[month]} ${year}`;
    document.getElementById('nextMonthBtn').disabled = monthsDiffFromToday(state.viewDate) >= FUTURE_MONTH_LIMIT;

    let html = lang.weekdays.map(d => `<div class="weekday">${d}</div>`).join('');
    const firstDay = getFirstDayOfMonth(year, month);
    const daysInMonth = getDaysInMonth(year, month);
    for (let i = 0; i < firstDay; i++) html += `<div class="day empty"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        html += buildDayCell(dateStr, d, { selectable: true, showAppointment: true });
    }
    grid.innerHTML = html;
}

function renderMiniCalendar(gridId, titleId, year, month, labelKey) {
    const lang = I18N[state.settings.lang] || I18N.pt;
    document.getElementById(titleId).textContent = `${lang.months[month]} ${year}`;
    let html = lang.weekdays.map(d => `<div class="weekday">${d}</div>`).join('');
    const firstDay = getFirstDayOfMonth(year, month);
    const daysInMonth = getDaysInMonth(year, month);
    for (let i = 0; i < firstDay; i++) html += `<div class="day empty"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        html += buildDayCell(dateStr, d, { selectable: false, showAppointment: true });
    }
    document.getElementById(gridId).innerHTML = html;
}

function renderMiniCalendars() {
    const year = state.viewDate.getFullYear();
    const month = state.viewDate.getMonth();
    let m1 = month + 1, y1 = year; if (m1 > 11) { m1 = 0; y1++; }
    renderMiniCalendar('miniGrid1', 'miniTitle1', y1, m1);
    let m2 = month + 2, y2 = year; while (m2 > 11) { m2 -= 12; y2++; }
    renderMiniCalendar('miniGrid2', 'miniTitle2', y2, m2);
}

function renderSidebar() {
    const dateStr = state.selectedDate;
    document.getElementById('selectedDateDisplay').textContent = dateStr || '—';

    if (!dateStr) {
        ['cycleDay', 'fertilityStatus', 'nextOvulation', 'nextPeriod', 'confidenceLevel'].forEach(id => document.getElementById(id).textContent = '—');
        document.getElementById('symptomDateInfo').textContent = t('noDateSelected');
        document.getElementById('flowSection').hidden = true;
        renderAppointmentSection(null);
        return;
    }

    const cycleDay = getCycleDay(dateStr);
    document.getElementById('cycleDay').textContent = cycleDay ? t('nthDay', { n: cycleDay }) : t('noPeriodRegistered');

    const isPeriod = isPeriodDay(dateStr);
    document.getElementById('fertilityStatus').textContent = isPeriod ? t('periodStatusLabel') : getFertilityInfo(dateStr).label;

    document.getElementById('nextOvulation').textContent = getNextOvulation(dateStr) || '—';
    document.getElementById('nextPeriod').textContent = getNextPeriodDisplay(dateStr) || '—';

    const conf = getCycleConfidence();
    document.getElementById('confidenceLevel').textContent = `${conf.emoji} ${conf.desc}`;

    const isFuture = isFutureDate(dateStr);
    const s = state.symptoms[dateStr] || {};
    SYMPTOM_KEYS.forEach(key => {
        const val = s[key] !== undefined ? s[key] : -1;
        document.querySelectorAll(`.symptom-buttons[data-symptom="${key}"] .btn`).forEach((btn, idx) => {
            btn.classList.toggle('active', idx === val);
            btn.disabled = isFuture;
        });
    });

    const flowSection = document.getElementById('flowSection');
    const canEditFlow = (isPeriod || !!getExtendablePeriod(dateStr)) && !isFuture;
    flowSection.hidden = !canEditFlow;
    if (canEditFlow) {
        const level = state.flow[dateStr]; // undefined num dia ainda por estender
        document.querySelectorAll('.flow-buttons .btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.level) === level);
        });
    }

    const notesInput = document.getElementById('notesInput');
    notesInput.value = s.notes || '';
    notesInput.disabled = isFuture;

    document.getElementById('symptomDateInfo').textContent = isFuture
        ? t('dateFuture', { date: dateStr })
        : (isPeriod ? t('dateInPeriod', { date: dateStr }) : t('dateEditable', { date: dateStr }));

    renderAppointmentSection(dateStr);
}

function renderAppointmentSection(dateStr) {
    const currentWrap = document.getElementById('appointmentCurrentWrap');
    const typesWrap = document.getElementById('appointmentTypesWrap');
    if (!dateStr) { currentWrap.innerHTML = ''; typesWrap.innerHTML = ''; return; }

    const existing = state.appointments.find(a => a.date === dateStr);
    if (existing) {
        typesWrap.innerHTML = '';
        currentWrap.innerHTML = `
            <div class="appointment-current">
                <span>${APPOINTMENT_ICONS[existing.type]} ${t(APPOINTMENT_TYPE_KEY[existing.type])} — ${dateStr}</span>
                <button class="btn btn-sm btn-danger" type="button" data-remove-appt="${existing.id}">✕</button>
            </div>`;
    } else {
        currentWrap.innerHTML = '';
        typesWrap.innerHTML = APPOINTMENT_TYPES.map(type =>
            `<button class="btn btn-outline btn-sm" type="button" data-add-appt="${type}">${APPOINTMENT_ICONS[type]} ${t(APPOINTMENT_TYPE_KEY[type])}</button>`
        ).join('');
    }
}

function renderAlerts() {
    const container = document.getElementById('alertContainer');
    let alerts = '';
    const threshold = state.settings.perimenopauseMode ? 75 : 45;
    if (state.periods.length > 0) {
        const sorted = [...state.periods].sort((a, b) => b.start.localeCompare(a.start));
        const diff = Math.round((new Date() - parseDate(sorted[0].start)) / 86400000);
        if (diff > threshold) alerts += `<div class="alert alert-warning">${t('alertNoRecentPeriod', { days: threshold })}</div>`;
    }
    if (state.periods.length < 2) alerts += `<div class="alert alert-info">${t('alertFewData')}</div>`;
    container.innerHTML = alerts;
}

function renderAppointmentBanner() {
    const banner = document.getElementById('appointmentBanner');
    const next = getNextAppointment();
    if (!next) { banner.hidden = true; return; }
    const days = Math.round((parseDate(next.date) - parseDate(todayStr())) / 86400000);
    const typeLabel = t(APPOINTMENT_TYPE_KEY[next.type]);
    let text;
    if (days === 0) text = t('appointmentToday', { type: typeLabel });
    else if (days === 1) text = t('appointmentTomorrow', { type: typeLabel });
    else text = t('daysUntilAppointment', { days, type: typeLabel, date: next.date });
    banner.textContent = `${APPOINTMENT_ICONS[next.type]} ${text}`;
    banner.hidden = false;
    banner.onclick = () => {
        state.viewDate = parseDate(next.date);
        state.selectedDate = next.date;
        render();
        document.getElementById('calendarGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
}

function updatePeriodToggleButton() {
    const btn = document.getElementById('periodToggleBtn');
    const dateStr = state.selectedDate;
    btn.style.width = '100%';
    btn.title = '';
    if (!dateStr || isFutureDate(dateStr)) {
        btn.textContent = t('markPeriodStart');
        btn.className = 'btn btn-primary';
        btn.disabled = true;
        return;
    }
    const exists = state.periods.some(p => p.start === dateStr);
    if (exists) {
        btn.textContent = t('removePeriodStart');
        btn.className = 'btn btn-danger';
        btn.disabled = false;
        return;
    }
    // CORRIGIDO: fica apenas desativado (sem trocar o texto do botão por uma
    // chave de tradução) — a indicação de "usa os botões de fluxo" vai só
    // no atributo title (tooltip), não como texto permanente do botão.
    if (getExtendablePeriod(dateStr)) {
        btn.textContent = t('markPeriodStart');
        btn.className = 'btn btn-outline';
        btn.disabled = true;
        btn.title = t('useFlowToExtend');
        return;
    }
    btn.textContent = t('markPeriodStart');
    btn.className = 'btn btn-primary';
    btn.disabled = false;
}

function updateSettingsStatus() {
    const avg = getAverageCycleLength();
    const isAuto = state.periods.length >= 2;
    const status = document.getElementById('settingsStatus');
    status.textContent = isAuto
        ? t('settingsAuto', { n: state.periods.length, avg })
        : t('settingsDefault');
    // BUG CORRIGIDO: cores fixas por inline style (verde/laranja claro) não
    // se adaptavam ao modo escuro — o texto (var(--text), quase branco em
    // modo escuro) ficava ilegível sobre esse fundo claro. Agora usa classes
    // com par claro/escuro definido no CSS, tal como os alertas.
    status.classList.remove('status-auto', 'status-default');
    status.classList.add(isAuto ? 'status-auto' : 'status-default');
    if (state.settings.perimenopauseMode) status.textContent += t('settingsPerimenopause');
}

function render() {
    renderMainCalendar();
    renderMiniCalendars();
    renderSidebar();
    renderAlerts();
    renderAppointmentBanner();
    updatePeriodToggleButton();
    updateSettingsStatus();
    saveState();
}

/* ================= TEXTOS ESTÁTICOS (i18n) ================= */
function applyStaticTexts() {
    document.documentElement.lang = state.settings.lang;
    document.getElementById('appTitleText').textContent = t('appTitle');
    document.getElementById('appSubtitleText').textContent = state.settings.userName || t('appSubtitle');
    document.getElementById('todayBtn').textContent = t('today');
    document.getElementById('prevMonthBtn').setAttribute('aria-label', t('prevMonth'));
    document.getElementById('nextMonthBtn').setAttribute('aria-label', t('nextMonth'));
    document.getElementById('periodActionsTitle').style.display = 'none';

    document.getElementById('lblCycleDay').textContent = t('cycleDay');
    document.getElementById('lblFertility').textContent = t('fertilityStatus');
    document.getElementById('lblNextOvulation').textContent = t('nextOvulation');
    document.getElementById('lblNextPeriod').textContent = t('nextPeriod');
    document.getElementById('lblConfidence').textContent = t('confidence');

    document.getElementById('appointmentsTitleText').textContent = t('appointmentsTitle');
    document.getElementById('lblFlow').textContent = t('flowTitle');
    document.querySelector('.flow-opt-1').textContent = '● ' + t('flowLow');
    document.querySelector('.flow-opt-2').textContent = '●● ' + t('flowMed');
    document.querySelector('.flow-opt-3').textContent = '●●● ' + t('flowHigh');

    document.getElementById('lblMood').textContent = t('mood');
    document.getElementById('lblPhysical').textContent = t('physical');
    document.getElementById('lblEnergy').textContent = t('energy');
    document.getElementById('lblLibido').textContent = t('libido');
    document.getElementById('lblNotes').textContent = t('notes');
    document.getElementById('notesInput').placeholder = t('notesPlaceholder');

    document.getElementById('settingsTitleText').textContent = t('settingsTitle');
    document.getElementById('lblCycleLength').textContent = t('cycleLengthLabel');
    document.getElementById('lblPeriodLength').textContent = t('periodLengthLabel');
    document.getElementById('lblLutealPhase').textContent = t('lutealPhaseLabel');
    document.getElementById('lblPerimenopause').textContent = t('perimenopauseModeLabel');

    document.getElementById('backupTitleText').textContent = t('backupTitle');
    document.getElementById('exportBtn').textContent = t('exportData');
    document.getElementById('importLabelText').textContent = t('importData');
    document.getElementById('clearBtn').textContent = t('clearAllData');

    document.getElementById('reportTitleText').textContent = t('reportTitle');
    document.getElementById('generateReportBtn').textContent = t('generateReport');

    document.getElementById('updateBannerText').textContent = t('updateAvailable');
    document.getElementById('updateNowBtn').textContent = t('updateNow');

    document.getElementById('appFooterText').textContent = t('appFooter');
    document.getElementById('onboardingTitleText').textContent = t('onboardingTitle');
    document.getElementById('onboardingPromptText').textContent = t('onboardingPrompt');
    document.getElementById('onboardingNameInput').placeholder = t('namePlaceholder');
    document.getElementById('onboardingSaveBtn').textContent = t('saveName');
    document.getElementById('onboardingSkipBtn').textContent = t('skipName');

    const langSelect = document.getElementById('langSelect');
    langSelect.innerHTML = Object.keys(LANGS).map(code =>
        `<option value="${code}" ${code === state.settings.lang ? 'selected' : ''}>${LANGS[code].flag} ${LANGS[code].code}</option>`
    ).join('');
}

/* ================= TEMA ================= */
function applyTheme() {
    const theme = state.settings.theme;
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
}
function cycleTheme() {
    const order = ['auto', 'light', 'dark'];
    const idx = order.indexOf(state.settings.theme);
    state.settings.theme = order[(idx + 1) % order.length];
    applyTheme();
    document.getElementById('themeToggleBtn').title = `${t('themeLabel')}: ${t('theme' + capitalize(state.settings.theme))}`;
    saveState();
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ================= RELATÓRIO / IMPRESSÃO ================= */
function getReportPeriods() {
    const sorted = [...state.periods].sort((a, b) => a.start.localeCompare(b.start));
    return sorted.slice(-12);
}

function predominantFlow(period) {
    const counts = { 1: 0, 2: 0, 3: 0 };
    let d = parseDate(period.start);
    const end = parseDate(period.end);
    while (d <= end) {
        const ds = formatDate(d);
        counts[getFlowLevel(ds)]++;
        d = addDays(d, 1);
    }
    const max = Object.keys(counts).reduce((a, b) => counts[a] >= counts[b] ? a : b);
    return { 1: t('flowLow'), 2: t('flowMed'), 3: t('flowHigh') }[max];
}

function generateReport() {
    const periods = getReportPeriods();
    const avgCycle = getAverageCycleLength();
    const avgPeriod = getAveragePeriodLength();
    const conf = getCycleConfidence();

    let html = `
        <h2>${t('appTitle')} — ${state.settings.userName ? t('reportSubtitlePersonal', { name: state.settings.userName }) : t('reportSubtitleGeneral')}</h2>
        <p>${t('reportGeneratedAt', { date: new Date().toLocaleDateString() })}</p>
        <h3>${t('reportSummary')}</h3>
        <ul>
            <li>${t('reportAvgCycle')}: <strong>${avgCycle} ${t('reportDays')}</strong></li>
            <li>${t('reportAvgPeriod')}: <strong>${avgPeriod} ${t('reportDays')}</strong></li>
            <li>${t('reportConfidenceLabel')}: <strong>${conf.desc}</strong></li>
        </ul>`;

    if (periods.length === 0) {
        html += `<p>${t('reportNoData')}</p>`;
    } else {
        // Histórico simples de duração de ciclos (barras)
        const diffs = [];
        for (let i = 1; i < periods.length; i++) {
            diffs.push({ date: periods[i].start, len: Math.round((parseDate(periods[i].start) - parseDate(periods[i - 1].start)) / 86400000) });
        }
        if (diffs.length) {
            const maxLen = Math.max(...diffs.map(d => d.len), avgCycle);
            html += `<h3>${t('reportCycleHistory', { n: periods.length })}</h3>
                <div style="display:flex;align-items:flex-end;gap:6px;height:120px;border-bottom:1px solid #999;padding-bottom:2px;">
                ${diffs.map(d => `
                    <div style="flex:1;text-align:center;font-size:10px;">
                        <div style="background:#e91e63;height:${Math.round((d.len / maxLen) * 100)}px;border-radius:3px 3px 0 0;"></div>
                        <div>${d.len}</div>
                    </div>`).join('')}
                </div>`;
        }

        html += `<h3>${t('reportPeriodsTable')}</h3>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead><tr>
                    <th style="text-align:left;border-bottom:1px solid #999;padding:4px;">${t('reportColStart')}</th>
                    <th style="text-align:left;border-bottom:1px solid #999;padding:4px;">${t('reportColEnd')}</th>
                    <th style="text-align:left;border-bottom:1px solid #999;padding:4px;">${t('reportColDuration')}</th>
                    <th style="text-align:left;border-bottom:1px solid #999;padding:4px;">${t('reportColFlow')}</th>
                </tr></thead>
                <tbody>
                ${periods.map(p => {
                    const dur = Math.round((parseDate(p.end) - parseDate(p.start)) / 86400000) + 1;
                    return `<tr>
                        <td style="padding:4px;border-bottom:1px solid #eee;">${p.start}</td>
                        <td style="padding:4px;border-bottom:1px solid #eee;">${p.end}</td>
                        <td style="padding:4px;border-bottom:1px solid #eee;">${dur} ${t('reportDays')}</td>
                        <td style="padding:4px;border-bottom:1px solid #eee;">${predominantFlow(p)}</td>
                    </tr>`;
                }).join('')}
                </tbody>
            </table>`;
    }

    if (state.appointments.length) {
        const sortedAppts = [...state.appointments].sort((a, b) => a.date.localeCompare(b.date));
        html += `<h3>${t('reportAppointments')}</h3>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead><tr>
                    <th style="text-align:left;border-bottom:1px solid #999;padding:4px;">${t('reportColDate')}</th>
                    <th style="text-align:left;border-bottom:1px solid #999;padding:4px;">${t('reportColType')}</th>
                    <th style="text-align:left;border-bottom:1px solid #999;padding:4px;">${t('reportColNote')}</th>
                </tr></thead>
                <tbody>
                ${sortedAppts.map(a => `<tr>
                    <td style="padding:4px;border-bottom:1px solid #eee;">${a.date}</td>
                    <td style="padding:4px;border-bottom:1px solid #eee;">${APPOINTMENT_ICONS[a.type]} ${t(APPOINTMENT_TYPE_KEY[a.type])}</td>
                    <td style="padding:4px;border-bottom:1px solid #eee;">${a.note || ''}</td>
                </tr>`).join('')}
                </tbody>
            </table>`;
    }

    document.getElementById('reportContent').innerHTML = html;
    window.print();
}

/* ================= SWIPE ================= */
function setupSwipe() {
    const grid = document.getElementById('calendarGrid');
    let startX = 0, startY = 0, tracking = false;
    grid.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX; startY = e.touches[0].clientY; tracking = true;
    }, { passive: true });
    grid.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
            navigateMonth(dx < 0 ? 1 : -1);
        }
    }, { passive: true });
}

/* ================= EVENTOS ================= */
function setupEvents() {
    document.getElementById('prevMonthBtn').addEventListener('click', () => navigateMonth(-1));
    document.getElementById('nextMonthBtn').addEventListener('click', () => navigateMonth(1));
    document.getElementById('todayBtn').addEventListener('click', goToToday);
    document.getElementById('periodToggleBtn').addEventListener('click', togglePeriod);
    document.getElementById('themeToggleBtn').addEventListener('click', cycleTheme);

    document.getElementById('langSelect').addEventListener('change', (e) => {
        state.settings.lang = e.target.value;
        applyStaticTexts();
        render();
    });

    document.getElementById('calendarGrid').addEventListener('click', (e) => {
        const cell = e.target.closest('[data-date]');
        if (cell) selectDay(cell.dataset.date);
    });

    document.querySelectorAll('.symptom-buttons[data-symptom]').forEach(group => {
        const symptom = group.dataset.symptom;
        if (symptom === 'flow') {
            group.querySelectorAll('.btn').forEach(btn => {
                btn.addEventListener('click', () => setFlow(parseInt(btn.dataset.level)));
            });
        } else {
            group.querySelectorAll('.btn').forEach(btn => {
                btn.addEventListener('click', () => setSymptom(symptom, parseInt(btn.dataset.idx)));
            });
        }
    });

    document.getElementById('notesInput').addEventListener('change', saveNotes);

    ['cycleLengthInput', 'periodLengthInput', 'lutealPhaseInput'].forEach(id => {
        document.getElementById(id).addEventListener('change', updateSettings);
    });
    document.getElementById('perimenopauseMode').addEventListener('change', updateSettings);

    document.getElementById('appointmentTypesWrap').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-add-appt]');
        if (btn) addAppointment(btn.dataset.addAppt);
    });
    document.getElementById('appointmentCurrentWrap').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-remove-appt]');
        if (btn) removeAppointment(btn.dataset.removeAppt);
    });

    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('importFile').addEventListener('change', importData);
    document.getElementById('clearBtn').addEventListener('click', clearAllData);
    document.getElementById('generateReportBtn').addEventListener('click', generateReport);

    document.getElementById('phaseInfoBtn').addEventListener('click', openPhasePopup);
    document.getElementById('phasePopupClose').addEventListener('click', closePhasePopup);

    document.getElementById('onboardingSaveBtn').addEventListener('click', () => completeOnboarding(true));
    document.getElementById('onboardingSkipBtn').addEventListener('click', () => completeOnboarding(false));

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') goToToday();
    });

    setupSwipe();

    // Recalcula quantos emoji cabem quando o ecrã cruza o limiar largo/estreito
    // (ex. rodar o telemóvel para landscape), sem precisar de recarregar.
    WIDE_SCREEN_MQ.addEventListener('change', render);
}

/* ================= POPUP DE FASE DO CICLO ================= */
// Mapeia o dia selecionado para uma das 7 fases descritas — reaproveita o
// mesmo motor de cálculo que já colore o calendário, por isso está sempre
// coerente com o que se vê nos dias reais/previstos.
function getPhaseKey(dateStr) {
    if (isPeriodDay(dateStr)) return 'menstrual';
    const fi = getFertilityInfo(dateStr);
    return fi.phase; // 'follicular' | 'fertility-moderate' | 'fertility-high' | 'ovulation' | 'luteal' | 'pms' | 'unknown'
}
const PHASE_I18N_SUFFIX = {
    menstrual: 'Menstrual', follicular: 'Follicular', 'fertility-moderate': 'FertilityModerate',
    'fertility-high': 'FertilityHigh', ovulation: 'Ovulation', luteal: 'Luteal', pms: 'Pms', unknown: 'Unknown'
};

function openPhasePopup() {
    const dateStr = state.selectedDate;
    if (!dateStr) return;
    const suffix = PHASE_I18N_SUFFIX[getPhaseKey(dateStr)] || 'Unknown';
    document.getElementById('phasePopupTitle').textContent = t('phaseTitle' + suffix);
    document.getElementById('phasePopupText').textContent = t('phaseText' + suffix);
    document.getElementById('phasePopupFootnote').textContent = t('footnoteGeneral');
    const perimenopauseP = document.getElementById('phasePopupPerimenopause');
    if (state.settings.perimenopauseMode) {
        perimenopauseP.textContent = t('footnotePerimenopause');
        perimenopauseP.hidden = false;
    } else {
        perimenopauseP.hidden = true;
    }
    document.getElementById('phasePopup').hidden = false;
}
function closePhasePopup() {
    document.getElementById('phasePopup').hidden = true;
}

/* ================= ONBOARDING (NOME OPCIONAL) ================= */
const ONBOARDED_KEY = 'ciclo_onboarded';
function shouldShowOnboarding() { return localStorage.getItem(ONBOARDED_KEY) !== 'true'; }
function markOnboarded() { localStorage.setItem(ONBOARDED_KEY, 'true'); }

function showOnboarding() {
    document.getElementById('onboardingNameInput').value = state.settings.userName || '';
    document.getElementById('onboardingModal').hidden = false;
}
function completeOnboarding(save) {
    if (save) {
        const name = document.getElementById('onboardingNameInput').value.trim();
        state.settings.userName = name;
        applyStaticTexts();
        saveState();
    }
    markOnboarded();
    document.getElementById('onboardingModal').hidden = true;
}


// BUG CORRIGIDO (causa raiz, não só um sintoma): logo na PRIMEIRA instalação
// (sem nenhuma versão anterior a substituir — o caso normal em incógnito),
// o service worker ativa-se automaticamente e chama clients.claim(), o que
// dispara 'controllerchange' mesmo sem existir de facto uma atualização.
// "navigator.serviceWorker.controller" não é fiável neste instante exato
// para distinguir "primeira instalação" de "atualização real". Em vez
// disso guardamos nós próprios, no localStorage, se esta app já esteve
// alguma vez sob controlo de um service worker — só a partir daí é que um
// controllerchange ou um worker à espera contam como uma atualização real.
const SW_SEEN_KEY = 'ciclo_sw_seen';

function setupServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    let refreshing = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        if (localStorage.getItem(SW_SEEN_KEY) === 'true') {
            refreshing = true;
            window.location.reload();
        } else {
            localStorage.setItem(SW_SEEN_KEY, 'true');
        }
    });

    navigator.serviceWorker.register('sw.js').then((reg) => {
        if (navigator.serviceWorker.controller) localStorage.setItem(SW_SEEN_KEY, 'true');
        const alreadySeen = () => localStorage.getItem(SW_SEEN_KEY) === 'true';

        if (reg.waiting && alreadySeen()) showUpdateBanner(reg);

        reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && alreadySeen()) {
                    showUpdateBanner(reg);
                }
                if (newWorker.state === 'activated') localStorage.setItem(SW_SEEN_KEY, 'true');
            });
        });
    }).catch((err) => console.warn('Falha ao registar service worker:', err));
}

function showUpdateBanner(reg) {
    const banner = document.getElementById('updateBanner');
    banner.hidden = false;
    document.getElementById('updateNowBtn').onclick = () => {
        if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
    };
}

/* ================= INICIALIZAÇÃO ================= */
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    applyTheme();
    applyStaticTexts();
    syncSettingsInputs();
    state.selectedDate = todayStr();
    setupEvents();
    render();
    setupServiceWorker();
    // Primeira utilização (ou logo a seguir a apagar todos os dados).
    if (shouldShowOnboarding()) showOnboarding();
});
