import { FurnaceStateManager } from './state.js';
import { SimulationConfig, SimulationSample, SimulationStatus } from './types.js';

interface SimulationTickDetail {
  sample: SimulationSample;
  status: SimulationStatus;
  samples: SimulationSample[];
}

const DEFAULT_CONFIG: SimulationConfig = {
  timeStepSeconds: 5,
  ambientTemperature: 25,
  initialMeltTemperature: 1250,
  maxSamples: 120,
};

export class SimulationEngine extends EventTarget {
  private config: SimulationConfig = { ...DEFAULT_CONFIG };
  private timer: number | null = null;
  private samples: SimulationSample[] = [];
  private elapsedTime = 0;

  constructor(private readonly manager: FurnaceStateManager, config?: Partial<SimulationConfig>) {
    super();
    if (config) {
      this.updateConfig(config);
    }
  }

  public start(): void {
    if (this.timer !== null) {
      return;
    }
    if (!this.samples.length) {
      this.samples.push({
        time: 0,
        meltTemperature: this.config.initialMeltTemperature,
        glassViscosity: this.estimateViscosity(this.config.initialMeltTemperature),
        chamberPressure: 101.3,
        energyConsumption: 0,
        note: '模拟初始化',
      });
    }
    this.timer = window.setInterval(() => this.step(), this.config.timeStepSeconds * 1000);
    this.dispatchStatus();
  }

  public pause(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
      this.dispatchStatus();
    }
  }

  public reset(): void {
    this.pause();
    this.samples = [];
    this.elapsedTime = 0;
    this.dispatchStatus();
    this.dispatchEvent(
      new CustomEvent('reset', {
        detail: {
          samples: this.getSamples(),
          status: this.getStatus(),
        },
      })
    );
  }

  public updateConfig(partial: Partial<SimulationConfig>): void {
    this.config = { ...this.config, ...partial };
    if (this.config.maxSamples < 10) {
      this.config.maxSamples = 10;
    }
    if (this.config.timeStepSeconds < 1) {
      this.config.timeStepSeconds = 1;
    }
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = window.setInterval(() => this.step(), this.config.timeStepSeconds * 1000);
    }
    this.dispatchStatus();
  }

  public getConfig(): SimulationConfig {
    return { ...this.config };
  }

  public getSamples(): SimulationSample[] {
    return this.samples.map((sample) => ({ ...sample }));
  }

  public getStatus(): SimulationStatus {
    return {
      isRunning: this.timer !== null,
      elapsedTime: this.elapsedTime,
      lastSample: this.samples[this.samples.length - 1],
    };
  }

  private step(): void {
    this.elapsedTime += this.config.timeStepSeconds;
    const state = this.manager.getState();
    const compositions = this.manager.getCompositions();
    const configuration = this.manager.getConfiguration();

    const burnerFactor = 1 + (state.burnerCount - 6) * 0.05;
    const electrodeFactor = 1 + (state.electrodeCount - 8) * 0.03;
    const heatLoad =
      state.burnerFlameSize * 0.82 * burnerFactor +
      state.electrodeVoltage * state.electrodeCurrent * 0.18 * electrodeFactor;
    const silica = this.getComposition(compositions, ['sio2', 'SiO₂']);
    const modifiers = this.getComposition(compositions, ['na2o', 'Na₂O']) + this.getComposition(compositions, ['k2o', 'K₂O']);
    const stabilizers = this.getComposition(compositions, ['cao', 'CaO']) + this.getComposition(compositions, ['mgo', 'MgO']);

    const lastTemp = this.samples[this.samples.length - 1]?.meltTemperature ?? this.config.initialMeltTemperature;
    const heatInput = heatLoad / 1800; // kW -> 温升系数
    const cooling = (lastTemp - this.config.ambientTemperature) * 0.015;
    const compositionBias = (silica - modifiers * 0.3 - stabilizers * 0.1 - 70) * 0.25;
    const totalDepth = configuration.sections.reduce((sum, section) => sum + section.depth, 0);
    const averageDepth = configuration.sections.length ? totalDepth / configuration.sections.length : 2.5;
    const depthEffect = (averageDepth - 2.4) * 6;
    const portInfluence = (state.feedPortCount - 2) * 1.5;
    const glassLevelEffect = (state.glassLevel - 1.6) * 8 + depthEffect + portInfluence;

    const newTemperature = Math.max(
      this.config.ambientTemperature,
      lastTemp + (heatInput - cooling + compositionBias + glassLevelEffect)
    );

    const viscosity = this.estimateViscosity(newTemperature, silica);
    const pressure = this.estimatePressure(state, configuration);
    const prevEnergy = this.samples[this.samples.length - 1]?.energyConsumption ?? 0;
    const stepEnergyMWh = (heatLoad * this.config.timeStepSeconds) / (1000 * 3600);
    const energyConsumption = prevEnergy + stepEnergyMWh;

    const note = this.generateNote(newTemperature, viscosity, pressure);

    const sample: SimulationSample = {
      time: this.elapsedTime,
      meltTemperature: Number(newTemperature.toFixed(1)),
      glassViscosity: Number(viscosity.toFixed(2)),
      chamberPressure: Number(pressure.toFixed(2)),
      energyConsumption: Number(energyConsumption.toFixed(3)),
      note,
    };

    this.samples.push(sample);
    if (this.samples.length > this.config.maxSamples) {
      this.samples.splice(0, this.samples.length - this.config.maxSamples);
    }

    this.dispatchStatus(sample);
  }

  private dispatchStatus(sample?: SimulationSample): void {
    const status = this.getStatus();
    if (sample) {
      this.dispatchEvent(
        new CustomEvent<SimulationTickDetail>('tick', {
          detail: {
            sample,
            status,
            samples: this.getSamples(),
          },
        })
      );
      return;
    }

    if (status.lastSample) {
      this.dispatchEvent(
        new CustomEvent<SimulationTickDetail>('status', {
          detail: {
            sample: status.lastSample,
            status,
            samples: this.getSamples(),
          },
        })
      );
    } else {
      this.dispatchEvent(
        new CustomEvent<SimulationTickDetail>('status', {
          detail: {
            sample: {
              time: 0,
              meltTemperature: this.config.initialMeltTemperature,
              glassViscosity: this.estimateViscosity(this.config.initialMeltTemperature),
              chamberPressure: 101.3,
              energyConsumption: 0,
            },
            status,
            samples: this.getSamples(),
          },
        })
      );
    }
  }

  private getComposition(
    compositions: ReturnType<FurnaceStateManager['getCompositions']>,
    identifiers: string[]
  ): number {
    const identifierSet = identifiers.map((item) => item.toLowerCase());
    const match = compositions.find((entry) => identifierSet.includes(entry.id.toLowerCase()) || identifierSet.includes(entry.name.toLowerCase()));
    return match ? match.percentage : 0;
  }

  private estimateViscosity(temperature: number, silicaContent = 70): number {
    const normalizedTemp = Math.max(400, temperature);
    const silicaFactor = 1 + (silicaContent - 70) * 0.01;
    const viscosity = Math.exp((5500 / normalizedTemp) * silicaFactor);
    return Math.min(Math.max(viscosity, 0.1), 500);
  }

  private estimatePressure(
    state: ReturnType<FurnaceStateManager['getState']>,
    configuration: ReturnType<FurnaceStateManager['getConfiguration']>
  ): number {
    const basePressure = 101.3;
    const burnerInfluence = (state.burnerFlameSize - 700) / 80 + (state.burnerCount - 6) * 0.6;
    const portInfluence = (state.feedPortSize - 1.5) * 5 + (state.feedPortCount - 2) * 1.2;
    const electrodeInfluence = (state.electrodeCurrent - 300) / 120 + (state.electrodeCount - 8) * 0.4;
    const enclosureFactor = configuration.layers.reduce((sum, layer) => sum + (layer.conductivity ?? 1) * layer.thickness, 0);
    const insulationEffect = enclosureFactor ? Math.max(0, 4 - enclosureFactor) : 2;
    return basePressure + burnerInfluence + portInfluence + electrodeInfluence + insulationEffect;
  }

  private generateNote(temperature: number, viscosity: number, pressure: number): string | undefined {
    if (temperature > 1500) {
      return '温度偏高，需关注耐火材料负荷';
    }
    if (temperature < 1200) {
      return '温度偏低，熔化效率下降';
    }
    if (viscosity > 200) {
      return '粘度偏高，建议提高助熔剂比例';
    }
    if (pressure > 115) {
      return '炉膛压力高，关注密封及燃烧配比';
    }
    return undefined;
  }
}
