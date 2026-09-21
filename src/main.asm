    include "msx.inc"
    org $4000
    defb "AB"
    defw font_boot,statement,0,0,0,0,0

; 描画用の一時データはスタック上に置く。フォント出力フックの小さなワーク領域は
; 起動時に予約し、このカートリッジのSLTWRKエントリから参照する。
statement:
    push hl
    ld de,commands
dispatch_next:
    ld hl,PROCNM
dispatch_compare:
    ld a,(hl)
    cp ' '
    jr nz,dispatch_char
    inc hl
    jr dispatch_compare
dispatch_char:
    ld a,(de)
    cp (hl)
    jr nz,dispatch_skip
    inc de
    inc hl
    or a
    jr nz,dispatch_compare
    ld a,(de)
    ld c,a
    inc de
    ld a,(de)
    ld b,a
    pop de
    push ix
    ; フレームに加え、ROM/BIOSの入れ子呼び出しと割り込み用に256バイトを確保する。
call_stack_check:
    ld hl,-512
    add hl,sp
    jp nc,out_of_memory
    push de
    ld de,(STREND)
    or a
    sbc hl,de
    pop de
    jp c,out_of_memory
    jp z,out_of_memory
call_frame_allocate:
    ld hl,-256
    add hl,sp
    ld sp,hl
    push hl
    pop ix
    push bc
    push de
    push hl
    pop de
    inc de
    ld (hl),0
    ld bc,255
    ldir
    pop hl
    pop bc
    call jump_bc
    call end_statement
    ex de,hl
    ld hl,256
    add hl,sp
    ld sp,hl
    ex de,hl
    pop ix
    or a
    ret
dispatch_skip:
    ld a,(de)
    inc de
    or a
    jr nz,dispatch_skip
    inc de
    inc de
    ld a,(de)
    or a
    jr nz,dispatch_next
    pop hl
    scf
    ret
jump_bc:
    push bc
    ret

commands:
    defb "V9968",0
    defw cmd_init
    defb "VDP",0
    defw cmd_vdp
    defb "SCREEN",0
    defw cmd_screen
    defb "SETPAGE",0
    defw cmd_page
    defb "COLOR=",0
    defw cmd_palette
    defb "LINE",0
    defw cmd_line
    defb "PSET",0
    defw cmd_pset
    defb "CIRCLE",0
    defw cmd_circle
    defb "CIRCLESTEP",0
    defw cmd_circle_step
    defb "CLS",0
    defw cmd_cls
    defb "COPY",0
    defw cmd_copy
    defb "PATTERNON",0
    defw cmd_pattern_on
    defb "PATTERNOFF",0
    defw cmd_pattern_off
    defb "WAITVDP",0
    defw cmd_wait_vdp
    defb "WAITVBLANK",0
    defw cmd_wait_vblank
    defb "SPRITE",0
    defw cmd_sprite
    defb "PUTSPRITE",0
    defw cmd_put_sprite
    defb "SPRITEON",0
    defw cmd_sprite_on
    defb "SPRITEOFF",0
    defw cmd_sprite_off
    defb "SPRITECLEAR",0
    defw cmd_sprite_clear
    defb "FONT",0
    defw cmd_font
    defb 0

    include "parser.asm"
    include "pattern.asm"
    include "vdp.asm"
    include "graphics.asm"
    include "circle.asm"
    include "transform.asm"
    include "copy-array.asm"
    include "sprite.asm"
    include "font.asm"
    include "sine.inc"
rom_end:
