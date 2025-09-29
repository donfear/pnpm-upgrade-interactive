import ora from 'ora';
import chalk from 'chalk';
import { existsSync, writeFileSync } from 'fs';
import { PackageInfo, UpgradeOptions, PackageUpgradeChoice } from './types';
import { executeCommand, findWorkspaceRoot, readPackageJson } from './utils';

export class PackageUpgrader {
  public async upgradePackages(
    choices: PackageUpgradeChoice[],
    packageInfos: PackageInfo[]
  ): Promise<void> {
    if (choices.length === 0) {
      console.log(chalk.yellow('No packages to upgrade.'));
      return;
    }

    // Group choices by package.json path and dependency type
    const choicesByFileAndType = this.groupChoicesByFileAndType(choices, packageInfos);

    for (const [fileAndType, choiceList] of Object.entries(choicesByFileAndType)) {
      if (choiceList.length === 0) continue;

      const [packageJsonPath, type] = fileAndType.split('|');
      console.log(`Processing ${type} in ${packageJsonPath}`);
      await this.upgradeChoiceGroup(choiceList, packageJsonPath, type as any);
    }

    // Count unique packages upgraded
    const uniquePackages = new Set(choices.map(c => c.name));
    console.log(chalk.green(`\n✅ Successfully upgraded ${uniquePackages.size} package(s)!`));
  }

  private groupChoicesByFileAndType(
    choices: PackageUpgradeChoice[],
    packageInfos: PackageInfo[]
  ): Record<string, PackageUpgradeChoice[]> {
    const groups: Record<string, PackageUpgradeChoice[]> = {};

    choices.forEach(choice => {
      const info = packageInfos.find(p => p.name === choice.name && p.packageJsonPath === choice.packageJsonPath);
      if (info) {
        const key = `${choice.packageJsonPath}|${info.type}`;
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(choice);
      }
    });

    return groups;
  }

  private async upgradeChoiceGroup(
    choices: PackageUpgradeChoice[],
    packageJsonPath: string,
    type: 'dependencies' | 'devDependencies' | 'optionalDependencies'
  ): Promise<void> {
    // Validate that package.json exists
    if (!existsSync(packageJsonPath)) {
      console.warn(chalk.yellow(`⚠️  Skipping ${type} in ${packageJsonPath} - package.json file not found`));
      return;
    }

    const packageDir = packageJsonPath.replace('/package.json', '');
    const spinner = ora(`Upgrading ${type} in ${packageDir}...`).start();

    try {
      // Read the current package.json
      const packageJson = readPackageJson(packageJsonPath);

      // Find workspace root
      const workspaceRoot = findWorkspaceRoot(packageDir);
      const isWorkspaceRoot = packageDir === workspaceRoot;

      // Group by upgrade type (range vs latest)
      const rangeChoices = choices.filter(c => c.upgradeType === 'range');
      const latestChoices = choices.filter(c => c.upgradeType === 'latest');

      let modified = false;

      // Upgrade range versions by directly modifying package.json
      if (rangeChoices.length > 0) {
        if (!packageJson[type]) {
          packageJson[type] = {};
        }

        rangeChoices.forEach(choice => {
          packageJson[type]![choice.name] = choice.targetVersion;
          modified = true;
        });
      }

      // Upgrade to latest versions by directly modifying package.json
      if (latestChoices.length > 0) {
        if (!packageJson[type]) {
          packageJson[type] = {};
        }

        latestChoices.forEach(choice => {
          packageJson[type]![choice.name] = choice.targetVersion;
          modified = true;
        });
      }

      // Write back the modified package.json
      if (modified) {
        writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
        spinner.text = `Updated package.json for ${choices.length} ${type}`;
      }

      // Update workspace lockfile after modifying package.json
      if (modified && workspaceRoot) {
        spinner.text = 'Updating workspace lockfile...';
        executeCommand('pnpm install', workspaceRoot);
      }

      spinner.succeed(`Upgraded ${choices.length} ${type} in ${packageDir}`);

      // Show which packages were upgraded
      choices.forEach(choice => {
        const upgradeTypeColor = choice.upgradeType === 'range' ? chalk.yellow : chalk.red;
        console.log(`  ${chalk.green('✓')} ${chalk.cyan(choice.name)} → ${upgradeTypeColor(choice.targetVersion)}`);
      });

    } catch (error) {
      spinner.fail(`Failed to upgrade ${type} in ${packageDir}`);
      console.error(chalk.red(`Error: ${error}`));
      throw error;
    }
  }

  public async upgradeAll(packageInfos: PackageInfo[]): Promise<void> {
    const outdatedPackages = packageInfos
      .filter(p => p.isOutdated)
      .map(p => p.name);

    if (outdatedPackages.length === 0) {
      console.log(chalk.green('✅ All packages are already up to date!'));
      return;
    }

    const spinner = ora('Upgrading all outdated packages...').start();

    try {
      // Find workspace root for running pnpm update
      const workspaceRoot = findWorkspaceRoot(process.cwd()) || process.cwd();
      executeCommand('pnpm update', workspaceRoot);
      spinner.succeed(`Upgraded all ${outdatedPackages.length} outdated packages!`);
    } catch (error) {
      spinner.fail('Failed to upgrade packages');
      throw error;
    }
  }
}
