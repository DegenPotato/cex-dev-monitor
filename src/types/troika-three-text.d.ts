// Type declarations for troika-three-text
declare module 'troika-three-text' {
  import { Object3D } from 'three';
  
  export class Text extends Object3D {
    text: string;
    fontSize: number;
    color: number | string;
    anchorX: 'left' | 'center' | 'right' | number;
    anchorY: 'top' | 'top-baseline' | 'middle' | 'bottom-baseline' | 'bottom' | number;
    maxWidth: number;
    lineHeight: number;
    letterSpacing: number;
    textAlign: 'left' | 'center' | 'right' | 'justify';
    font: string | null;
    material: any;
    outlineWidth: number | string;
    outlineColor: number | string;
    outlineOpacity: number;
    outlineBlur: number | string;
    strokeWidth: number | string;
    strokeColor: number | string;
    strokeOpacity: number;
    fillOpacity: number;
    depthOffset: number;
    clipRect: [number, number, number, number] | null;
    curveRadius: number;
    glyphGeometryDetail: number;
    sdfGlyphSize: number;
    sync(): void;
    dispose(): void;
  }
  
  export function preloadFont(
    font: string,
    text?: string,
    callback?: () => void
  ): void;
}
