# Project Rules

## Documentation

- README.md is the public overview; docs/commands.md describes the public API.
- When present, README.local.md preserves the detailed development reference,
  including test coverage and memory/error policies. Read the relevant sections
  before changing those mechanisms. It is intentionally ignored by Git; do not
  publish it or copy the complete development notes into public documentation.
- Public checkouts may not contain README.local.md. The rules below still apply.

## Antigravity Delegation

- The user has designated Antigravity as this project's external subagent.
  Use the agy CLI for bounded research, analysis, and independent reviews when
  delegation is useful. The main agent owns integration and final verification.
- Run from this project root using the existing codex-agent definition in
  .agy/agents/codex-agent.md. Start with --agent codex-agent --mode plan --sandbox
  --output-format json --print-timeout 60s --print "<scoped task>". Do not change
  the user's agent definition or model selection without a reason and approval.
- Keep initial tasks read-only. Supply the objective, relevant paths, constraints,
  and expected result; require the agent to follow this file and relevant README
  policies. Assign explicit file ownership before delegating edits. Do not run
  simultaneous edits to the same files or competing build/emulator sessions.
- Inspect the actual JSON response and denied_actions, not just exit code or
  status: headless mode can report SUCCESS with an empty response after denying
  a tool. Independently review findings and test changes before accepting them.
- Obtain scoped permissions when needed. Do not use
  --dangerously-skip-permissions or broaden file/command access to bypass a denial.
- Connection status (2026-09-17): the user approved project-only reads and
  read_file(D:/MSX/V9968) was added to permissions.allow in
  ~/.gemini/antigravity-cli/settings.json. No write or command allow rules were
  added. Read-only delegation is verified with agy 1.2.4: both default and
  codex-agent text checks returned ANTIGRAVITY_READY, and codex-agent read
  AGENTS.md and src/parser.asm with a nonempty response and no denied_actions.
  The reported basic_error instructions and line numbers matched the source.
  Earlier calls failed with license error #3501; it did not recur in these
  checks, but its cause is unconfirmed. No further settings changes were needed.

## Command Completion

- [_COPY is synchronous](docs/commands.md#copy-completion): wait for the previous VDP
  operation before submission and for this copy before returning to BASIC.
  This includes ordinary, rotated, and scaled copies. Do not require a following
  _WAIT VDP statement or silently make COPY asynchronous for performance.
- Keep command completion separate from vertical synchronization. Do not change
  the shared submit_command contract or other drawing commands as a side effect.
- Test the VDP busy flag at COPY's return boundary, not only pixels after host
  polling. Cover both Z80 and R800, transformations, and large/chained copies.
- COPY ends with destination-page[,logical-operation[,angle[,scale]]]. These
  three optional fields have fixed positions and allow empty/trailing omissions,
  defaulting independently to PSET, 0 degrees and scale 1 on every call.
  ROTATE/SCALE keyword options are removed; angles/scales are ordinary BASIC
  numeric expressions evaluated once. Reject extra fields before mutation.
  Logical names are PSET/PRESET/AND/OR/XOR and their T-prefixed variants.
  Native TAND tokenizes as TAN + D, TOR as TO + R. Preserve LOGOPR. Reuse the
  existing command-image byte IX+14 for the operation; no seen flag is needed
  with positional fields. Do not grow resident RAM or the CALL frame.
  Source-window misses are color 0, including the T-operation skip rule.
  Same-page identity copies (equal rectangles and identity vectors) use LMMM
  with automatic DIX/DIY for overlap-safe traversal. Transformed/windowed
  same-page copies use LRMM only for disjoint source/destination rectangles;
  reject overlap with ERR=5 before mutation. Keep all ten logical operations,
  self-copy effects, FIL/9-bit bounds, reservations and synchronous returns.
  Do not allocate hidden CPU/VRAM staging buffers. tests/copy-in-place.mjs
  covers both CPUs; --screen=N restricts the matrix to one screen mode.
  tests/copy-logic.mjs checks all operators/colors, normal/FIL SCREEN 5/7,
  transforms, native parity, error recovery/protection and synchronous returns
  on Z80/R800. COPYLOG.BAS prepares matching backgrounds outside each timed
  60-copy burst; INTERLAC.BAS uses one opaque rotation per frame. Transparency
  alone does not erase a previous animated frame.
- Array COPY uses `_COPY(rect),page TO A%` and
  `_COPY(A%)[,direction] TO(x,y),page[,logical]`. CALL consumes a bare leading
  array name as part of PROCNM, so source arrays need parentheses. No subscripts,
  raw RAM addresses, string arrays, memory transforms or destination rectangles.
  Use DIM-owned integer/single/double arrays, native COPY's four-byte LE width/
  height header and continuously packed pixels (only the last byte is padded).
  Keep all ten logical operations, native direction 0..3, SC5/6/7/8 normal/FIL
  and explicit FG4. Page arguments remain explicit; no pixel-format conversion.
  PTRGET through CALBAS with SUBFLG=1 resolves an existing whole array without
  implicit DIM: BC points to dimension count, DE is dimension-header + data size.
  Restore SUBFLG, reject string arrays, and resolve again after all expressions
  before caching a pointer. Check payload ownership within ARYTAB..STREND,
  arithmetic overflow, capacity, coordinates and reservations before mutation.
  Missing/undersized arrays or malformed image headers use ERR=5, string arrays
  ERR=13, syntax ERR=2; preserve native expression errors. No persistent pointers,
  allocations, hidden CPU/VRAM staging or frame growth. Temporary state reuses
  IX+64..77, separately from the VRAM-transform scale token buffer. LMCM/LMMC
  transfer synchronously, restore status selection between interruptible reads,
  and clear FG4 only after completion. `tests/copy-array.mjs` covers both CPUs,
  packing/native parity, logic/flips, relocation/GC, errors/recovery and protection.
  `tests/copy-array-boundary.mjs` checks 65536-pixel arithmetic, exact-fit buffers,
  64KB payload rejection, ERASE/re-DIM and unchanged BASIC program/data.
- [LFMM font output is also synchronous](docs/commands.md#font-completion): finish each
  glyph before restoring the background register and returning to BASIC. Keep
  the internal wait; do not require _WAIT VDP after GRP PRINT. Check completion
  and register restoration at the glyph boundary on both Z80 and R800.
- Further font/kanji development is paused at the user's request. The user has
  reported the LFMC issue to the author; do not start an LFMM workaround while
  paused. Keep existing font support and diagnostics. On user-directed resumption,
  check the response/fix and rerun the reproduction in docs/lfmc-investigation.md.

## Memory And BASIC Compatibility

Read this section and, when available, README.local.md's memory policy before
changing RAM/VRAM ownership, allocation, stack frames, hooks, or cached BASIC
data pointers.

- The RAM-minimization policy concerns extension-owned work areas, not a ban on
  BASIC variables or arrays. BASIC demos may use variables, arrays, precomputed
  tables and cached calculation results freely when they improve performance,
  using normal BASIC assignment/DIM and respecting available memory. Do not
  trade away speed just to avoid adding BASIC-managed data. Preserve the
  interpreter's ownership rules and existing data protection requirements.
- Report extension-owned RAM, transient stack, BASIC program/data and VRAM
  separately when discussing memory changes; avoid an unqualified "no RAM added"
  that conflates these categories.
- Minimize permanent extension-owned RAM, but do not sacrifice BASIC
  compatibility for a smaller footprint. Record owner, size including alignment,
  lifetime, and release policy for every new allocation. Report transient stack
  usage separately.
- Keep extension-command memory use as low as practical to limit interference
  with BASIC and other environments. Perform a consolidated reduction review
  during final verification, covering resident work areas and transient stack.
  This schedules footprint optimization, not safety: valid ownership,
  non-destructive allocation and compatibility are required during implementation.
- Minimize transient stack use as well. Preserving BASIC program, variable,
  array, string and file data takes priority over footprint and speed. Memory
  after the program or variable end is not extension-owned scratch space;
  require a valid reservation or checked stack allocation before using it.
  Verify existing BASIC data remains intact on both success and failure.
- Do not use apparently unused RAM or system work areas as private storage.
  SLTWRK is assigned per slot and page, two bytes each. The current eight-byte
  whole-slot layout is a restricted implementation assumption, not a reusable
  allocation rule.
- Do not create per-feature allocators or copy font_reserve_ram into new code.
  Review one shared reservation design before adding persistent RAM. Its current
  startup-only implementation is not a general-purpose runtime allocator.
- Follow the documented startup BOTTOM reservation model for ordinary cartridge
  work where applicable. Page-3 resident hook code needs a separately justified,
  reviewed reservation. Never lower HIMEM alone or relocate live BASIC memory
  during ordinary drawing commands.
- Check bounds, arithmetic overflow, and sufficient stack/heap headroom before
  writes or SP changes. Include nested BASIC/BIOS calls and interrupt overhead.
  On failure, leave memory and hooks unchanged; report a BASIC error only when
  the interpreter is ready, otherwise leave the dependent feature unavailable.
- Keep startup reservations idempotent across CLEAR, NEW, RUN, and MAXFILES.
  Do not return resident RAM while a hook or another owner can still reference
  it. Disabling a feature is not permission to raise HIMEM.
- Chain existing hooks and preserve their calling conventions. Do not cache raw
  BASIC string/array addresses across relocation, garbage collection, or reset
  of BASIC-owned data. Shared scratch memory requires a reentrancy audit.
- Keep CPU RAM and VRAM ownership separate. Document reserved VRAM ranges and
  prevent extension writes from overwriting active reservations; do not claim
  that native BASIC drawing or direct POKE/VPOKE is automatically protected.
- For memory changes, run the relevant existing font/disk/smoke tests and add
  focused failure/lifecycle tests from the policy. Record untested configurations
  and existing gaps instead of treating a passing normal demo as proof of safety.

The boot allocator and GRP font-hook stack headroom checks and the restricted
SLTWRK layout remain audit items. CALL entry now checks its 256-byte frame plus
256 bytes of nested-call margin against STREND before moving SP (ERR=7).
This does not prove unbounded expression/USR/interrupt stack use. Fix or explicitly
resolve remaining issues before growing/generalizing the corresponding mechanism.

`font_boot` must be idempotent: mirrored 16KB headers can invoke INIT twice.
The existing SLTWRK pointer is zero at BIOS initialization, 0001h while allocation
is pending, then a nonzero reserved pointer. Return without mutation if nonzero;
do not replace this with a current-H.CLEA-only check, which misses other chained
hooks. tests/boot.mjs covers Normal/Mirrored/auto, both primary cartridge slots,
power cycles, predecessor/wrapper hooks and repeated INIT after BASIC data and
font installation. This does not generalize whole-slot SLTWRK ownership or
prove expanded-slot/warm-reset compatibility; see docs/rom-boot-investigation.md.

## Errors And State Validation

Follow this section and, when available, README.local.md's error policy when
adding or changing commands.

- For V9968-only operations, missing required extension state, unsupported screen
  modes, and invalid argument ranges use BASIC error 5, Illegal function call.
  Do not silently enable extensions from drawing commands. Explicit initializers
  such as _V9968 and _SCREEN(5/6/7/8) are allowed to enable them.
- Separate validation from initialization. Specify each command's required state,
  initializer/cleanup role, and behavior when already disabled. Do not require
  V9968-only state for operations that do not depend on it.
- Use error 2 for extension syntax errors and error 7 for insufficient RAM/stack
  space detected during BASIC execution. Preserve errors from BASIC expression,
  type, string, and file processing instead of translating every failure to 5.
- Send extension errors through src/parser.asm's basic_error path with the error
  number in E (CALBAS to ERROR). Do not print a message and return, jump directly
  to the prompt, or add a replacement global error handler.
- Validate before changing drawing, palette, extension mode, or ownership state.
  Respect BASIC's error unwinding; normal RET cleanup is not guaranteed to run.
  Add tests for ERR, ERL, ON ERROR, RESUME/RESUME NEXT, subsequent valid commands,
  and unchanged extension-owned state after rejected operations.

The CALL command paths now validate required bits without auto-enabling them.
Keep HS optional and preserve unrelated R#20/R#21 settings. Only explicit SCREEN
initialization resets these registers. FID detection must restore R#21 before
returning or reporting an error. Memory checks and broader lifecycle audits
remain outstanding; passing the state tests does not close those audit items.

## Register Access And SCREEN 8

The [extended register API](docs/commands.md#vdp-register-plan) implements _VDP(n)=X
for n=48..59, x=0..255, retaining native BASIC numbering (48 writes R#47).
It requires ECOM, waits for previous VDP execution, and does not start a command.
Existing control registers remain native VDP's responsibility, including BASIC
shadows. Do not add a read function or RAM mirror without a separate design.
Raw commands started through native VDP do not gain extension VRAM protection.

SCREEN 8 supports _SCREEN(8), _COLOR with all 256 palette entries and extension
drawing/page/COPY commands, alongside native BASIC drawing. Extension drawing
commands support SCREEN 5/6/7/8; extension
font commands remain SCREEN-5-only; sprites accept SCREEN 1..6. Both reject FIL.
Keep sprite palette-set parsing at 0..15; only drawing colors accept 0..255
in SCREEN 8. Omitted foreground/background colors retain all eight bits there.
Normal pages are 0..3 (64KB), FIL pages 0..1 (128KB), X=0..255. SCREEN 10..12
remain a separate YJK design and must still reject ordinary extension drawing.
Explicit PATTERN drawing is a separate 4bpp material operation, not YJK output.
Native SCREEN 10..12 share SCRMOD=8: check RG25SAV's YJK bit as well, including
partial FIL entry. Explicit _SCREEN(8) is allowed to reset YJK through SUB-ROM.
tests/screen8.mjs checks all 256x256 color pairs for all logical operators,
normal/FIL transforms, native parity, synchronous returns, errors/recovery,
data protection and physical font/SAT reservations on both Z80 and R800.
tests/screen8-pages.mjs pins the renderer limitation: normal pages 2/3 display
as 0/1, FIL page 1 as FIL page 0. All four normal/two FIL pages are distinct
for drawing/COPY. Do not claim upper displayed pages or change emulator code.
The SCREEN 8 FIL renderer clips X=255; the user has already reported this bug
to the emulator author. Keep correct edge pixels in VRAM, test them separately
from the known display clipping, and do not shift BASIC coordinates to hide it.
Test register/state changes with tests/vdp.mjs on Z80 and R800; palette-demo.mjs
checks unchanged VRAM during palette animation and optionally rendered pixels.

## SCREEN 6

- _SCREEN(6) delegates to native SCREEN. Drawing/COPY/page commands support
  normal and FIL SCREEN 6: X=0..511, Y=0..255 or 0..511, colors 0..3.
  Explicit out-of-range colors use ERR=5; omitted colors mask BASIC foreground
  or background to two bits. Keep sprite palette-set parsing at 0..15.
- Normal pages are 0..7 (32KB, 512x256), FIL pages 0..3 (64KB, 512x512).
  ACPAGE/DPPAGE stay in native 256-row units. Physical font/SAT protection is
  in native page 6, Y=236..255, like SCREEN 5; FIL uses public page 3.
  Font support remains restricted to non-FIL SCREEN 5. Mode 3 now accepts
  non-FIL SCREEN 6 via its own guard; do not loosen the font guard. Patterns
  retain the physical SCREEN 5 4bpp layout and 0..2047 numbering, palettes
  remain 0..15, SAT stays at 37E00h..37FFFh. Material can be prepared on
  SCREEN 5 page 7 before native SCREEN 6 and _SPRITE(3).
  The pinned fork clips mode-3 drawing at X=256 even in SCREEN 6. Keep correct
  SAT coordinates, do not compensate in BASIC or claim full-width rendering.
  tests/sprite-screen6.mjs --visual checks both left-half rendering and this
  limitation on Z80/R800. Font development remains paused.
- Reuse SCREEN 7's 9-bit X fields and SCREEN 5's page/protection mapping.
  No resident RAM, CALL-frame, transient-stack or VRAM reservation growth.
  Allocation/headroom audits remain open; do not generalize the allocator.
- tests/screen6.mjs covers native parity, all 4x4 color pairs and ten logical
  operators, normal/FIL transforms, source-window transparency, all pages,
  512x512/chained synchronous COPY, errors/recovery and BASIC/VRAM protection
  on Z80/R800. --visual checks 512x424, one-pixel lines, bottom-right pixel
  and all displayed pages. On the pinned fork, normal pages 4..7 display 0..3
  and FIL pages 2..3 display 0..1. All eight/four pages remain distinct for
  drawing/COPY. Do not claim upper display support or modify emulator code.

## SCREEN Delegation And Shuffle

- `_SCREEN(M,S,K,B,P,I,H,V)` retains native SCREEN argument positions 1..6;
  argument 7 is a 0..3 bitmask: bit 0 = SPS, bit 1 = S16. Evaluate once and
  validate everything before mutation.
  Delegate validated constants through MAIN EXTROM to SUB-ROM SCREEN, never to
  machine-specific internal addresses. The native token buffer lives only in
  the existing CALL frame; do not grow it or introduce resident state.
- Explicit mode 0/5/6/7/8 initializes extension state and defaults both flags to OFF.
  Omitted mode updates only supplied fields. Sprite-flag-only calls bypass native
  SCREEN, preserving VRAM, reservations, hooks, pages and unrelated registers.
- Update R#25 bit 7 / RG25SAV for SPS and R#20 bit 7 / RG20SAV for S16,
  preserving other bits. Both are independent of ECOM/EVR/EPAL. Nonzero flags
  are invalid in SCREEN 0. Require MSX2+ or later for RG25SAV.
- Native size changes clear sprite tables. Reject partial size updates while
  SP3 or the font reservation is active; full screen initialization is allowed.
  Mode-3 size remains per-sprite SIZE(W,H). Sprite commands must preserve both
  flags; mode 3 always has a 16-per-line limit regardless of S16.
- Test native argument parity, expression evaluation count, errors/RESUME and
  partial state preservation on Z80/R800 using tests/shuffle.mjs. Its --visual
  mode checks hardware priority changes and line overflow over 64 frames.
- Test native modes 1/2 with tests/sprite16.mjs --visual: 4/8 versus 16 per
  line, overflow, SPS combinations, unchanged VRAM and native-limit restoration.
  Do not change the existing shuffle demo's native 4/8-sprite comparison.
- Argument 8 is SVNS: 0 = sprites follow vertical scrolling, 1 = independent.
  Update only R#20 bit 1 / RG20SAV, preserving ILNS and all unrelated bits.
  Omitted mode retains omitted flags; explicit mode 0/5/6/7/8 defaults SVNS OFF.
  Reject SVNS=1 in SCREEN 0. It needs neither ECOM/EVR/EPAL nor new RAM/VRAM.
  Keep the 256-byte CALL frame and native token buffer unchanged in size.
  tests/shuffle.mjs covers validation/state; tests/svns.mjs checks rendered
  scrolling in sprite modes 1/2/3 on Z80/R800. ILNS remains outside this API.

## Flat Interlace

- SCREEN argument 6 accepts 4 for FIL (R#21 bit 6), not a ninth argument.
  Values 0..3 retain native semantics and clear FIL. Map 4 to native I=0 in
  the temporary SUB-ROM token stream, then apply FIL separately. Preserve
  unrelated R#21 bits on partial updates; omitted I preserves FIL unless the
  screen mode itself is supplied. Validate before native or VDP mutation.
- Allow FIL selection in SCREEN 5/6/7/8 only; partial entry requires EVR,
  valid even native display/active pages, and no active font/mode-3 reservation.
  Full screen initialization may release those features as before. FIL
  font/sprite commands remain unsupported.
- SCREEN 5 FIL coordinates are X=0..255, Y=0..511 (normally 424 visible rows).
  Public pages are 0..3 in 64KB units. SCREEN 6 uses the same page units with
  512 two-bit pixels per row. SCREEN 7 accepts X=0..511 in normal/FIL
  modes, with normal pages 0..3 (64KB) and FIL pages 0..1 (128KB). SCREEN 8
  uses those same page units with 256 byte-color pixels per row.
  Keep ACPAGE/DPPAGE in native 256-row units (32KB for SCREEN 5/6, 64KB for 7/8),
  and reject odd active native pages for FIL drawing. Do not reinterpret BASIC
  shadows as private state. Normal coordinates/pages retain their old bounds.
- High Y bytes use existing CALL-frame offsets 60..63, not new resident RAM or
  a larger frame. High X bytes use offsets 27..30, disjoint from the register
  image 0..26 and token buffers 64+. Keep native token/scale buffers disjoint and protect active
  font/SAT reservations even after raw VDP enables FIL. COPY stays synchronous.
- tests/interlace.mjs checks mode transitions, single evaluation, error recovery,
  data preservation, 255/256 boundaries, 512-row drawing/copies, transformations,
  reservations and rendered coordinates on Z80/R800. Also run smoke/font/shuffle
  and disk regressions because parsing and drawing are shared with normal mode.
  Existing allocation/stack-headroom audit gaps remain open; this does not
  generalize the startup allocator or the restricted SLTWRK ownership model.
- SCREEN 7/8's planar mapping puts physical font/SAT reservations in native page 2,
  Y=236..255, one plane. Protect the whole row conservatively; CLS stops before
  the first active reservation. Do not drop protection after native SCREEN changes.
  Font extension commands remain restricted to non-FIL SCREEN 5; sprites
  accept non-FIL SCREEN 1..6 only. SCREEN 7..12 mode-3 remains rejected: the pinned
  fork does not disable planar CPU VRAM addressing when SP3 is enabled,
  contrary to the author's documented mapping. Do not introduce emulator-
  specific SAT relocation or change emulator code. tests/sprite-planar-probe.mjs
  reproduces the difference with native OUTs; see docs/sprite-screen-investigation.md.
- tests/screen7.mjs checks native SET PAGE parity, four normal/two FIL drawing
  pages, 512x512 synchronous copies and transforms, both 9-bit axes, planar
  reservation protection and 512x424 rendered pixels on Z80/R800. The pinned
  fork has upper-VRAM display limitations: SCREEN 7 FIL page 1 is usable for
  drawing/COPY, not a verified second displayed page. Do not hide this limitation
  or change emulator code as part of the BASIC command implementation.

## Pattern Drawing And Sprite Coverage

- `_PATTERN ON(n)` accepts physical SCREEN-5-format pages 0..7; `_PATTERN OFF`
  is idempotent and works without V9968 state. Repeated ON replaces the page;
  rejected arguments leave the old state unchanged. ON requires ECOM/EVR.
- Only extension PSET/LINE/CIRCLE/CLS/COPY load this state. FG4 always uses 256x256,
  16 colors and 32KB pages, even under FIL or YJK. COPY uses its explicit VRAM
  page arguments, not the configured destination. No RGB/YJK conversion is implied.
  Native drawing/GRP, FONT, SPRITE and SET PAGE retain their previous meanings.
- Force R#45 bit 7 per command; finish FG4 draws before clearing R#45 to 0.
  Keep ordinary drawing and shared submit_command asynchronous, COPY synchronous,
  and do not add VBLANK waits. Protect physical font/SAT reservations on page 6.
- State lives at offset 31 of the existing 32-byte boot reservation, initialized
  at allocation and preserved by first font installation. No allocation growth,
  runtime allocator, changed lifetime or new VRAM reservation. Existing SLTWRK
  restrictions remain. IX+31 is a disjoint per-drawing snapshot in the unchanged
  CALL frame. State helpers save BC/DE/HL transiently (6 bytes plus return PCs).
- CLEAR/NEW/RUN and full _SCREEN reset OFF. Native SCREEN, partial _SCREEN,
  MAXFILES, errors and STOP/END preserve it. Missing reservation: ON returns
  ERR=7, OFF is a no-op. No extra hook is installed for MAXFILES.
- Final sprite target is every native mode except SCREEN 0. The user approved
  shipping non-FIL SCREEN 1..6 first and leaving SCREEN 7..12 rejected until
  the fork's planar/SP3 mapping is fixed. Do not modify the emulator, relocate
  SAT to another area or claim those modes work. FONT remains paused/SC5 only.
- tests/pattern.mjs covers both CPUs, all available native modes, FIL, physical
  pages, logical/transformed/in-place copies, synchronous returns, errors,
  reservation and BASIC-data protection, first font install, lifecycle and CALL
  stack boundary checks. tests/sprite-screens.mjs --visual covers modes 1..6.

## CIRCLE

- `_CIRCLE [STEP](X,Y),R[,C,S,E,A]` supports SC5..8 normal/FIL and PATTERN.
  Angles are radians, negative endpoints request radii, positive A is the
  vertical/horizontal aspect. R=0..32767 after BASIC integer conversion.
  Use ASPCT2/256 for native default aspect (already adjusted by SCREEN), double
  it for FIL; PATTERN defaults to 1. Explicit aspects are not mode-adjusted.
- Centres/deltas use signed CINT conversion (-32768..32767). STEP adds to
  GRPACX/GRPACY after both coordinate expressions, wrapping at 16 bits like native.
  Commit the centre only after all rejecting validation, even if fully clipped
  or in PATTERN. Do not undo USR side effects; success commits the parsed centre.
  No global relaxation of get_point or other commands' strict coordinate guards.
  Non-integers use CINT of an owned numeric token through page-1 CALBAS; do not
  directly CALBAS page-0 FRCINT, whose RST dependencies also require MAIN page 1.
- Clip signed ellipse bounds before font/SAT checks; skip VDP mutation for an
  empty intersection. Prevent signed underflow wrapping into visible points.
  Outside-centre radius lines skip the off-page major span with phase-correct
  32/16 division, then draw at most 512 points. Reuse completed raster scratch.
- Evaluate original expressions once. Owned numeric literals in the CALL frame
  may be evaluated again, but never retain BASIC data pointers or replay USR/RND.
  Validate all inputs/state/page and the clipped whole-ellipse bounding Y range
  against font/SAT before issuing any VDP command. Native writes remain unguarded.
- Midpoint raster state and signed Q14 math use existing frame offsets 64..126;
  literals 128..136, 192..200, 208..216; expression scratch 144..191. Expanded
  templates must fit 48 bytes. No new persistent RAM, frame growth or VRAM reserve.
  Nested calls/saved registers still use transient stack; allocator audit stays open.
- After validation and all BASIC evaluation, reuse command/drawing scratch
  0..11, 14..25, 27..30, 32..39, 44..55 for octant masks/cross products,
  incremental aspect fractions and symmetric coordinates. Keep ARG (13),
  PATTERN_CONTEXT (31), DPAGE (41), COLOR (42) and TEXTPTR (58..59) intact.
  Do not call shared submit_command or BASIC evaluation after this reuse.
  The two arc-boundary cross products use signed 32-bit incremental updates;
  Q14 aspect fractions retain the old rounding. No multiplication in the
  circumference hot loop; endpoint/radius setup still uses the shared helpers.
- Circle point submission changes only its own R36..39/R44..46; do not change
  shared submit_command. Normal CIRCLE retains ordinary asynchronous drawing;
  PATTERN waits for final completion before clearing R45. No VBLANK wait.
  Set color/ARG once after waiting for the preceding command, then wait and
  submit only coordinates/PSET per point. Restore S0 through the existing wait.
- tests/circle.mjs covers both CPUs, native geometry (not exact arc raster parity),
  independent geometry, normal/FIL pages, FG4 and failure/BASIC/VRAM protection.
  Its independent Q14 cross-product oracle covers all octants and compressed
  arcs. tests/circle-speed.mjs compares native/extension BASIC TIME for 20
  radius-60 shapes on both CPUs; --compare=path adds exact old-ROM pixel checks.
  tests/circle-position.mjs checks signed extremes, exact clipped arcs/radii,
  STEP/native/GRP cursor integration, error atomicity and reservations on both CPUs.
  Its raster oracle uses parsed Q14 directions to isolate BASIC trig precision,
  then computes points/line stepping independently. Keep full-page clipping
  (256/512 rows), not native visible
  rows. Native pixel rounding and error-side cursor mutations are not emulated.
  Keep SCREEN7+ sprites and further fonts/kanji pending; no emulator changes.

## Future External Cartridge Target

The user also wants to consider an external V9968 cartridge, not only integrated
MSX2++ hardware. A compile-time I/O target is the first candidate; no runtime
configuration RAM is justified yet. Port substitutions alone are not a claim
of compatibility: audit native SCREEN/BIOS delegation, native drawing and GRP,
shadows, interrupts/VBLANK and chip detection against the actual cartridge BIOS
and the coexistence of internal/external VDPs. This is planned, not implemented.
