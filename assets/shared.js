/* Engineer Textbook — shared JS
 * 各教材ページに共通して使う、宣言的なインタラクションランタイム。
 *
 *  クイズ:        <div data-quiz data-answer="b" data-explanation="...">
 *                   <ul>
 *                     <li><label><input type="radio" name="qN" value="a">選択肢A</label></li>
 *                     ...
 *                   </ul>
 *                   <button data-quiz-submit>回答する</button>
 *                 </div>
 *  複数選択:      data-multiple を付けて、data-answer="a,c" のようにカンマ区切り
 *  穴埋め:        <div data-fill>
 *                   <p>... <input data-answer="kernel"> ...</p>
 *                   <button data-fill-submit>確認</button>
 *                 </div>
 *  ターミナル演習: <div data-terminal data-expect="ls" data-output="file1 file2">
 *                   <pre>$ <span data-cursor></span></pre>
 *                 </div>
 *  並び替え:      <ul data-sortable data-answer="a,b,c"> <li data-id="b">...</li> ... </ul>
 *
 * 進捗は LocalStorage に保存。key: tb:progress:{topicId}
 */
(function () {
  'use strict';

  // ===== 進捗管理 =====
  const Progress = {
    key: () => `tb:progress:${document.documentElement.dataset.topicId || 'default'}`,
    load() {
      try { return JSON.parse(localStorage.getItem(this.key()) || '{}'); }
      catch { return {}; }
    },
    save(state) {
      try { localStorage.setItem(this.key(), JSON.stringify(state)); } catch {}
    },
    mark(id, ok) {
      const s = this.load();
      s[id] = { ok: !!ok, at: Date.now() };
      this.save(s);
      this.refreshBar();
    },
    refreshBar() {
      const total = document.querySelectorAll('[data-quiz],[data-fill],[data-terminal],[data-sortable]').length;
      const state = this.load();
      const done = Object.values(state).filter(v => v && v.ok).length;
      const bar = document.querySelector('[data-progress-bar]');
      const pct = document.querySelector('[data-progress-pct]');
      const ratio = total ? Math.round((done / total) * 100) : 0;
      if (bar) bar.style.width = ratio + '%';
      if (pct) pct.textContent = ratio + '%';
    },
    reset() {
      try { localStorage.removeItem(this.key()); } catch {}
      document.querySelectorAll('.is-correct, .is-wrong, .is-selected').forEach(el => {
        el.classList.remove('is-correct', 'is-wrong', 'is-selected');
      });
      document.querySelectorAll('.tb-quiz-feedback').forEach(el => {
        el.classList.remove('is-correct', 'is-wrong');
        el.style.display = '';
      });
      this.refreshBar();
    },
  };

  // ===== クイズ =====
  function setupQuiz(root) {
    const id = root.dataset.id || cryptoHash(root.innerText).slice(0, 8);
    root.dataset.id = id;
    const multiple = root.hasAttribute('data-multiple');
    const correct = (root.dataset.answer || '').split(',').map(s => s.trim().toLowerCase());
    const expl = root.dataset.explanation || '';

    const inputs = root.querySelectorAll('input[type=radio],input[type=checkbox]');
    inputs.forEach(input => {
      input.addEventListener('change', () => {
        root.querySelectorAll('.tb-quiz-option').forEach(opt => {
          const inp = opt.querySelector('input');
          opt.classList.toggle('is-selected', inp && inp.checked);
        });
      });
    });

    const submit = root.querySelector('[data-quiz-submit]');
    if (!submit) return;
    submit.addEventListener('click', () => {
      const checked = [...root.querySelectorAll('input:checked')].map(i => i.value.toLowerCase());
      const ok = multiple
        ? checked.length === correct.length && correct.every(v => checked.includes(v))
        : checked.length === 1 && correct.includes(checked[0]);

      root.querySelectorAll('.tb-quiz-option').forEach(opt => {
        const inp = opt.querySelector('input');
        if (!inp) return;
        const v = inp.value.toLowerCase();
        opt.classList.remove('is-correct', 'is-wrong');
        if (correct.includes(v)) opt.classList.add('is-correct');
        else if (inp.checked) opt.classList.add('is-wrong');
      });

      let fb = root.querySelector('.tb-quiz-feedback');
      if (!fb) {
        fb = document.createElement('div');
        fb.className = 'tb-quiz-feedback';
        root.appendChild(fb);
      }
      fb.classList.remove('is-correct', 'is-wrong');
      fb.classList.add(ok ? 'is-correct' : 'is-wrong');
      fb.innerHTML = (ok ? '正解 ' : '惜しい ') + (expl ? `<br><span style="opacity:.85">${expl}</span>` : '');

      Progress.mark(id, ok);
    });
  }

  // ===== 穴埋め =====
  function setupFill(root) {
    const id = root.dataset.id || cryptoHash(root.innerText).slice(0, 8);
    root.dataset.id = id;
    const submit = root.querySelector('[data-fill-submit]');
    if (!submit) return;
    submit.addEventListener('click', () => {
      const inputs = root.querySelectorAll('input[data-answer]');
      let allOk = true;
      inputs.forEach(input => {
        const expected = (input.dataset.answer || '').split('|').map(s => s.trim().toLowerCase());
        const got = (input.value || '').trim().toLowerCase();
        const ok = expected.includes(got);
        input.classList.remove('is-correct', 'is-wrong');
        input.classList.add(ok ? 'is-correct' : 'is-wrong');
        if (!ok) allOk = false;
      });
      Progress.mark(id, allOk);
    });
  }

  // ===== フェイクターミナル =====
  function setupTerminal(root) {
    const id = root.dataset.id || cryptoHash(root.innerText).slice(0, 8);
    root.dataset.id = id;
    const expectRaw = root.dataset.expect || '';
    const expects = expectRaw.split('|').map(s => s.trim()).filter(Boolean);
    const output = root.dataset.output || '';
    const hint = root.dataset.hint || '';

    const log = document.createElement('div');
    log.className = 'tb-terminal-log';
    root.appendChild(log);

    const inputRow = document.createElement('div');
    inputRow.className = 'tb-terminal-input';
    inputRow.innerHTML = '<span>$</span><input autocomplete="off" spellcheck="false" placeholder="コマンドを入力">';
    root.appendChild(inputRow);
    const input = inputRow.querySelector('input');

    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const cmd = input.value.trim();
      if (!cmd) return;
      const ok = expects.some(exp => normalizeCmd(cmd) === normalizeCmd(exp));
      const line = document.createElement('pre');
      line.innerHTML = `<span class="prompt">$</span> ${escapeHtml(cmd)}`;
      log.appendChild(line);
      if (ok) {
        if (output) {
          const out = document.createElement('pre');
          out.className = 'out';
          out.textContent = output;
          log.appendChild(out);
        }
        const ack = document.createElement('pre');
        ack.className = 'ok';
        ack.textContent = '✓ 正解です';
        log.appendChild(ack);
        Progress.mark(id, true);
        input.disabled = true;
      } else {
        const err = document.createElement('pre');
        err.className = 'err';
        err.textContent = hint ? `× もう一度。ヒント: ${hint}` : '× もう一度試してみてください';
        log.appendChild(err);
        Progress.mark(id, false);
      }
      input.value = '';
      root.scrollTop = root.scrollHeight;
    });
  }

  // ===== 並び替え =====
  function setupSortable(root) {
    const id = root.dataset.id || cryptoHash(root.innerText).slice(0, 8);
    root.dataset.id = id;
    const correct = (root.dataset.answer || '').split(',').map(s => s.trim());
    const items = [...root.querySelectorAll('li')];
    items.forEach(li => {
      const label = document.createElement('span');
      label.className = 'tb-sort-label';
      while (li.firstChild) label.appendChild(li.firstChild);
      li.appendChild(label);

      const controls = document.createElement('span');
      controls.className = 'tb-sort-controls';
      controls.innerHTML = '<button type="button" data-sort-up aria-label="上へ移動">↑</button><button type="button" data-sort-down aria-label="下へ移動">↓</button>';
      li.appendChild(controls);

      controls.querySelector('[data-sort-up]').addEventListener('click', () => {
        const prev = li.previousElementSibling;
        if (prev) root.insertBefore(li, prev);
        check();
      });
      controls.querySelector('[data-sort-down]').addEventListener('click', () => {
        const next = li.nextElementSibling;
        if (next) root.insertBefore(next, li);
        check();
      });

      li.draggable = true;
      li.addEventListener('dragstart', () => li.classList.add('dragging'));
      li.addEventListener('dragend', () => {
        li.classList.remove('dragging');
        check();
      });
    });
    root.addEventListener('dragover', e => {
      e.preventDefault();
      const dragging = root.querySelector('.dragging');
      if (!dragging) return;
      const after = getAfter(root, e.clientY);
      if (after == null) root.appendChild(dragging);
      else root.insertBefore(dragging, after);
    });
    function getAfter(container, y) {
      const els = [...container.querySelectorAll('li:not(.dragging)')];
      return els.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) return { offset, el: child };
        return closest;
      }, { offset: -Infinity, el: null }).el;
    }
    function check() {
      const order = [...root.querySelectorAll('li')].map(li => li.dataset.id);
      const ok = order.length === correct.length && order.every((v, i) => v === correct[i]);
      root.classList.toggle('is-correct', ok);
      root.classList.toggle('is-wrong', !ok);
      const fb = root.parentElement.querySelector('[data-sortable-feedback]');
      if (fb) {
        fb.textContent = ok ? '✓ 並び順 正解です' : '× 並び順がまだ違います';
        fb.style.color = ok ? '#065f46' : '#991b1b';
      }
      Progress.mark(id, ok);
    }
  }

  // ===== VPCフローログ解析パネル =====
  function setupFlowDecoder(root) {
    const input = root.querySelector('[data-flow-input]');
    const submit = root.querySelector('[data-flow-submit]');
    const rejectExample = root.querySelector('[data-flow-reject-example]');
    const result = root.querySelector('[data-flow-result]');
    if (!input || !submit || !result) return;

    const fields = [
      ['version', '形式バージョン'],
      ['account-id', 'AWSアカウント'],
      ['interface-id', '観測したENI'],
      ['srcaddr', '送信元IP'],
      ['dstaddr', '宛先IP'],
      ['srcport', '送信元ポート'],
      ['dstport', '宛先ポート'],
      ['protocol', 'プロトコル'],
      ['packets', 'パケット数'],
      ['bytes', 'バイト数'],
      ['start', '開始時刻'],
      ['end', '終了時刻'],
      ['action', 'アクション'],
      ['log-status', 'ログ状態'],
    ];
    const protocolNames = { '1': 'ICMP (1)', '6': 'TCP (6)', '17': 'UDP (17)', '58': 'IPv6-ICMP (58)' };

    function formatTime(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return value;
      try {
        return new Intl.DateTimeFormat('ja-JP', {
          dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Tokyo'
        }).format(new Date(n * 1000)) + ' JST';
      } catch { return value; }
    }

    function render() {
      const values = input.value.trim().split(/\s+/);
      if (values.length !== fields.length) {
        result.innerHTML = `<div class="flow-decoder-error">標準形式は14フィールドです。現在は${values.length}個です。空白区切りと改行を確認してください。</div>`;
        return;
      }

      const data = Object.fromEntries(fields.map((f, i) => [f[0], values[i]]));
      const actionText = data.action === 'ACCEPT' ? '許可' : data.action === 'REJECT' ? '拒否' : data.action;
      const protocolText = protocolNames[data.protocol] || `IPプロトコル番号 ${data.protocol}`;
      const summary = `${data.srcaddr}:${data.srcport} から ${data.dstaddr}:${data.dstport} への ${protocolText} 通信を ${data['interface-id']} で観測し、結果は ${data.action}（${actionText}）です。`;

      const display = { ...data };
      display.protocol = protocolText;
      display.start = formatTime(data.start);
      display.end = formatTime(data.end);
      display.action = `${data.action}（${actionText}）`;

      result.innerHTML = `
        <div class="flow-decoder-summary"><strong>読み取り結果：</strong>${escapeHtml(summary)}</div>
        <div class="flow-decoder-grid">
          ${fields.map(([key, label]) => `<div class="flow-decoder-item"><div class="flow-decoder-key">${escapeHtml(label)} <span aria-hidden="true">·</span> ${escapeHtml(key)}</div><div class="flow-decoder-value">${escapeHtml(display[key])}</div></div>`).join('')}
        </div>`;
    }

    submit.addEventListener('click', render);
    if (rejectExample) {
      rejectExample.addEventListener('click', () => {
        input.value = '2 123456789012 eni-0abc123def456 203.0.113.10 10.0.2.80 53144 22 6 3 180 1793232120 1793232180 REJECT OK';
        render();
      });
    }
    render();
  }

  // ===== Cache-Asideシミュレーター =====
  function setupCacheSimulator(root) {
    root.dataset.cacheReady = 'true';
    const cache = new Set();
    const history = [];
    let requests = 0;
    let hits = 0;
    const requestEl = root.querySelector('[data-cache-requests]');
    const hitsEl = root.querySelector('[data-cache-hits]');
    const rateEl = root.querySelector('[data-cache-rate]');
    const logEl = root.querySelector('[data-cache-log]');

    function render() {
      if (requestEl) requestEl.textContent = requests;
      if (hitsEl) hitsEl.textContent = hits;
      if (rateEl) rateEl.textContent = requests ? Math.round((hits / requests) * 100) + '%' : '0%';
      if (logEl) {
        logEl.innerHTML = history.length
          ? history.map(item => `<p><span class="${item.hit ? 'cache-sim-hit' : 'cache-sim-miss'}">${item.hit ? 'HIT' : 'MISS'}</span> ${escapeHtml(item.key)} — ${item.hit ? 'ElastiCacheから約5msで応答' : 'DBから約120msで取得し、キャッシュへ保存'}</p>`).join('')
          : '<p>商品ボタンを押してください。</p>';
      }
    }

    root.querySelectorAll('[data-cache-request]').forEach(button => {
      button.addEventListener('click', () => {
        const key = button.dataset.cacheRequest || 'unknown';
        const hit = cache.has(key);
        requests++;
        if (hit) hits++;
        else cache.add(key);
        history.unshift({ key, hit });
        history.splice(6);
        render();
      });
    });

    const reset = root.querySelector('[data-cache-reset]');
    if (reset) reset.addEventListener('click', () => {
      cache.clear();
      history.length = 0;
      requests = 0;
      hits = 0;
      render();
    });
    render();
  }

  // ===== Service Quotas 使用量シミュレーター =====
  function setupQuotaCalculator(root) {
    root.dataset.quotaReady = 'true';
    const currentInput = root.querySelector('[data-quota-current]');
    const plannedInput = root.querySelector('[data-quota-planned]');
    const limitInput = root.querySelector('[data-quota-limit]');
    const result = root.querySelector('[data-quota-result]');
    const bar = root.querySelector('[data-quota-bar]');
    const used = root.querySelector('[data-quota-used]');
    if (!currentInput || !plannedInput || !limitInput || !result) return;

    function readNumber(input) {
      const value = Number(input.value);
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    }

    function render() {
      const current = readNumber(currentInput);
      const planned = readNumber(plannedInput);
      const limit = readNumber(limitInput);
      const projected = current + planned;
      const remaining = Math.max(0, limit - current);
      const ratio = limit > 0 ? Math.min(100, Math.round((projected / limit) * 100)) : 100;
      const over = limit <= 0 || projected > limit;
      const full = !over && projected === limit;

      root.classList.toggle('is-over', over);
      root.classList.toggle('is-full', full);
      if (bar) bar.style.width = ratio + '%';
      if (used) used.textContent = `${projected} / ${limit}`;

      if (over) {
        result.innerHTML = `<strong>超過します：</strong>予定後は ${projected}、適用クォータは ${limit} です。少なくとも ${projected - limit} の不足があります。削除・設計変更・クォータ引き上げを先に行ってください。`;
      } else if (full) {
        result.innerHTML = `<strong>上限ちょうどです：</strong>予定後は ${projected} / ${limit}。次の作成は失敗するため、余裕を確保してください。`;
      } else {
        result.innerHTML = `<strong>作成可能です：</strong>現在の残りは ${remaining}、予定後は ${projected} / ${limit} で、残り ${limit - projected} です。`;
      }
    }

    [currentInput, plannedInput, limitInput].forEach(input => input.addEventListener('input', render));
    render();
  }

  // ===== Patch Manager学習用フリート =====
  function setupPatchFleet(root) {
    const grid = root.querySelector('[data-patch-grid]');
    const result = root.querySelector('[data-patch-result]');
    const install = root.querySelector('[data-patch-action="install"]');
    const reboot = root.querySelector('[data-patch-action="reboot"]');
    if (!grid || !result || !install || !reboot) return;
    let phase = 'initial';
    const states = {
      initial: { ok: 0, missing: 0, pending: 0, unknown: 80,
        text: 'まだ評価していません。EC2が80台あることと、80台すべてのパッチ状態が分かることは別です。まずScanを実行します。' },
      scan: { ok: 64, missing: 12, pending: 2, unknown: 2,
        text: 'Scan完了：64台が準拠、12台で承認済みパッチが未適用、2台は再起動待ち、2台は接続できず未評価です。Scanはインストールも再起動もしません。' },
      install: { ok: 64, missing: 0, pending: 14, unknown: 2,
        text: 'NoRebootで適用：未適用12台へパッチを入れました。この例は再起動が必要な更新なので、既存2台と合わせ14台が再起動待ちです。Missingが0でも完了とは判断できません。' },
      reboot: { ok: 78, missing: 0, pending: 0, unknown: 2,
        text: '再起動・再スキャン後：確認できた78台は準拠です。ただし対象80台のうち2台は未評価のまま。全台完了と報告する前に接続を復旧して再実行します。' }
    };
    const labels = { ok: '準拠', missing: '未適用', pending: '再起動待ち', unknown: '未評価' };
    function render() {
      const state = states[phase];
      let number = 0;
      grid.innerHTML = Object.entries(labels).map(([key, label]) =>
        Array.from({ length: state[key] }, () => {
          number++;
          const node = String(number).padStart(2, '0');
          return `<span class="patch-node is-${key}" title="EC2 ${node}: ${label}" aria-label="EC2 ${node}: ${label}">${node}</span>`;
        }).join('')
      ).join('');
      Object.keys(labels).forEach(key => {
        const host = root.querySelector(`[data-patch-count="${key}"]`);
        if (host) host.textContent = state[key];
      });
      result.textContent = state.text;
      install.disabled = phase !== 'scan';
      reboot.disabled = phase !== 'install';
      root.querySelectorAll('[data-patch-action]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.patchAction === phase));
      });
    }
    root.querySelectorAll('[data-patch-action]').forEach(button => {
      button.addEventListener('click', () => {
        const action = button.dataset.patchAction;
        if (action === 'reset') phase = 'initial';
        else if (Object.hasOwn(states, action)) phase = action;
        render();
      });
    });
    render();
  }

  // ===== CloudTrail整合性検証の概念デモ（AWSの検証形式とは異なる） =====
  async function setupIntegrityDemo(root) {
    const logEl = root.querySelector('[data-integrity-log]');
    const recordedEl = root.querySelector('[data-integrity-recorded]');
    const actualEl = root.querySelector('[data-integrity-actual]');
    const result = root.querySelector('[data-integrity-result]');
    const signatureEl = root.querySelector('[data-integrity-signature]');
    const hashEl = root.querySelector('[data-integrity-hash]');
    const buttons = [...root.querySelectorAll('button')];
    if (!logEl || !recordedEl || !actualEl || !result || !signatureEl || !hashEl) return;
    const lock = value => buttons.forEach(button => { button.disabled = value; });
    const fail = () => {
      result.textContent = 'この環境では暗号デモを起動できません。Web Crypto対応ブラウザで、HTTPSまたはlocalhost経由で開いてください。本文とクイズはそのまま使えます。';
      root.dataset.integrityReady = 'error';
      lock(true);
    };
    lock(true);
    try {
      if (!window.crypto || !window.crypto.subtle) { fail(); return; }
      const subtle = window.crypto.subtle;
      const encoder = new TextEncoder();
      const algorithm = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
      const keys = await subtle.generateKey(algorithm, false, ['sign', 'verify']);
      const original = JSON.stringify({ Records: [{ eventName: 'StopInstances', awsRegion: 'ap-northeast-1' }] }, null, 2);
      const modified = original.replace('StopInstances', 'TerminateInstances');
      const digest = async value => {
        const bytes = new Uint8Array(await subtle.digest('SHA-256', encoder.encode(value)));
        return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
      };
      const originalHash = await digest(original);
      const digestText = hash => JSON.stringify({ logFile: 'example.json', hashAlgorithm: 'SHA-256', hashValue: hash });
      const signature = await subtle.sign(algorithm.name, keys.privateKey, encoder.encode(digestText(originalHash)));
      let currentLog = original;
      let currentHash = originalHash;
      let recordedHash = originalHash;
      const descriptions = {
        original: '元のログと、署名されたダイジェストです。「検証する」を押してください。',
        log: 'ログのeventNameだけを変更しました。ダイジェストに記録されたハッシュ値は元のままです。',
        both: 'ログとダイジェスト内のハッシュ値を変更しました。ただし、元の署名を作り直すことはできません。',
        deleted: 'ダイジェストが参照しているログがありません。元の内容を検証するには復旧や追加調査が必要です。'
      };
      async function setCase(mode) {
        lock(true);
        try {
          currentLog = mode === 'deleted' ? null : mode === 'original' ? original : modified;
          currentHash = currentLog === null ? null : await digest(currentLog);
          recordedHash = mode === 'both' ? currentHash : originalHash;
          logEl.textContent = currentLog === null ? 'ログファイルなし' : currentLog;
          recordedEl.textContent = recordedHash;
          actualEl.textContent = currentHash || '計算できません（ファイルなし）';
          signatureEl.textContent = '未検証';
          hashEl.textContent = '未検証';
          result.textContent = descriptions[mode];
          root.classList.remove('is-valid', 'is-invalid');
          root.dataset.integrityCase = mode;
          root.querySelectorAll('[data-integrity-case]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.integrityCase === mode));
          });
          lock(false);
        } catch { fail(); }
      }
      root.querySelectorAll('[data-integrity-case]').forEach(button => {
        button.addEventListener('click', () => { void setCase(button.dataset.integrityCase); });
      });
      root.querySelector('[data-integrity-verify]').addEventListener('click', async () => {
        lock(true);
        try {
          const signatureValid = await subtle.verify(algorithm.name, keys.publicKey, signature, encoder.encode(digestText(recordedHash)));
          const hashesMatch = currentHash !== null && currentHash === recordedHash;
          signatureEl.textContent = signatureValid ? '有効' : '無効';
          hashEl.textContent = currentHash === null ? '検証不可' : hashesMatch ? '一致' : '不一致';
          const valid = signatureValid && hashesMatch;
          root.classList.toggle('is-valid', valid);
          root.classList.toggle('is-invalid', !valid);
          root.dataset.integrityOutcome = valid ? 'valid' : 'invalid';
          result.textContent = !signatureValid
            ? '検証失敗：ハッシュ値は一致しますが、ダイジェストの署名が無効です。ハッシュ値まで書き換えても、署名で検知できます。'
            : currentHash === null
              ? '検証不可：署名されたダイジェストは有効ですが、参照先のログがありません。削除、アクセス権、取得先などを調査します。'
              : !hashesMatch
                ? '検証失敗：ダイジェストの署名は有効ですが、ログのハッシュ値が一致しません。ログの内容が変わっています。'
                : '検証成功：ダイジェストの署名が有効で、ログのハッシュ値も一致します。このデモのログは署名時の内容と同じです。';
          lock(false);
        } catch { fail(); }
      });
      await setCase('original');
      root.dataset.integrityReady = 'true';
    } catch { fail(); }
  }

  // ===== IAM学習デモ（限定したポリシー評価のみ） =====
  function setupIamDemo(root) {
    const group = root.querySelector('[data-iam-group]');
    const action = root.querySelector('[data-iam-action]');
    const resource = root.querySelector('[data-iam-resource]');
    const authenticated = root.querySelector('[data-iam-auth]');
    const trusted = root.querySelector('[data-iam-trust]');
    const denyDelete = root.querySelector('[data-iam-deny-delete]');
    const result = root.querySelector('[data-iam-result]');
    const roleEl = root.querySelector('[data-iam-role]');
    const traceEl = root.querySelector('[data-iam-trace]');
    const policyEl = root.querySelector('[data-iam-policy]');
    if (![group, action, resource, authenticated, trusted, denyDelete, result, roleEl, traceEl, policyEl].every(Boolean)) return;
    const roles = {
      developers: { name: 'DevRole', actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'], prefix: 'dev/' },
      auditors: { name: 'AuditRole', actions: ['s3:GetObject'], prefix: '' }
    };
    function render() {
      const role = roles[group.value];
      const requestedAction = action.value;
      const objectKey = resource.value;
      const statements = role ? [{ Effect: 'Allow', Action: role.actions, Resource: `arn:aws:s3:::example-company-data/${role.prefix}*` }] : [];
      if (role && denyDelete.checked) statements.push({ Effect: 'Deny', Action: 's3:DeleteObject', Resource: 'arn:aws:s3:::example-company-data/*' });
      policyEl.textContent = JSON.stringify({ Version: '2012-10-17', Statement: statements }, null, 2);
      const traces = [];
      let decision;
      let message;
      if (!authenticated.checked) {
        decision = 'no-session';
        message = 'セッション未成立：IdPで本人確認ができていません。AWSの操作権限の評価へ進みません。';
        traces.push('認証：未完了', 'ロールセッション：発行されない', '認可：まだ評価しない');
      } else if (!role) {
        decision = 'no-session';
        message = 'セッション未成立：認証は成功しましたが、このグループに許可したロールのマッピングがありません。';
        traces.push('認証：成功', 'グループ→ロール：対応なし', '認可：まだ評価しない');
      } else if (!trusted.checked) {
        decision = 'no-session';
        message = 'セッション未成立：ロールがこのIdPからの引き受けを許可していません。権限ポリシーにAllowがあっても使えません。';
        traces.push('認証：成功', 'ロールの信頼関係：不成立', '認可：まだ評価しない');
      } else {
        traces.push('認証：成功', `ロールセッション：${role.name}を想定`);
        if (denyDelete.checked && requestedAction === 's3:DeleteObject') {
          decision = 'explicit-deny';
          message = '拒否（明示的Deny）：削除を拒否するステートメントが一致しました。AllowがあってもDenyが優先します。';
          traces.push('認可：DeleteObjectに明示的Denyが一致');
        } else if (role.actions.includes(requestedAction) && objectKey.startsWith(role.prefix)) {
          decision = 'allow';
          message = '許可（Allow）：このデモでは、操作とリソースに一致するAllowがあり、明示的Denyはありません。';
          traces.push(`認可：${requestedAction}と${objectKey}にAllowが一致`);
        } else {
          decision = 'implicit-deny';
          message = '拒否（暗黙的Deny）：操作またはリソースに一致するAllowがありません。ログイン成功だけでは操作できません。';
          traces.push('認可：操作またはリソースを許可するAllowがない');
        }
      }
      roleEl.textContent = decision === 'no-session' ? 'なし（セッション未成立）' : role.name + ' のセッション';
      result.textContent = message;
      traceEl.innerHTML = traces.map(item => `<li>${escapeHtml(item)}</li>`).join('');
      root.classList.toggle('is-allowed', decision === 'allow');
      root.dataset.iamDecision = decision;
    }
    [group, action, resource, authenticated, trusted, denyDelete].forEach(input => input.addEventListener('change', render));
    render();
  }

  // ===== Lambda予約済み同時実行数の学習モデル =====
  function setupLambdaConcurrency(root) {
    const quotaInput = root.querySelector('[data-lambda-quota]');
    const otherReservedInput = root.querySelector('[data-lambda-other-reserved]');
    const reservedInput = root.querySelector('[data-lambda-reserved]');
    const otherDemandInput = root.querySelector('[data-lambda-other-demand]');
    const targetDemandInput = root.querySelector('[data-lambda-target-demand]');
    const result = root.querySelector('[data-lambda-result]');
    const inputs = [quotaInput, otherReservedInput, reservedInput, otherDemandInput, targetDemandInput];
    if (!result || !inputs.every(Boolean)) return;
    function setValue(key, value) {
      root.querySelectorAll(`[data-lambda-value="${key}"]`).forEach(el => { el.textContent = String(value); });
    }
    function render() {
      const values = inputs.map(input => input.value.trim() === '' ? NaN : Number(input.value));
      const [quota, otherReserved, reserved, otherDemand, targetDemand] = values;
      const valid = values.every(v => Number.isInteger(v) && v >= 0)
        && quota >= 100 && quota - otherReserved - reserved >= 100;
      root.classList.toggle('is-invalid', !valid);
      if (!valid) {
        root.querySelectorAll('[data-lambda-value]').forEach(el => { el.textContent = '—'; });
        root.querySelectorAll('[data-lambda-segment]').forEach(el => { el.style.width = '0%'; });
        root.dataset.lambdaState = 'invalid';
        result.textContent = 'このモデルでは設定できません。0以上の整数を入力し、全体クォータから他関数の予約枠と対象の予約枠を引いた残りを100以上にしてください。';
        return;
      }
      const withoutPool = quota - otherReserved;
      const withoutOther = Math.min(otherDemand, withoutPool);
      const withoutTarget = Math.min(targetDemand, withoutPool - withoutOther);
      const withPool = quota - otherReserved - reserved;
      const withOther = Math.min(otherDemand, withPool);
      const withTarget = Math.min(targetDemand, reserved);
      const numbers = {
        quota, otherReserved, reserved, targetDemand, free: withPool,
        withoutTarget, withoutBlocked: targetDemand - withoutTarget, withoutOther,
        withTarget, withBlocked: targetDemand - withTarget, withOther
      };
      Object.entries(numbers).forEach(([key, value]) => setValue(key, value));
      const segments = { other: otherReserved, target: reserved, shared: withPool };
      Object.entries(segments).forEach(([key, value]) => {
        const el = root.querySelector(`[data-lambda-segment="${key}"]`);
        if (el) el.style.width = (value / quota * 100) + '%';
      });
      root.dataset.lambdaState = 'valid';
      if (reserved === 0) {
        result.textContent = '予約済み同時実行数0は「予約なし」ではありません。この関数を新たに実行させない設定なので、対象の実行数は0になります。';
      } else if (targetDemand > reserved) {
        result.textContent = `専用枠は${reserved}です。要求${targetDemand}のうち${withTarget}までで、${targetDemand - reserved}は直ちに実行できません。予約枠は確保と同時に上限にもなります。`;
      } else {
        result.textContent = `予約した${reserved}枠は、他関数の共有側への要求が${otherDemand}でも取り上げられません。このモデルでは対象の要求${targetDemand}をすべて受けられます。予約が未使用でも、その枠を他の関数は借りられません。`;
      }
    }
    inputs.forEach(input => input.addEventListener('input', render));
    render();
  }

  // ===== Auto Scaling 台数概算 =====
  function setupAutoScalingSimulator(root) {
    const current = root.querySelector('[data-asg-current]');
    const cpu = root.querySelector('[data-asg-cpu]');
    const target = root.querySelector('[data-asg-target]');
    const min = root.querySelector('[data-asg-min]');
    const max = root.querySelector('[data-asg-max]');
    const result = root.querySelector('[data-asg-result]');
    const detail = root.querySelector('[data-asg-detail]');
    const inputs = [current, cpu, target, min, max];
    if (inputs.some(input => !input) || !result || !detail) return;
    function render() {
      const values = inputs.map(input => Number(input.value));
      const [now, load, goal, lower, upper] = values;
      const valid = values.every(Number.isFinite) && values.every(value => value >= 0)
        && now >= 1 && load >= 1 && load <= 100 && goal >= 1 && goal <= 100
        && lower <= upper && upper >= 1;
      root.classList.toggle('is-invalid', !valid);
      root.dataset.asgReady = valid ? 'true' : 'false';
      if (!valid) {
        result.textContent = '入力を確認してください';
        detail.textContent = '台数は1以上、CPUは1〜100%、MinはMax以下にします。';
        return;
      }
      const raw = now * load / goal;
      const estimate = Math.ceil(raw);
      const bounded = Math.max(lower, Math.min(upper, estimate));
      const action = bounded > now ? `${bounded}台へスケールアウト`
        : bounded < now ? `${bounded}台へスケールイン` : `${now}台を維持`;
      const boundNote = estimate > upper ? `概算${estimate}台ですが、Max ${upper}で制限されます。`
        : estimate < lower ? `概算${estimate}台ですが、Min ${lower}を維持します。`
        : 'Min / Maxの範囲内です。';
      result.textContent = action;
      detail.textContent = `${now}×${load}÷${goal}＝${raw.toFixed(2)}を切り上げ、概算${estimate}台。${boundNote}`;
    }
    inputs.forEach(input => input.addEventListener('input', render));
    render();
  }

  // ===== ALB / NLB ルーティング比較 =====
  function setupLoadBalancerSimulator(root) {
    const mode = root.querySelector('[data-lb-mode]');
    const path = root.querySelector('[data-lb-path]');
    const ingress = root.querySelector('[data-lb-ingress]');
    const rule = root.querySelector('[data-lb-rule]');
    const target = root.querySelector('[data-lb-target]');
    const note = root.querySelector('[data-lb-note]');
    if (!mode || !path || !ingress || !rule || !target || !note) return;
    const routes = {
      api: { rule: '優先度10 · /api/*', target: 'api-tg', label: 'API' },
      images: { rule: '優先度20 · /images/*', target: 'images-tg', label: '画像' },
      web: { rule: 'デフォルトルール', target: 'web-tg', label: 'Web画面' }
    };
    function render() {
      const route = routes[path.value] || routes.web;
      const isAlb = mode.value === 'alb';
      ingress.textContent = isAlb ? 'ALB · HTTPS : 443' : 'NLB · TCP : 443';
      rule.textContent = isAlb ? route.rule : 'URLのパスを判定しない';
      target.textContent = isAlb ? route.target : 'web-all-tg';
      note.textContent = isAlb
        ? `ALBがHTTPSを復号し、${route.label}用のグループへ転送します。`
        : 'この構成のNLBはTLSを復号せず、どのパスもweb-all-tgへ転送します。HTTPSの終端とパスの処理はバックエンドが担当します。';
      root.dataset.lbReady = 'true';
    }
    mode.addEventListener('change', render);
    path.addEventListener('change', render);
    render();
  }

  // ===== S3 転送経路シミュレーター =====
  function setupS3RouteSimulator(root) {
    const distance = root.querySelector('[data-s3-distance]');
    const mode = root.querySelector('[data-s3-mode]');
    const client = root.querySelector('[data-s3-hop="client"]');
    const entry = root.querySelector('[data-s3-hop="entry"]');
    const destination = root.querySelector('[data-s3-hop="destination"]');
    const result = root.querySelector('[data-s3-result]');
    const detail = root.querySelector('[data-s3-detail]');
    if (!distance || !mode || !client || !entry || !destination || !result || !detail) return;
    const distanceLabels = { same: '同一リージョン付近', near: '国内・近距離拠点', far: '海外クリニック' };
    function render() {
      const accelerated = mode.value === 'accelerated';
      const far = distance.value === 'far';
      const same = distance.value === 'same';
      client.textContent = distanceLabels[distance.value] || distanceLabels.far;
      entry.textContent = accelerated ? '最寄りのエッジ' : '公開インターネット';
      destination.textContent = accelerated ? 'AWS経路 → S3' : 'リージョン内のS3';
      root.classList.toggle('is-accelerated', accelerated);
      if (accelerated && far) {
        result.textContent = '長距離アップロードに適合';
        detail.textContent = '最寄りのエッジからAWSの最適化された経路を使います。追加料金と実測効果を確認します。';
      } else if (accelerated && same) {
        result.textContent = '通常経路との比較が必要';
        detail.textContent = 'クライアントがバケットの近くにいるため、加速の効果は限定的な可能性があります。料金を含めて実測します。';
      } else if (accelerated) {
        result.textContent = '改善候補';
        detail.textContent = 'エッジ経由の効果を速度比較ツールと実ファイルで測定します。';
      } else if (far) {
        result.textContent = '距離がボトルネックになり得ます';
        detail.textContent = '長いインターネット経路を通るため、Transfer Accelerationとマルチパートを検討します。';
      } else {
        result.textContent = '標準エンドポイントが基本';
        detail.textContent = '近距離ではまず通常経路を測定し、大容量ならマルチパートを利用します。';
      }
      root.dataset.s3Ready = 'true';
    }
    distance.addEventListener('change', render);
    mode.addEventListener('change', render);
    render();
  }

  // ===== RDS 要件アドバイザー =====
  function setupRdsAdvisor(root) {
    const scenario = root.querySelector('[data-rds-scenario]');
    const result = root.querySelector('[data-rds-result]');
    const detail = root.querySelector('[data-rds-detail]');
    if (!scenario || !result || !detail) return;
    const recommendations = {
      ha: ['Multi-AZ', '同期スタンバイと自動フェイルオーバーを利用します。読み取りスケール用途ではありません。'],
      read: ['リードレプリカ', '読み取り専用クエリを分散します。非同期複製のためレプリカ遅延を考慮します。'],
      connections: ['RDS Proxy', '接続をプールして再利用し、Lambdaなどからの接続急増がDBを圧迫するのを抑えます。'],
      recover: ['自動バックアップ＋PITR', '保持期間内の事故直前から新しいDBを復元し、検証後に接続先を切り替えます。'],
      storage: ['ストレージオートスケーリング', '最大しきい値まで容量を拡張できます。縮小はせず、FreeStorageSpaceの監視も必要です。']
    };
    function render() {
      const [title, body] = recommendations[scenario.value] || recommendations.ha;
      result.textContent = title;
      detail.textContent = body;
      root.dataset.rdsReady = 'true';
    }
    scenario.addEventListener('change', render);
    render();
  }

  // ===== AWSネットワークゲートウェイ 経路アドバイザー =====
  function setupGatewayAdvisor(root) {
    const scenario = root.querySelector('[data-gateway-scenario]');
    const source = root.querySelector('[data-gateway-source]');
    const result = root.querySelector('[data-gateway-result]');
    const destination = root.querySelector('[data-gateway-destination]');
    const detail = root.querySelector('[data-gateway-detail]');
    if (!scenario || !source || !result || !destination || !detail) return;
    const recommendations = {
      'public-ipv4': ['Public subnet', 'Internet Gateway', 'Internet', '0.0.0.0/0をIGWへ向け、リソースにパブリックIPv4／Elastic IPを付与します。SGとNACLも確認します。'],
      'private-ipv4': ['Private subnet', 'Public NAT Gateway', 'Internet', 'プライベート側の0.0.0.0/0をNAT Gatewayへ向けます。NAT Gatewayはパブリックサブネットに置き、EIPとIGWへの経路を使います。'],
      'private-ipv6': ['IPv6 subnet', 'Egress-only IGW', 'Internet', '::/0をEgress-only IGWへ向けます。VPC側から開始したIPv6通信の応答は返し、インターネット側からの開始は防ぎます。'],
      'onprem-one': ['On-premises', 'CGW ⇄ VGW', 'One VPC', 'Customer Gatewayは装置をAWS内で表し、Virtual Private GatewayはVPC側でVPNを終端します。2本のトンネルを両方運用します。'],
      'many-networks': ['VPCs / On-premises', 'Transit Gateway', 'VPCs / VPN / DX', '各接続をアタッチし、TGWルート表でセグメントを分離します。VPC側ルート表と戻り道も必要です。'],
      's3-private': ['Private subnet', 'Gateway VPC Endpoint', 'S3', 'S3のプレフィックスリストへのルートが追加されます。NATやIGWは不要です。Endpoint Policyとバケットポリシーも確認します。'],
      'inspection': ['Application VPC', 'GWLBe → GWLB', 'Firewall fleet', 'ルート表でGWLBeを次ホップにし、検査VPCのGWLBが正常な仮想アプライアンスへ分散します。往復経路を対称にします。']
    };
    function render() {
      const [from, gateway, to, body] = recommendations[scenario.value] || recommendations['public-ipv4'];
      source.textContent = from;
      result.textContent = gateway;
      destination.textContent = to;
      detail.textContent = body;
      root.dataset.gatewayReady = 'true';
    }
    scenario.addEventListener('change', render);
    render();
  }

  // ===== Amazon EKS 構成アドバイザー =====
  function setupEksAdvisor(root) {
    const scenario = root.querySelector('[data-eks-scenario]');
    const result = root.querySelector('[data-eks-result]');
    const detail = root.querySelector('[data-eks-detail]');
    if (!scenario || !result || !detail) return;
    const recommendations = {
      standard: ['EKS Auto Mode', '標準的なLinuxワークロードなら、Node、ネットワーク、ロードバランシング、ストレージの運用負荷を抑えられます。NodePoolとPodの要件は明示します。'],
      custom: ['Managed Node Group', 'Windows、カスタムAMI、起動テンプレート、細かなEC2設定が必要な場合の出発点です。Node AMIとKubernetesバージョンの更新を計画します。'],
      serverless: ['AWS Fargate', '対応するPodをNode管理なしで実行します。DaemonSet、ストレージ、ネットワーク、Pod仕様などの制約と料金を先に確認します。'],
      s3: ['Pod Identity + S3 Gateway Endpoint', '専用ServiceAccountへ最小権限のIAM Roleを関連付け、Pod／Nodeサブネットのルート表にS3 Gateway Endpointを関連付けます。'],
      http: ['Ingress + ALB', 'AWS Load Balancer ControllerがIngressを監視してALBを作成します。TLS、ヘルスチェック、Target Type、Security Groupを設計します。'],
      scale: ['HPA + Node autoscaling', 'HPAがPod数を増減し、EKS Auto Mode／Karpenter／Cluster Autoscalerが置き場所となるNodeを増減します。requestsの設定が前提です。']
    };
    function render() {
      const [title, body] = recommendations[scenario.value] || recommendations.standard;
      result.textContent = title;
      detail.textContent = body;
      root.dataset.eksReady = 'true';
    }
    scenario.addEventListener('change', render);
    render();
  }

  // ===== パンくず描画 (data-breadcrumb 属性に JSON 配列) =====
  function renderBreadcrumb() {
    const host = document.querySelector('[data-breadcrumb]');
    if (!host) return;
    let crumbs;
    try { crumbs = JSON.parse(host.dataset.breadcrumb); } catch { return; }
    host.innerHTML = crumbs.map((c, i) => {
      const isLast = i === crumbs.length - 1;
      if (isLast) return `<span class="text-sky-900 font-semibold">${escapeHtml(c.label)}</span>`;
      const href = c.href || '#';
      return `<a href="${href}" class="text-sky-700 hover:text-sky-900 hover:underline">${escapeHtml(c.label)}</a><span class="mx-2 text-slate-400">/</span>`;
    }).join('');
  }

  // ===== utility =====
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function normalizeCmd(s) {
    return String(s).replace(/\s+/g, ' ').trim();
  }
  function cryptoHash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36) + s.length.toString(36);
  }

  // ===== boot =====
  function init() {
    document.querySelectorAll('[data-quiz]').forEach(setupQuiz);
    document.querySelectorAll('[data-fill]').forEach(setupFill);
    document.querySelectorAll('[data-terminal]').forEach(setupTerminal);
    document.querySelectorAll('[data-sortable]').forEach(setupSortable);
    document.querySelectorAll('[data-flow-decoder]').forEach(setupFlowDecoder);
    document.querySelectorAll('[data-cache-simulator]').forEach(setupCacheSimulator);
    document.querySelectorAll('[data-quota-calculator]').forEach(setupQuotaCalculator);
    document.querySelectorAll('[data-patch-fleet]').forEach(setupPatchFleet);
    document.querySelectorAll('[data-integrity-demo]').forEach(root => { void setupIntegrityDemo(root); });
    document.querySelectorAll('[data-iam-demo]').forEach(setupIamDemo);
    document.querySelectorAll('[data-lambda-concurrency]').forEach(setupLambdaConcurrency);
    document.querySelectorAll('[data-lb-sim]').forEach(setupLoadBalancerSimulator);
    document.querySelectorAll('[data-asg-sim]').forEach(setupAutoScalingSimulator);
    document.querySelectorAll('[data-s3-route]').forEach(setupS3RouteSimulator);
    document.querySelectorAll('[data-rds-advisor]').forEach(setupRdsAdvisor);
    document.querySelectorAll('[data-gateway-advisor]').forEach(setupGatewayAdvisor);
    document.querySelectorAll('[data-eks-advisor]').forEach(setupEksAdvisor);
    renderBreadcrumb();

    const reset = document.querySelector('[data-progress-reset]');
    if (reset) reset.addEventListener('click', () => {
      if (confirm('この教材の回答状況をリセットしますか？')) Progress.reset();
    });

    Progress.refreshBar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
