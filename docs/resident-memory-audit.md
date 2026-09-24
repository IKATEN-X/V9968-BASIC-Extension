# Resident memory inventory

Audit date: 2026-09-21. This is a source and existing-ROM inventory, not an
allocator change or a claim that all memory-safety tests have passed.
The scope is permanent extension-owned CPU RAM and SLTWRK. Transient stack
optimization, new font features, and emulator changes are outside this audit.

Subsequent work on the same date fixed duplicate cartridge initialization;
see [the ROM startup investigation](rom-boot-investigation.md). That fix adds
five ROM bytes but does not change this inventory's RAM/VRAM sizes. The source
addresses and ROM hash below describe the pre-fix snapshot audited here.

## Update: startup banner (2026-09-23)

The startup banner now uses seven previously unused bytes in the existing
32-byte block: offsets 23..27 save H.READ, 28 holds its trailing RET, and 29
is the print-once flag. Offsets 1..3 and 30 remain unused. Current occupancy
is **28 bytes, with four unused**; including the existing eight SLTWRK bytes,
the content inventory is 36 bytes. The 21/29-byte figures below are the
original September 21 snapshot, not the current minimum.

The reservation remains 32 bytes plus 0..1 alignment bytes. There is no new
allocator, HIMEM adjustment, CALL-frame growth or VRAM reservation. The saved
H.READ bytes and flag belong to the ROM until reset, even after display:
a later hook owner may retain a call to `banner_ready`. First font installation
now clears offsets 0..22 only, preserving both banner data and PATTERN state.

H.READ (FF07h, BASIC READY) is installed after the existing startup allocation.
On first entry, the flag is cleared before output. The hook is restored only
if all five bytes still identify this ROM; later owners are not overwritten.
If another H.CLEA invocation (such as AUTOEXEC's RUN) occurs before READY,
the existing clear hook cancels the pending banner and restores H.READ with
the same ownership check. BREAK or END must not print a delayed startup banner.
The saved predecessor remains available to later wrapper hooks after cancellation.
The predecessor is always called with the original main registers. The banner
also saves the alternate registers and incoming interrupt state; patching is
interrupt-protected. The entry saves 22 stack bytes, with nested helper calls,
CALLF, BIOS CHPUT and interrupts using additional transient stack. It adds no
private temporary frame. Existing allocator/headroom and coexistence audit
gaps remain open. As with the existing hooks, copying a five-byte predecessor
assumes relocatable hook code (RET/JP/CALLF), not a location-dependent JR.

`tests/banner.mjs` covers predecessor and subsequent wrapper chains, first
font installation before READY, register preservation, later CLEAR/RUN/NEW,
error recovery and disk AUTOEXEC. `tests/kanji-break.mjs` verifies actual
Ctrl+STOP without a delayed banner, retained BASIC program/arrays and CONT.
`tests/boot.mjs` covers the two CPU machines,
both cartridge slots, Normal/Mirrored/automatic mappings, power cycles and
repeated INIT. These are not a proof for every third-party resident ROM.

## Update: Japanese GRP font (2026-09-23)

FONT(3) uses the remaining four bytes: offset 1 is a Shift-JIS lead byte,
2..3 hold the output FCB identity, and 30 is the detected Kanji-ROM level.
All 32 reserved bytes now have uses. The FCB identity is only compared with
the current PTRFIL, never dereferenced; no BASIC string or array address is
cached. Font/screen changes, CLEAR/NEW/RUN, controls and foreign output clear
the pending lead byte. Closing and reopening the identical FCB without output
cannot be detected by H.OUTD: complete each character before CLOSE, or reset
the decoder with FONT(3). No close hook or per-file allocation is added.

Permanent reservation remains **32 + 0..1 alignment bytes**, plus the same
eight existing SLTWRK bytes. No ordinary output changes HIMEM. The existing
256-byte font frame contains 32 raw and 32 reordered glyph bytes; it does not
grow. The GRP hook now checks its frame plus 256 bytes of nested-call/interrupt
headroom against STREND before allocating it, returning ERR=7 on failure.
The startup allocator and whole-slot SLTWRK assumptions remain separate open
audit items; this check is not a bound on arbitrary third-party interrupts.

VRAM reservation is still 37600h..37DFFh (2048 bytes). Under FONT(3), only
37600h..3761Fh is needed as synchronous single-glyph staging; switching to
FONT(1/2) reloads the old 256-glyph set. Sprite attributes are untouched.
BASIC demo strings, variables and position arrays use ordinary CLEAR/DIM.

`tests/kanji.mjs` and `--z80` check native PUT KANJI parity, mixed-width
characters, JIS2, split bytes, channel/control resets, clipping, synchronous
returns and R#12/14/15 restoration. Heap-boundary injection verifies ERR=7
before VRAM changes and preserves BASIC scalar/array/string sentinels.

## Snapshot conclusions

- The current upper-RAM reservation is 32 bytes plus 0..1 alignment bytes.
  It contains 21 occupied bytes and 11 unused bytes.
- The implementation also occupies eight existing SLTWRK bytes: six for the
  previous H.CLEA chain and two for the tagged resident pointer.
- Keeping the current hook mechanism and separate feature-state bytes requires
  content totaling **29 bytes**: 21 + 6 + 2. This is an inventory total, not a
  proven theoretical minimum or an implemented allocation size.
- Moving the six-byte H.CLEA chain into owned RAM would give a **27-byte
  payload plus a two-byte slot pointer**. This describes the content to place;
  its safe boot-time placement remains a separate design decision.
- Do not shrink FONT_RAM_SIZE alone, replace SLTWRK+6 with SLTWRK+2 alone, or
  treat the future 27-byte payload as an approved allocator. Delayed allocation
  needs a valid place to save H.CLEA before that payload exists.
- No ordinary drawing command should move HIMEM or allocate persistent RAM.
  Feature OFF must not release memory still referenced by a hook.

Only the 32..33-byte upper-RAM reservation is currently subtracted from BASIC's
HIMEM. SLTWRK is already system-allocated storage; adding its eight occupied
bytes to the inventory does not mean BASIC loses another eight free bytes.
The existing H.CLEA/H.OUTD hook entries are also system storage, listed below
without double-counting them as new allocations.

## Snapshot 32-byte block

Offsets are relative to `font_state() & FFFEh`. The address is not fixed.
Sources: [font.asm](../src/font.asm), [pattern.asm](../src/pattern.asm).

| Offset | Bytes | Content | Writers / readers | Retention |
|---|---:|---|---|---|
| 0 | 1 | Font state: 0=OFF, 1=normal, 2=bold | `font_install`, `cmd_font`, `font_off` / `font_active` | After first font installation, until explicitly changed |
| 1..3 | 3 | Unused | Cleared by first `font_install`; no functional reads | Can be removed by repacking |
| 4..16 | 13 | GRP output inter-slot trampoline, including slot byte at offset 6 | `font_install` copies ROM template and patches slot / execution through H.OUTD | Until reset; remains installed when font is OFF |
| 17..21 | 5 | Previous H.OUTD contents | First `font_install` / execution on pass-through | Same lifetime as the installed hook |
| 22 | 1 | RET after the saved H.OUTD contents | ROM template copy / execution on pass-through | Same lifetime as the installed hook |
| 23..30 | 8 | Unused | Cleared by first `font_install`; no functional reads | Can be removed by repacking |
| 31 | 1 | PATTERN state: 0=OFF, 80h..87h=ON with material page | `font_allocate`, `cmd_pattern_on`, `pattern_off` / `pattern_begin` | Across commands, with the reset rules below |

Occupied: 1 + 13 + 5 + 1 + 1 = 21 bytes. Unused: 3 + 8 = 11 bytes.
The 19-byte `font_stub` includes both the saved H.OUTD bytes and its trailing
RET; those must not be counted again on top of the stub.

Before first font installation, only offset 31 is initialized by the allocator.
Offset 0 and the trampoline are not yet valid. The pointer tag prevents their
use. First installation zeroes offsets 0..30, installs the trampoline and old
hook, then clears the tag. It deliberately preserves offset 31.

The 11 unused bytes are not a new shared scratch area. Removing or repurposing
them requires changing the layout, all initialization ranges, the slot patch
at base+6, and tests that currently inspect fixed offsets.

## SLTWRK and hooks

Let `S = FD09h + 32 * primary_slot + 8 * secondary_slot`.
For an unexpanded slot the secondary part is zero.

| Address | Bytes | Content | Writers / readers |
|---|---:|---|---|
| S+0..S+4 | 5 | Previous H.CLEA contents | `font_boot` / every `font_clear_hook` chain |
| S+5 | 1 | RET after the previous H.CLEA contents | `font_boot` / hook execution |
| S+6..S+7 | 2 | Tagged resident pointer | `font_boot`, `font_allocate`, `font_install` / `font_state` |
| H.CLEA at FED0h | 5 existing system bytes | Inter-slot call to `font_clear_hook` | `font_boot` / BASIC |
| H.OUTD at FEE4h | 5 existing system bytes | JP to the resident trampoline; only first three bytes replaced | First `font_install` / BASIC OUTDO |

The slot pointer encodes three states without a separate installed flag:

| Value | Meaning |
|---|---|
| 0001h | Upper-RAM block not allocated yet |
| base OR 1 | Block allocated, H.OUTD not installed yet |
| base | H.OUTD installed; font may independently be ON or OFF |

The real base is even so bit 0 can serve as the tag. The alignment byte is
required by this representation, not by a general Z80 alignment requirement.
For current size 32, the allocator calculates
`new_HIMEM = (old_HIMEM - 33) OR 1` and `base = new_HIMEM + 1`.
An odd old HIMEM consumes 32 bytes; an even one consumes 33.

SLTWRK is assigned per slot **and CPU page**, two bytes each. This ROM is in
CPU page 1 (4000h..7FFFh), whose corresponding pair is S+2..S+3, not S+6..S+7.
The current eight-byte arrangement spans all four pairs. Its standalone-slot
assumption must not be generalized to another owner in the same slot.
These rules and the startup BOTTOM reservation example are in the
[MSX2 Technical Handbook, Chapter 5 section 7](https://konamiman.github.io/MSX2-Technical-Handbook/md/Chapter5b.html).

## Why these contents persist

- Font enable state controls GRP interception and font-VRAM protection. The
  stored 1/2 distinction currently records the selected style, but ongoing
  readers only require enabled/disabled; bold transformation happens during
  upload. No separate CPU copy of glyph data is retained.
- PATTERN state is a software drawing context, not the current R#45 value.
  FG4 is set per extension command and cleared after completion so native
  drawing is unaffected. Therefore R#45 cannot replace the persistent setting.
- The previous hooks are runtime values supplied by the environment and
  cannot be constants in this cartridge ROM. Both hooks remain chained, so
  their saved bytes cannot overlap or be dropped after the first call.
- The font trampoline runs after CALLF restores the caller's slot, including
  the path that skips native GRP output. Simply moving these bytes to this
  page-1 ROM would not preserve that return path. A different hook ABI would
  need its own proof and is not assumed in the 29-byte inventory.
- The pointer is needed to locate the reservation in differing startup
  environments. Its installed flag already shares a pointer bit.

Combining the font and PATTERN states into one byte could save another byte
with masked reads and writes. That is a possible implementation change, not
a discovered unused byte. This audit retains the separate bytes for a
conservative baseline; it does not assert that 29 is an absolute lower bound.

## Lifetime and reset behavior

| Event | Allocation / hooks | Font state | PATTERN state |
|---|---|---|---|
| ROM initialization | Save H.CLEA in SLTWRK, set pointer to 0001h, install CLEAR hook | Not installed | Block does not exist |
| First H.CLEA after initialization | Reserve upper block, relocate BASIC stack/file structures and related pointers once | Still not installed | OFF |
| First successful FONT(1/2) | Install resident H.OUTD trampoline once | Selected value | Preserved |
| Later CLEAR / NEW / RUN | Keep reservation and installed hooks, chain previous H.CLEA | Preserved | OFF |
| Full extension SCREEN initialization | Keep reservation and installed hooks | OFF | OFF |
| Partial extension SCREEN / native SCREEN | No allocation or extension reset by these paths | Stored state retained; output still checks mode | Preserved |
| FONT(0) / PATTERN OFF | No memory release | FONT(0) clears only font state | PATTERN OFF clears only PATTERN state |
| MAXFILES / STOP / END | No extension release or resize | Retained | Retained |
| Rejected extension command | No intended state commit | Retained | Retained |

The last row is the extension's validation contract, not a claim that an
arbitrary BASIC expression/USR cannot have side effects. This table describes
extension-owned state; native commands can still change VRAM or system state.

## No additional private resident blocks found

The command sources included by [main.asm](../src/main.asm) were searched for
absolute and indirect RAM writes, allocations and hook accesses.

| Category | Storage actually used |
|---|---|
| V9968 flags, SCREEN/FIL/SPS/S16/SVNS, sprite visibility and pages | Existing VDP registers and their BASIC shadows; SCRMOD, ACPAGE and DPPAGE |
| Sprite position, size, pattern, palette and omitted parameters | VRAM SAT; one transient attribute record in the CALL frame |
| PSET / LINE / CIRCLE / CLS / COPY / transformations | CALL-frame scratch, registers, stack; constant tables and templates in ROM |
| COPY to/from arrays | BASIC-owned numeric array payload; pointers and capacity in the CALL frame, not a persistent cache |
| Font glyph upload and custom strings | Transient eight-byte glyph buffer; final bitmap in VRAM |
| BASIC expression and graphics integration | Existing DAC/VALTYP/SUBFLG and GRPACX/GRPACY/GRPHED/CLOC/CMASK under their existing roles |

Other memory is separate from this inventory: the 256-byte CALL frame, the
font hook's own 256-byte temporary frame, nested-call/interrupt stack, BASIC
program/data/file buffers, 2,048 font-VRAM bytes, and 512 SAT-VRAM bytes.
No change to any of these areas is made by this audit. Listing system work
accesses does not certify all error/reentrancy paths as safe.

## Placement issue to resolve before shrinking

The old H.CLEA is saved during `font_boot`, **before** the upper block exists.
Current allocation is deliberately delayed until H.CLEA so Disk BASIC can
initialize first. Thus a two-byte slot pointer plus a later 27-byte block is
not a complete boot design: the old hook must already have valid storage.

The next allocation-design review must provide that storage and count its
full lifetime. An early BOTTOM reservation is one candidate, but if it cannot
be safely released after moving the hook, its bytes remain part of permanent
usage. Do not hide them as temporary startup memory. Moving all work to BOTTOM
also needs review of the executable hook's visibility across slot changes.

Using the existing 32-byte upper block for the 27-byte payload would leave five
bytes there, but even this does not solve the pre-allocation hook storage.
The six-byte SLTWRK saving cannot be claimed until boot placement is resolved.

Upper-RAM reservation also needs capacity/overflow checks and a non-destructive
failure path before changing SP, HIMEM, file pointers or hooks. The current
allocator has no such preflight. The GRP temporary-frame headroom and general
stack audit remain open; the CALL check does not close them. The
[UNAPI ROM example](https://github.com/Konamiman/MSX-UNAPI-specification/blob/master/examples/unapi-rom.asm)
is useful startup context, not a general runtime allocation contract.

## Verification and limits

- Cross-checked all resident references in font.asm and pattern.asm and their
  callers in SCREEN, sprite and drawing code. Offset 0 is live font state;
  treating offsets 0..3 as four unused bytes would be incorrect.
- Checked the existing map and ROM: `font_stub=6683h`,
  `font_stub_end=6696h`, difference 19; FONT_STUB=4, FONT_OLD=17,
  PATTERN_STATE=31, FONT_RAM_SIZE=32. The 19 ROM bytes were checked against
  the expected instructions, including the ROM font_output address.
- Checked the current allocation arithmetic for both HIMEM parities and all
  16 primary/secondary slot combinations for page-1 versus page-3 placement.
- Reviewed existing tests, without rerunning the emulator in this audit.
  [font.mjs](../tests/font.mjs) checks boot pointers, relocated file buffers,
  H.OUTD pass-through and NEW/CLEAR; [disk.mjs](../tests/disk.mjs) checks no
  reallocation during demo RUN/CLEAR cycles;
  [pattern.mjs](../tests/pattern.mjs) checks state/error/GC/lifecycle behavior.
  These tests currently assume slot 1 and fixed layout offsets. They must be
  updated with any layout change, not used to justify the ownership assumption.
- A read-only Antigravity review returned usable results on the second call.
  Its 19-byte stub/8-byte SLTWRK counts agreed; its claim that offset 0 was
  unused was rejected against `cmd_font` / `font_active`. The first call's
  empty SUCCESS response contained a denied command and was not evidence.
- No build, source-code change, ROM rewrite or emulator modification was made.
  Existing ROM SHA-256:
  `298098b89a5643a642243522ebda641978616e5b212971f89928b938cbb108b5`.

Before implementing allocation changes, cover both CPUs, failure at low RAM,
the previous H.CLEA and H.OUTD chains, first font install with PATTERN active,
CLEAR/NEW/RUN/MAXFILES, strings/arrays/GC/files and error recovery, Disk BASIC
startup order, other slot owners and slot configurations. MSX-DOS transitions
and interrupt-time visibility are still unverified. This inventory fixes the
byte accounting, not those safety gaps.
