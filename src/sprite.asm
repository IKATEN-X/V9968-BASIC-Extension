; スプライトモード3のSAT: ページ6、Y=252..255（37E00h..37FFFh）。
; IX+0..7にハードウェア属性1件分を、IX+32にそのスプライト面番号を置く。
; パターンの基点R#6は0なので、P = VRAMページ * 256 + タイルY * 16 + タイルX。
defc SPRITE_PLANE = 32

cmd_sprite:
    call open_args
    call get_byte
    cp 3
    jr z,sprite_mode_valid
    or a
    jp nz,illegal
sprite_mode_valid:
    ld (ix+TEMP),a
    call close_args
    call end_statement
    call require_sprite_graphics
    call require_palette
    call wait_vdp
    call sprite_disable
    ld a,(ix+TEMP)
    or a
    jr nz,sprite_init
    ld a,(RG20SAV)
    and $f7
    jp write_mode20
sprite_init:
    ld a,(RG20SAV)
    or 8
    call write_mode20
    ld a,$fc
    ld (RG5SAV),a
    ld c,5
    call write_reg
    ld a,6
    ld (RG11SAV),a
    ld c,11
    call write_reg
    xor a
    ld (RG6SAV),a
    ld c,6
    call write_reg
    call clear_sprites
    jp sprite_enable

require_sprite:
    ld a,(RG20SAV)
    bit 3,a
    jp z,illegal
    call require_sprite_graphics
    jp require_palette

require_sprite_graphics:
    ld a,(SCRMOD)
    or a
    jp z,illegal
    cp 7
    jp nc,illegal           ; 検証対象のforkでは、プレーン形式でのSP3アドレス処理に不具合がある。
sprite_graphics_normal:
    ld a,(RG21SAV)
    bit 6,a
    jp nz,illegal
    jp require_drawing_extensions

cmd_sprite_on:
    call end_statement
    call require_sprite
sprite_enable:
    ld a,(RG8SAV)
    and $fd
    jr sprite_visibility
sprite_disable:
    ld a,(RG8SAV)
    or 2
sprite_visibility:
    ld (RG8SAV),a
    ld c,8
    jp write_reg

cmd_sprite_off:
    call skip_space
    cp '('
    jr z,sprite_hide_plane
    call end_statement
    call require_sprite
    jp sprite_disable
sprite_hide_plane:
    call sprite_number_start
    call close_args
    call end_statement
    call require_sprite
    call save_text
    call read_sprite
    ld (ix+0),254           ; BASIC上のY=511（SATのY=510）。終端マーカーは使わない。
    ld a,(ix+1)
    and $fc
    or 1
    ld (ix+1),a
    call write_sprite
    jp restore_text

cmd_sprite_clear:
    call end_statement
    call require_sprite
clear_sprites:
    call save_text
    ld (ix+0),254
    ld (ix+1),1
    ld (ix+2),16
    ld (ix+3),0
    ld (ix+4),0
    ld (ix+5),0
    ld (ix+6),16
    ld (ix+7),0
    ld (ix+SPRITE_PLANE),0
clear_sprite_loop:
    call write_sprite
    inc (ix+SPRITE_PLANE)
    ld a,(ix+SPRITE_PLANE)
    cp 64
    jr nz,clear_sprite_loop
    jp restore_text

sprite_number_start:
    call open_args
    call get_byte
    cp 64
    jp nc,illegal
    ld (ix+SPRITE_PLANE),a
    ret

cmd_put_sprite:
    call sprite_number_start
    call comma
    call require_sprite
    call save_text
    call read_sprite
    call restore_text
    call get_sprite_coordinate
    ld (ix+4),e
    ld a,(ix+5)
    and $70
    or d
    ld (ix+5),a
    call comma
    call get_sprite_coordinate
    ; 検証対象のforkでは、SATのY座標より背景1行分下に表示される。
    dec de
    ld a,d
    and 3
    ld d,a
    or a
    jr nz,sprite_y_valid
    ld a,e
    cp 216
    jr nz,sprite_y_valid
    ld de,510              ; BASIC上のY=217は画面外。SATの終端にはしない。
sprite_y_valid:
    ld (ix+0),e
    ld a,(ix+1)
    and $c0
    or d
    ld (ix+1),a
    call close_args
    cp ','
    jp nz,sprite_parsed
    call comma
    call empty_field
    jr z,sprite_palette_done
    call get_color
    ld b,a
    ld a,(ix+3)
    and $f0
    or b
    ld (ix+3),a
sprite_palette_done:
    call skip_space
    cp ','
    jp nz,sprite_parsed
    call comma
    call empty_field
    jr z,sprite_options
    call get_int
    ld a,d
    cp 8
    jp nc,illegal
    rlca
    rlca
    rlca
    rlca
    ld b,a
    ld a,(ix+5)
    and 3
    or b
    ld (ix+5),a
    ld (ix+7),e
sprite_options:
    call skip_space
    cp ','
    jp nz,sprite_parsed
    call comma
    cp 'S'
    jr z,sprite_size
    cp 'P'
    jr z,sprite_pattern
    cp 'F'
    jp z,sprite_flip
    cp 'T'
    jp nz,syntax_error
    jp sprite_transparency
sprite_size:
    ld de,word_size
    call match_word
    call open_args
    call get_sprite_dimension
    ld (ix+6),a
    call comma
    call get_sprite_dimension
    ld (ix+2),a
    call close_args
    jr sprite_options
sprite_pattern:
    ld de,word_pattern
    call match_word
    call open_args
    call get_byte
    ld b,0
    cp 16
    jr z,sprite_pattern_valid
    ld b,$40
    cp 32
    jr z,sprite_pattern_valid
    ld b,$80
    cp 64
    jr z,sprite_pattern_valid
    ld b,$c0
    cp 128
    jp nz,illegal
sprite_pattern_valid:
    ld a,(ix+1)
    and 3
    or b
    ld (ix+1),a
    call close_args
    jr sprite_options
sprite_flip:
    ld de,word_flip
    call match_word
    call open_args
    call get_byte
    cp 4
    jp nc,illegal
    rlca
    rlca
    rlca
    rlca
    ld b,a
    ld a,(ix+3)
    and $cf
    or b
    ld (ix+3),a
    call close_args
    jp sprite_options
sprite_transparency:
    ld de,word_trans
    call match_word
    call open_args
    call get_byte
    ld b,0
    or a
    jr z,sprite_trans_valid
    ld b,$40
    cp 25
    jr z,sprite_trans_valid
    ld b,$80
    cp 50
    jr z,sprite_trans_valid
    ld b,$c0
    cp 75
    jp nz,illegal
sprite_trans_valid:
    ld a,(ix+3)
    and $3f
    or b
    ld (ix+3),a
    call close_args
    jp sprite_options
sprite_parsed:
    call end_statement
    ; 転送元の行は1ページ内に収め、予約されたSATを読み出さない。
    ld a,(ix+1)
    rlca
    rlca
    and 3
    ld b,a
    ld a,16
    inc b
sprite_source_height:
    dec b
    jr z,sprite_source_bounds
    add a,a
    jr sprite_source_height
sprite_source_bounds:
    dec a
    ld b,a
    ld a,(ix+7)
    and $f0
    add a,b
    jp c,illegal
    ld b,a
    ld a,(ix+5)
    and $70
    cp $60
    jr nz,sprite_commit
    ld a,b
    cp 252
    jp nc,illegal
    call font_active
    jr z,sprite_commit
    ld a,b
    cp FONT_TOP
    jp nc,illegal
sprite_commit:
    call save_text
    call write_sprite
    jp restore_text

get_sprite_coordinate:
    call get_int
    ld a,d
    add a,2
    cp 4
    jp nc,illegal
    ld a,d
    and 3
    ld d,a
    ret
get_sprite_dimension:
    call get_int
    ld a,d
    or a
    jr nz,sprite_dimension_256
    ld a,e
    or a
    jp z,illegal
    ret
sprite_dimension_256:
    cp 1
    jp nz,illegal
    ld a,e
    or a
    jp nz,illegal
    ret

; VRAMに書き込む前に8バイトすべてを検証する。HLは呼び出し元が保存する。
; 割り込み禁止は1件分の更新中だけとし、R#14をBIOS側の保存値へ戻す。
read_sprite:
    call wait_vdp
    xor a
    call sprite_vram_address
    ld bc,$0898
    inir
    jp sprite_vram_done
write_sprite:
    call wait_vdp
    ld a,$40
    call sprite_vram_address
    ld bc,$0898
    otir
sprite_vram_done:
    ld a,(RG14SAV)
    out ($99),a
    ld a,$8e
    out ($99),a
    ei
    ret
sprite_vram_address:
    ld d,a
    ld a,(ix+SPRITE_PLANE)
    ld l,a
    ld h,0
    add hl,hl
    add hl,hl
    add hl,hl
    di
    ld a,13
    out ($99),a
    ld a,$8e
    out ($99),a
    ld a,l
    out ($99),a
    ld a,h
    or $3e
    or d
    out ($99),a
    push ix
    pop hl
    ret

check_sprite_destination:
    call check_font_destination
    ld a,(RG20SAV)
    bit 3,a
    ret z
    call reserved_drawing_page
    ret nz
    ld a,(ix+DY1H)
    or (ix+DY2H)
    jr z,sprite_destination_low
    ld a,(ix+DY1H)
    and (ix+DY2H)
    ret nz
    jp illegal              ; 255/256をまたぐ範囲は予約されたSATを横切る。
sprite_destination_low:
    ld a,(ix+DY1)
    cp 252
    jp nc,illegal
    ld a,(ix+DY2)
    cp 252
    jp nc,illegal
    ret

word_size:
    defb "SIZE",0
word_pattern:
    defb "PATTERN",0
word_flip:
    defb "FLIP",0
word_trans:
    defb "TRANS",0
