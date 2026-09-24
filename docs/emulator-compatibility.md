# Emulator compatibility

## Current target (2026-09-23)

The ROM and setup script now target buppu3 openMSX **c620b69**, with the
machine VDP version set to `V9968` (new register definitions, not `V9968_OLD`).
R#21 bit0 is V58: clear it to enable native extended commands and 256KB VRAM.
R#20 bit5/bit6 no longer enable ECOM/EVR. `_V9968` clears V58 and enables
HS/EPAL; `_SCREEN(0)` returns to compatibility mode. Drawing and font guards
use V58. No resident allocation or temporary CALL frame was added.

The project-local `.local/openmsx/openmsx.exe` was updated. Installed openMSX
and Catapult installations were not changed. Update both their executable
and this extension ROM together; mixing the old executable with this ROM
is unsupported. The old local executable/ROM/source snapshots are retained
under `.local/migration-d884c4b-backup/` (not distributed).

- [Binary and release notes](https://buppu3.github.io/)
- [Source at c620b69](https://github.com/buppu3/openMSX/tree/c620b693726b512c6860c7a0e01d3abf7b588b20)
- Archive SHA256: `764C42EC1D202F90283C1A75558B9CD6C0E29F0481103854C447487EF2E4FC8E`.

The native-OUT sprite probe now confirms contiguous addresses for SCREEN
5/6/7/8. SCREEN 7+ sprite commands remain guarded pending full background,
SAT reservation and rendering verification. The LFMC no-data probe now
leaves all target pixels unchanged; the transfer diagnostic still does not
produce the expected glyph. Kanji support remains paused.

The SCREEN 8 page-display test still observes upper pages aliasing lower
display pages (normal pages 2/3 show 0/1; flat-interlace page 1 shows 0).
All four normal/two flat drawing pages remain separate in physical VRAM.
The SCREEN 8 flat-interlace screenshot test now confirms the final column,
including (255,423), is visible. The old right-column clipping assertion was
replaced by the correct white-frame pixel assertion.

With SP3 left active by native `SCREEN 7/8`, command addressing is now linear.
Until those layouts are supported, ordinary extended drawing/COPY/page calls
reject that combination before mutation. `_SCREEN(7)`/`_SCREEN(8)` resets it.
FG4 pattern drawing continues to use its separate SCREEN-5-format path.

### Verification status

The final ROM is 16KB (11,229 bytes before padding). Its SHA256 is
`74637070B829B0D60319A16D017C90BF9C35740588781483AA7C2BBC5B9FAD07`.
The installed local executable SHA256 is
`0528593DC9C71F40DCCA00193C1B3EA8D745B833C3C7C0FD38CEBC651EF1A62D`.

- `v9968-native.mjs`: passed on Z80 and R800 with the final ROM, including
  V58 transitions, unrelated R#21 bits, native drawing without old ECOM/EVR
  bits, upper VRAM, SP3 rejection, FG4/SAT protection and BASIC/HIMEM preservation.
- `screen7.mjs`: passed with the final ROM, including the new SP3 guard.
- During migration, smoke (both CPUs), VDP, font, sprite, interlace, SCREEN 6,
  array COPY, logical COPY, shuffle and CIRCLE tests completed successfully.
  The SCREEN 8 right-edge screenshot test passed. ROAD direct disk boot,
  scrolling, sprites and Escape return passed; menu sequence 1 -> 3 -> 4 -> 8
  also passed.
- Some long runs timed out waiting for the file-based test bridge. Interlace,
  SCREEN 6 and shuffle completed on rerun, but PATTERN, CIRCLE-position and
  the complete disk suite have not completed cleanly in this migration.
  The timeout cause is not established; do not call this a full green suite
  or attribute it conclusively to either the ROM or emulator.
- Same-page COPY passed all mode/operator matrices, but one final cleanup
  sample read FF instead of the guest completion marker. A focused SCREEN 5
  rerun including cleanup passed. Full SCREEN 8 coverage also needs a clean
  rerun after replacing its obsolete SP3/planar-reservation expectations.

No emulator source workaround was applied. Font/kanji expansion and SCREEN 7+
mode-3 integration remain separate, pending work.

## Historical investigation (2026-09-21)

The following observations and register comparison concern **d884c4b** and
the ROM before migration. They do not describe the new ROM's register setup,
and do not establish compatibility with the current blueMSX+ build.

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
