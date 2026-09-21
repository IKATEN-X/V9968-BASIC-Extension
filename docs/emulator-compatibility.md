# Emulator compatibility follow-up (2026-09-21)

This follow-up is separate from the duplicate INIT defect fixed in
[the startup investigation](rom-boot-investigation.md).

## Catapult / installed openMSX

The user reported `Illegal function call in 10` before the demo menu.
The installed and project-local openMSX executables have the same SHA256:
`B5DE3932C0E486002C2CA1FB0D858AD27FC10E97BC5A6B1B277F988F7B7454B9`.

However, the installed machine definition named
`Panasonic_FS-A1ST(V9968).xml` still selected V9958, 128KB VRAM and the old I/O
port counts. A machine's filename does not select the VDP implementation.
MENU.BAS line 10 invokes `_SCREEN(0)`, which checks the V9968 ID before mutation;
rejecting the V9958 with ERR=5 is expected.

Writing the Program Files copy was denied by Windows before any modification.
With scoped permission, a corrected definition was instead added at:
`D:/Users/k-kai/Documents/openMSX/share/machines/Panasonic_FS-A1ST(V9968).xml`.
It selects V9968, 256KB, five input/output ports starting at 98h, and timing 0,
matching the tested local machine. No pre-existing user definition was replaced.
The installed copy and emulator binary were not changed.

A separate headless process used the installed executable, installed system
data, actual user machine/BIOS search directory and isolated writable state.
It reported `type VDP version V9968` and 262144 physical VRAM bytes, booted the
DSK menu, ran rotation with COPY returns increasing from 115 to 137 over two
emulated seconds, wrote nonzero VRAM and returned to the menu on Escape.
This validates machine selection and command execution, not a GUI screenshot.
An already running machine must be relaunched to pick up the new definition.

## blueMSX+

The user reports that the menu appears but all selected demos fail. The selected
machine config already specifies V9968 and 256KB. Public source comparison found
substantial register differences from this ROM's tested openMSX target:

| Field | This ROM / pinned openMSX | blueMSX+ public experimental branch |
|---|---|---|
| R#20 bit5 | ECOM, extended commands | FIL, flat interlace |
| R#20 bit6 | EVR, extended VRAM | Command-end interrupt enable |
| R#21 bit6 | FIL | Masked out by the register write mask |
| Command/VRAM extension gating | ECOM/EVR | Native mode selected by R#21 bit0 |

The ROM initializes R#20 to 71h (preserving other bits for `_V9968`), so the
examined blueMSX+ source would enable flat interlace and command-end interrupts
instead of ECOM/EVR. This is a concrete source-level incompatibility capable of
affecting normal demo drawing. It is not a mapper or DSK packaging issue.

Sources pinned for reproducibility:
- [blueMSX+ VDP.c, 7f7a257](https://github.com/Hesoten/blueMSX-plus/blob/7f7a2572604dcd3dc82ba4cc7a8b7f6c9b3a9d92/blueMSX/Src/VideoChips/VDP.c):
  native mode line 162; FIL line 188; R#21 mask lines 226-234; extension gating
  lines 577-587; command-end interrupt lines 1894-1904.
- [openMSX VDP.hh, d884c4b](https://github.com/buppu3/openMSX/blob/d884c4b/src/video/VDP.hh):
  `isECOM`, `isEVR`, `isFIL`.
- [ROM initialization](../src/vdp.asm): `enable_v9968`, `cmd_screen`.

The installed blueMSX+ 3.1.1 executable has SHA256
`9DF06B5E20C3A5BDC0C0D066EF1E4E1909F74B6B20523F150BEDE866133BD6BB`.
Its exact build-to-commit relationship is unverified. The source comparison
therefore does not prove the precise execution path of every observed failure.
No blueMSX+ binary, implementation or user config was modified, no emulator-
specific ROM workaround was added, and working blueMSX+ demo compatibility is
not claimed. Reconcile these register meanings with the authors before porting
or attributing all symptoms to one defect. Font/kanji development remains paused.
