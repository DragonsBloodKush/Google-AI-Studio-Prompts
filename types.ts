export type AspectRatio = '9:16' | '16:9' | '3:4' | '1:1';

export interface VideoDimensions {
  width: number;
  height: number;
  label: string;
}

export const ASPECT_RATIOS: Record<AspectRatio, VideoDimensions> = {
  '9:16': { width: 720, height: 1280, label: 'Portrait Story' },
  '16:9': { width: 1280, height: 720, label: 'Landscape' },
  '3:4': { width: 960, height: 1280, label: 'Classic Portrait' },
  '1:1': { width: 1080, height: 1080, label: 'Square' },
};

export type AppMode = 'setup' | 'recording' | 'review';

export interface AIConfig {
  mode: 'audio' | 'text' | 'off';
}
