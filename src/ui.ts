import { FurnaceStateManager } from './state.js';
import {
  CompositionEntry,
  FurnaceConfiguration,
  FurnaceLayer,
  FurnaceSection,
  NumericParameter,
  SimulationConfig,
  SimulationSample,
  SimulationStatus,
} from './types.js';

interface SimulationControlCallbacks {
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onConfigChange: (partial: Partial<SimulationConfig>) => void;
}

export function renderParameterControls(
  container: HTMLElement,
  manager: FurnaceStateManager,
  parameters: NumericParameter[]
) {
  container.innerHTML = '';
  parameters.forEach((parameter) => {
    const item = document.createElement('div');
    item.className = 'control-item';

    const label = document.createElement('label');
    label.htmlFor = `${parameter.key}-range`;
    label.textContent = parameter.label;

    const unit = document.createElement('span');
    unit.className = 'unit-text';
    unit.textContent = parameter.unit;

    const range = document.createElement('input');
    range.type = 'range';
    range.id = `${parameter.key}-range`;
    range.min = String(parameter.min);
    range.max = String(parameter.max);
    range.step = String(parameter.step);
    range.value = String(parameter.defaultValue);

    const numberInput = document.createElement('input');
    numberInput.type = 'number';
    numberInput.min = String(parameter.min);
    numberInput.max = String(parameter.max);
    numberInput.step = String(parameter.step);
    numberInput.value = String(parameter.defaultValue);
    numberInput.setAttribute('aria-label', `${parameter.label} 数值输入`);

    const syncValue = (value: number) => {
      range.value = String(value);
      numberInput.value = String(value);
    };

    range.addEventListener('input', () => {
      const value = Number(range.value);
      syncValue(value);
      manager.updateParameter(parameter.key, value);
    });

    numberInput.addEventListener('change', () => {
      let value = Number(numberInput.value);
      value = Math.max(parameter.min, Math.min(parameter.max, value));
      syncValue(value);
      manager.updateParameter(parameter.key, value);
    });

    item.append(label, unit, range, numberInput);
    container.appendChild(item);
  });
}

export function renderCompositionPanel(
  container: HTMLElement,
  manager: FurnaceStateManager,
  compositions: CompositionEntry[],
  onValidate: () => void
) {
  container.innerHTML = '';
  compositions.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'composition-entry';

    const name = document.createElement('span');
    name.textContent = entry.name;

    const percentage = document.createElement('input');
    percentage.type = 'number';
    percentage.min = '0';
    percentage.max = '100';
    percentage.step = '0.1';
    percentage.value = String(entry.percentage);
    percentage.setAttribute('aria-label', `${entry.name} 百分比`);

    percentage.addEventListener('change', () => {
      const value = Math.max(0, Math.min(100, Number(percentage.value)));
      percentage.value = String(value);
      manager.updateComposition(entry.id, value);
      onValidate();
    });

    const unit = document.createElement('span');
    unit.className = 'unit-text';
    unit.textContent = '%';

    row.append(name, percentage, unit);
    container.appendChild(row);
  });
}

export function renderSectionConfiguration(
  container: HTMLElement,
  sections: FurnaceSection[],
  onChange: (id: string, changes: Partial<FurnaceSection>) => void
) {
  container.innerHTML = '';
  if (!sections.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = '尚未配置炉池分区。';
    container.appendChild(empty);
    return;
  }

  const table = document.createElement('table');
  table.className = 'configuration-table';

  const header = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['分区', '长度 (m)', '宽度 (m)', '深度 (m)', '液面高度 (m)', '材料'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headerRow.appendChild(th);
  });
  header.appendChild(headerRow);
  table.appendChild(header);

  const body = document.createElement('tbody');
  const fieldLabels: Record<'length' | 'width' | 'depth' | 'height', string> = {
    length: '长度',
    width: '宽度',
    depth: '深度',
    height: '液面高度',
  };

  sections.forEach((section) => {
    const row = document.createElement('tr');

    const nameCell = document.createElement('td');
    nameCell.textContent = section.name;
    row.appendChild(nameCell);

    const createNumberCell = (
      key: keyof Pick<FurnaceSection, 'length' | 'width' | 'depth' | 'height'>,
      min: number,
      max: number
    ) => {
      const cell = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'number';
      input.min = String(min);
      input.max = String(max);
      input.step = '0.1';
      input.value = String(section[key]);
      input.setAttribute('aria-label', `${section.name}${fieldLabels[key]}设置`);
      input.addEventListener('change', () => {
        const value = Number(input.value);
        const clamped = Math.max(min, Math.min(max, value));
        input.value = String(clamped);
        onChange(section.id, { [key]: clamped } as Partial<FurnaceSection>);
      });
      cell.appendChild(input);
      return cell;
    };

    row.appendChild(createNumberCell('length', 1, 60));
    row.appendChild(createNumberCell('width', 1, 20));
    row.appendChild(createNumberCell('depth', 0.5, 6));
    row.appendChild(createNumberCell('height', 1, 6));

    const materialCell = document.createElement('td');
    const materialInput = document.createElement('input');
    materialInput.type = 'text';
    materialInput.value = section.material;
    materialInput.setAttribute('aria-label', `${section.name}材料`);
    materialInput.addEventListener('change', () => {
      onChange(section.id, { material: materialInput.value });
    });
    materialCell.appendChild(materialInput);
    row.appendChild(materialCell);

    body.appendChild(row);
  });

  table.appendChild(body);
  container.appendChild(table);
}

export function renderLayerConfiguration(
  container: HTMLElement,
  layers: FurnaceLayer[],
  onChange: (id: string, changes: Partial<FurnaceLayer>) => void
) {
  container.innerHTML = '';
  if (!layers.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = '尚未配置炉衬层。';
    container.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'layer-list';

  layers.forEach((layer) => {
    const item = document.createElement('div');
    item.className = 'layer-item';

    const title = document.createElement('h4');
    title.textContent = layer.name;
    item.appendChild(title);

    const materialField = document.createElement('label');
    materialField.className = 'layer-field';
    materialField.textContent = '材料';
    const materialInput = document.createElement('input');
    materialInput.type = 'text';
    materialInput.value = layer.material;
    materialInput.setAttribute('aria-label', `${layer.name} 材料`);
    materialInput.addEventListener('change', () => {
      onChange(layer.id, { material: materialInput.value });
    });
    materialField.appendChild(materialInput);
    item.appendChild(materialField);

    const thicknessField = document.createElement('label');
    thicknessField.className = 'layer-field';
    thicknessField.textContent = '厚度 (m)';
    const thicknessInput = document.createElement('input');
    thicknessInput.type = 'number';
    thicknessInput.min = '0.05';
    thicknessInput.max = '1.5';
    thicknessInput.step = '0.01';
    thicknessInput.value = String(layer.thickness);
    thicknessInput.setAttribute('aria-label', `${layer.name} 厚度`);
    thicknessInput.addEventListener('change', () => {
      const value = Number(thicknessInput.value);
      const clamped = Math.max(0.05, Math.min(1.5, value));
      thicknessInput.value = String(clamped);
      onChange(layer.id, { thickness: clamped });
    });
    thicknessField.appendChild(thicknessInput);
    item.appendChild(thicknessField);

    const conductivityField = document.createElement('label');
    conductivityField.className = 'layer-field';
    conductivityField.textContent = '导热系数 (W/m·K)';
    const conductivityInput = document.createElement('input');
    conductivityInput.type = 'number';
    conductivityInput.min = '0.1';
    conductivityInput.max = '5';
    conductivityInput.step = '0.1';
    conductivityInput.value = String(layer.conductivity ?? 1);
    conductivityInput.setAttribute('aria-label', `${layer.name} 导热系数`);
    conductivityInput.addEventListener('change', () => {
      const value = Number(conductivityInput.value);
      const clamped = Math.max(0.1, Math.min(5, value));
      conductivityInput.value = String(clamped);
      onChange(layer.id, { conductivity: clamped });
    });
    conductivityField.appendChild(conductivityInput);
    item.appendChild(conductivityField);

    const notesField = document.createElement('label');
    notesField.className = 'layer-field';
    notesField.textContent = '备注';
    const notesInput = document.createElement('textarea');
    notesInput.rows = 2;
    notesInput.value = layer.notes ?? '';
    notesInput.setAttribute('aria-label', `${layer.name} 备注`);
    notesInput.addEventListener('change', () => {
      onChange(layer.id, { notes: notesInput.value });
    });
    notesField.appendChild(notesInput);
    item.appendChild(notesField);

    list.appendChild(item);
  });

  container.appendChild(list);
}

export function pushEventLog(logContainer: HTMLElement, message: string) {
  const item = document.createElement('li');
  item.className = 'event-item';
  const time = document.createElement('time');
  time.dateTime = new Date().toISOString();
  time.textContent = new Date().toLocaleTimeString();
  item.append(time);

  const content = document.createElement('span');
  content.textContent = message;
  item.append(content);

  logContainer.prepend(item);
  const maxEntries = 40;
  while (logContainer.children.length > maxEntries) {
    logContainer.removeChild(logContainer.lastChild as HTMLElement);
  }
}

export function renderIndicators(container: HTMLElement, indicators: { id: string; label: string; value: string; hint?: string }[]) {
  container.innerHTML = '';
  indicators.forEach((indicator) => {
    const card = document.createElement('div');
    card.className = 'status-card';

    const title = document.createElement('h3');
    title.textContent = indicator.label;

    const value = document.createElement('p');
    value.textContent = indicator.value;

    card.append(title, value);

    if (indicator.hint) {
      const hint = document.createElement('p');
      hint.textContent = indicator.hint;
      hint.className = 'unit-text';
      card.appendChild(hint);
    }

    container.appendChild(card);
  });
}

export function renderSimulationControls(
  container: HTMLElement,
  config: SimulationConfig,
  callbacks: SimulationControlCallbacks
) {
  container.innerHTML = '';

  const configWrapper = document.createElement('div');
  configWrapper.className = 'simulation-config';

  const createConfigField = (
    labelText: string,
    unit: string,
    key: keyof SimulationConfig,
    options: { min: number; max: number; step: number }
  ) => {
    const field = document.createElement('label');
    field.className = 'simulation-field';

    const title = document.createElement('span');
    title.textContent = labelText;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(options.min);
    input.max = String(options.max);
    input.step = String(options.step);
    input.value = String(config[key]);
    input.addEventListener('change', () => {
      const value = Number(input.value);
      const clamped = Math.max(options.min, Math.min(options.max, value));
      input.value = String(clamped);
      callbacks.onConfigChange({ [key]: clamped } as Partial<SimulationConfig>);
    });

    const unitLabel = document.createElement('span');
    unitLabel.className = 'unit-text';
    unitLabel.textContent = unit;

    field.append(title, input, unitLabel);
    configWrapper.appendChild(field);
  };

  createConfigField('时间步长', '秒', 'timeStepSeconds', { min: 1, max: 60, step: 1 });
  createConfigField('环境温度', '°C', 'ambientTemperature', { min: -20, max: 80, step: 1 });
  createConfigField('初始熔体温度', '°C', 'initialMeltTemperature', { min: 800, max: 1600, step: 10 });
  createConfigField('最大采样点', '点', 'maxSamples', { min: 10, max: 500, step: 10 });

  const actions = document.createElement('div');
  actions.className = 'simulation-actions';

  const startButton = document.createElement('button');
  startButton.type = 'button';
  startButton.textContent = '开始';
  startButton.addEventListener('click', () => callbacks.onStart());

  const pauseButton = document.createElement('button');
  pauseButton.type = 'button';
  pauseButton.textContent = '暂停';
  pauseButton.addEventListener('click', () => callbacks.onPause());

  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.textContent = '重置';
  resetButton.addEventListener('click', () => callbacks.onReset());

  actions.append(startButton, pauseButton, resetButton);
  container.append(configWrapper, actions);
}

export function renderSimulationStatus(container: HTMLElement, status: SimulationStatus) {
  container.innerHTML = '';
  const statusBox = document.createElement('div');
  statusBox.className = 'simulation-status-box';

  const statusLine = document.createElement('p');
  statusLine.textContent = `状态：${status.isRunning ? '运行中' : '已停止'} · 累计 ${formatDuration(status.elapsedTime)}`;
  statusBox.appendChild(statusLine);

  if (status.lastSample) {
    const { meltTemperature, glassViscosity, chamberPressure, energyConsumption } = status.lastSample;
    const metrics = document.createElement('p');
    metrics.textContent = `温度 ${meltTemperature.toFixed(1)}°C · 粘度 ${glassViscosity.toFixed(2)} Pa·s · 压力 ${chamberPressure.toFixed(2)} kPa · 能耗 ${energyConsumption.toFixed(3)} MWh`;
    statusBox.appendChild(metrics);
  }

  container.appendChild(statusBox);
}

export function renderSimulationTimeline(container: HTMLElement, samples: SimulationSample[]) {
  container.innerHTML = '';
  if (!samples.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = '暂无模拟数据，点击开始运行模拟。';
    container.appendChild(empty);
    return;
  }

  const table = document.createElement('table');
  table.className = 'simulation-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['时间 (s)', '温度 (°C)', '粘度 (Pa·s)', '压力 (kPa)', '能耗 (MWh)', '提示'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  samples.forEach((sample) => {
    const row = document.createElement('tr');
    const cells: (string | number | undefined)[] = [
      sample.time,
      sample.meltTemperature.toFixed(1),
      sample.glassViscosity.toFixed(2),
      sample.chamberPressure.toFixed(2),
      sample.energyConsumption.toFixed(3),
      sample.note ?? '-',
    ];
    cells.forEach((value) => {
      const td = document.createElement('td');
      td.textContent = String(value);
      row.appendChild(td);
    });
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);
  const segments = [
    hours ? `${hours}小时` : '',
    minutes ? `${minutes}分` : '',
    `${seconds}秒`,
  ].filter(Boolean);
  return segments.join('');
}
