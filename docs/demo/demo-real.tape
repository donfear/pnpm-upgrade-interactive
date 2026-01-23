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

# Wait for the tool to scan and fetch package updates (reduced from 5s)
Sleep 3s

# Use 'M' to select all minor updates
Type "m"
Sleep 1s

# Navigate down 2 packages
Down
Sleep 400ms
Down
Sleep 400ms

# Select major version for this package (right arrow)
Right
Sleep 600ms

# Navigate down 1 package (leave with minor selection from M)
Down
Sleep 400ms

# Navigate down 1 more package
Down
Sleep 400ms

# Go left to current version (unselect this one)
Left
Sleep 600ms

# Quick pause to show final selections
Sleep 1.5s

# Press Enter to confirm selections
Enter
Sleep 500ms

# Press Enter again to confirm installation
Enter

# Wait for pnpm install to complete (reduced from 5s)
Sleep 3s
