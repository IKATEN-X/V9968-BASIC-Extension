# LFMC transfer investigation

## Recheck with c620b69 (2026-09-23)

The project's emulator now uses the new `V9968` register definitions.
`demo/LFMCBUG.BAS` has been updated to clear R#21.V58 and enable R#20.HS,
then restore R#12, R#20 and R#21 on exit. With no glyph data sent, the Z80/R800
standalone tests now report **99999999**, as expected. The premature drawing
of the foreground color as glyph data is no longer reproduced.

`tests/lfmc-probe.mjs` still reports `matchesDocumentedTransfer: false`, but
that probe waits through a host handshake before sending data. The timing
diagnostic below narrows the failure: **immediate transfer can work; transfer
after waiting across a frame does not resume**. Do not describe LFMC as wholly
nonfunctional. Kanji implementation remains paused. Source snapshots in
`.local/reference/` follow c620b69; old snapshots are in the migration backup.

## Timing Diagnostic (2026-09-23)

The new `tests/lfmc-transfer.mjs` uses `tests/lfmc-transfer.asm` to perform real
guest I/O, with no extension ROM attached. All register pairs and status reads
are protected by DI, including command start and the guest-only frame wait.
The driver restores R#15=0 and interrupts before returning to BASIC. Both TR
polling and frame waits are bounded; the host aborts unfinished commands.

The tested binary is c620b69, SHA-256:

```text
0528593dc9c71f40dcca00193c1b3ea8d745b833c3c7c0fd38cebc651ef1a62d
```

The local test executable and the user's installed `C:\Program Files\openMSX`
executable have that same hash. No emulator binary/source or extension ROM was
modified for this diagnostic.

### Results

Both completed matrices, Z80 and R800, cover SCREEN 5/6/7/8, HS=0/1, direct
R#44 writes via 99h and indirect writes via 9Bh. For each CPU, all 32 immediate
LFMC cases passed, all 48 delayed LFMC cases failed to complete, and all 12
LMMC control cases passed (184 cases total). No driver I/O errors occurred.

Representative SCREEN 7 case: DX=DY=64, NX=16, NY=1, foreground=5,
background=3, original pixels=9. Send F0h, then 0Fh, checking TR before each.

| Timing | Observed pixels | CE after observation |
| --- | --- | --- |
| Start and send in one machine-code call | `55553333 33335555` | 0 |
| Return to BASIC, wait at least 50 ms, send | `99999999 99999999` | 1 |
| Wait across a frame inside the same DI-protected call, then send | `99999999 99999999` | 1 |
| Send F0h, wait across a frame, send 0Fh | `55553333 99999999` | 1 |

The guest-only wait polls S#2.VR through 0 -> 1 -> 0. It does not use HALT,
enable interrupts, or return to the host between command start and data. Both
bytes are sent without driver errors; TR remains set, but the delayed LFMC
cases still have CE=1 after a further observation interval of at least 20 ms.
R#46=0 successfully aborts them. This is not an unbounded completion wait.

Immediate 8x1, 8x16, 16x16 and 13x2 transfers also passed the pixel comparison,
including per-row discard of unused bits for NX=13. The LMMC controls use the
same driver and delays, with one initial pixel in R#44 and 15 following pixel
values instead of two bitmap bytes. They draw all 16 pixels and clear CE.

Thus the earlier failure was not merely an interrupted pair of OUTs, the
extension command parser, or the host handshake. This is evidence about this
emulator build, not a result from physical V9968 hardware. Immediate success
does not prove that arbitrary start timing or interrupted transfers are safe.

The saved Z80 SCREEN 7 state (HS=1, indirect, wait between bytes) independently
shows `CMD=32`, `status=129` (CE/TR), `COL=15`, `transfer=true`, `ADX=72` and
`ANX=8`. The second byte 0Fh reached the command engine but remains pending
after the first eight pixels. Its serialized engine time is 1721762999640,
ahead of scheduler time 1666200399360 (raw emulator time units). This supports
investigating command scheduling, without proving the exact failure path.

### Running The Diagnostic

```powershell
node tests/lfmc-transfer.mjs
node tests/lfmc-transfer.mjs V9968_Basic --state
```

The first command tests R800; the second tests Z80. Add `--quick` for the
SCREEN 7 timing matrix only. `--state` also saves a stopped SCREEN 7 command
to `build/lfmc-transfer/after-frame-<cpu>.xml.gz`; it never reloads that state.
Results, actual/expected pixels and the complete BASIC harness are recorded
in `build/lfmc-transfer/results-<cpu>.json` (with `-quick` for the short run).
Exit code zero means the diagnostic completed and LMMC controls passed, not
that every LFMC case passed.

The fixture requires the existing z88dk assembler (or `Z80ASM` override).
BASIC `CLEAR 200,&HBFFF` reserves the test RAM: C000h holds parameters/status,
C100h the machine-code driver, and C800h the bitmap payload. This is diagnostic
RAM, not additional resident extension work or a change to the CALL frame.

### Source Candidate

In c620b69, `startLfmc` correctly latches `fontColor` and clears `transfer`,
addressing the original premature-drawing problem. However, `executeLfmc`
breaks when no byte is pending without advancing its access-slot calculator to
the current limit, then retains the calculator's old time as `engineTime`.
In contrast, LMMC rebases its time with `nextAccessSlot(limit)` (or the HS
variant). See [VDPCmdEngine.cc at the tested revision](https://github.com/buppu3/openMSX/blob/c620b693726b512c6860c7a0e01d3abf7b588b20/src/video/VDPCmdEngine.cc#L2770).

The slot calculator assumes `frame <= time`. Carrying an old command time
across the next frame is therefore a candidate explanation for the stall.
See [VDPAccessSlots.hh](https://github.com/buppu3/openMSX/blob/c620b693726b512c6860c7a0e01d3abf7b588b20/src/video/VDPAccessSlots.hh#L52).
This is a source-based hypothesis, not a verified patch or a claim about the
exact point of failure. No emulator patch or replacement transfer workaround
was applied. Keep LFMC-based font/kanji expansion pending a robust transfer fix;
existing LFMM font support is separate and unchanged.

## Historical results (d884c4b)

Status: observed on the old d884c4b V9968 fork, 2026-09-20. No emulator
or extension ROM changes have been made for this investigation. The proposed
kanji command is not implemented yet.

### Reproduction

#### Standalone BASIC

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

#### Transfer Diagnostic

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

### Expected And Observed

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

### Source Inspection

In the pinned `.local/reference/VDPCmdEngine.cc`, writing R#44 sets both `COL`
and `transfer`. `startLfmc` does not clear that pending transfer or latch a
separate foreground color. `executeLfmc` consumes `COL` as bitmap data and
also uses `COL` as foreground. These are candidates for upstream investigation,
not changes made by this project. The foreground/data coupling is visible in
the source; the diagnostic alone does not establish every subsequent failure.

## Kanji Work

The user resumed font work on 2026-09-23 and explicitly approved LFMM first.
The quick LFMC reproduction on c620b69 still passes 4 immediate cases and
fails 12 delayed cases on each CPU; all three LMMC controls pass. The report
remains with the author. This is not a confirmed hardware restriction.

FONT(3) therefore uses synchronous LFMM and stages one glyph inside the existing
font reservation at 37600h..3761Fh. It adds no VRAM/RAM reservation and does not
patch the emulator. LFMC direct transfer remains pending; the diagnostic stays
available for checking future upstream fixes.
