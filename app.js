import { guessAbiEncodedData, guessFragment } from 'https://esm.sh/@openchainxyz/abi-guesser@1.0.2?bundle&target=es2020';
import { AbiCoder, hexlify } from 'https://esm.sh/ethers@6.6.0?target=es2020';

const form = document.getElementById('guess-form');
const textarea = document.getElementById('calldata');
const tabs = document.querySelectorAll('.tab');
const statusEl = document.getElementById('status');
const resultBody = document.getElementById('result-body');
const modeLabel = document.getElementById('mode-label');
const fileInput = document.getElementById('file-input');
const chips = document.querySelectorAll('.chip');
const viewButtons = document.querySelectorAll('.view-btn');

let mode = 'fragment'; // "fragment" | "params"
let valueView = 'decoded'; // "decoded" | "raw"
let lastResult = null;
const coder = AbiCoder.defaultAbiCoder();

const samples = {
  call: '0xa9059cbb000000000000000000000000742d35cc6634c0532925a3b844bc454e4438f44e0000000000000000000000000000000000000000000000000000000000989680',
  params: '000000000000000000000000742d35cc6634c0532925a3b844bc454e4438f44e0000000000000000000000000000000000000000000000000000000000989680'
};

const formatParam = (param) => param.format();
const formatTuple = (params) => `(${params.map(formatParam).join(', ')})`;

const chunkHex = (hex) => {
  const cleaned = hex.replace(/^0x/, '');
  return cleaned.match(/.{1,64}/g) || [];
};

const setMode = (nextMode) => {
  mode = nextMode;
  tabs.forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-pressed', String(active));
  });
  modeLabel.textContent = mode === 'fragment' ? 'Call data mode' : 'Params-only mode';
  statusEl.textContent = '';
};

const setValueView = (next) => {
  valueView = next;
  viewButtons.forEach((btn) => {
    const active = btn.dataset.view === valueView;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  if (lastResult) {
    renderResult(lastResult);
  }
};

const setStatus = (msg, isError = false) => {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', isError);
};

const formatDecodedValue = (value) => {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'bigint') return value.toString(10);
  if (Array.isArray(value)) return `[${value.map(formatDecodedValue).join(', ')}]`;
  if (value instanceof Uint8Array) return hexlify(value);
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch (err) {
      return String(value);
    }
  }
  return String(value);
};

const decodeParamValues = (params, hex, hasSelector) => {
  try {
    const cleaned = cleanHex(hex);
    const dataWithoutSelector = hasSelector ? cleaned.replace(/^0x/, '').slice(8) : cleaned.replace(/^0x/, '');
    const payload = `0x${dataWithoutSelector}`;
    const decoded = coder.decode(params, payload);
    const readable = Array.from(decoded).map((v) => formatDecodedValue(v));
    const rawValues = params.map((param, idx) => coder.encode([param], [decoded[idx]]));
    const paddedDecoded = params.map((_, i) => readable[i] ?? '(not decoded)');
    const paddedRaw = params.map((_, i) => rawValues[i] ?? '');
    return { decoded: paddedDecoded, raw: paddedRaw };
  } catch (err) {
    console.warn('decode failed', err);
    return {
      decoded: params.map(() => '(decode failed)'),
      raw: params.map(() => '')
    };
  }
};

const renderParams = (params, decodedValues, rawValues, container) => {
  const list = document.createElement('div');
  list.className = 'param-list';
  params.forEach((param, idx) => {
    const row = document.createElement('div');
    row.className = 'param';
    const type = document.createElement('div');
    type.textContent = param.format();
    const shape = document.createElement('div');
    shape.className = 'shape';
    shape.textContent = `${param.baseType}${param.isArray() ? ' (array)' : ''}${param.isTuple() ? ' (tuple)' : ''}`;
    row.appendChild(type);
    row.appendChild(shape);
    const valueLine = document.createElement('div');
    valueLine.className = 'value';
    const viewVal = valueView === 'decoded' ? decodedValues[idx] : rawValues[idx];
    valueLine.textContent = viewVal ?? '';
    row.appendChild(valueLine);
    list.appendChild(row);
  });
  container.appendChild(list);
};

const renderHexPreview = (hex, container) => {
  const preview = document.createElement('div');
  preview.className = 'raw-hex';
  preview.textContent = chunkHex(hex).join('\n');
  container.appendChild(preview);
};

const renderResult = (result) => {
  if (!result) return;
  lastResult = result;
  const { signature, params, selector, tuple, hex, decodedValues, rawValues } = result;
  resultBody.innerHTML = '';

  const sigBlock = document.createElement('div');
  sigBlock.className = 'signature';
  sigBlock.textContent = signature;
  resultBody.appendChild(sigBlock);

  const pills = document.createElement('div');
  pills.className = 'pill-row';
  if (selector) {
    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.textContent = `selector: ${selector}`;
    pills.appendChild(pill);
  }
  const tuplePill = document.createElement('div');
  tuplePill.className = 'pill';
  tuplePill.textContent = tuple;
  pills.appendChild(tuplePill);
  resultBody.appendChild(pills);

  if (params.length > 0) {
    const paramSection = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = 'Parameters';
    paramSection.appendChild(title);
    renderParams(params, decodedValues, rawValues, paramSection);
    resultBody.appendChild(paramSection);
  }

  const hexSection = document.createElement('div');
  const hexTitle = document.createElement('h3');
  hexTitle.textContent = 'Hex preview';
  hexSection.appendChild(hexTitle);
  renderHexPreview(hex, hexSection);
  resultBody.appendChild(hexSection);
};

const cleanHex = (val) => val.trim().replace(/\s+/g, '');

const guess = (hex) => {
  if (!hex) {
    setStatus('Paste some ABI-encoded data first.', true);
    return;
  }
  const normalized = cleanHex(hex);
  try {
    if (mode === 'fragment') {
      const fragment = guessFragment(normalized);
      if (!fragment) {
        setStatus('Unable to guess the function from this call data.', true);
        return;
      }
      const values = decodeParamValues(fragment.inputs, normalized, true);
      renderResult({
        signature: fragment.format('minimal'),
        params: fragment.inputs,
        selector: normalized.replace(/^0x/, '').substring(0, 8),
        tuple: formatTuple(fragment.inputs),
        hex: normalized,
        decodedValues: values.decoded,
        rawValues: values.raw
      });
      setStatus('Guessed function fragment using call data.');
      return;
    }
    const params = guessAbiEncodedData(normalized);
    if (!params) {
      setStatus('No well-formed parameter tuple could be inferred.', true);
      return;
    }
    const values = decodeParamValues(params, normalized, false);
    renderResult({
      signature: `tuple ${formatTuple(params)}`,
      params,
      selector: null,
      tuple: formatTuple(params),
      hex: normalized,
      decodedValues: values.decoded,
      rawValues: values.raw
    });
    setStatus('Guessed parameter tuple without selector.');
  } catch (err) {
    console.error(err);
    setStatus('Input was not valid hex or could not be decoded.', true);
  }
};

tabs.forEach((tab) => {
  tab.addEventListener('click', () => setMode(tab.dataset.mode));
});

viewButtons.forEach((btn) => {
  btn.addEventListener('click', () => setValueView(btn.dataset.view));
});

form.addEventListener('submit', (evt) => {
  evt.preventDefault();
  guess(textarea.value);
});

fileInput.addEventListener('change', (evt) => {
  const file = evt.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    textarea.value = String(reader.result || '');
    setStatus(`Loaded ${file.name}`);
  };
  reader.onerror = () => setStatus('Could not read that file.', true);
  reader.readAsText(file);
});

chips.forEach((chip) => {
  chip.addEventListener('click', () => {
    const kind = chip.dataset.fill;
    textarea.value = samples[kind] || '';
    setMode(kind === 'call' ? 'fragment' : 'params');
    setStatus(`Loaded ${kind === 'call' ? 'call data' : 'params'} sample.`);
    textarea.focus();
  });
});

modeLabel.textContent = 'Call data mode';
setStatus('Ready to guess. Paste call data or load a sample.');
setValueView('decoded');
