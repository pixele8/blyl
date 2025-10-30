import * as THREE from '../vendor/three/three.module.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { FurnaceStateManager } from './state.js';
import {
  FurnaceBurner,
  FurnaceConfiguration,
  FurnaceElectrode,
  FurnaceFeedPort,
  FurnaceLayer,
  FurnaceSection,
  FurnaceSnapshot,
} from './types.js';

type SelectableType = 'section' | 'layer' | 'burner' | 'electrode' | 'feedPort';
type PlacementMode = 'none' | 'burner' | 'electrode' | 'feedPort';

interface SelectedInfo {
  type: SelectableType;
  id: string;
}

interface FurnaceExtents {
  length: number;
  width: number;
  depth: number;
  height: number;
}

const COLOR_FLOOR = 0x0b1220;
const COLOR_SECTION = 0x4f46e5;
const COLOR_SECTION_EDGE = 0x93c5fd;
const COLOR_GLASS = 0xff8c00;
const COLOR_LAYER = 0x64748b;
const COLOR_BURNER = 0xffb74d;
const COLOR_ELECTRODE = 0x60a5fa;
const COLOR_FEED = 0x34d399;
const COLOR_SELECTION = 0xfacc15;

export class Furnace3DEditor {
  private readonly scene = new THREE.Scene();
  private readonly camera: any;
  private readonly renderer: any;
  private readonly controls: any;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly sectionGroup = new THREE.Group();
  private readonly layerGroup = new THREE.Group();
  private readonly equipmentGroup = new THREE.Group();
  private readonly sectionMeshes = new Map<string, any>();
  private readonly layerMeshes = new Map<string, any>();
  private readonly burnerMeshes = new Map<string, any>();
  private readonly electrodeMeshes = new Map<string, any>();
  private readonly feedPortMeshes = new Map<string, any>();
  private readonly floor: any;
  private readonly selectionHelper: any;
  private placementMode: PlacementMode = 'none';
  private selected: SelectedInfo | null = null;
  private lastSnapshot: FurnaceSnapshot | null = null;
  private pointerDown = false;
  private pointerMoved = false;
  private initialized = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly overlay: HTMLElement,
    private readonly manager: FurnaceStateManager
  ) {
    this.scene.background = new THREE.Color(0x050915);

    this.camera = new THREE.PerspectiveCamera(50, this.aspectRatio, 0.1, 200);
    this.camera.position.set(15, 12, 18);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(this.container.clientWidth || 640, this.container.clientHeight || 360, false);
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI - Math.PI / 12;
    this.controls.target.set(0, 1.5, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    const directional = new THREE.DirectionalLight(0xffffff, 1.1);
    directional.position.set(8, 16, 6);
    directional.castShadow = false;
    this.scene.add(ambient, directional);

    const backLight = new THREE.DirectionalLight(0x6b9cff, 0.4);
    backLight.position.set(-10, 8, -12);
    this.scene.add(backLight);

    const grid = new THREE.GridHelper(80, 40, 0x1f2937, 0x1f2937);
    grid.position.y = 0;
    this.scene.add(grid);

    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: COLOR_FLOOR, side: THREE.DoubleSide })
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = 0;
    this.scene.add(this.floor);

    this.selectionHelper = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(0, 0, 0)), COLOR_SELECTION);
    this.selectionHelper.visible = false;
    this.scene.add(this.selectionHelper);

    this.scene.add(this.sectionGroup);
    this.scene.add(this.layerGroup);
    this.scene.add(this.equipmentGroup);

    this.bindEvents();
    this.renderOverlay();
    this.animate();
  }

  public updateSnapshot(snapshot: FurnaceSnapshot): void {
    this.lastSnapshot = snapshot;
    this.rebuildSections(snapshot.configuration.sections);
    this.rebuildLayers(snapshot.configuration.layers, snapshot.configuration.sections);
    this.rebuildEquipment(snapshot.configuration);
    this.updateFloor(snapshot.configuration.sections);
    this.refreshSelection();
    this.renderOverlay();
    if (!this.initialized) {
      this.reframeCamera(snapshot.configuration);
      this.initialized = true;
    }
  }

  private bindEvents(): void {
    this.renderer.domElement.addEventListener('pointerdown', (event: PointerEvent) => {
      this.pointerDown = true;
      this.pointerMoved = false;
      this.updatePointer(event);
    });
    this.renderer.domElement.addEventListener('pointermove', (event: PointerEvent) => {
      if (this.pointerDown) {
        this.pointerMoved = true;
      }
      this.updatePointer(event);
    });
    this.renderer.domElement.addEventListener('pointerup', (event: PointerEvent) => {
      this.pointerDown = false;
      this.updatePointer(event);
      if (this.pointerMoved && this.placementMode === 'none') {
        return;
      }
      if (this.placementMode !== 'none') {
        this.commitPlacement();
        return;
      }
      this.performSelection();
    });
    window.addEventListener('resize', () => this.handleResize());
    this.handleResize();
  }

  private get aspectRatio(): number {
    const width = this.container.clientWidth || 640;
    const height = this.container.clientHeight || 360;
    return width / Math.max(1, height);
  }

  private handleResize(): void {
    const width = this.container.clientWidth || this.container.offsetWidth || 640;
    const height = this.container.clientHeight || this.container.offsetHeight || 360;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private animate(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.animate());
  }

  private updatePointer(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  private computeExtents(sections: FurnaceSection[]): FurnaceExtents {
    const length = sections.reduce((sum, section) => sum + section.length, 0) || 10;
    const width = sections.reduce((max, section) => Math.max(max, section.width), 0) || 6;
    const depth = sections.reduce((max, section) => Math.max(max, section.depth), 0) || 2.5;
    const height = sections.reduce((max, section) => Math.max(max, section.height), 0) || 3.2;
    return { length, width, depth, height };
  }

  private rebuildSections(sections: FurnaceSection[]): void {
    this.sectionGroup.clear();
    this.sectionMeshes.clear();
    const extents = this.computeExtents(sections);
    let offsetX = -extents.length / 2;

    sections.forEach((section) => {
      const group = new THREE.Group();
      group.position.set(offsetX + section.length / 2, 0, 0);
      group.userData = { type: 'section', id: section.id };

      const bodyGeometry = new THREE.BoxGeometry(1, 1, 1);
      const bodyMaterial = new THREE.MeshStandardMaterial({
        color: COLOR_SECTION,
        transparent: true,
        opacity: 0.35,
      });
      const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
      body.scale.set(section.length, Math.max(0.2, section.depth), section.width);
      body.position.set(0, Math.max(0.1, section.depth / 2), 0);
      body.userData = { type: 'section', id: section.id };
      group.add(body);

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
        new THREE.LineBasicMaterial({ color: COLOR_SECTION_EDGE, transparent: true, opacity: 0.8 })
      );
      edges.scale.copy(body.scale);
      edges.position.copy(body.position);
      edges.userData = { type: 'section', id: section.id };
      group.add(edges);

      const glassMaterial = new THREE.MeshBasicMaterial({
        color: COLOR_GLASS,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      });
      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(section.length * 0.96, section.width * 0.96),
        glassMaterial
      );
      glass.rotation.x = -Math.PI / 2;
      glass.position.set(0, section.height, 0);
      glass.userData = { type: 'section', id: section.id };
      group.add(glass);

      this.sectionGroup.add(group);
      this.sectionMeshes.set(section.id, group);
      offsetX += section.length;
    });
  }

  private rebuildLayers(layers: FurnaceLayer[], sections: FurnaceSection[]): void {
    this.layerGroup.clear();
    this.layerMeshes.clear();
    if (!layers.length) {
      return;
    }
    const extents = this.computeExtents(sections);
    let expansion = 0;
    layers.forEach((layer) => {
      expansion += layer.thickness;
      const length = extents.length + expansion * 2;
      const width = extents.width + expansion * 2;
      const height = extents.depth + layer.thickness * 1.5;

      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ color: COLOR_LAYER, transparent: true, opacity: 0.08 })
      );
      mesh.scale.set(length, height, width);
      mesh.position.set(0, height / 2, 0);
      mesh.userData = { type: 'layer', id: layer.id };

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
        new THREE.LineBasicMaterial({ color: COLOR_LAYER, transparent: true, opacity: 0.5 })
      );
      edges.scale.copy(mesh.scale);
      edges.position.copy(mesh.position);
      edges.userData = { type: 'layer', id: layer.id };

      const group = new THREE.Group();
      group.userData = { type: 'layer', id: layer.id };
      group.add(mesh, edges);
      this.layerGroup.add(group);
      this.layerMeshes.set(layer.id, group);
    });
  }

  private rebuildEquipment(configuration: FurnaceConfiguration): void {
    this.equipmentGroup.clear();
    this.burnerMeshes.clear();
    this.electrodeMeshes.clear();
    this.feedPortMeshes.clear();

    configuration.burners.forEach((burner) => {
      const group = new THREE.Group();
      group.position.set(burner.position.x, burner.position.y, burner.position.z);
      group.rotation.x = 0;
      group.rotation.z = THREE.MathUtils.degToRad(-burner.tilt);
      group.userData = { type: 'burner', id: burner.id };

      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(burner.diameter / 2, burner.diameter / 2, burner.length, 12),
        new THREE.MeshStandardMaterial({ color: COLOR_BURNER, metalness: 0.1, roughness: 0.5 })
      );
      body.rotation.x = Math.PI / 2;
      const direction = burner.position.z >= 0 ? -1 : 1;
      body.position.set(0, 0, (burner.length / 2) * direction);
      body.userData = { type: 'burner', id: burner.id };
      group.add(body);

      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(burner.diameter / 2, 12, 12),
        new THREE.MeshStandardMaterial({ color: COLOR_BURNER, emissive: 0xff8f3d, emissiveIntensity: 0.4 })
      );
      tip.position.set(0, 0, 0);
      tip.userData = { type: 'burner', id: burner.id };
      group.add(tip);

      this.equipmentGroup.add(group);
      this.burnerMeshes.set(burner.id, group);
    });

    configuration.electrodes.forEach((electrode) => {
      const group = new THREE.Group();
      group.position.set(electrode.position.x, electrode.position.y, electrode.position.z);
      group.userData = { type: 'electrode', id: electrode.id };

      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(electrode.diameter / 2, electrode.diameter / 2, electrode.length, 16),
        new THREE.MeshStandardMaterial({ color: COLOR_ELECTRODE, metalness: 0.3, roughness: 0.4 })
      );
      body.position.set(0, 0, 0);
      body.userData = { type: 'electrode', id: electrode.id };
      group.add(body);

      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(electrode.diameter / 2, electrode.diameter / 2, electrode.diameter * 0.6, 12),
        new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.8 })
      );
      cap.position.set(0, electrode.length / 2, 0);
      cap.userData = { type: 'electrode', id: electrode.id };
      group.add(cap);

      this.equipmentGroup.add(group);
      this.electrodeMeshes.set(electrode.id, group);
    });

    configuration.feedPorts.forEach((feedPort) => {
      const group = new THREE.Group();
      group.position.set(feedPort.position.x, feedPort.position.y, feedPort.position.z);
      group.userData = { type: 'feedPort', id: feedPort.id };

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(feedPort.width, feedPort.height, feedPort.depth),
        new THREE.MeshStandardMaterial({ color: COLOR_FEED, transparent: true, opacity: 0.3 })
      );
      body.userData = { type: 'feedPort', id: feedPort.id };
      group.add(body);

      const rim = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(feedPort.width, feedPort.height, feedPort.depth)),
        new THREE.LineBasicMaterial({ color: COLOR_FEED, transparent: true, opacity: 0.9 })
      );
      rim.userData = { type: 'feedPort', id: feedPort.id };
      group.add(rim);

      this.equipmentGroup.add(group);
      this.feedPortMeshes.set(feedPort.id, group);
    });
  }

  private performSelection(): void {
    const intersects = this.raycaster.intersectObjects(
      [...this.sectionGroup.children, ...this.layerGroup.children, ...this.equipmentGroup.children],
      true
    );
    const hit = intersects.find((entry: any) => entry.object.userData?.type && entry.object.userData?.id);
    if (!hit) {
      this.selected = null;
      this.selectionHelper.visible = false;
      this.renderOverlay();
      return;
    }
    const data = hit.object.userData as SelectedInfo;
    this.selected = { type: data.type, id: data.id };
    this.updateSelectionHelper();
    this.renderOverlay();
  }

  private updateSelectionHelper(): void {
    if (!this.selected) {
      this.selectionHelper.visible = false;
      return;
    }
    const target = this.getObjectBySelection(this.selected);
    if (!target) {
      this.selectionHelper.visible = false;
      return;
    }
    const box = new THREE.Box3().setFromObject(target);
    this.selectionHelper.box.copy(box);
    this.selectionHelper.visible = true;
  }

  private getObjectBySelection(selection: SelectedInfo): any | null {
    switch (selection.type) {
      case 'section':
        return this.sectionMeshes.get(selection.id) ?? null;
      case 'layer':
        return this.layerMeshes.get(selection.id) ?? null;
      case 'burner':
        return this.burnerMeshes.get(selection.id) ?? null;
      case 'electrode':
        return this.electrodeMeshes.get(selection.id) ?? null;
      case 'feedPort':
        return this.feedPortMeshes.get(selection.id) ?? null;
      default:
        return null;
    }
  }

  private refreshSelection(): void {
    if (!this.selected || !this.lastSnapshot) {
      this.selectionHelper.visible = false;
      return;
    }
    const exists = this.entityExists(this.selected);
    if (!exists) {
      this.selected = null;
      this.selectionHelper.visible = false;
      return;
    }
    this.updateSelectionHelper();
  }

  private entityExists(selection: SelectedInfo): boolean {
    if (!this.lastSnapshot) {
      return false;
    }
    const configuration = this.lastSnapshot.configuration;
    switch (selection.type) {
      case 'section':
        return configuration.sections.some((section) => section.id === selection.id);
      case 'layer':
        return configuration.layers.some((layer) => layer.id === selection.id);
      case 'burner':
        return configuration.burners.some((burner) => burner.id === selection.id);
      case 'electrode':
        return configuration.electrodes.some((electrode) => electrode.id === selection.id);
      case 'feedPort':
        return configuration.feedPorts.some((feedPort) => feedPort.id === selection.id);
      default:
        return false;
    }
  }

  private updateFloor(sections: FurnaceSection[]): void {
    const extents = this.computeExtents(sections);
    this.floor.scale.set(extents.length * 1.4, extents.width * 1.4, 1);
    this.floor.position.y = 0;
  }

  private renderOverlay(): void {
    this.overlay.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'viewport-overlay-panel';
    panel.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.overlay.appendChild(panel);

    const header = document.createElement('div');
    header.className = 'viewport-overlay-header';
    const title = document.createElement('h3');
    title.textContent = '三维编辑';
    header.appendChild(title);
    panel.appendChild(header);

    const summary = document.createElement('p');
    summary.className = 'viewport-overlay-summary';
    if (this.lastSnapshot) {
      const { burners, electrodes, feedPorts } = this.lastSnapshot.configuration;
      summary.textContent = `燃枪 ${burners.length} · 电极 ${electrodes.length} · 投料口 ${feedPorts.length}`;
    } else {
      summary.textContent = '等待载入窑炉配置…';
    }
    panel.appendChild(summary);

    const addBar = document.createElement('div');
    addBar.className = 'viewport-overlay-actions';
    addBar.appendChild(this.createPlacementButton('新增燃枪', 'burner'));
    addBar.appendChild(this.createPlacementButton('新增电极', 'electrode'));
    addBar.appendChild(this.createPlacementButton('新增投料口', 'feedPort'));
    panel.appendChild(addBar);

    if (this.placementMode !== 'none') {
      const hint = document.createElement('p');
      hint.className = 'viewport-overlay-hint';
      const text =
        this.placementMode === 'burner'
          ? '在炉池侧面点击，放置新的燃枪。'
          : this.placementMode === 'electrode'
          ? '在炉池上方点击，放置新的电极。'
          : '在炉池顶面点击，放置新的投料口。';
      hint.textContent = `${text} 点击画布空白处取消。`;
      panel.appendChild(hint);
      return;
    }

    if (!this.selected || !this.lastSnapshot) {
      const help = document.createElement('p');
      help.className = 'viewport-overlay-help';
      help.textContent = '点击三维对象以选择并编辑，或使用上方按钮在视图中新增设备。';
      panel.appendChild(help);
      return;
    }

    switch (this.selected.type) {
      case 'section':
        this.renderSectionEditor(panel, this.selected.id);
        break;
      case 'layer':
        this.renderLayerEditor(panel, this.selected.id);
        break;
      case 'burner':
        this.renderBurnerEditor(panel, this.selected.id);
        break;
      case 'electrode':
        this.renderElectrodeEditor(panel, this.selected.id);
        break;
      case 'feedPort':
        this.renderFeedPortEditor(panel, this.selected.id);
        break;
    }
  }

  private renderSectionEditor(panel: HTMLElement, id: string): void {
    const section = this.lastSnapshot?.configuration.sections.find((item) => item.id === id);
    if (!section) {
      return;
    }
    const title = document.createElement('h4');
    title.textContent = `${section.name} (${section.id})`;
    panel.appendChild(title);

    const fields = document.createElement('div');
    fields.className = 'viewport-field-grid';

    fields.appendChild(
      this.createNumberField('长度 (m)', section.length, 0.1, (value) =>
        this.manager.updateSection(section.id, { length: this.clampRange(value, 1, 60) })
      )
    );
    fields.appendChild(
      this.createNumberField('宽度 (m)', section.width, 0.1, (value) =>
        this.manager.updateSection(section.id, { width: this.clampRange(value, 1, 30) })
      )
    );
    fields.appendChild(
      this.createNumberField('深度 (m)', section.depth, 0.1, (value) =>
        this.manager.updateSection(section.id, { depth: this.clampRange(value, 0.2, 8) })
      )
    );
    fields.appendChild(
      this.createNumberField('液面高度 (m)', section.height, 0.1, (value) =>
        this.manager.updateSection(section.id, { height: this.clampRange(value, 0.2, 8) })
      )
    );
    panel.appendChild(fields);

    const materialLabel = document.createElement('label');
    materialLabel.className = 'viewport-text-field';
    materialLabel.textContent = '耐火材料';
    const materialInput = document.createElement('input');
    materialInput.type = 'text';
    materialInput.value = section.material;
    materialInput.addEventListener('change', () => {
      this.manager.updateSection(section.id, { material: materialInput.value });
    });
    materialLabel.appendChild(materialInput);
    panel.appendChild(materialLabel);
  }

  private renderLayerEditor(panel: HTMLElement, id: string): void {
    const layer = this.lastSnapshot?.configuration.layers.find((item) => item.id === id);
    if (!layer) {
      return;
    }
    const title = document.createElement('h4');
    title.textContent = `${layer.name} (${layer.id})`;
    panel.appendChild(title);

    const fields = document.createElement('div');
    fields.className = 'viewport-field-grid';
    fields.appendChild(
      this.createNumberField('厚度 (m)', layer.thickness, 0.05, (value) =>
        this.manager.updateLayer(layer.id, { thickness: this.clampRange(value, 0.05, 2) })
      )
    );
    fields.appendChild(
      this.createNumberField('导热系数', layer.conductivity ?? 1, 0.05, (value) =>
        this.manager.updateLayer(layer.id, { conductivity: this.clampRange(value, 0.05, 10) })
      )
    );
    panel.appendChild(fields);

    const materialLabel = document.createElement('label');
    materialLabel.className = 'viewport-text-field';
    materialLabel.textContent = '材料名称';
    const materialInput = document.createElement('input');
    materialInput.type = 'text';
    materialInput.value = layer.material;
    materialInput.addEventListener('change', () => this.manager.updateLayer(layer.id, { material: materialInput.value }));
    materialLabel.appendChild(materialInput);
    panel.appendChild(materialLabel);

    const notesLabel = document.createElement('label');
    notesLabel.className = 'viewport-textarea-field';
    notesLabel.textContent = '备注';
    const notesInput = document.createElement('textarea');
    notesInput.value = layer.notes ?? '';
    notesInput.rows = 2;
    notesInput.addEventListener('change', () => this.manager.updateLayer(layer.id, { notes: notesInput.value }));
    notesLabel.appendChild(notesInput);
    panel.appendChild(notesLabel);
  }

  private renderBurnerEditor(panel: HTMLElement, id: string): void {
    if (!this.lastSnapshot) {
      return;
    }
    const burner = this.lastSnapshot.configuration.burners.find((item) => item.id === id);
    if (!burner) {
      return;
    }
    const extents = this.computeExtents(this.lastSnapshot.configuration.sections);
    const title = document.createElement('h4');
    title.textContent = `${burner.label}`;
    panel.appendChild(title);

    const fields = document.createElement('div');
    fields.className = 'viewport-field-grid';
    fields.appendChild(
      this.createNumberField('X 位置 (m)', burner.position.x, 0.1, (value) => {
        const clamped = this.clampWithin(value, extents.length / 2);
        this.manager.updateBurner(burner.id, { position: { ...burner.position, x: clamped } });
      })
    );
    fields.appendChild(
      this.createNumberField('高度 (m)', burner.position.y, 0.1, (value) => {
        this.manager.updateBurner(burner.id, { position: { ...burner.position, y: this.clampRange(value, 0.2, 8) } });
      })
    );
    fields.appendChild(
      this.createNumberField('喷嘴长度 (m)', burner.length, 0.1, (value) =>
        this.manager.updateBurner(burner.id, { length: this.clampRange(value, 0.2, 4) })
      )
    );
    fields.appendChild(
      this.createNumberField('喷嘴直径 (m)', burner.diameter, 0.01, (value) =>
        this.manager.updateBurner(burner.id, { diameter: this.clampRange(value, 0.05, 1) })
      )
    );
    fields.appendChild(
      this.createNumberField('倾角 (°)', burner.tilt, 1, (value) =>
        this.manager.updateBurner(burner.id, { tilt: this.clampRange(value, -30, 45) })
      )
    );
    panel.appendChild(fields);

    const remove = this.createDangerButton('删除燃枪', () => {
      this.selected = null;
      this.manager.removeBurner(burner.id);
    });
    panel.appendChild(remove);
  }

  private renderElectrodeEditor(panel: HTMLElement, id: string): void {
    if (!this.lastSnapshot) {
      return;
    }
    const electrode = this.lastSnapshot.configuration.electrodes.find((item) => item.id === id);
    if (!electrode) {
      return;
    }
    const extents = this.computeExtents(this.lastSnapshot.configuration.sections);
    const title = document.createElement('h4');
    title.textContent = `${electrode.label}`;
    panel.appendChild(title);

    const fields = document.createElement('div');
    fields.className = 'viewport-field-grid';
    fields.appendChild(
      this.createNumberField('X 位置 (m)', electrode.position.x, 0.1, (value) => {
        const clamped = this.clampWithin(value, extents.length / 2);
        this.manager.updateElectrode(electrode.id, { position: { ...electrode.position, x: clamped } });
      })
    );
    fields.appendChild(
      this.createNumberField('Z 位置 (m)', electrode.position.z, 0.1, (value) => {
        const clamped = this.clampWithin(value, extents.width / 2);
        this.manager.updateElectrode(electrode.id, { position: { ...electrode.position, z: clamped } });
      })
    );
    fields.appendChild(
      this.createNumberField('深度 (m)', electrode.position.y, 0.1, (value) =>
        this.manager.updateElectrode(electrode.id, { position: { ...electrode.position, y: this.clampRange(value, 0.2, 8) } })
      )
    );
    fields.appendChild(
      this.createNumberField('电极长度 (m)', electrode.length, 0.1, (value) =>
        this.manager.updateElectrode(electrode.id, { length: this.clampRange(value, 0.5, 6) })
      )
    );
    fields.appendChild(
      this.createNumberField('电极直径 (m)', electrode.diameter, 0.01, (value) =>
        this.manager.updateElectrode(electrode.id, { diameter: this.clampRange(value, 0.05, 1) })
      )
    );
    fields.appendChild(
      this.createNumberField('电压 (V)', electrode.voltage, 5, (value) =>
        this.manager.updateElectrode(electrode.id, { voltage: this.clampRange(value, 50, 2000) })
      )
    );
    fields.appendChild(
      this.createNumberField('电流 (A)', electrode.current, 5, (value) =>
        this.manager.updateElectrode(electrode.id, { current: this.clampRange(value, 10, 2000) })
      )
    );
    panel.appendChild(fields);

    const remove = this.createDangerButton('移除电极', () => {
      this.selected = null;
      this.manager.removeElectrode(electrode.id);
    });
    panel.appendChild(remove);
  }

  private renderFeedPortEditor(panel: HTMLElement, id: string): void {
    if (!this.lastSnapshot) {
      return;
    }
    const feedPort = this.lastSnapshot.configuration.feedPorts.find((item) => item.id === id);
    if (!feedPort) {
      return;
    }
    const extents = this.computeExtents(this.lastSnapshot.configuration.sections);
    const title = document.createElement('h4');
    title.textContent = `${feedPort.label}`;
    panel.appendChild(title);

    const fields = document.createElement('div');
    fields.className = 'viewport-field-grid';
    fields.appendChild(
      this.createNumberField('X 位置 (m)', feedPort.position.x, 0.1, (value) => {
        const clamped = this.clampWithin(value, extents.length / 2);
        this.manager.updateFeedPort(feedPort.id, { position: { ...feedPort.position, x: clamped } });
      })
    );
    fields.appendChild(
      this.createNumberField('高度 (m)', feedPort.position.y, 0.1, (value) =>
        this.manager.updateFeedPort(feedPort.id, { position: { ...feedPort.position, y: this.clampRange(value, 0.5, 8) } })
      )
    );
    fields.appendChild(
      this.createNumberField('宽度 (m)', feedPort.width, 0.05, (value) =>
        this.manager.updateFeedPort(feedPort.id, { width: this.clampRange(value, 0.2, 4) })
      )
    );
    fields.appendChild(
      this.createNumberField('开口高度 (m)', feedPort.height, 0.05, (value) =>
        this.manager.updateFeedPort(feedPort.id, { height: this.clampRange(value, 0.2, 3) })
      )
    );
    fields.appendChild(
      this.createNumberField('进深 (m)', feedPort.depth, 0.05, (value) =>
        this.manager.updateFeedPort(feedPort.id, { depth: this.clampRange(value, 0.1, 2) })
      )
    );
    fields.appendChild(
      this.createNumberField('开口 (m)', feedPort.opening, 0.01, (value) =>
        this.manager.updateFeedPort(feedPort.id, { opening: this.clampRange(value, 0.01, 1) })
      )
    );
    panel.appendChild(fields);

    const remove = this.createDangerButton('移除投料口', () => {
      this.selected = null;
      this.manager.removeFeedPort(feedPort.id);
    });
    panel.appendChild(remove);
  }

  private createPlacementButton(label: string, mode: PlacementMode): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = this.placementMode === mode ? 'viewport-action active' : 'viewport-action';
    button.addEventListener('click', () => {
      this.placementMode = this.placementMode === mode ? 'none' : mode;
      if (this.placementMode !== 'none') {
        this.selected = null;
      }
      this.renderOverlay();
    });
    return button;
  }

  private createDangerButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'viewport-danger';
    button.textContent = label;
    button.addEventListener('click', () => {
      onClick();
      this.renderOverlay();
    });
    return button;
  }

  private createNumberField(label: string, value: number, step: number, onChange: (value: number) => void): HTMLElement {
    const wrapper = document.createElement('label');
    wrapper.className = 'viewport-field';

    const title = document.createElement('span');
    title.textContent = label;
    wrapper.appendChild(title);

    const input = document.createElement('input');
    input.type = 'number';
    input.step = String(step);
    input.value = Number.isInteger(step) ? String(Math.round(value)) : value.toFixed(2);
    input.addEventListener('change', () => {
      const parsed = Number(input.value);
      if (!Number.isFinite(parsed)) {
        return;
      }
      onChange(parsed);
    });
    wrapper.appendChild(input);
    return wrapper;
  }

  private clampRange(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }
    return Math.min(Math.max(value, min), max);
  }

  private clampWithin(value: number, limit: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.min(Math.max(value, -limit), limit);
  }

  private commitPlacement(): void {
    if (!this.lastSnapshot || this.placementMode === 'none') {
      return;
    }
    const extents = this.computeExtents(this.lastSnapshot.configuration.sections);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(plane, point);
    if (!hit) {
      this.placementMode = 'none';
      this.renderOverlay();
      return;
    }
    const clampedX = this.clampWithin(point.x, extents.length / 2);
    const clampedZ = this.clampWithin(point.z, extents.width / 2);
    const baseId = this.randomId(this.placementMode);

    if (this.placementMode === 'burner') {
      const direction = point.z >= 0 ? 1 : -1;
      const burner: FurnaceBurner = {
        id: baseId,
        label: `燃枪 ${baseId.slice(-4)}`,
        position: { x: clampedX, y: Math.max(0.8, extents.depth * 0.65), z: direction * (extents.width / 2 + 0.4) },
        length: 1.2,
        tilt: 10,
        diameter: 0.18,
      };
      this.manager.addBurner(burner);
    } else if (this.placementMode === 'electrode') {
      const electrode: FurnaceElectrode = {
        id: baseId,
        label: `电极 ${baseId.slice(-4)}`,
        position: { x: clampedX, y: Math.max(0.6, extents.depth * 0.55), z: clampedZ },
        length: Math.max(1.2, extents.depth * 0.9),
        diameter: 0.22,
        voltage: this.lastSnapshot.state.electrodeVoltage,
        current: this.lastSnapshot.state.electrodeCurrent,
      };
      this.manager.addElectrode(electrode);
    } else if (this.placementMode === 'feedPort') {
      const feedPort: FurnaceFeedPort = {
        id: baseId,
        label: `投料口 ${baseId.slice(-4)}`,
        position: { x: clampedX, y: extents.depth + 0.35, z: clampedZ },
        width: this.lastSnapshot.state.feedPortSize,
        height: 0.6,
        depth: 0.5,
        opening: 0.25,
      };
      this.manager.addFeedPort(feedPort);
    }
    this.placementMode = 'none';
    this.renderOverlay();
  }

  private randomId(prefix: PlacementMode): string {
    const random = Math.floor(Math.random() * 1000000);
    return `${prefix}-${Date.now().toString(36)}-${random.toString(36)}`;
  }

  private reframeCamera(configuration: FurnaceConfiguration): void {
    const extents = this.computeExtents(configuration.sections);
    const maxDimension = Math.max(extents.length, extents.width);
    const distance = Math.max(16, maxDimension * 1.2);
    this.camera.position.set(distance, Math.max(extents.depth * 1.6, 12), distance);
    this.controls.target.set(0, Math.max(1.2, extents.depth / 2), 0);
    this.controls.update();
  }
}
