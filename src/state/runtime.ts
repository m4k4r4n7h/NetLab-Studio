import type { Project } from '../types';
import { NetworkSimulator } from '../engine/core/NetworkSimulator';

let simulator: NetworkSimulator | null = null;
let boundProject: Project | null = null;

export function syncSimulator(project: Project): void {
  if (!simulator) {
    simulator = new NetworkSimulator(project);
    boundProject = project;
    return;
  }
  if (boundProject === project) return;
  simulator.sync(project);
  boundProject = project;
}

export function getSimulator(): NetworkSimulator {
  if (!simulator) {
    throw new Error('The simulation engine has not been initialized.');
  }
  return simulator;
}

export function resetSimulator(project: Project): void {
  simulator = new NetworkSimulator(project);
  boundProject = project;
}
