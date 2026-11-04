// Utilities in this file work entirely in the browser.
(() => {
    const byId = id => document.getElementById(id);

    function showStatus(id, message, error = false) {
        const element = byId(id);
        element.textContent = message;
        element.classList.toggle('error', error);
    }

    async function copyText(value, statusId) {
        if (!value) {
            showStatus(statusId, '没有可复制的结果', true);
            return;
        }
        try {
            await navigator.clipboard.writeText(value);
            showStatus(statusId, '已复制到剪贴板');
        } catch {
            showStatus(statusId, '复制失败，请手动选中结果复制', true);
        }
    }

    document.querySelectorAll('[data-workbench-tab]').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('[data-workbench-tab]').forEach(item => {
                const active = item === button;
                item.classList.toggle('active', active);
                item.setAttribute('aria-pressed', String(active));
            });
            document.querySelectorAll('.workbench-panel').forEach(panel => {
                panel.classList.toggle('active', panel.id === button.dataset.workbenchTab);
            });
        });
    });

    function processJson(compact) {
        const source = byId('json-input').value;
        if (!source.trim()) {
            showStatus('json-status', '请先输入 JSON', true);
            return;
        }
        try {
            const parsed = JSON.parse(source);
            byId('json-output').textContent = JSON.stringify(parsed, null, compact ? 0 : 2);
            showStatus('json-status', compact ? 'JSON 有效，已压缩' : 'JSON 有效，已格式化');
        } catch (error) {
            byId('json-output').textContent = '结果会显示在这里';
            showStatus('json-status', `JSON 格式错误：${error.message}`, true);
        }
    }
    byId('json-format').addEventListener('click', () => processJson(false));
    byId('json-minify').addEventListener('click', () => processJson(true));
    byId('json-copy').addEventListener('click', () => copyText(byId('json-output').textContent === '结果会显示在这里' ? '' : byId('json-output').textContent, 'json-status'));

    function addDiffLine(container, kind, text) {
        const line = document.createElement('span');
        line.className = `diff-line diff-${kind}`;
        line.textContent = text;
        container.appendChild(line);
    }

    function compareText(left, right, output) {
        const a = left.replace(/\r\n/g, '\n').split('\n');
        const b = right.replace(/\r\n/g, '\n').split('\n');
        if (a.length > 500 || b.length > 500) throw new Error('每侧最多支持 500 行');
        const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
        for (let i = a.length - 1; i >= 0; i--) {
            for (let j = b.length - 1; j >= 0; j--) {
                dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
        }
        let i = 0, j = 0, changes = 0;
        while (i < a.length || j < b.length) {
            if (i < a.length && j < b.length && a[i] === b[j]) {
                addDiffLine(output, 'same', `  ${a[i++]}`);
                j++;
            } else if (j < b.length && (i === a.length || dp[i][j + 1] > dp[i + 1][j])) {
                addDiffLine(output, 'add', `+ ${b[j++]}`);
                changes++;
            } else {
                addDiffLine(output, 'remove', `- ${a[i++]}`);
                changes++;
            }
        }
        return changes;
    }

    function flattenJson(value, path, result) {
        if (Object.keys(result).length > 1000) throw new Error('JSON 字段过多，最多支持 1000 项');
        if (value !== null && typeof value === 'object') {
            const keys = Object.keys(value);
            if (!keys.length) result[path] = JSON.stringify(value);
            keys.forEach(key => flattenJson(value[key], Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`, result));
        } else {
            result[path] = JSON.stringify(value);
        }
    }

    function compareJson(left, right, output) {
        const a = Object.create(null), b = Object.create(null);
        flattenJson(JSON.parse(left), '$', a);
        flattenJson(JSON.parse(right), '$', b);
        let changes = 0;
        for (const path of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
            if (!(path in a)) { addDiffLine(output, 'add', `+ ${path}: ${b[path]}`); changes++; }
            else if (!(path in b)) { addDiffLine(output, 'remove', `- ${path}: ${a[path]}`); changes++; }
            else if (a[path] !== b[path]) { addDiffLine(output, 'remove', `- ${path}: ${a[path]}`); addDiffLine(output, 'add', `+ ${path}: ${b[path]}`); changes++; }
        }
        return changes;
    }

    byId('diff-compare').addEventListener('click', () => {
        const left = byId('diff-left').value, right = byId('diff-right').value;
        if (!left.trim() && !right.trim()) { showStatus('diff-status', '请先输入要对比的内容', true); return; }
        const output = byId('diff-output');
        const result = document.createDocumentFragment();
        try {
            const count = byId('diff-type').value === 'json'
                ? compareJson(left, right, result)
                : compareText(left, right, result);
            output.replaceChildren(result);
            if (!count) output.textContent = '两份内容相同';
            showStatus('diff-status', count ? `发现 ${count} 处差异` : '没有发现差异');
        } catch (error) {
            output.textContent = '差异会显示在这里';
            showStatus('diff-status', `对比失败：${error.message}`, true);
        }
    });

    function addParam(name = '', value = '') {
        const row = document.createElement('div');
        row.className = 'url-param-row';
        const key = document.createElement('input');
        key.className = 'input-field'; key.placeholder = '参数名'; key.setAttribute('aria-label', '参数名'); key.value = name;
        const val = document.createElement('input');
        val.className = 'input-field'; val.placeholder = '参数值'; val.setAttribute('aria-label', '参数值'); val.value = value;
        const remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'copy-btn'; remove.textContent = '移除';
        remove.addEventListener('click', () => row.remove());
        row.append(key, val, remove);
        byId('url-params').appendChild(row);
    }
    byId('url-add').addEventListener('click', () => addParam());
    byId('url-parse').addEventListener('click', () => {
        try {
            const url = new URL(byId('url-input').value.trim());
            if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅支持 http 或 https 链接');
            byId('url-params').replaceChildren();
            url.searchParams.forEach((value, name) => addParam(name, value));
            byId('url-output').value = url.href;
            showStatus('url-status', `已解析 ${url.searchParams.size} 个参数`);
        } catch (error) {
            byId('url-params').replaceChildren();
            byId('url-output').value = '';
            showStatus('url-status', `无法解析链接：${error.message}`, true);
        }
    });
    byId('url-build').addEventListener('click', () => {
        try {
            const url = new URL(byId('url-input').value.trim());
            if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅支持 http 或 https 链接');
            url.search = '';
            for (const row of byId('url-params').children) {
                const [key, value] = row.querySelectorAll('input');
                if (!key.value) throw new Error('参数名不能为空');
                url.searchParams.append(key.value, value.value);
            }
            byId('url-output').value = url.href;
            showStatus('url-status', 'URL 已生成');
        } catch (error) {
            showStatus('url-status', `生成失败：${error.message}`, true);
        }
    });
    byId('url-copy').addEventListener('click', () => copyText(byId('url-output').value, 'url-status'));
})();
