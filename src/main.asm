    include "msx.inc"
    org $4000
    defb "AB"
    defw font_boot,statement,0,0,0,0,0

; 描画用の一時データはスタック上に置く。フォント出力フックの小さなワーク領域は
; 起動時に予約し、このカートリッジのSLTWRKエントリから参照する。
statement:
    push hl
    ld hl,PROCNM
dispatch_initial:
    ld a,(hl)
    cp ' '
    jr nz,dispatch_index
    inc hl
    jr dispatch_initial
dispatch_index:
    ; 先頭の英字でROM内の表を引く。空の名前や範囲外の文字は未対応として返す。
    sub 'A'
    cp 26
    jp nc,dispatch_unknown
    add a,a
    ld l,a
    ld h,0
    ld de,command_initials
    add hl,de
    ld e,(hl)
    inc hl
    ld d,(hl)
    ld a,(de)
    or a
    jp z,dispatch_unknown
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
dispatch_unknown:
    pop hl
    scf
    ret
jump_bc:
    push bc
    ret

; A～Zの入口。命令がない英字は共通の空リストを参照する。
command_initials:
    defw commands_end      ; A
    defw commands_end      ; B
    defw commands_c        ; C
    defw commands_end      ; D
    defw commands_end      ; E
    defw commands_f        ; F
    defw commands_end      ; G
    defw commands_end      ; H
    defw commands_end      ; I
    defw commands_end      ; J
    defw commands_end      ; K
    defw commands_l        ; L
    defw commands_end      ; M
    defw commands_end      ; N
    defw commands_end      ; O
    defw commands_p        ; P
    defw commands_end      ; Q
    defw commands_end      ; R
    defw commands_s        ; S
    defw commands_end      ; T
    defw commands_end      ; U
    defw commands_v        ; V
    defw commands_w        ; W
    defw commands_end      ; X
    defw commands_end      ; Y
    defw commands_end      ; Z

; 各リストはアルファベット順。0で探索を終え、別の英字の命令には進まない。
commands:
commands_c:
    defb "CIRCLE",0
    defw cmd_circle
    defb "CIRCLESTEP",0
    defw cmd_circle_step
    defb "CLS",0
    defw cmd_cls
    defb "COLOR=",0
    defw cmd_palette
    defb "COPY",0
    defw cmd_copy
    defb 0
commands_f:
    defb "FONT",0
    defw cmd_font
    defb 0
commands_l:
    defb "LINE",0
    defw cmd_line
    defb 0
commands_p:
    defb "PATTERNOFF",0
    defw cmd_pattern_off
    defb "PATTERNON",0
    defw cmd_pattern_on
    defb "PSET",0
    defw cmd_pset
    defb "PUTSPRITE",0
    defw cmd_put_sprite
    defb 0
commands_s:
    defb "SCREEN",0
    defw cmd_screen
    defb "SETPAGE",0
    defw cmd_page
    defb "SPRITE",0
    defw cmd_sprite
    defb "SPRITECLEAR",0
    defw cmd_sprite_clear
    defb "SPRITEOFF",0
    defw cmd_sprite_off
    defb "SPRITEON",0
    defw cmd_sprite_on
    defb 0
commands_v:
    defb "V9968",0
    defw cmd_init
    defb "VDP",0
    defw cmd_vdp
    defb 0
commands_w:
    defb "WAITVBLANK",0
    defw cmd_wait_vblank
    defb "WAITVDP",0
    defw cmd_wait_vdp
commands_end:
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
