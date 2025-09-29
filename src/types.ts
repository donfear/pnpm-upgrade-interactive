export interface PackageInfo {
  name: string;
  currentVersion: string; // Raw version specifier from package.json (with ^/~ prefixes)
  rangeVersion: string;  // Version that satisfies current range
  latestVersion: string; // Absolute latest version
  type: 'dependencies' | 'devDependencies' | 'optionalDependencies';
  packageJsonPath: string; // Path to the package.json file
  isOutdated: boolean;
  hasRangeUpdate: boolean; // If range version is different from current
  hasMajorUpdate: boolean; // If latest version is a major update
}

export interface PackageUpgradeChoice {
  name: string;
  packageJsonPath: string; // Path to the package.json file to upgrade
  upgradeType: 'none' | 'range' | 'latest';
  targetVersion: string;
  currentVersionSpecifier: string; // Original version specifier with prefix
}

export interface PackageSelectionState {
  name: string;
  packageJsonPath: string; // Primary path to the package.json file (for display)
  packageJsonPaths?: string[]; // All package.json paths where this package appears
  currentVersionSpecifier: string; // Original version specifier with prefix
  currentVersion: string;
  rangeVersion: string;
  latestVersion: string;
  selectedOption: 'none' | 'range' | 'latest';
  hasRangeUpdate: boolean;
  hasMajorUpdate: boolean;
}

export interface UpgradeOptions {
  packages: string[];
  dev?: boolean;
  optional?: boolean;
}

export interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  [key: string]: any;
}
