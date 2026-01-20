import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

interface AppConfig {
  nodePath?: string;
  npxPath?: string;
  lastPort?: number;
}

export class ConfigManager {
  private configPath: string;
  private config: AppConfig = {};

  constructor() {
    const userDataPath = app.getPath('userData');
    this.configPath = path.join(userDataPath, 'config.json');
    this.load();
  }

  private load(): void {
    try {
      if (existsSync(this.configPath)) {
        const data = readFileSync(this.configPath, 'utf-8');
        this.config = JSON.parse(data);
      }
    } catch (error) {
      console.warn('Failed to load config:', error);
      this.config = {};
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  getNodePath(): string | undefined {
    return this.config.nodePath;
  }

  setNodePath(nodePath: string): void {
    this.config.nodePath = nodePath;
    this.save();
  }

  getNpxPath(): string | undefined {
    return this.config.npxPath;
  }

  setNpxPath(npxPath: string): void {
    this.config.npxPath = npxPath;
    this.save();
  }

  setPaths(nodePath: string, npxPath: string): void {
    this.config.nodePath = nodePath;
    this.config.npxPath = npxPath;
    this.save();
  }

  getLastPort(): number | undefined {
    return this.config.lastPort;
  }

  setLastPort(port: number): void {
    this.config.lastPort = port;
    this.save();
  }
}
