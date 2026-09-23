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
    inc hl
    ld b,h
    ld c,l
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
    ld h,b
    ld l,c
    ld b,1                ; 頭文字は索引で確定済み。Bは空白を除く一致文字数。
dispatch_next:
    ld a,(de)
    cp b
    ; 辞書順なので、一致済みの接頭辞より手前で変わる候補には一致しない。
    jp c,dispatch_unknown
    inc de
    jr nz,dispatch_skip_record
    ld a,(de)
    inc de
    add a,b
    ld c,a                ; 次候補までの距離に一致文字数を加えて保持する。
dispatch_compare:
    ld a,(hl)
    cp ' '
    jr nz,dispatch_char
    inc hl
    jr dispatch_compare
dispatch_char:
    ld a,(de)
    cp (hl)
    jr nz,dispatch_mismatch
    inc de
    inc hl
    inc b
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
dispatch_mismatch:
    jp nc,dispatch_unknown ; 候補の文字が入力より大きければ、それ以降も一致しない。
    ld a,c
    sub b
    jr dispatch_skip_distance
dispatch_skip_record:
    ; 前候補の不一致文字まで共通なら、この候補も文字比較なしで飛ばせる。
    ld a,(de)
    inc de
dispatch_skip_distance:
    add a,e
    ld e,a
    jr nc,dispatch_next
    inc d
    jr dispatch_next
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

; 辞書順の候補: 前候補との共通文字数、文字列先頭から次候補への距離、残りの文字列、処理先。
; 最初の候補は頭文字1文字が確定済み。共通文字数0はグループ終端。
; 距離と共通文字数の和は255以下に収める。表の整合性はdispatchテストで検証する。
commands:
commands_c:
    defb 1
    defb commands_circle_step - $ - 1
    defb "IRCLE",0
    defw cmd_circle
commands_circle_step:
    defb 6
    defb commands_cls - $ - 1
    defb "STEP",0
    defw cmd_circle_step
commands_cls:
    defb 1
    defb commands_color - $ - 1
    defb "LS",0
    defw cmd_cls
commands_color:
    defb 1
    defb commands_copy - $ - 1
    defb "OLOR=",0
    defw cmd_palette
commands_copy:
    defb 2
    defb commands_c_end - $ - 1
    defb "PY",0
    defw cmd_copy
commands_c_end:
    defb 0
commands_f:
    defb 1
    defb commands_f_end - $ - 1
    defb "ONT",0
    defw cmd_font
commands_f_end:
    defb 0
commands_l:
    defb 1
    defb commands_l_end - $ - 1
    defb "INE",0
    defw cmd_line
commands_l_end:
    defb 0
commands_p:
    defb 1
    defb commands_pattern_on - $ - 1
    defb "ATTERNOFF",0
    defw cmd_pattern_off
commands_pattern_on:
    defb 8
    defb commands_pset - $ - 1
    defb "N",0
    defw cmd_pattern_on
commands_pset:
    defb 1
    defb commands_put_sprite - $ - 1
    defb "SET",0
    defw cmd_pset
commands_put_sprite:
    defb 1
    defb commands_p_end - $ - 1
    defb "UTSPRITE",0
    defw cmd_put_sprite
commands_p_end:
    defb 0
commands_s:
    defb 1
    defb commands_set_page - $ - 1
    defb "CREEN",0
    defw cmd_screen
commands_set_page:
    defb 1
    defb commands_sprite - $ - 1
    defb "ETPAGE",0
    defw cmd_page
commands_sprite:
    defb 1
    defb commands_sprite_clear - $ - 1
    defb "PRITE",0
    defw cmd_sprite
commands_sprite_clear:
    defb 6
    defb commands_sprite_off - $ - 1
    defb "CLEAR",0
    defw cmd_sprite_clear
commands_sprite_off:
    defb 6
    defb commands_sprite_on - $ - 1
    defb "OFF",0
    defw cmd_sprite_off
commands_sprite_on:
    defb 7
    defb commands_s_end - $ - 1
    defb "N",0
    defw cmd_sprite_on
commands_s_end:
    defb 0
commands_v:
    defb 1
    defb commands_vdp - $ - 1
    defb "9968",0
    defw cmd_init
commands_vdp:
    defb 1
    defb commands_v_end - $ - 1
    defb "DP",0
    defw cmd_vdp
commands_v_end:
    defb 0
commands_w:
    defb 1
    defb commands_wait_vdp - $ - 1
    defb "AITVBLANK",0
    defw cmd_wait_vblank
commands_wait_vdp:
    defb 5
    defb commands_end - $ - 1
    defb "DP",0
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
