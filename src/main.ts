import { FurnaceStateManager } from './state.js';
import {
  CompositionEntry,
  FurnaceConfiguration,
  FurnaceState,
  NumericParameter,
} from './types.js';
import {
  renderParameterControls,
  renderCompositionPanel,
  pushEventLog,
  renderIndicators,
  renderSectionConfiguration,
  renderLayerConfiguration,
  renderSimulationControls,
  renderSimulationStatus,
  renderSimulationTimeline,
} from './ui.js';
import { SimulationEngine } from './simulation.js';
import { FurnaceSnapshot, SimulationConfig, SimulationSample, SimulationStatus } from './types.js';
import { Furnace3DEditor } from './visualization.js';

const initialState: FurnaceState = {
  burnerPosition: 5,
  burnerFlameSize: 850,
  burnerCount: 6,
  glassLevel: 1.6,
  electrodePosition: 4,
  electrodeCount: 8,
  electrodeVoltage: 480,
  electrodeCurrent: 350,
  feedPortPosition: 3,
  feedPortSize: 1.2,
  feedPortCount: 2,
};

const parameters: NumericParameter[] = [
  {
    key: 'burnerPosition',
    label: '燃枪位置',
    unit: 'm',
    min: 0,
    max: 10,
    step: 0.1,
    defaultValue: initialState.burnerPosition,
  },
  {
    key: 'burnerFlameSize',
    label: '燃枪火焰功率',
    unit: 'kW',
    min: 200,
    max: 1200,
    step: 10,
    defaultValue: initialState.burnerFlameSize,
  },
  {
    key: 'burnerCount',
    label: '燃枪数量',
    unit: '支',
    min: 1,
    max: 16,
    step: 1,
    defaultValue: initialState.burnerCount,
  },
  {
    key: 'glassLevel',
    label: '玻璃液面高度',
    unit: 'm',
    min: 1.0,
    max: 2.2,
    step: 0.01,
    defaultValue: initialState.glassLevel,
  },
  {
    key: 'electrodePosition',
    label: '电极位置',
    unit: 'm',
    min: 0,
    max: 8,
    step: 0.1,
    defaultValue: initialState.electrodePosition,
  },
  {
    key: 'electrodeCount',
    label: '电极数量',
    unit: '支',
    min: 2,
    max: 24,
    step: 1,
    defaultValue: initialState.electrodeCount,
  },
  {
    key: 'electrodeVoltage',
    label: '电极电压',
    unit: 'V',
    min: 200,
    max: 800,
    step: 10,
    defaultValue: initialState.electrodeVoltage,
  },
  {
    key: 'electrodeCurrent',
    label: '电极电流',
    unit: 'A',
    min: 100,
    max: 600,
    step: 10,
    defaultValue: initialState.electrodeCurrent,
  },
  {
    key: 'feedPortPosition',
    label: '投料口位置',
    unit: 'm',
    min: 0,
    max: 10,
    step: 0.1,
    defaultValue: initialState.feedPortPosition,
  },
  {
    key: 'feedPortSize',
    label: '投料口宽度',
    unit: 'm',
    min: 0.5,
    max: 2.5,
    step: 0.1,
    defaultValue: initialState.feedPortSize,
  },
  {
    key: 'feedPortCount',
    label: '投料口数量',
    unit: '个',
    min: 1,
    max: 8,
    step: 1,
    defaultValue: initialState.feedPortCount,
  },
];

const initialCompositions: CompositionEntry[] = [
  { id: 'sio2', name: 'SiO₂', percentage: 72 },
  { id: 'na2o', name: 'Na₂O', percentage: 14 },
  { id: 'cao', name: 'CaO', percentage: 10 },
  { id: 'al2o3', name: 'Al₂O₃', percentage: 4 },
];

const initialConfiguration: FurnaceConfiguration = {
  sections: [
    {
      id: 'melting',
      name: '熔化区',
      length: 12,
      width: 6.5,
      depth: 2.8,
      height: 4,
      material: 'AZS 铸砖',
      description: '主熔化区',
    },
    {
      id: 'refining',
      name: '澄清区',
      length: 8,
      width: 6,
      depth: 2.6,
      height: 3.6,
      material: '锆刚玉',
      description: '去泡澄清区',
    },
    {
      id: 'working',
      name: '工作池',
      length: 5,
      width: 4.5,
      depth: 2.2,
      height: 3.2,
      material: '镁铬砖',
      description: '成型前保温区',
    },
  ],
  layers: [
    {
      id: 'crown',
      name: '拱顶耐火层',
      material: '高铝砖',
      thickness: 0.45,
      conductivity: 1.6,
      notes: '承受高温辐射',
    },
    {
      id: 'superstructure',
      name: '上部结构保温层',
      material: '硅酸铝纤维毯',
      thickness: 0.15,
      conductivity: 0.25,
    },
    {
      id: 'bottom',
      name: '炉底耐火层',
      material: '熔铸锆刚玉',
      thickness: 0.65,
      conductivity: 1.9,
    },
  ],
  burners: [
    {
      id: 'burner-1',
      label: '燃枪 1',
      position: { x: -9, y: 1.8, z: 3.6 },
      length: 1.3,
      tilt: 10,
      diameter: 0.18,
    },
    {
      id: 'burner-2',
      label: '燃枪 2',
      position: { x: -5.5, y: 1.7, z: 3.6 },
      length: 1.3,
      tilt: 12,
      diameter: 0.18,
    },
    {
      id: 'burner-3',
      label: '燃枪 3',
      position: { x: -2, y: 1.6, z: 3.6 },
      length: 1.3,
      tilt: 11,
      diameter: 0.18,
    },
    {
      id: 'burner-4',
      label: '燃枪 4',
      position: { x: 1.5, y: 1.6, z: -3.6 },
      length: 1.3,
      tilt: 9,
      diameter: 0.18,
    },
    {
      id: 'burner-5',
      label: '燃枪 5',
      position: { x: 5, y: 1.7, z: -3.6 },
      length: 1.3,
      tilt: 13,
      diameter: 0.18,
    },
    {
      id: 'burner-6',
      label: '燃枪 6',
      position: { x: 8.5, y: 1.8, z: -3.6 },
      length: 1.3,
      tilt: 12,
      diameter: 0.18,
    },
  ],
  electrodes: Array.from({ length: 8 }, (_, index) => ({
    id: `electrode-${index + 1}`,
    label: `电极 ${index + 1}`,
    position: { x: -10 + index * 2.8, y: 1.4, z: 0 },
    length: 1.8,
    diameter: 0.22,
    voltage: 480,
    current: 350,
  })),
  feedPorts: [
    {
      id: 'feed-1',
      label: '投料口 1',
      position: { x: -6, y: 3.1, z: 0 },
      width: 1.4,
      height: 0.6,
      depth: 0.5,
      opening: 0.25,
    },
    {
      id: 'feed-2',
      label: '投料口 2',
      position: { x: 4, y: 3.1, z: 0 },
      width: 1.2,
      height: 0.6,
      depth: 0.5,
      opening: 0.25,
    },
  ],
};

const manager = new FurnaceStateManager(initialState, initialCompositions, initialConfiguration);
const simulationConfig: SimulationConfig = {
  timeStepSeconds: 5,
  ambientTemperature: 25,
  initialMeltTemperature: 1280,
  maxSamples: 120,
};
const simulationEngine = new SimulationEngine(manager, simulationConfig);

document.addEventListener('DOMContentLoaded', () => {
  const controlContainer = document.getElementById('parameter-controls');
  const compositionContainer = document.getElementById('composition-list');
  const compositionTotal = document.getElementById('composition-total');
  const sectionContainer = document.getElementById('section-configuration');
  const layerContainer = document.getElementById('layer-configuration');
  const eventLog = document.getElementById('event-log');
  const statusCards = document.getElementById('status-cards');
  const viewport = document.getElementById('furnace-viewport');
  const viewportOverlay = document.getElementById('viewport-overlay');
  const simulationControls = document.getElementById('simulation-controls');
  const simulationStatus = document.getElementById('simulation-status');
  const simulationTimeline = document.getElementById('simulation-timeline');

  if (
    !controlContainer ||
    !compositionContainer ||
    !compositionTotal ||
    !sectionContainer ||
    !layerContainer ||
    !eventLog ||
    !statusCards ||
    !viewport ||
    !viewportOverlay ||
    !simulationControls ||
    !simulationStatus ||
    !simulationTimeline
  ) {
    console.error('界面初始化失败：缺少必要的容器元素');
    return;
  }

  renderParameterControls(controlContainer, manager, parameters);
  renderCompositionPanel(compositionContainer, manager, manager.getCompositions(), () => {
    const validation = manager.validateComposition();
    renderCompositionStatus(compositionTotal, validation.total, validation.isBalanced, validation.deviation);
  });

  const configuration = manager.getConfiguration();
  renderSectionConfiguration(sectionContainer, configuration.sections, (id, changes) => {
    manager.updateSection(id, changes);
  });
  renderLayerConfiguration(layerContainer, configuration.layers, (id, changes) => {
    manager.updateLayer(id, changes);
  });

  const viewportEditor = new Furnace3DEditor(viewport, viewportOverlay, manager);

  const latestSnapshot = manager.getLatestSnapshot();
  if (latestSnapshot) {
    renderIndicators(statusCards, latestSnapshot.derivedIndicators);
    viewportEditor.updateSnapshot(latestSnapshot);
  }
  const validation = manager.validateComposition();
  renderCompositionStatus(compositionTotal, validation.total, validation.isBalanced, validation.deviation);

  renderSimulationControls(simulationControls, simulationEngine.getConfig(), {
    onStart: () => {
      simulationEngine.start();
      pushEventLog(eventLog, '模拟启动');
    },
    onPause: () => {
      simulationEngine.pause();
      pushEventLog(eventLog, '模拟暂停');
    },
    onReset: () => {
      simulationEngine.reset();
      renderSimulationTimeline(simulationTimeline, []);
      pushEventLog(eventLog, '模拟重置');
    },
    onConfigChange: (partial) => {
      simulationEngine.updateConfig(partial);
      pushEventLog(eventLog, '模拟参数已更新');
      renderSimulationStatus(simulationStatus, simulationEngine.getStatus());
    },
  });

  renderSimulationStatus(simulationStatus, simulationEngine.getStatus());
  renderSimulationTimeline(simulationTimeline, simulationEngine.getSamples());

  manager.addEventListener('state-change', (event: Event) => {
    const detail = (event as CustomEvent).detail as { key: keyof FurnaceState; value: number };
    pushEventLog(eventLog, `${parameters.find((param) => param.key === detail.key)?.label ?? detail.key} 调整为 ${detail.value}`);
  });

  manager.addEventListener('composition-change', () => {
    const validationResult = manager.validateComposition();
    renderCompositionStatus(
      compositionTotal,
      validationResult.total,
      validationResult.isBalanced,
      validationResult.deviation
    );
  });

  manager.addEventListener('configuration-change', (event: Event) => {
    const detail = (event as CustomEvent<{ configuration: FurnaceConfiguration; type: string; id: string }>).detail;
    if (!detail) {
      return;
    }
    renderSectionConfiguration(sectionContainer, detail.configuration.sections, (id, changes) => {
      manager.updateSection(id, changes);
    });
    renderLayerConfiguration(layerContainer, detail.configuration.layers, (id, changes) => {
      manager.updateLayer(id, changes);
    });
  });

  manager.addEventListener('snapshot', (event: Event) => {
    const detail = (event as CustomEvent<{ snapshot: FurnaceSnapshot; label: string }>).detail;
    if (!detail) {
      return;
    }
    if (detail.label) {
      pushEventLog(eventLog, detail.label);
    }
    renderIndicators(statusCards, detail.snapshot.derivedIndicators);
    viewportEditor.updateSnapshot(detail.snapshot);
  });

  simulationEngine.addEventListener('tick', (event: Event) => {
    const detail = (event as CustomEvent<{
      sample: SimulationSample;
      status: SimulationStatus;
      samples: SimulationSample[];
    }>).detail;
    if (detail) {
      renderSimulationStatus(simulationStatus, detail.status);
      renderSimulationTimeline(simulationTimeline, detail.samples);
      if (detail.sample.note) {
        pushEventLog(eventLog, `模拟提示：${detail.sample.note}`);
      }
      const snapshot = manager.getLatestSnapshot();
      if (snapshot) {
        viewportEditor.updateSnapshot(snapshot);
      }
    }
  });

  simulationEngine.addEventListener('status', (event: Event) => {
    const detail = (event as CustomEvent<{
      status: SimulationStatus;
      samples: SimulationSample[];
    }>).detail;
    if (detail) {
      renderSimulationStatus(simulationStatus, detail.status);
      renderSimulationTimeline(simulationTimeline, detail.samples);
      const snapshot = manager.getLatestSnapshot();
      if (snapshot) {
        viewportEditor.updateSnapshot(snapshot);
      }
    }
  });

  simulationEngine.addEventListener('reset', (event: Event) => {
    const detail = (event as CustomEvent<{
      status: SimulationStatus;
      samples: SimulationSample[];
    }>).detail;
    if (detail) {
      renderSimulationStatus(simulationStatus, detail.status);
      renderSimulationTimeline(simulationTimeline, detail.samples);
      const snapshot = manager.getLatestSnapshot();
      if (snapshot) {
        viewportEditor.updateSnapshot(snapshot);
      }
    }
  });

  manager.addEventListener('equipment-change', (event: Event) => {
    const detail = (event as CustomEvent<{
      configuration: FurnaceConfiguration;
      type: string;
      id: string;
      action: string;
    }>).detail;
    if (!detail) {
      return;
    }
    if (detail.id === 'auto-sync') {
      return;
    }
    const readable =
      detail.type === 'burner' ? '燃枪' : detail.type === 'electrode' ? '电极' : '投料口';
    const actionLabel = detail.action === 'add' ? '新增' : detail.action === 'remove' ? '删除' : '更新';
    pushEventLog(eventLog, `${actionLabel}${readable} ${detail.id}`);
  });
});

function renderCompositionStatus(container: HTMLElement, total: number, isBalanced: boolean, deviation: number) {
  const totalText = `当前总量：${total.toFixed(2)}%`;
  const statusText = isBalanced
    ? '配方平衡 ✅'
    : `偏差：${deviation > 0 ? '+' : ''}${deviation.toFixed(2)}%`;
  container.textContent = `${totalText} · ${statusText}`;
  container.style.color = isBalanced ? 'var(--success-color)' : 'var(--warning-color)';
}
