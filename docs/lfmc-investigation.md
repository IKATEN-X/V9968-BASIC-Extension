# LFMC transfer investigation

Status: observed on the project's current V9968 fork, 2026-09-20. No emulator
or extension ROM changes have been made for this investigation. The proposed
kanji command is not implemented yet.

## Reproduction

### Standalone BASIC

`demo/LFMCBUG.BAS` reproduces the first discrepancy using native MSX BASIC
only. It needs the V9968 fork, but not this extension ROM, `USR`, raw CPU
memory access, or a host-side handshake. It does not test for a V9968 itself;
an unchanged result on a different VDP is not evidence that LFMC works.

To launch through the project's existing batch file:

```powershell
.\run.bat -Entry LFMCBUG.BAS -NoBuild
```

This prepares a read-only demo disk and boots `LFMCBUG.BAS` via AUTOEXEC.
The normal launcher attaches the extension ROM, but the diagnostic does not
call it. Its result stays at the BASIC prompt instead of returning to the menu.
`node tests/lfmc-basic.mjs --disk` verifies this disk startup path.

The program clears SCREEN 7 to color 9, sets R#20.ECOM and HS, and starts
an 8-by-1 LFMC at (64,64), with foreground 5 and background 3. It never sends
bitmap data after command start. After a timer tick it aborts the command,
uses native `POINT` to read the eight pixels, restores R#12/R#20, and prints
the result in SCREEN 0:

```text
EXPECTED: 99999999
ACTUAL:   33333535
UNEXPECTED DRAWING
```

Stopping the command before `POINT` is intentional: a correct LFMC would
still be waiting for bitmap input. Do not replace the abort with a wait for
command completion. Both Z80 and R800 reproduced this result without the
extension ROM attached, using:

```powershell
node tests/lfmc-basic.mjs
node tests/lfmc-basic.mjs V9968_Basic
```

### Transfer Diagnostic

Run from the project root, using the existing built ROM:

```powershell
node tests/lfmc-probe.mjs
node tests/lfmc-probe.mjs V9968_Basic
```

The probe starts its own emulator and closes it afterward. It reserves guest
memory with BASIC `CLEAR 200,&HBFFF`; C000h/C001h are handshake bytes,
C010h holds S#2, and C100h holds a short interrupt-protected status reader.
The results and the complete BASIC program are written to
`build/lfmc-probe-r800.json` and `build/lfmc-probe-z80.json`.
Exit code zero means the diagnostic completed, not that LFMC passed.

SCREEN 7 is initialized and cleared to color 9. The probe sets foreground 5,
background 3, DX=DY=0, NX=16, NY=1, ARG=0 and starts LFMC with R#46=20h.
After observing S#2.TR, it sends one data byte, F0h, to R#44. The guest reads
S#2 through real I/O and restores R#15=0. Physical VRAM is decoded using the
SCREEN 7 planar layout; this is not a screenshot or right-edge display test.

## Expected And Observed

The [developer's LFMC description](https://note.com/thara1129/n/n0b419e7fbf47)
distinguishes the foreground color set before command start from the bitmap
bytes transferred afterward, with one byte describing eight horizontal pixels.

Before any bitmap transfer, all 16 target pixels should still be color 9.
Instead, both CPUs produced:

```text
3 3 3 3 3 5 3 5 | 9 9 9 9 9 9 9 9
```

The first eight pixels match the bits of the initial foreground value 05h.
This is the primary reproduced discrepancy: the foreground setting appears
to have been consumed as bitmap data before the first data transfer.

After F0h, the expected first eight pixels are `5 5 5 5 3 3 3 3`, with the
remaining eight untouched and CE still set while waiting for the next byte.
The observed row did not change to that expected pattern. See the JSON for
register values and S#2; do not interpret host polling delays as proof of a
correct transfer handshake or extrapolate these results to physical hardware.

## Source Inspection

In the pinned `.local/reference/VDPCmdEngine.cc`, writing R#44 sets both `COL`
and `transfer`. `startLfmc` does not clear that pending transfer or latch a
separate foreground color. `executeLfmc` consumes `COL` as bitmap data and
also uses `COL` as foreground. These are candidates for upstream investigation,
not changes made by this project. The foreground/data coupling is visible in
the source; the diagnostic alone does not establish every subsequent failure.

## Kanji Work

The user has reported the issue to the author and explicitly paused further
font/kanji work. Keep the existing font functionality and reproduction tools.
Do not proceed with an LFMM workaround while this work is paused. When the
user resumes it, review the author's response or fix and rerun the LFMC
reproduction before choosing an implementation.

LFMC would avoid a VRAM glyph work area. An LFMM implementation is an alternative,
but its small glyph work area still needs an explicit ownership, protection and
lifetime design. Do not borrow arbitrary VRAM, add an unreviewed allocator, or
silently patch the emulator to make a kanji test pass.
