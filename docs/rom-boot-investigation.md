# ROM startup investigation (2026-09-21)

## Confirmed cause

The user reported startup hanging both in blueMSX+ and when selecting this ROM
through openMSX Catapult. The project launcher and previous automated tests
explicitly select the `Normal` mapper. Automatic selection in the tested
openMSX instead mirrors this 16KB image, exposing its header more than once.

A headless debugger probe of the previous ROM reproduced:

| Mapping | `font_boot` entries | Result |
|---|---:|---|
| Normal | 1 | BASIC prompt |
| Mirrored | 2 | Recursive CLEAR hook, no usable prompt |
| Automatic | 2 | Same failure as Mirrored |

Previous ROM SHA256:
`298098B89A5643A642243522EBDA641978616E5B212971F89928B938CBB108B5`.

The second INIT overwrote the saved previous H.CLEA with the extension's own
CALLF hook. The first CLEAR then chained back into itself. This was a ROM
initialization bug, not evidence that V9968 rendering caused the hang.

## Fix

`font_boot` now checks the existing two-byte SLTWRK pointer before writing
anything. Zero means not initialized; 0001h means initialization completed but
RAM allocation is pending; a later nonzero pointer denotes reserved RAM.
Repeated INIT leaves the pointer, previous hook and current hook unchanged.

Checking this marker rather than only the current H.CLEA also preserves a hook
installed by another owner between INIT calls. The guard adds five ROM bytes,
zero resident bytes and zero additional stack bytes. It changes neither the
allocation size/timing nor BASIC-owned data or VRAM reservations. Ordinary
extension commands do not execute the new guard.

This relies on the BIOS clearing SLTWRK before the first cartridge INIT.
The test checks this on initial power-on and subsequent power cycles of the
two configured machines. The existing restricted whole-slot, eight-byte
SLTWRK ownership assumption remains an audit item, not a general allocation
rule. The [technical handbook](https://konamiman.github.io/MSX2-Technical-Handbook/md/Chapter5b.html)
assigns SLTWRK per slot and page; the pending redesign described in
[the resident memory audit](resident-memory-audit.md) is still needed.

## Regression test

Run `node tests/boot.mjs` after building. It covers `V9968_Basic` and
`Panasonic_FS-A1ST(V9968)`, slots A/B, Normal/Mirrored/automatic selection:

- Count one or two INIT entries but exactly one resident allocation.
- Check zero-initialized slot work after power-on and power cycling.
- Install a test predecessor hook before INIT and a wrapper between mirrored
  INIT entries. Verify the saved hook and execution counts, not just a prompt.
- Check CLEAR/NEW/MAXFILES without another allocation or HIMEM change.
- Re-enter INIT twice after FONT and PATTERN are active, including a wrapped
  H.CLEA, and retain the resident bytes, both hooks, pointer and HIMEM.
- Preserve a BASIC program, array and string, then use GRP output again.

Test-only ROM hooks occupy verified unused padding in isolated generated
images. Runtime USR trampolines occupy RAM reserved first with BASIC CLEAR;
they are not new extension allocations. Existing font, smoke and disk tests
remain the broader regression checks.

### Verification results

- `node tests/boot.mjs`: all 12 configurations passed, including power cycles
  and runtime re-entry (36 PASS reports).
- `node tests/font.mjs V9968_Basic` and `node tests/font.mjs`: passed on
  Z80 and R800, including existing hook/data protection and synchronous LFMM.
- `node tests/smoke.mjs` and the FS-A1ST variant: passed on both CPUs.
- `node tests/disk.mjs`: passed, including all 12 demos, AUTOEXEC, file errors,
  menu return, read-only disk protection and no repeated resident allocation.
- The unmodified distribution image was also inserted with automatic mapper
  selection, without the test hooks, on both machines. Both reached the BASIC
  prompt and successfully executed `_V9968`.

Some earlier test runs ended in headless IPC timeouts at different operations;
the final complete runs above passed. Those timeouts were not classified as
ROM failures or silently treated as passes.

Fixed ROM SHA256:
`156BE9C9212FCDCB1A2921F0497F9E1A66AE001BBF31E046AB63166CB17DA3B2`.

### Limits and separate observations

- GUI launch through Catapult and blueMSX+ has not been retested with the fixed
  ROM. No emulator binary or user installation settings were changed for this
  fix. Real hardware and expanded external slots remain untested here.
- During this investigation, the local headless fork's Tcl `reset` sometimes
  failed even without an extension ROM: CPU-visible work RAM read as FFFFh
  while the old screen remained visible. It also occurred with the old ROM.
  Power OFF/ON worked. The regression therefore tests power cycles; this does
  not establish warm-reset compatibility or diagnose that separate symptom.
- Earlier blueMSX+ 3.1.1 probes used isolated profiles and generated DSK files.
  The native-only LFMCBUG program passed its narrow no-bitmap-data test.
  One explicit 4000h run reached the demo menu, but rotation playback was not
  verified. These observations do not establish full V9968 compatibility or
  resolve the paused font/kanji work.
