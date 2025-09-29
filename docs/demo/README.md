# Demo

This folder contains a VHS demo script that showcases pnpm-upgrade-interactive, an interactive upgrade tool for pnpm projects.

## 🎬 **Interactive Upgrade Demo**

The demo shows how to use `npx pnpm-upgrade-interactive` to interactively upgrade outdated packages in your project.

## 🚀 **Quick Recording**

Use the automated script to record the demo:

```bash
# From the project root
./docs/demo/record-demo.sh
```

This script will:
- ✅ Check VHS installation
- 🎬 Record the demo from the example directory
- 📁 Save GIF in the proper location
- 📊 Provide a recording summary

## 🛠️ **Manual Recording**

Make sure you have [VHS](https://github.com/charmbracelet/vhs) installed:

```bash
brew install vhs
```

Record the demo:
```bash
cd example  # Important: record from example directory!
vhs ../docs/demo/interactive-upgrade.tape
```

## 📝 **Using in Documentation**

Add to your README with:
```markdown
![Interactive Upgrade Demo](docs/demo/interactive-upgrade.gif)
```

## 🎨 **Customizing**

- **Theme**: Change `Set Theme "Dracula"` to your preferred theme
- **Speed**: Adjust `Set PlaybackSpeed` (1.0-3.0)
- **Size**: Modify `Set Width` and `Set Height`
- **Timing**: Adjust `Sleep` values for pacing

## 📦 **Example Project**

The demo uses the `example/package.json` which includes several outdated packages that can be interactively upgraded:
- `lodash`: ^4.17.15 (has newer versions available)
- `express`: ^4.17.1 (has newer versions available)
- `axios`: ^0.30.2 (has newer versions available)
- `@babel/core`: ^7.10.0 (has newer versions available)
- `@vue/cli`: ^4.5.0 (has newer versions available)
- And more packages with available updates 