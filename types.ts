
export type AspectRatio = '9:16' | '16:9' | '3:4' | '1:1';

export type Personality = 'formal' | 'playful' | 'inquisitive' | 'investigator';

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
  personality: Personality;
}

export interface TranscriptEntry {
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
}

export interface CrewMember {
  id: string;
  name: string;
  role: string;
}

export interface DigitalSignature {
  signerName: string;
  signedAt: number;
  isLocked: boolean;
}

export interface SavedTranscript {
  id: string;
  timestamp: number;
  entries: TranscriptEntry[];
  preview: string;
  crewManifest?: CrewMember[];
  isIncidentMode?: boolean;
  signature?: DigitalSignature;
}

// Logic Tree Types
export interface LogicQuestion {
  id: string;
  text: string;
  type: 'boolean' | 'text' | 'number' | 'currency' | 'select';
  options?: string[]; // For select type
  units?: string;
  placeholder?: string;
  compliance_tag?: string;
  follow_up?: {
    trigger_response: boolean | string;
    questions: LogicQuestion[];
  };
  alternate_follow_up?: {
    trigger_response: boolean | string;
    questions: LogicQuestion[];
  };
  nested_logic?: Record<string, LogicQuestion[]>;
}

export interface LogicSection {
  id: string;
  title: string;
  questions: LogicQuestion[];
}

export interface LogicTreeSchema {
  version: string;
  sections: LogicSection[];
}

export interface WeatherData {
  temperature: number;
  windSpeed: number;
  condition: string;
  unit: string;
  location: string;
}
