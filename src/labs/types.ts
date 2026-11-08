import type { Project } from '../types';
import type { LabValidation } from './builders';

export type LabDifficulty = 'Beginner' | 'Intermediate' | 'Advanced';

export interface GuidedLab {
  id: string;
  title: string;
  difficulty: LabDifficulty;
  summary: string;
  steps: string[];
  hints: string[];
  build: () => Project;
  validate: (project: Project) => LabValidation;
}

export interface TopologyTemplate {
  id: string;
  title: string;
  description: string;
  build: () => Project;
}

export interface NetworkChallenge {
  id: string;
  title: string;
  difficulty: LabDifficulty;
  brief: string;
  symptoms: string[];
  hints: string[];
  build: () => Project;
  validate: (project: Project) => LabValidation;
}
