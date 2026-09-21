; 数値配列はBASICが管理する。メモリ確保や、非公開のVRAM一時領域は使わない。
; 既存のCALLフレーム内のオフセット64..77を、このコマンド専用に使う。
defc CA_TEXT = 64
defc CA_DATA = 66
defc CA_CAPACITY = 68
defc CA_BYTES = 70
defc CA_BITS = 72
defc CA_PACK = 73
defc CA_MASK = 74
defc CA_LAST = 75
defc CA_WRITE = 76
defc CA_FIRST = 77

copy_array_source:
    ld (ix+CA_WRITE),1
    call open_args
    call copy_array_name
    call close_args
    cp ','
    jr nz,copy_array_to
    call comma
    call get_byte
    cp 4
    jp nc,illegal
    add a,a
    add a,a
    or (ix+13)
    ld (ix+13),a
copy_array_to:
    ld a,TOK_TO
    call expect
    call get_point
    ld (ix+DX1),d
    ld (ix+DY1),e
    ld (ix+DX1H),b
    ld (ix+DY1H),a
    call comma
    call get_page
    ld (ix+DPAGE),a
    call skip_space
    cp ','
    jr nz,copy_array_parsed
    call comma
    call empty_field
    jr z,copy_array_parsed
    call get_copy_logic
    jr copy_array_parsed

; CALLの命令名は「(」で終わる。(配列名)と(Xの式,Y)を区別する。
; この先読みでは、式の評価やスカラー変数の作成を行わない。
copy_array_operand:
    push hl
    call skip_space
    cp '('
    jr nz,copy_array_operand_done
    inc hl
    call skip_space
    cp 'A'
    jr c,copy_array_operand_no
    cp 'Z'+1
    jr nc,copy_array_operand_no
copy_array_operand_name:
    inc hl
    call skip_space
    cp 'A'
    jr c,copy_array_operand_digit
    cp 'Z'+1
    jr c,copy_array_operand_name
copy_array_operand_digit:
    cp '0'
    jr c,copy_array_operand_suffix
    cp '9'+1
    jr c,copy_array_operand_name
copy_array_operand_suffix:
    cp '%'
    jr z,copy_array_operand_suffix_end
    cp '!'
    jr z,copy_array_operand_suffix_end
    cp '#'
    jr z,copy_array_operand_suffix_end
    cp '$'
    jr nz,copy_array_operand_close
copy_array_operand_suffix_end:
    inc hl
    call skip_space
copy_array_operand_close:
    cp ')'
    jr copy_array_operand_done
copy_array_operand_no:
    or 1
copy_array_operand_done:
    pop hl
    ret

copy_array_destination:
    call copy_array_name
copy_array_parsed:
    call end_statement
    call require_graphics
    call save_text
    ; 式の評価で配列が移動する場合があるため、この時点で参照先を再取得する。
    ld l,(ix+CA_TEXT)
    ld h,(ix+CA_TEXT+1)
    call copy_array_lookup
    call copy_array_bounds
    ld a,(ix+CA_WRITE)
    or a
    jp nz,copy_array_load

    ; 標準COPYと同様、指定された対角線の向きに従って画像を取得する。
    ld l,(ix+SX2)
    ld h,(ix+SX2H)
    ld e,(ix+SX1)
    ld d,(ix+SX1H)
    or a
    sbc hl,de
    jr nc,copy_array_width
    call negate_hl
    set 2,(ix+13)
copy_array_width:
    inc hl
    ld (ix+8),l
    ld (ix+9),h
    ld l,(ix+SY2)
    ld h,(ix+SY2H)
    ld e,(ix+SY1)
    ld d,(ix+SY1H)
    or a
    sbc hl,de
    jr nc,copy_array_height
    call negate_hl
    set 3,(ix+13)
copy_array_height:
    inc hl
    ld (ix+10),l
    ld (ix+11),h
    call copy_array_size
    call wait_vdp
    ld l,(ix+CA_DATA)
    ld h,(ix+CA_DATA+1)
    ld a,(ix+8)
    ld (hl),a
    inc hl
    ld a,(ix+9)
    ld (hl),a
    inc hl
    ld a,(ix+10)
    ld (hl),a
    inc hl
    ld a,(ix+11)
    ld (hl),a
    ld a,(ix+SX1)
    ld (ix+0),a
    ld a,(ix+SX1H)
    ld (ix+1),a
    ld a,(ix+SY1)
    ld (ix+2),a
    ld a,(ix+SPAGE)
    or (ix+SY1H)
    ld (ix+3),a
    ld (ix+14),$a0          ; LMCM。CPUの1回の読み取りで1色を受け取る。
    jp copy_array_start

copy_array_load:
    ld l,(ix+CA_DATA)
    ld h,(ix+CA_DATA+1)
    ld e,(hl)
    inc hl
    ld d,(hl)
    inc hl
    ld (ix+8),e
    ld (ix+9),d
    ld e,(hl)
    inc hl
    ld d,(hl)
    ld (ix+10),e
    ld (ix+11),d
    call copy_array_size
    ; コマンドも最初のピクセルも送る前に、両端の座標を検証する。
    ld l,(ix+DX1)
    ld h,(ix+DX1H)
    ld e,(ix+8)
    ld d,(ix+9)
    bit 2,(ix+13)
    call copy_array_end
    ld a,h
    call validate_x_high
    ld (ix+DX2),l
    ld (ix+DX2H),h
    ld l,(ix+DY1)
    ld h,(ix+DY1H)
    ld e,(ix+10)
    ld d,(ix+11)
    bit 3,(ix+13)
    call copy_array_end
    ld a,h
    cp 2
    jp nc,illegal
    ld (ix+DY2),l
    ld (ix+DY2H),h
    call require_graphics
    call check_sprite_destination
    ld a,(ix+DX1)
    ld (ix+4),a
    ld a,(ix+DX1H)
    ld (ix+5),a
    ld a,(ix+DY1)
    ld (ix+6),a
    ld a,(ix+DPAGE)
    or (ix+DY1H)
    ld (ix+7),a
    ld a,(ix+14)
    or $b0                  ; LMMC。コマンド発行時のR#44で最初のピクセルを渡す。
    ld (ix+14),a
    call copy_array_pointer
    ld a,(hl)
    call copy_array_rotate
    and (ix+CA_MASK)
    ld (ix+12),a
    ld (ix+CA_FIRST),1
copy_array_start:
    call submit_command
    call copy_array_pointer
    ld c,(ix+CA_BYTES)
    ld b,(ix+CA_BYTES+1)
copy_array_byte:
    ld e,(ix+CA_PACK)
    ld a,b
    or a
    jr nz,copy_array_slots
    ld a,c
    cp 1
    jr nz,copy_array_slots
    ld e,(ix+CA_LAST)
copy_array_slots:
    ld a,(ix+CA_WRITE)
    or a
    jr z,copy_array_read_byte
    ld d,(hl)
copy_array_write_pixel:
    ld a,d
    call copy_array_rotate
    ld d,a
    and (ix+CA_MASK)
    call copy_array_put_pixel
    dec e
    jr nz,copy_array_write_pixel
    jr copy_array_next_byte
copy_array_read_byte:
    ld d,0
copy_array_read_pixel:
    call copy_array_ready
    ld a,7
    call read_status
    and (ix+CA_MASK)
    push af
    ld a,d
    call copy_array_rotate
    ld d,a
    pop af
    or d
    ld d,a
    dec e
    jr nz,copy_array_read_pixel
    ld a,b
    or a
    jr nz,copy_array_store
    ld a,c
    cp 1
    jr nz,copy_array_store
    ld a,(ix+CA_PACK)
    sub (ix+CA_LAST)
    ld e,a
    jr z,copy_array_store
copy_array_pad:
    ld a,d
    call copy_array_rotate
    ld d,a
    dec e
    jr nz,copy_array_pad
copy_array_store:
    ld (hl),d
copy_array_next_byte:
    inc hl
    dec bc
    ld a,b
    or c
    jr nz,copy_array_byte
    call wait_vdp
    call pattern_clear_argument
    jp restore_text

copy_array_end:
    dec de                  ; DEC rrは方向判定のZフラグを保持する。
    jr z,copy_array_end_forward
    or a
    sbc hl,de
    jp c,illegal
    ret
copy_array_end_forward:
    add hl,de
    jp c,illegal
    ret

copy_array_pointer:
    ld l,(ix+CA_DATA)
    ld h,(ix+CA_DATA+1)
    ld de,4
    add hl,de
    ret

copy_array_ready:
    ld a,2
    call read_status
    and $80
    jr z,copy_array_ready
    ret

copy_array_put_pixel:
    bit 0,(ix+CA_FIRST)
    jr z,copy_array_send_pixel
    res 0,(ix+CA_FIRST)
    ret
copy_array_send_pixel:
    push af
    call copy_array_ready
    pop af
    push bc
    ld c,44
    call write_reg
    pop bc
    ret

; 転送カウンターを変えず、詰め込まれた1色分のビットを回転して下位へ移す。
copy_array_rotate:
    bit 3,(ix+CA_BITS)
    ret nz
    rlca
    rlca
    bit 2,(ix+CA_BITS)
    ret z
    rlca
    rlca
    ret

copy_array_name:
    ld (ix+CA_TEXT),l
    ld (ix+CA_TEXT+1),h
copy_array_lookup:
    ; SUBFLG=1のPTRGETで既存の配列全体を取得する（暗黙のDIMは行わない）。
    ; BCは次元数を指し、DEには次元ヘッダーとデータの合計長が返る。
    ld a,(SUBFLG)
    push af
    ld a,1
    ld (SUBFLG),a
    push ix
    ld ix,PTRGET
    call CALBAS
    pop ix
    pop af
    ld (SUBFLG),a
    ld a,(VALTYP)
    cp 3
    jr nz,copy_array_numeric
    ld e,13
    jp basic_error
copy_array_numeric:
    jp skip_space

copy_array_bounds:
    ; ARYTAB..STREND内の数値データ部分だけに書き込みを許可する。
    ld hl,(ARYTAB)
    inc hl
    inc hl
    inc hl
    inc hl
    inc hl
    or a
    sbc hl,bc
    jp c,copy_array_lower_ok
    jp nz,illegal
copy_array_lower_ok:
    ld h,b
    ld l,c
    bit 7,h                 ; このROMで扱うBASICデータはRAMのページ2/3にある必要がある。
    jp z,illegal
    add hl,de
    jp c,illegal
    push hl                 ; 配列レコード全体の終端の次のアドレス。
    ld de,(STREND)
    or a
    sbc hl,de
    jr c,copy_array_upper_ok
    jp nz,illegal
copy_array_upper_ok:
    ld a,(bc)
    or a
    jp z,illegal
    ld l,a
    ld h,0
    add hl,hl
    inc hl
    add hl,bc               ; 次元数と各次元のサイズを読み飛ばす。
    jp c,illegal
    ld (ix+CA_DATA),l
    ld (ix+CA_DATA+1),h
    ex de,hl
    pop hl
    or a
    sbc hl,de
    jp c,illegal
    ld (ix+CA_CAPACITY),l
    ld (ix+CA_CAPACITY+1),h
    ld de,4
    or a
    sbc hl,de
    jp c,illegal
    ret

copy_array_size:
    ; 幅・高さは0より大きく、論理ページのサイズ以下でなければならない。
    ld l,(ix+8)
    ld h,(ix+9)
    ld a,h
    or l
    jp z,illegal
    dec hl
    ld a,h
    call validate_x_high
    ld l,(ix+10)
    ld h,(ix+11)
    ld a,h
    or l
    jp z,illegal
    dec hl
    ld a,h
    cp 2
    jp nc,illegal
    bit 7,(ix+13)
    jr nz,copy_array_normal_height
    ld a,(RG21SAV)
    bit 6,a
    jr nz,copy_array_format
copy_array_normal_height:
    ld a,h
    or a
    jp nz,illegal
copy_array_format:
    ld b,4
    ld c,2
    ld e,15
    call drawing_mode
    cp 6
    jr nz,copy_array_not_two_bit
    ld b,2
    ld c,4
    ld e,3
copy_array_not_two_bit:
    cp 8
    jr nz,copy_array_format_ready
    ld b,8
    ld c,1
    ld e,255
copy_array_format_ready:
    ld (ix+CA_BITS),b
    ld (ix+CA_PACK),c
    ld (ix+CA_MASK),e
    ; A:HLは24ビットの積。1転送につき一度だけ、最大512回の加算で求める。
    ld e,(ix+8)
    ld d,(ix+9)
    ld c,(ix+10)
    ld b,(ix+11)
    ld hl,0
    xor a
copy_array_product:
    add hl,de
    adc a,0
    dec bc
    inc c
    dec c
    jr nz,copy_array_product
    inc b
    dec b
    jr nz,copy_array_product
    ld e,a
    ld a,(ix+CA_PACK)
    dec a
    ld b,a
    and l
    jr nz,copy_array_last_partial
    ld a,(ix+CA_PACK)
copy_array_last_partial:
    ld (ix+CA_LAST),a
    ld c,b
    ld b,0
    add hl,bc
    ld a,e
    adc a,0
    ld b,(ix+CA_PACK)
copy_array_divide:
    srl b
    jr z,copy_array_length
    srl a
    rr h
    rr l
    jr copy_array_divide
copy_array_length:
    or a
    jp nz,illegal
    ld (ix+CA_BYTES),l
    ld (ix+CA_BYTES+1),h
    ld de,4
    add hl,de
    jp c,illegal
    ld e,(ix+CA_CAPACITY)
    ld d,(ix+CA_CAPACITY+1)
    or a
    sbc hl,de
    ret c
    jp nz,illegal
    ret
