import {
  CompositionEntry,
  CompositionValidation,
  FurnaceBurner,
  FurnaceConfiguration,
  FurnaceElectrode,
  FurnaceFeedPort,
  FurnaceSnapshot,
  FurnaceState,
  DerivedIndicator,
} from './types.js';

export class FurnaceStateManager extends EventTarget {
  private state: FurnaceState;
  private compositions: CompositionEntry[];
  private history: FurnaceSnapshot[] = [];
  private configuration: FurnaceConfiguration;

  constructor(
    initialState: FurnaceState,
    initialCompositions: CompositionEntry[],
    initialConfiguration: FurnaceConfiguration
  ) {
    super();
    this.state = { ...initialState };
    this.compositions = initialCompositions.map((entry) => ({ ...entry }));
    this.configuration = {
      sections: initialConfiguration.sections.map((section) => ({ ...section })),
      layers: initialConfiguration.layers.map((layer) => ({ ...layer })),
      burners: initialConfiguration.burners?.map((burner) => ({ ...burner })) ?? [],
      electrodes: initialConfiguration.electrodes?.map((electrode) => ({ ...electrode })) ?? [],
      feedPorts: initialConfiguration.feedPorts?.map((port) => ({ ...port })) ?? [],
    };
    this.syncEquipmentCounts(false);
    this.captureSnapshot('初始化');
  }

  public getState(): FurnaceState {
    return { ...this.state };
  }

  public getCompositions(): CompositionEntry[] {
    return this.compositions.map((entry) => ({ ...entry }));
  }

  public getConfiguration(): FurnaceConfiguration {
    return {
      sections: this.configuration.sections.map((section) => ({ ...section })),
      layers: this.configuration.layers.map((layer) => ({ ...layer })),
      burners: this.configuration.burners.map((burner) => ({ ...burner, position: { ...burner.position } })),
      electrodes: this.configuration.electrodes.map((electrode) => ({
        ...electrode,
        position: { ...electrode.position },
      })),
      feedPorts: this.configuration.feedPorts.map((port) => ({ ...port, position: { ...port.position } })),
    };
  }

  public getEquipmentCounts(): { burners: number; electrodes: number; feedPorts: number } {
    return {
      burners: this.configuration.burners.length,
      electrodes: this.configuration.electrodes.length,
      feedPorts: this.configuration.feedPorts.length,
    };
  }

  public updateParameter(key: keyof FurnaceState, value: number): void {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new Error(`参数 ${String(key)} 的值无效`);
    }
    if (key === 'burnerCount' || key === 'electrodeCount' || key === 'feedPortCount') {
      value = Math.max(0, Math.round(value));
    }
    if (this.state[key] === value) {
      return;
    }
    this.state = { ...this.state, [key]: value };
    this.dispatchEvent(
      new CustomEvent('state-change', {
        detail: { key, value, state: this.getState() },
      })
    );
    if (key === 'burnerCount') {
      this.ensureEquipmentCount('burners', value);
    } else if (key === 'electrodeCount') {
      this.ensureEquipmentCount('electrodes', value);
    } else if (key === 'feedPortCount') {
      this.ensureEquipmentCount('feedPorts', value);
    }
    this.captureSnapshot(`${String(key)} 调整为 ${value}`);
  }

  public updateComposition(id: string, percentage: number): void {
    this.compositions = this.compositions.map((entry) =>
      entry.id === id ? { ...entry, percentage } : entry
    );
    this.dispatchEvent(
      new CustomEvent('composition-change', {
        detail: { compositions: this.getCompositions() },
      })
    );
    this.captureSnapshot(`配方 ${id} 调整为 ${percentage.toFixed(2)}%`);
  }

  public updateSection(
    id: string,
    values: Partial<Pick<FurnaceConfiguration['sections'][number], 'length' | 'width' | 'depth' | 'height' | 'material'> & { description?: string }>
  ): void {
    let updated = false;
    this.configuration = {
      ...this.configuration,
      sections: this.configuration.sections.map((section) => {
        if (section.id !== id) {
          return section;
        }
        updated = true;
        return { ...section, ...values };
      }),
    };
    if (!updated) {
      throw new Error(`未找到编号为 ${id} 的炉池分区`);
    }
    this.dispatchEvent(
      new CustomEvent('configuration-change', {
        detail: { configuration: this.getConfiguration(), type: 'section', id },
      })
    );
    this.captureSnapshot(`炉池分区 ${id} 更新`);
  }

  public updateLayer(
    id: string,
    values: Partial<Pick<FurnaceConfiguration['layers'][number], 'material' | 'thickness' | 'conductivity' | 'notes'>>
  ): void {
    let updated = false;
    this.configuration = {
      ...this.configuration,
      layers: this.configuration.layers.map((layer) => {
        if (layer.id !== id) {
          return layer;
        }
        updated = true;
        return { ...layer, ...values };
      }),
    };
    if (!updated) {
      throw new Error(`未找到编号为 ${id} 的炉衬层`);
    }
    this.dispatchEvent(
      new CustomEvent('configuration-change', {
        detail: { configuration: this.getConfiguration(), type: 'layer', id },
      })
    );
    this.captureSnapshot(`炉衬层 ${id} 更新`);
  }

  public addBurner(burner: FurnaceBurner): void {
    this.configuration = {
      ...this.configuration,
      burners: [...this.configuration.burners, this.cloneBurner(burner)],
    };
    this.syncEquipmentCounts();
    this.emitEquipmentChange('burner', burner.id, 'add');
    this.captureSnapshot(`新增燃烧器 ${burner.label}`);
  }

  public updateBurner(id: string, values: Partial<FurnaceBurner>): void {
    let updated = false;
    this.configuration = {
      ...this.configuration,
      burners: this.configuration.burners.map((burner) => {
        if (burner.id !== id) {
          return burner;
        }
        updated = true;
        const merged = {
          ...burner,
          ...values,
          position: values.position ? { ...burner.position, ...values.position } : { ...burner.position },
        };
        return merged;
      }),
    };
    if (!updated) {
      throw new Error(`未找到编号为 ${id} 的燃烧器`);
    }
    this.emitEquipmentChange('burner', id, 'update');
    this.captureSnapshot(`燃烧器 ${id} 更新`);
  }

  public removeBurner(id: string): void {
    const next = this.configuration.burners.filter((burner) => burner.id !== id);
    if (next.length === this.configuration.burners.length) {
      throw new Error(`未找到编号为 ${id} 的燃烧器`);
    }
    this.configuration = { ...this.configuration, burners: next };
    this.syncEquipmentCounts();
    this.emitEquipmentChange('burner', id, 'remove');
    this.captureSnapshot(`删除燃烧器 ${id}`);
  }

  public addElectrode(electrode: FurnaceElectrode): void {
    this.configuration = {
      ...this.configuration,
      electrodes: [...this.configuration.electrodes, this.cloneElectrode(electrode)],
    };
    this.syncEquipmentCounts();
    this.emitEquipmentChange('electrode', electrode.id, 'add');
    this.captureSnapshot(`新增电极 ${electrode.label}`);
  }

  public updateElectrode(id: string, values: Partial<FurnaceElectrode>): void {
    let updated = false;
    this.configuration = {
      ...this.configuration,
      electrodes: this.configuration.electrodes.map((electrode) => {
        if (electrode.id !== id) {
          return electrode;
        }
        updated = true;
        return {
          ...electrode,
          ...values,
          position: values.position ? { ...electrode.position, ...values.position } : { ...electrode.position },
        };
      }),
    };
    if (!updated) {
      throw new Error(`未找到编号为 ${id} 的电极`);
    }
    this.emitEquipmentChange('electrode', id, 'update');
    this.captureSnapshot(`电极 ${id} 更新`);
  }

  public removeElectrode(id: string): void {
    const next = this.configuration.electrodes.filter((electrode) => electrode.id !== id);
    if (next.length === this.configuration.electrodes.length) {
      throw new Error(`未找到编号为 ${id} 的电极`);
    }
    this.configuration = { ...this.configuration, electrodes: next };
    this.syncEquipmentCounts();
    this.emitEquipmentChange('electrode', id, 'remove');
    this.captureSnapshot(`删除电极 ${id}`);
  }

  public addFeedPort(port: FurnaceFeedPort): void {
    this.configuration = {
      ...this.configuration,
      feedPorts: [...this.configuration.feedPorts, this.cloneFeedPort(port)],
    };
    this.syncEquipmentCounts();
    this.emitEquipmentChange('feedPort', port.id, 'add');
    this.captureSnapshot(`新增投料口 ${port.label}`);
  }

  public updateFeedPort(id: string, values: Partial<FurnaceFeedPort>): void {
    let updated = false;
    this.configuration = {
      ...this.configuration,
      feedPorts: this.configuration.feedPorts.map((feedPort) => {
        if (feedPort.id !== id) {
          return feedPort;
        }
        updated = true;
        return {
          ...feedPort,
          ...values,
          position: values.position ? { ...feedPort.position, ...values.position } : { ...feedPort.position },
        };
      }),
    };
    if (!updated) {
      throw new Error(`未找到编号为 ${id} 的投料口`);
    }
    this.emitEquipmentChange('feedPort', id, 'update');
    this.captureSnapshot(`投料口 ${id} 更新`);
  }

  public removeFeedPort(id: string): void {
    const next = this.configuration.feedPorts.filter((feedPort) => feedPort.id !== id);
    if (next.length === this.configuration.feedPorts.length) {
      throw new Error(`未找到编号为 ${id} 的投料口`);
    }
    this.configuration = { ...this.configuration, feedPorts: next };
    this.syncEquipmentCounts();
    this.emitEquipmentChange('feedPort', id, 'remove');
    this.captureSnapshot(`删除投料口 ${id}`);
  }

  public validateComposition(target = 100): CompositionValidation {
    const total = this.compositions.reduce((sum, entry) => sum + entry.percentage, 0);
    const deviation = total - target;
    return {
      total,
      isBalanced: Math.abs(deviation) < 0.01,
      deviation,
    };
  }

  public getLatestSnapshot(): FurnaceSnapshot | null {
    return this.history.length ? this.history[this.history.length - 1] : null;
  }

  private captureSnapshot(eventLabel: string): void {
    const derivedIndicators = this.calculateDerivedIndicators();
    const snapshot: FurnaceSnapshot = {
      timestamp: Date.now(),
      state: this.getState(),
      compositions: this.getCompositions(),
      configuration: this.getConfiguration(),
      derivedIndicators,
    };
    this.history.push(snapshot);
    this.dispatchEvent(
      new CustomEvent('snapshot', {
        detail: { snapshot, label: eventLabel },
      })
    );
  }

  private emitEquipmentChange(
    type: 'burner' | 'electrode' | 'feedPort',
    id: string,
    action: 'add' | 'update' | 'remove'
  ): void {
    this.dispatchEvent(
      new CustomEvent('equipment-change', {
        detail: {
          configuration: this.getConfiguration(),
          type,
          id,
          action,
        },
      })
    );
  }

  private syncEquipmentCounts(emitEvents = true): void {
    const updates: Partial<FurnaceState> = {
      burnerCount: this.configuration.burners.length,
      electrodeCount: this.configuration.electrodes.length,
      feedPortCount: this.configuration.feedPorts.length,
    };
    const changedKeys = (Object.keys(updates) as (keyof FurnaceState)[]).filter(
      (key) => updates[key] !== undefined && updates[key] !== this.state[key]
    );
    if (!changedKeys.length) {
      return;
    }
    this.state = { ...this.state, ...updates };
    if (emitEvents) {
      const currentState = this.getState();
      for (const key of changedKeys) {
        const value = currentState[key];
        this.dispatchEvent(
          new CustomEvent('state-change', {
            detail: { key, value, state: currentState },
          })
        );
      }
    }
  }

  private ensureEquipmentCount(
    kind: 'burners' | 'electrodes' | 'feedPorts',
    count: number
  ): void {
    const normalized = Math.max(0, Math.round(count));
    let updated = false;
    while (this.configuration[kind].length < normalized) {
      if (kind === 'burners') {
        const index = this.configuration.burners.length;
        const burner = this.createDefaultBurner(index, normalized);
        this.configuration.burners.push(burner);
      } else if (kind === 'electrodes') {
        const index = this.configuration.electrodes.length;
        const electrode = this.createDefaultElectrode(index, normalized);
        this.configuration.electrodes.push(electrode);
      } else {
        const index = this.configuration.feedPorts.length;
        const port = this.createDefaultFeedPort(index, normalized);
        this.configuration.feedPorts.push(port);
      }
      updated = true;
    }
    while (this.configuration[kind].length > normalized) {
      this.configuration[kind].pop();
      updated = true;
    }
    if (updated) {
      this.syncEquipmentCounts();
      this.emitEquipmentChange(
        kind === 'burners' ? 'burner' : kind === 'electrodes' ? 'electrode' : 'feedPort',
        'auto-sync',
        'update'
      );
    }
  }

  private cloneBurner(burner: FurnaceBurner): FurnaceBurner {
    return { ...burner, position: { ...burner.position } };
  }

  private cloneElectrode(electrode: FurnaceElectrode): FurnaceElectrode {
    return { ...electrode, position: { ...electrode.position } };
  }

  private cloneFeedPort(port: FurnaceFeedPort): FurnaceFeedPort {
    return { ...port, position: { ...port.position } };
  }

  private createDefaultBurner(index: number, total: number): FurnaceBurner {
    const extents = this.getFurnaceExtents();
    const spacing = extents.length / Math.max(1, total + 1);
    const x = -extents.length / 2 + spacing * (index + 1);
    return {
      id: this.generateEquipmentId('burner', index),
      label: `燃枪 ${index + 1}`,
      position: { x, y: Math.max(0.8, extents.depth * 0.7), z: extents.width / 2 + 0.5 },
      length: 1.2,
      tilt: 12,
      diameter: 0.18,
    };
  }

  private createDefaultElectrode(index: number, total: number): FurnaceElectrode {
    const extents = this.getFurnaceExtents();
    const spacing = extents.length / Math.max(1, total + 1);
    const x = -extents.length / 2 + spacing * (index + 1);
    return {
      id: this.generateEquipmentId('electrode', index),
      label: `电极 ${index + 1}`,
      position: { x, y: Math.max(0.6, extents.depth * 0.55), z: 0 },
      length: Math.max(1.5, extents.depth * 0.9),
      diameter: 0.22,
      voltage: this.state.electrodeVoltage,
      current: this.state.electrodeCurrent,
    };
  }

  private createDefaultFeedPort(index: number, total: number): FurnaceFeedPort {
    const extents = this.getFurnaceExtents();
    const spacing = extents.length / Math.max(1, total + 1);
    const x = -extents.length / 2 + spacing * (index + 1);
    return {
      id: this.generateEquipmentId('feed', index),
      label: `投料口 ${index + 1}`,
      position: { x, y: extents.depth + 0.3, z: 0 },
      width: this.state.feedPortSize,
      height: 0.6,
      depth: 0.5,
      opening: 0.25,
    };
  }

  private generateEquipmentId(prefix: string, index: number): string {
    return `${prefix}-${Date.now()}-${index}`;
  }

  private getFurnaceExtents(): { length: number; width: number; depth: number } {
    const sections = this.configuration.sections;
    const length = sections.reduce((sum, section) => sum + section.length, 0) || 10;
    const width = sections.reduce((max, section) => Math.max(max, section.width), 0) || 5;
    const depth = sections.reduce((max, section) => Math.max(max, section.depth), 0) || 2.5;
    return { length, width, depth };
  }

  private calculateDerivedIndicators(): DerivedIndicator[] {
    const {
      burnerFlameSize,
      burnerCount,
      glassLevel,
      electrodeVoltage,
      electrodeCurrent,
      electrodeCount,
      feedPortCount,
    } = this.state;
    const configuration = this.getConfiguration();
    const totalVolume = configuration.sections.reduce((sum, section) => {
      const sectionVolume = section.length * section.width * section.depth;
      return sum + sectionVolume;
    }, 0);
    const heatLoad = burnerFlameSize * 0.85 + electrodeVoltage * electrodeCurrent * 0.15;
    const electricalPower = (electrodeVoltage * electrodeCurrent) / 1000;
    const meltDepth = Math.max(glassLevel - 1.2, 0.1);
    const stabilityIndex = 100 - Math.abs(glassLevel - 1.5) * 10;
    const thermalReserve = totalVolume * Math.max(1, burnerCount + electrodeCount * 0.5);
    const batchThroughput = feedPortCount * this.configuration.sections[0]?.width * 2 || feedPortCount * 1.2;

    return [
      {
        id: 'heat-load',
        label: '热负荷估计',
        value: `${heatLoad.toFixed(1)} kW`,
        hint: '基于燃烧与电加热的组合负荷估算',
      },
      {
        id: 'electrical-power',
        label: '电加热功率',
        value: `${electricalPower.toFixed(2)} kW`,
        hint: '电极电压与电流的瞬时功率',
      },
      {
        id: 'melt-depth',
        label: '有效熔化深度',
        value: `${meltDepth.toFixed(2)} m`,
        hint: '液面高度与安全基准差值估计',
      },
      {
        id: 'thermal-reserve',
        label: '热容量估算',
        value: `${thermalReserve.toFixed(1)} m³·kW`,
        hint: '炉池体积与加热单元数量估算的热储量',
      },
      {
        id: 'batch-throughput',
        label: '理论投料能力',
        value: `${batchThroughput.toFixed(1)} t/h`,
        hint: '基于投料口数量与熔化区宽度的理论上限',
      },
      {
        id: 'layer-count',
        label: '炉衬层配置',
        value: `${configuration.layers.length} 层`,
        hint: '炉衬层数量与材料设置情况概览',
      },
      {
        id: 'stability-index',
        label: '稳定性指数',
        value: `${Math.max(0, Math.min(stabilityIndex, 100)).toFixed(1)} %`,
        hint: '液面偏差对应的操作稳定性评分',
      },
    ];
  }
}
