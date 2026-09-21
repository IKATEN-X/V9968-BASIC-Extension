# Mode-3 sprites outside SCREEN 5

## Scope

SCREEN 1..6 command support is implemented for non-FIL mode. SCREEN 7..12 command
support is held pending emulator mapping fixes. The final target is every
native screen except SCREEN 0; the user approved this staged rollout.
FG4 asset drawing via _PATTERN ON(n)/OFF is separate and works on all available
native screens (0..8 and 10..12), without requiring SP3. Font/kanji development stays
paused. Neither the emulator nor cartridge hardware is modified here.

References:

- [Author: sprite mode 3](https://note.com/thara1129/n/n810be44fba3e)
- [Author: VRAM interleaving](https://note.com/thara1129/n/n670f85abbfcf)
- Pinned fork source snapshots in `.local/reference/`, based on `d884c4b`.

The author specifies SCREEN-5-format 4bpp pattern sets regardless of background
format. In the VRAM article, SCREEN 7..12 normally use interleaved addressing,
but selecting sprite mode 3 switches to contiguous DRAM/VRAM addresses.

## SCREEN 7/8 CPU Addressing

Run the diagnostic (no extension sprite command is used):

```powershell
node tests/sprite-planar-probe.mjs
node tests/sprite-planar-probe.mjs V9968_Basic
```

After selecting the screen and enabling SP3/EVR with native VDP writes, it
writes A5h and 5Ah at CPU VRAM address 37E00h using native OUT statements.
Sprites are hidden while deliberately writing into this test area.

Equivalent write sequence in ordinary BASIC on the V9968 machine:

```basic
10 SCREEN 7
20 VDP(21)=121:VDP(9)=VDP(9) OR 2
30 OUT &H99,13:OUT &H99,&H8E
40 OUT &H99,0:OUT &H99,&H7E
50 OUT &H98,&HA5:OUT &H98,&H5A
60 GOTO 60
```

Inspect physical VRAM in the emulator debugger; do not use VPEEK alone, since
its CPU address translation follows the same mapping as the writes.

| Screen | Physical 37E00h | 37E01h | 2BF00h | 3BF00h |
| --- | --- | --- | --- | --- |
| Expected with SP3 | A5 | 5A | 00 | 00 |
| 5/6 observed | A5 | 5A | 00 | 00 |
| 7/8 observed | 00 | 00 | A5 | 5A |

`VDP::executeCpuVramAccess` tests `displayMode.isPlanar()` without excluding
SP3. `updateSpriteAttributeBase` likewise applies planar conversion; meanwhile
`SpriteChecker::checkSprites3` fetches contiguous 512-byte attributes.
Changing only the extension's guard would therefore write outside its existing
SAT reservation. Moving the SAT or duplicating it to accommodate the fork is
not a compatible hardware fix and is intentionally not implemented.

## SCREEN 6 Horizontal Clipping

```powershell
node tests/sprite-screen6.mjs --visual
node tests/sprite-screen6.mjs V9968_Basic --visual
node tests/sprite-screens.mjs --visual
node tests/sprite-screens.mjs V9968_Basic --visual
```

The SAT preserves 10-bit signed X, including X=304 and X=511. The bitmap is
512 pixels wide, but mode-3 sprites at those positions are not rendered.
The diagnostic screenshots under `build/screenshots/sprite-screen6-*` show
left-half display, scaling, flipping, transparency and 64 sprites, then verify
that the right-half test positions still show the background.

`PixelRenderer::draw` passes halved display coordinates/width to `drawSprites`,
whose mode-3 path writes pixels without the normal mode-2 wide-screen handling.
Thus its mode-3 clipping boundary is 256 in the current fork. ROM coordinates
are not shifted or rescaled to hide this restriction. These checks pin observed
emulator behavior, not a claim that the hardware has the same limitation.

## Recheck After An Emulator Fix

1. Re-run the native-OUT diagnostic and compare physical addresses.
2. Verify SAT placement/64 records, CPU reads and command/background addressing
   together, including mode transitions and reserved-region protection.
3. Verify sprites on both halves of SCREEN 6/7 and on SCREEN 8, including palette
   sets, scaling, transparency and scroll independence.
4. Only then enable SCREEN 7/8 in the extension and revise limitation assertions.

No resident allocation, CALL-frame enlargement or VRAM reservation was added.
Existing memory-allocation/headroom audits remain open.
