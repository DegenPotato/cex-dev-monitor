/**
 * Solar System VR & Voice Control Service
 * Implements WebXR and Voice Commands for minimal-typing interaction
 */

import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';

// Import Text as any type for now (troika-three-text doesn't have types)
import { Text } from 'troika-three-text';

// Type declarations
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => ISpeechRecognition;
    webkitSpeechRecognition: new () => ISpeechRecognition;
  }
}

// ============================================
// VR MANAGER
// ============================================

export interface VRConfig {
  enableTeleportation: boolean;
  enableHandTracking: boolean;
  enableVoiceCommands: boolean;
  enableHaptics: boolean;
}

export class VRSolarSystem {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private controllers: THREE.Group[] = [];
  private controllerGrips: THREE.Group[] = [];
  private raycaster = new THREE.Raycaster();
  private tempMatrix = new THREE.Matrix4();
  private teleportMarker?: THREE.Mesh;
  private selectedObject: THREE.Object3D | null = null;
  private vrButton?: HTMLElement;
  
  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    private config: VRConfig = {
      enableTeleportation: true,
      enableHandTracking: true,
      enableVoiceCommands: true,
      enableHaptics: true
    }
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
  }
  
  async enableVR(): Promise<boolean> {
    if (!('xr' in navigator)) {
      console.warn('WebXR not available');
      return false;
    }
    
    try {
      // Check VR support
      const isVRSupported = await navigator.xr?.isSessionSupported('immersive-vr');
      
      if (!isVRSupported) {
        console.warn('VR not supported on this device');
        return false;
      }
      
      // Enable XR
      this.renderer.xr.enabled = true;
      
      // Add VR button
      this.vrButton = VRButton.createButton(this.renderer);
      document.body.appendChild(this.vrButton);
      
      // Setup controllers
      this.setupControllers();
      
      // Setup teleportation
      if (this.config.enableTeleportation) {
        this.setupTeleportation();
      }
      
      // Adjust render loop for VR
      this.renderer.setAnimationLoop(() => {
        this.update();
        this.renderer.render(this.scene, this.camera);
      });
      
      console.log('✅ VR enabled successfully');
      return true;
      
    } catch (error) {
      console.error('Failed to enable VR:', error);
      return false;
    }
  }
  
  private setupControllers() {
    const controllerModelFactory = new XRControllerModelFactory();
    
    for (let i = 0; i < 2; i++) {
      // Controller
      const controller = this.renderer.xr.getController(i);
      controller.addEventListener('selectstart', this.onSelectStart.bind(this));
      controller.addEventListener('selectend', this.onSelectEnd.bind(this));
      controller.addEventListener('squeeze', this.onSqueeze.bind(this));
      controller.addEventListener('connected', this.onControllerConnected.bind(this));
      controller.addEventListener('disconnected', this.onControllerDisconnected.bind(this));
      
      this.controllers.push(controller);
      this.scene.add(controller);
      
      // Controller grip (for hand models)
      const controllerGrip = this.renderer.xr.getControllerGrip(i);
      controllerGrip.add(controllerModelFactory.createControllerModel(controllerGrip));
      this.controllerGrips.push(controllerGrip);
      this.scene.add(controllerGrip);
      
      // Add laser pointer
      const laserGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1)
      ]);
      const laserMaterial = new THREE.LineBasicMaterial({
        color: 0x00ff00,
        linewidth: 2,
        transparent: true,
        opacity: 0.5
      });
      const laser = new THREE.Line(laserGeometry, laserMaterial);
      laser.name = 'laser';
      laser.scale.z = 10;
      controller.add(laser);
      
      // Add pointer indicator
      const pointerGeometry = new THREE.SphereGeometry(0.01, 8, 8);
      const pointerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
      const pointer = new THREE.Mesh(pointerGeometry, pointerMaterial);
      pointer.name = 'pointer';
      pointer.position.z = -1;
      controller.add(pointer);
    }
  }
  
  private setupTeleportation() {
    // Create teleport marker
    const markerGeometry = new THREE.RingGeometry(0.25, 0.3, 32);
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5
    });
    this.teleportMarker = new THREE.Mesh(markerGeometry, markerMaterial);
    this.teleportMarker.rotation.x = -Math.PI / 2;
    this.teleportMarker.visible = false;
    this.scene.add(this.teleportMarker);
  }
  
  private onControllerConnected(event: any) {
    const gamepad = event.data.gamepad;
    
    console.log('🎮 Controller connected:', gamepad?.id);
    
    // Trigger haptic feedback
    if (this.config.enableHaptics && gamepad?.hapticActuators?.length > 0) {
      gamepad.hapticActuators[0].pulse(0.5, 100);
    }
  }
  
  private onControllerDisconnected(_event: any) {
    console.log('🎮 Controller disconnected');
  }
  
  private onSelectStart(event: any) {
    const controller = event.target;
    const intersections = this.getIntersections(controller);
    
    if (intersections.length > 0) {
      const intersected = intersections[0];
      
      // Check if it's a planet
      if (intersected.object.userData.type === 'planet') {
        this.selectedObject = intersected.object;
        this.onPlanetSelected(intersected.object);
      }
      // Check if it's teleportable ground
      else if (intersected.object.userData.teleportable) {
        this.teleportToPosition(intersected.point);
      }
      
      // Haptic feedback
      this.triggerHaptics(controller, 0.3, 50);
    }
  }
  
  private onSelectEnd(_event: any) {
    this.selectedObject = null;
  }
  
  private onSqueeze(event: any) {
    const controller = event.target;
    
    // Use squeeze for teleportation
    if (this.config.enableTeleportation) {
      const intersections = this.getIntersections(controller);
      
      for (const intersect of intersections) {
        if (intersect.object.userData.teleportable !== false) {
          this.teleportToPosition(intersect.point);
          break;
        }
      }
    }
  }
  
  private getIntersections(controller: THREE.Group): THREE.Intersection[] {
    this.tempMatrix.identity().extractRotation(controller.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);
    
    return this.raycaster.intersectObjects(this.scene.children, true);
  }
  
  private teleportToPosition(position: THREE.Vector3) {
    if (!this.renderer.xr.isPresenting) return;
    
    const player = this.renderer.xr.getCamera();
    player.position.x = position.x;
    player.position.z = position.z;
    
    // Visual feedback
    if (this.teleportMarker) {
      this.teleportMarker.position.copy(position);
      this.teleportMarker.visible = true;
      
      setTimeout(() => {
        if (this.teleportMarker) {
          this.teleportMarker.visible = false;
        }
      }, 500);
    }
    
    console.log('🚀 Teleported to:', position);
  }
  
  private onPlanetSelected(planet: THREE.Object3D) {
    console.log('🪐 Planet selected:', planet.userData);
    
    // Create info panel
    this.createInfoPanel(planet);
    
    // Trigger haptic feedback
    this.controllers.forEach(controller => {
      this.triggerHaptics(controller, 0.5, 100);
    });
  }
  
  private triggerHaptics(controller: THREE.Group, intensity: number, duration: number) {
    if (!this.config.enableHaptics) return;
    
    const gamepad = (controller as any).gamepad;
    if (gamepad?.hapticActuators?.length > 0) {
      gamepad.hapticActuators[0].pulse(intensity, duration);
    }
  }
  
  private update() {
    // Update controller rays
    this.controllers.forEach(controller => {
      const laser = controller.getObjectByName('laser');
      const pointer = controller.getObjectByName('pointer');
      
      if (laser && pointer) {
        const intersections = this.getIntersections(controller);
        
        if (intersections.length > 0) {
          const intersection = intersections[0];
          pointer.position.z = -intersection.distance;
          
          // Change color on hover
          if (intersection.object.userData.interactive) {
            ((laser as THREE.Line).material as THREE.LineBasicMaterial).color.setHex(0x00ffff);
            ((pointer as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(0x00ffff);
          } else {
            ((laser as THREE.Line).material as THREE.LineBasicMaterial).color.setHex(0x00ff00);
            ((pointer as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(0x00ff00);
          }
        } else {
          pointer.position.z = -10;
        }
      }
    });
  }
  
  private createInfoPanel(object: THREE.Object3D) {
    // Create floating info panel
    const panel = new VRUIPanel(
      new THREE.Vector3(
        object.position.x + 2,
        object.position.y + 1,
        object.position.z
      ),
      object.userData
    );
    
    this.scene.add(panel.getPanel());
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      this.scene.remove(panel.getPanel());
    }, 5000);
  }
  
  isPresenting(): boolean {
    return this.renderer.xr.isPresenting;
  }
  
  getSelectedObject(): THREE.Object3D | null {
    return this.selectedObject;
  }
  
  dispose() {
    // Clean up VR resources
    this.controllers.forEach(controller => {
      this.scene.remove(controller);
    });
    
    this.controllerGrips.forEach(grip => {
      this.scene.remove(grip);
    });
    
    if (this.teleportMarker) {
      this.scene.remove(this.teleportMarker);
    }
    
    if (this.vrButton) {
      document.body.removeChild(this.vrButton);
    }
    
    this.renderer.xr.enabled = false;
  }
}

// ============================================
// VR UI PANELS
// ============================================

export class VRUIPanel {
  private panel: THREE.Group;
  private background: THREE.Mesh;
  private text?: any; // Using any for troika-three-text which lacks types
  
  constructor(position: THREE.Vector3, data: any) {
    this.panel = new THREE.Group();
    this.panel.position.copy(position);
    
    // Glass panel background
    const geometry = new THREE.PlaneGeometry(2, 1.5);
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.8,
      roughness: 0.1,
      metalness: 0.1,
      clearcoat: 1,
      side: THREE.DoubleSide
    });
    
    this.background = new THREE.Mesh(geometry, material);
    this.panel.add(this.background);
    
    // Add border glow
    const borderGeometry = new THREE.PlaneGeometry(2.1, 1.6);
    const borderMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide
    });
    const border = new THREE.Mesh(borderGeometry, borderMaterial);
    border.position.z = -0.01;
    this.panel.add(border);
    
    // Create text content
    this.createText(data);
  }
  
  private createText(data: any) {
    // Using Troika for 3D text
    this.text = new Text();
    
    this.text.text = `
${data.name || 'Unknown'}
━━━━━━━━━━━━━━━
👁 Viewers: ${data.viewerCount || 0}
💬 Activity: ${Math.round((data.chatActivity || 0) * 100)}%
🔴 Status: ${data.isLive ? 'LIVE' : 'OFFLINE'}
⭐ Featured: ${data.isFeatured ? 'YES' : 'NO'}
    `.trim();
    
    this.text.fontSize = 0.08;
    this.text.color = 0x00ffff;
    this.text.anchorX = 'center';
    this.text.anchorY = 'middle';
    this.text.position.z = 0.01;
    
    // Add glow effect
    this.text.outlineWidth = 0.002;
    this.text.outlineColor = 0x000088;
    
    this.text.sync();
    this.panel.add(this.text);
  }
  
  update(data: any) {
    if (this.text) {
      this.text.text = `
${data.name || 'Unknown'}
━━━━━━━━━━━━━━━
👁 Viewers: ${data.viewerCount || 0}
💬 Activity: ${Math.round((data.chatActivity || 0) * 100)}%
🔴 Status: ${data.isLive ? 'LIVE' : 'OFFLINE'}
⭐ Featured: ${data.isFeatured ? 'YES' : 'NO'}
      `.trim();
      
      this.text.sync();
    }
  }
  
  getPanel(): THREE.Group {
    return this.panel;
  }
}

// ============================================
// VOICE COMMANDS
// ============================================

export interface VoiceCommand {
  phrases: string[];
  action: () => void;
  description: string;
}

export class VoiceCommander {
  private recognition: ISpeechRecognition | null = null;
  private commands = new Map<string, VoiceCommand>();
  private isListening = false;
  private onCommandCallback?: (command: string) => void;
  private feedbackElement?: HTMLElement;
  
  constructor() {
    // Check for browser support
    const SpeechRecognition = window.SpeechRecognition || 
                              window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported');
      return;
    }
    
    this.recognition = new SpeechRecognition();
    if (this.recognition) {
      this.recognition.continuous = true;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';
    }
    
    this.setupDefaultCommands();
    this.setupEventHandlers();
    this.createFeedbackUI();
  }
  
  private setupDefaultCommands() {
    // Navigation commands
    this.addCommand({
      phrases: ['go to earth', 'show earth', 'focus earth'],
      action: () => this.executeAction('focus', 'earth'),
      description: 'Focus on Earth planet'
    });
    
    this.addCommand({
      phrases: ['go to mars', 'show mars', 'focus mars'],
      action: () => this.executeAction('focus', 'mars'),
      description: 'Focus on Mars planet'
    });
    
    this.addCommand({
      phrases: ['go to jupiter', 'show jupiter', 'focus jupiter'],
      action: () => this.executeAction('focus', 'jupiter'),
      description: 'Focus on Jupiter planet'
    });
    
    // UI commands
    this.addCommand({
      phrases: ['show dashboard', 'open dashboard', 'dashboard'],
      action: () => this.executeAction('ui', 'show_dashboard'),
      description: 'Show dashboard panel'
    });
    
    this.addCommand({
      phrases: ['hide dashboard', 'close dashboard'],
      action: () => this.executeAction('ui', 'hide_dashboard'),
      description: 'Hide dashboard panel'
    });
    
    this.addCommand({
      phrases: ['show stats', 'statistics', 'metrics'],
      action: () => this.executeAction('ui', 'show_stats'),
      description: 'Show statistics'
    });
    
    // Action commands
    this.addCommand({
      phrases: ['launch comet', 'send super chat', 'fire comet'],
      action: () => this.executeAction('action', 'launch_comet'),
      description: 'Launch a demo comet'
    });
    
    this.addCommand({
      phrases: ['enter planet', 'join channel', 'connect'],
      action: () => this.executeAction('action', 'enter_planet'),
      description: 'Enter selected planet'
    });
    
    this.addCommand({
      phrases: ['exit planet', 'leave channel', 'disconnect'],
      action: () => this.executeAction('action', 'exit_planet'),
      description: 'Exit current planet'
    });
    
    // View commands
    this.addCommand({
      phrases: ['overview', 'show all', 'zoom out'],
      action: () => this.executeAction('view', 'overview'),
      description: 'Overview mode'
    });
    
    this.addCommand({
      phrases: ['first person', 'fps mode', 'immersive'],
      action: () => this.executeAction('view', 'first_person'),
      description: 'First person view'
    });
    
    // System commands
    this.addCommand({
      phrases: ['help', 'show commands', 'what can you do'],
      action: () => this.showHelp(),
      description: 'Show available commands'
    });
    
    this.addCommand({
      phrases: ['stop listening', 'pause voice', 'mute'],
      action: () => this.stop(),
      description: 'Stop voice recognition'
    });
  }
  
  private setupEventHandlers() {
    if (!this.recognition) return;
    
    this.recognition.onresult = (event) => {
      const lastResult = event.results[event.results.length - 1];
      const transcript = lastResult[0].transcript.toLowerCase().trim();
      
      console.log('🎙️ Heard:', transcript);
      this.processCommand(transcript);
    };
    
    this.recognition.onerror = (event) => {
      console.error('Voice recognition error:', event.error);
      
      if (event.error === 'no-speech') {
        // Restart recognition
        this.restart();
      }
    };
    
    this.recognition.onend = () => {
      if (this.isListening) {
        // Restart if it stopped unexpectedly
        this.restart();
      }
    };
  }
  
  private createFeedbackUI() {
    this.feedbackElement = document.createElement('div');
    this.feedbackElement.id = 'voice-feedback';
    this.feedbackElement.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 10px 20px;
      background: rgba(0, 255, 255, 0.1);
      border: 1px solid #00ffff;
      border-radius: 5px;
      color: #00ffff;
      font-family: monospace;
      font-size: 14px;
      z-index: 10000;
      display: none;
      backdrop-filter: blur(10px);
    `;
    document.body.appendChild(this.feedbackElement);
  }
  
  private showFeedback(text: string, duration: number = 2000) {
    if (!this.feedbackElement) return;
    
    this.feedbackElement.textContent = text;
    this.feedbackElement.style.display = 'block';
    
    setTimeout(() => {
      if (this.feedbackElement) {
        this.feedbackElement.style.display = 'none';
      }
    }, duration);
  }
  
  private processCommand(transcript: string) {
    let matched = false;
    
    // Check each command
    for (const [key, command] of this.commands) {
      for (const phrase of command.phrases) {
        if (transcript.includes(phrase)) {
          console.log(`✅ Matched command: ${key}`);
          this.showFeedback(`Command: ${key}`);
          command.action();
          matched = true;
          
          // Trigger callback
          if (this.onCommandCallback) {
            this.onCommandCallback(key);
          }
          
          break;
        }
      }
      
      if (matched) break;
    }
    
    if (!matched) {
      console.log('❓ No matching command');
      this.showFeedback('Command not recognized', 1000);
    }
  }
  
  private executeAction(category: string, action: string) {
    console.log(`🎯 Execute: ${category}/${action}`);
    
    // This would trigger actual scene actions
    // For now, just log
    const event = new CustomEvent('voiceCommand', {
      detail: { category, action }
    });
    window.dispatchEvent(event);
  }
  
  private showHelp() {
    const helpText = Array.from(this.commands.entries())
      .map(([key, cmd]) => `${key}: "${cmd.phrases[0]}"`)
      .join('\n');
    
    console.log('📚 Available voice commands:\n' + helpText);
    this.showFeedback('Check console for commands', 3000);
  }
  
  addCommand(command: VoiceCommand) {
    const key = command.phrases[0].replace(/\s+/g, '_');
    this.commands.set(key, command);
  }
  
  start() {
    if (!this.recognition) {
      console.warn('Voice recognition not available');
      return false;
    }
    
    this.isListening = true;
    this.recognition.start();
    console.log('🎤 Voice commands activated');
    this.showFeedback('🎤 Listening...', 1500);
    
    return true;
  }
  
  stop() {
    if (!this.recognition) return;
    
    this.isListening = false;
    this.recognition.stop();
    console.log('🔇 Voice commands deactivated');
    this.showFeedback('🔇 Stopped', 1500);
  }
  
  private restart() {
    if (!this.isListening) return;
    
    setTimeout(() => {
      if (this.recognition && this.isListening) {
        try {
          this.recognition.start();
        } catch (e) {
          // Already started
        }
      }
    }, 500);
  }
  
  onCommand(callback: (command: string) => void) {
    this.onCommandCallback = callback;
  }
  
  dispose() {
    this.stop();
    
    if (this.feedbackElement) {
      document.body.removeChild(this.feedbackElement);
    }
  }
}

// ============================================
// EXPORTS
// ============================================

export default {
  VRSolarSystem,
  VRUIPanel,
  VoiceCommander
};
