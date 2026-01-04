// Enhanced calculator with memory stack (multiple slots).
// Keeps previous features: functions, DEG/RAD, history, theme, live preview.
// New: memory stack (multi-slot) with push/pop/add/subtract/clear and clickable slots.

(() => {
  const expressionEl = document.getElementById('expression');
  const resultEl = document.getElementById('result');
  const keys = document.querySelectorAll('.keys .btn');
  const memIndicator = document.getElementById('memIndicator');
  const historyPanel = document.getElementById('historyPanel');
  const historyListEl = document.getElementById('historyList');
  const historyToggle = document.getElementById('historyToggle');
  const clearHistoryBtn = document.getElementById('clearHistory');
  const themeToggle = document.getElementById('themeToggle');
  const modeToggle = document.getElementById('modeToggle');

  const memClearAllBtn = document.getElementById('memClearAll');
  const memPushBtn = document.getElementById('memPush');
  const memPopBtn = document.getElementById('memPop');
  const memAddBtn = document.getElementById('memAdd');
  const memSubBtn = document.getElementById('memSub');
  const memSlotsContainer = document.getElementById('memSlots');

  let expression = '';
  let memoryStack = []; // stack: last element is the top
  const MAX_SLOTS = 6;

  let history = [];
  let angleMode = localStorage.getItem('calc-angle') || 'DEG'; // DEG or RAD
  let theme = localStorage.getItem('calc-theme') || 'dark';

  // Initialize theme and angle mode
  function applyTheme() {
    if (theme === 'light') document.documentElement.classList.add('light');
    else document.documentElement.classList.remove('light');
    themeToggle.setAttribute('aria-pressed', theme === 'light');
  }
  function applyAngleMode() {
    modeToggle.textContent = angleMode;
    modeToggle.setAttribute('aria-pressed', angleMode === 'RAD');
  }

  // Load history and memory from storage
  function loadState() {
    const mem = localStorage.getItem('calc-memory-stack');
    memoryStack = mem ? JSON.parse(mem) : [];
    memoryStack = Array.isArray(memoryStack) ? memoryStack : [];
    const h = localStorage.getItem('calc-history');
    history = h ? JSON.parse(h) : [];
    renderHistory();
    renderMemorySlots();
  }

  applyTheme();
  applyAngleMode();
  loadState();

  // Utilities
  function pushHistory(expr, result) {
    const entry = { expr, result, time: new Date().toISOString() };
    history.unshift(entry);
    if (history.length > 100) history.pop();
    localStorage.setItem('calc-history', JSON.stringify(history));
    renderHistory();
  }

  function renderHistory() {
    historyListEl.innerHTML = '';
    history.forEach((it) => {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.tabIndex = 0;
      li.innerHTML = `<div style="font-weight:600">${escapeHtml(it.expr)}</div><div style="color:var(--muted)">${escapeHtml(it.result)}</div>`;
      li.addEventListener('click', () => {
        expression = String(it.expr);
        updateDisplay();
        historyPanel.setAttribute('aria-hidden', 'true');
      });
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') li.click();
      });
      historyListEl.appendChild(li);
    });
  }

  function escapeHtml(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  function updateDisplay() {
    expressionEl.textContent = expression || '';
    const value = expression ? tryEvaluate(expression) : '0';
    resultEl.textContent = value;
  }

  // Preprocess expression to JS-evaluable expression (same logic as earlier)
  function preprocessExpression(expr) {
    let e = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');

    // Handle contextual percent: e.g., 200+10% => 200+(200*10/100)
    e = e.replace(/([0-9.)]+)([+\-])([0-9.]+)%/g, (_, left, op, pct) => {
      return `${left}${op}(${left}*${pct}/100)`;
    });

    // Standalone percentages become fraction
    e = e.replace(/([0-9.]+)%/g, '($1/100)');

    // Map '^' to '**'
    e = e.replace(/\^/g, '**');

    // Map functions to Math.* or helpers
    e = e.replace(/sqrt\(/gi, 'Math.sqrt(');
    e = e.replace(/log\(/gi, 'Math.log10('); // map to Math.log10, replaced later with helper
    e = e.replace(/ln\(/gi, 'Math.log(');

    // Map trig names to Math.<fn>(
    e = e.replace(/(sin|cos|tan)\(/gi, (m) => {
      return `Math.${m.slice(0, -1)}(`;
    });

    // If DEG mode, inject conversion wrapper before trig arguments
    if (angleMode === 'DEG') {
      e = e.replace(/Math\.(sin|cos|tan)\(/g, 'Math.$1((Math.PI/180)*(');
      e = addClosingParensForInjectedDeg(e);
    }

    return e;
  }

  function addClosingParensForInjectedDeg(s) {
    // When we inserted an extra "(Math.PI/180)*(" we need to add a closing ')' for each trig argument.
    // We'll scan and add an extra ')' matching the inserted wrapper.
    let out = '';
    let i = 0;
    while (i < s.length) {
      const prefix = s.slice(i, i + 15); // "Math.sin((Math" length < 15
      const match = s.slice(i).match(/^Math\.(sin|cos|tan)\(\(Math\.PI\/180\)\*\(/);
      if (match) {
        out += match[0];
        i += match[0].length;
        // copy until matching ')' of the arg, then add an extra ')'
        let depth = 1;
        while (i < s.length && depth > 0) {
          const ch = s[i++];
          out += ch;
          if (ch === '(') depth++;
          else if (ch === ')') depth--;
        }
        out += ')';
      } else {
        out += s[i++];
      }
    }
    return out;
  }

  // Safe-ish evaluation
  function tryEvaluate(expr) {
    try {
      const pre = preprocessExpression(expr);
      // Replace Math.log10 with log10 helper
      let prepared = pre.replace(/Math\.log10\(/g, 'log10(');

      // Safety regex: allow digits, operators, parentheses, Math, log10, and letters from helper names
      const safetyRegex = /^[0-9+\-*/()., \tMathlog10PIeLnSincostanr]+$/i;
      // The regex is permissive; final guard is controlled Function invocation.

      if (!safetyRegex.test(prepared)) return 'Err';

      // Evaluate using Function exposing only log10 helper
      // eslint-disable-next-line no-new-func
      const fn = new Function('log10', `return (${prepared});`);
      const value = fn((x) => Math.log10 ? Math.log10(x) : Math.log(x)/Math.LN10);
      if (typeof value === 'number' && isFinite(value)) return formatNumber(value);
      return 'Err';
    } catch {
      return 'Err';
    }
  }

  function formatNumber(num) {
    if (Number.isInteger(num)) return String(num);
    return parseFloat(num.toPrecision(12)).toString();
  }

  // Memory stack helpers
  function saveMemoryStack() {
    localStorage.setItem('calc-memory-stack', JSON.stringify(memoryStack));
    renderMemorySlots();
  }

  function renderMemorySlots() {
    memSlotsContainer.innerHTML = '';
    // We'll display slots top-first. memoryStack's last element is the top.
    const reversed = memoryStack.slice().reverse(); // top at index 0
    for (let i = 0; i < MAX_SLOTS; i++) {
      const li = document.createElement('div');
      li.className = 'mem-slot';
      const slotValue = reversed[i];
      const slotHeader = document.createElement('div');
      slotHeader.className = 'slot-header';
      const slotLabel = document.createElement('div');
      slotLabel.textContent = `Slot ${i + 1}`; // 1 = top
      slotLabel.className = 'slot-meta';
      const slotActions = document.createElement('div');
      slotActions.className = 'slot-actions';
      const clearBtn = document.createElement('button');
      clearBtn.className = 'slot-btn';
      clearBtn.textContent = 'Clear';
      // If there's a value, show it; else show placeholder
      const slotValEl = document.createElement('div');
      slotValEl.className = 'slot-value';
      slotValEl.textContent = slotValue !== undefined ? formatNumber(slotValue) : '—';

      // Clicking the whole slot recalls the value (if exists)
      if (slotValue !== undefined) {
        li.title = 'Click to recall this slot';
        li.addEventListener('click', (e) => {
          // Prevent clicks on clear button from also triggering recall
          if (e.target === clearBtn) return;
          expression = String(slotValue);
          updateDisplay();
        });
      } else {
        li.style.opacity = '0.6';
      }

      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Map displayed index back to memoryStack index
        const memIndex = memoryStack.length - 1 - i;
        if (memIndex >= 0 && memIndex < memoryStack.length) {
          memoryStack.splice(memIndex, 1);
          saveMemoryStack();
        }
      });

      slotActions.appendChild(clearBtn);
      slotHeader.appendChild(slotLabel);
      slotHeader.appendChild(slotActions);
      li.appendChild(slotHeader);
      li.appendChild(slotValEl);
      memSlotsContainer.appendChild(li);
    }

    // Update memIndicator to show stack count and top value if present
    const top = memoryStack.length ? memoryStack[memoryStack.length - 1] : null;
    memIndicator.textContent = memoryStack.length ? `M: ${memoryStack.length} (top: ${formatNumber(top)})` : 'M: 0';
  }

  function memPush() {
    const val = tryEvaluate(expression);
    if (val === 'Err') return;
    const num = Number(val);
    memoryStack.push(num);
    if (memoryStack.length > MAX_SLOTS) {
      // drop bottom (oldest)
      memoryStack.shift();
    }
    saveMemoryStack();
  }

  function memPop() {
    if (!memoryStack.length) return;
    const val = memoryStack.pop();
    saveMemoryStack();
    expression = String(val);
    updateDisplay();
  }

  function memAdd() {
    const val = tryEvaluate(expression);
    if (val === 'Err') return;
    const num = Number(val);
    if (memoryStack.length === 0) memoryStack.push(num);
    else memoryStack[memoryStack.length - 1] = Number(memoryStack[memoryStack.length - 1]) + num;
    saveMemoryStack();
  }

  function memSub() {
    const val = tryEvaluate(expression);
    if (val === 'Err') return;
    const num = Number(val);
    if (memoryStack.length === 0) memoryStack.push(-num);
    else memoryStack[memoryStack.length - 1] = Number(memoryStack[memoryStack.length - 1]) - num;
    saveMemoryStack();
  }

  function memClearAll() {
    memoryStack = [];
    saveMemoryStack();
  }

  // Add input value
  function press(value) {
    expression += value;
    updateDisplay();
  }

  function clearAll() {
    expression = '';
    updateDisplay();
  }

  function del() {
    if (!expression) return;
    expression = expression.slice(0, -1);
    updateDisplay();
  }

  function evaluate() {
    const out = tryEvaluate(expression);
    if (out === 'Err') {
      resultEl.textContent = 'Error';
      return;
    }
    pushHistory(expression || out, out);
    expression = String(out);
    updateDisplay();
  }

  // Click handlers for keys
  keys.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.value;
      const action = btn.dataset.action;

      if (action === 'clear') return clearAll();
      if (action === 'delete') return del();
      if (action === 'equals') return evaluate();

      if (val) press(val);
    });
  });

  // Keyboard support
  window.addEventListener('keydown', (e) => {
    const key = e.key;
    if (key === 'Enter') {
      e.preventDefault();
      return evaluate();
    }
    if (key === 'Backspace') {
      e.preventDefault();
      return del();
    }
    if (key === 'Escape') {
      e.preventDefault();
      return clearAll();
    }

    // Allow digits, parentheses, operators, dot, percent, ^ 
    if (/^[0-9+\-*/().%^]$/.test(key)) {
      press(key);
      return;
    }

    if (key === '.') { press('.'); return; }
    if (key === '*') { press('*'); return; }
    if (key === '/') { press('/'); return; }
    if (key === '^') { press('^'); return; }

    // Allow letters for functions (type sin, cos)
    if (/^[a-zA-Z]$/.test(key)) {
      press(key);
      return;
    }
  });

  // History toggle
  historyToggle.addEventListener('click', () => {
    const hidden = historyPanel.getAttribute('aria-hidden') === 'true';
    historyPanel.setAttribute('aria-hidden', String(!hidden));
  });

  clearHistoryBtn.addEventListener('click', () => {
    history = [];
    localStorage.removeItem('calc-history');
    renderHistory();
  });

  // Theme toggle
  themeToggle.addEventListener('click', () => {
    theme = theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('calc-theme', theme);
    applyTheme();
  });

  // Angle mode toggle
  modeToggle.addEventListener('click', () => {
    angleMode = angleMode === 'DEG' ? 'RAD' : 'DEG';
    localStorage.setItem('calc-angle', angleMode);
    applyAngleMode();
    updateDisplay();
  });

  // Memory controls
  memPushBtn.addEventListener('click', memPush);
  memPopBtn.addEventListener('click', memPop);
  memAddBtn.addEventListener('click', memAdd);
  memSubBtn.addEventListener('click', memSub);
  memClearAllBtn.addEventListener('click', memClearAll);

  // Initial render
  updateDisplay();
  renderMemorySlots();

  // Helper: escape unsafe characters when rendering history (already used)
})();
