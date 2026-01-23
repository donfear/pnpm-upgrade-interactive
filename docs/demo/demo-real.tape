Output docs/demo/interactive-upgrade.gif

Set Shell zsh
Set FontSize 14
Set Width 1400
Set Height 800
Set PlaybackSpeed 1.0
Set Theme "Catppuccin Mocha"

# Change to clean temp directory (hidden from view)
Hide
Type "cd /tmp/my-app"
Enter
Type "clear"
Enter
Show

# Run pnpm-upgrade-interactive
Type "pnpm-upgrade-interactive"
Enter

# Wait for the tool to scan and fetch package updates
Sleep 5s

# Navigate down through the list to show multiple packages
Down
Sleep 800ms
Down
Sleep 800ms
Down
Sleep 800ms

# Use 'M' to select all minor updates
Type "m"
Sleep 1.5s

# Navigate to show the selections
Up
Sleep 600ms
Up
Sleep 600ms
Down
Sleep 600ms

# Use right arrow to upgrade one package to latest major version
Right
Sleep 800ms
Right
Sleep 800ms

# Navigate down to show more packages
Down
Sleep 600ms
Down
Sleep 600ms

# Wait to show the final selections
Sleep 2.5s

# Press Enter to confirm selections
Enter
Sleep 1s

# Press Enter again to confirm installation
Enter

# Wait for pnpm install to complete
Sleep 5s
