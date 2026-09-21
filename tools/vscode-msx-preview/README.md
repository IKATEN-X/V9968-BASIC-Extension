# MSX Image Preview for VS Code

A dependency-free, read-only custom editor for MSX `SCREEN 2` (`.SC2`) and
`SCREEN 5` (`.SC5`) files. It accepts raw VRAM data and standard 7-byte
`BSAVE` files beginning with `FE`.

## Install

Run the following command once from the repository root, then reload VS Code:

```powershell
code --install-extension .\tools\vscode-msx-preview\msx-image-preview-0.1.1.vsix --force
```

After installation, ordinary VS Code windows preview `.SC2` and `.SC5`
files directly. The development steps below are not needed.

## Run from this repository

1. Open `tools/vscode-msx-preview` in a new VS Code window.
2. Press `F5` and choose **VS Code Extension Development Host** if prompted.
3. Open an `.SC2` or `.SC5` file in the development-host window.

If another editor is already associated with the extension, use
**Reopen Editor With... > MSX Image Preview** from the editor tab's context
menu. You can also right-click an SC2/SC5 file and select
**Open MSX Image Preview**, or run that command from the Command Palette.

SCREEN 5 uses the standard MSX2 palette initially. **Palette...** accepts a
text palette containing one `index, red, green, blue` entry per line. Component
values may be either 0–31 or 0–255; this also accepts this project's
`PALETTE.DAT` (including its leading color count) and `SHOOT.PAL` formats. The
selected palette remains active for that editor during the current VS Code
session.

The SCREEN 2 preview renders the bitmap tables and does not currently overlay
hardware sprites.

## Test

```powershell
npm test
```
