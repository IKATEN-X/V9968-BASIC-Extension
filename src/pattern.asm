; 新規確保はせず、既存の起動時予約領域内の1バイトを使う。
; 0 = 通常描画、80h..87h = FG4と転送先の物理32KBページ。
defc PATTERN_STATE = 31

pattern_address:
    call font_state
    ld a,h
    or a
    ret z
    res 0,l
    ld de,PATTERN_STATE
    add hl,de
    ret

cmd_pattern_on:
    call open_args
    call get_byte
    cp 8
    jp nc,illegal
    or $80
    ld (ix+PATTERN_CONTEXT),a
    call close_args
    call end_statement
    call require_drawing_extensions
    call save_text
    call pattern_address
    jp z,out_of_memory
    ld a,(ix+PATTERN_CONTEXT)
    ld (hl),a
    jp restore_text

cmd_pattern_off:
    call end_statement
pattern_off:
    push bc
    push de
    push hl
    call pattern_address
    jr z,pattern_off_done
    ld (hl),0
pattern_off_done:
    pop hl
    pop de
    pop bc
    ret

; 描画の入口だけでこの状態を読み込む。PAGE、FONT、SPRITEの動作は変えない。
pattern_begin:
    push bc
    push de
    push hl
    call pattern_address
    jr z,pattern_begin_done
    ld a,(hl)
    ld (ix+PATTERN_CONTEXT),a
    and $80
    ld (ix+13),a
pattern_begin_done:
    pop hl
    pop de
    pop bc
    ret

drawing_mode:
    bit 7,(ix+13)
    ld a,5
    ret nz
    ld a,(SCRMOD)
    ret

drawing_active_page:
    bit 7,(ix+13)
    ld a,(ACPAGE)
    jp z,validate_drawing_page
    ld a,(ix+PATTERN_CONTEXT)
    and 7
    ret

; ARGは実行中のコマンドにも影響するため、FG4の完了を待ってから解除する。
; 標準BASICのPOINTや描画に、強制したピクセル形式を持ち越さない。
pattern_finish:
    bit 7,(ix+13)
    ret z
    call wait_vdp
pattern_clear_argument:
    bit 7,(ix+13)
    ret z
    xor a
    ld c,45
    jp write_reg
