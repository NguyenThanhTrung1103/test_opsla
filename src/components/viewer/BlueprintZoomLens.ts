/**
 * Oops La Book Store — Blueprint Zoom Lens Utility
 * Interactive pan & zoom state calculator for 1:20 architectural drawings.
 */

export interface ZoomTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

export class BlueprintZoomLens {
  private scale = 1.0;
  private translateX = 0;
  private translateY = 0;
  private minScale = 1.0;
  private maxScale = 4.0; // 4x magnification for 1:20 technical drawing details

  constructor(minScale = 1.0, maxScale = 4.0) {
    this.minScale = minScale;
    this.maxScale = maxScale;
  }

  public zoomIn(factor = 1.5): ZoomTransform {
    this.scale = Math.min(this.maxScale, this.scale * factor);
    return this.getTransform();
  }

  public zoomOut(factor = 1.5): ZoomTransform {
    this.scale = Math.max(this.minScale, this.scale / factor);
    if (this.scale === this.minScale) {
      this.resetPan();
    }
    return this.getTransform();
  }

  public setScale(newScale: number): ZoomTransform {
    this.scale = Math.max(this.minScale, Math.min(this.maxScale, newScale));
    if (this.scale === this.minScale) {
      this.resetPan();
    }
    return this.getTransform();
  }

  public pan(deltaX: number, deltaY: number): ZoomTransform {
    if (this.scale > 1.0) {
      this.translateX += deltaX;
      this.translateY += deltaY;
    }
    return this.getTransform();
  }

  public reset(): ZoomTransform {
    this.scale = 1.0;
    this.resetPan();
    return this.getTransform();
  }

  public resetPan(): void {
    this.translateX = 0;
    this.translateY = 0;
  }

  public getTransform(): ZoomTransform {
    return {
      scale: parseFloat(this.scale.toFixed(2)),
      translateX: Math.round(this.translateX),
      translateY: Math.round(this.translateY)
    };
  }

  public getCssTransformString(): string {
    return `transform: translate3d(${this.translateX}px, ${this.translateY}px, 0px) scale(${this.scale});`;
  }
}
