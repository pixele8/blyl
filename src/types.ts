export interface NumericParameter {
  key: keyof FurnaceState;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  description?: string;
}

export interface CompositionEntry {
  id: string;
  name: string;
  percentage: number;
}

export interface ElectrodeSetting {
  id: string;
  position: number;
  voltage: number;
  current: number;
}

export interface FurnaceState {
  burnerPosition: number;
  burnerFlameSize: number;
  burnerCount: number;
  glassLevel: number;
  electrodePosition: number;
  electrodeCount: number;
  electrodeVoltage: number;
  electrodeCurrent: number;
  feedPortPosition: number;
  feedPortSize: number;
  feedPortCount: number;
}

export interface FurnaceSnapshot {
  timestamp: number;
  state: FurnaceState;
  compositions: CompositionEntry[];
  configuration: FurnaceConfiguration;
  derivedIndicators: DerivedIndicator[];
}

export interface DerivedIndicator {
  id: string;
  label: string;
  value: string;
  hint?: string;
}

export type CompositionValidation = {
  total: number;
  isBalanced: boolean;
  deviation: number;
};

export interface SimulationConfig {
  /** 每个计算步长的秒数 */
  timeStepSeconds: number;
  /** 环境温度 (°C)，用于估算散热 */
  ambientTemperature: number;
  /** 初始熔体温度 (°C)，用于模拟起点 */
  initialMeltTemperature: number;
  /** 保留的最大采样点数量 */
  maxSamples: number;
}

export interface SimulationSample {
  /** 从模拟开始累积的时间，单位秒 */
  time: number;
  /** 窑炉熔体温度估计，单位 °C */
  meltTemperature: number;
  /** 玻璃粘度估计 (Pa·s) */
  glassViscosity: number;
  /** 炉膛压力估计 (kPa) */
  chamberPressure: number;
  /** 累积能耗 (MWh) */
  energyConsumption: number;
  /** 对当前状态的文字说明 */
  note?: string;
}

export interface SimulationStatus {
  isRunning: boolean;
  elapsedTime: number;
  lastSample?: SimulationSample;
}

export interface FurnaceSection {
  id: string;
  name: string;
  length: number;
  width: number;
  depth: number;
  height: number;
  material: string;
  description?: string;
}

export interface FurnaceLayer {
  id: string;
  name: string;
  material: string;
  thickness: number;
  conductivity?: number;
  notes?: string;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface FurnaceBurner {
  id: string;
  label: string;
  position: Vector3;
  length: number;
  tilt: number;
  diameter: number;
}

export interface FurnaceElectrode {
  id: string;
  label: string;
  position: Vector3;
  length: number;
  diameter: number;
  voltage: number;
  current: number;
}

export interface FurnaceFeedPort {
  id: string;
  label: string;
  position: Vector3;
  width: number;
  height: number;
  depth: number;
  opening: number;
}

export interface FurnaceConfiguration {
  sections: FurnaceSection[];
  layers: FurnaceLayer[];
  burners: FurnaceBurner[];
  electrodes: FurnaceElectrode[];
  feedPorts: FurnaceFeedPort[];
}
