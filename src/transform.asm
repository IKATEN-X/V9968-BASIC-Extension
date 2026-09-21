cmd_copy:
    call pattern_begin
    call copy_array_operand
    jp z,copy_array_source
    call get_point
    ld (ix+SX1H),b
    ld (ix+SY1H),a
    ld (ix+SX1),d
    ld (ix+SY1),e
    ld a,TOK_MINUS
    call expect
    call get_point
    ld (ix+SX2H),b
    ld (ix+SY2H),a
    ld (ix+SX2),d
    ld (ix+SY2),e
    call comma
    call get_page
    ld (ix+SPAGE),a
    ld a,TOK_TO
    call expect
    cp '('
    jp nz,copy_array_destination
    call get_point
    ld (ix+DX1H),b
    ld (ix+DY1H),a
    ld (ix+DX1),d
    ld (ix+DY1),e
    call skip_space
    cp TOK_MINUS
    jr z,copy_destination_rect
    ; 通常のCOPYでは転送元のサイズと転送先の左上座標を使う。
    push hl
    ld l,(ix+SX2)
    ld h,(ix+SX2H)
    ld e,(ix+SX1)
    ld d,(ix+SX1H)
    or a
    sbc hl,de
    jp c,illegal
    ld e,(ix+DX1)
    ld d,(ix+DX1H)
    add hl,de
    ld a,h
    call validate_x_high
    ld (ix+DX2),l
    ld (ix+DX2H),h
    ld l,(ix+SY2)
    ld h,(ix+SY2H)
    ld e,(ix+SY1)
    ld d,(ix+SY1H)
    or a
    sbc hl,de
    jp c,illegal
    ld e,(ix+DY1)
    ld d,(ix+DY1H)
    add hl,de
    bit 7,(ix+13)
    jr nz,copy_height_normal
    ld a,(RG21SAV)
    bit 6,a
    jr nz,copy_height_fil
copy_height_normal:
    ld a,h
    or a
    jp nz,illegal
copy_height_fil:
    ld a,h
    cp 2
    jp nc,illegal
    ld (ix+DY2),l
    ld (ix+DY2H),h
    pop hl
    jr copy_destination_page
copy_destination_rect:
    inc hl
    call get_point
    ld (ix+DX2H),b
    ld (ix+DY2H),a
    ld (ix+DX2),d
    ld (ix+DY2),e
copy_destination_page:
    call comma
    call get_page
    ld (ix+DPAGE),a
    ld (ix+INV),0
    ld (ix+INV+1),1
    ; 省略可能な引数の位置は、論理演算、角度、倍率の順。
    call skip_space
    cp ','
    jp nz,copy_parsed
    call comma
    call empty_field
    jr z,copy_angle_field
    call get_copy_logic
copy_angle_field:
    call skip_space
    cp ','
    jp nz,copy_parsed
    call comma
    call empty_field
    jr z,copy_scale_field
    call get_int
    ld (ix+ANGLE),e
    ld (ix+ANGLE+1),d
copy_scale_field:
    call skip_space
    cp ','
    jp nz,copy_parsed
    call comma
    call empty_field
    jp z,copy_parsed
    call get_inverse_scale
    jr copy_parsed
copy_parsed:
    call end_statement
    call require_graphics
    call save_text
    ld l,(ix+SX2)
    ld h,(ix+SX2H)
    ld e,(ix+SX1)
    ld d,(ix+SX1H)
    or a
    sbc hl,de
    jp c,illegal
    ld l,(ix+SY2)
    ld h,(ix+SY2H)
    ld e,(ix+SY1)
    ld d,(ix+SY1H)
    or a
    sbc hl,de
    jp c,illegal
    ld l,(ix+DX2)
    ld h,(ix+DX2H)
    ld e,(ix+DX1)
    ld d,(ix+DX1H)
    or a
    sbc hl,de
    jp c,illegal
    ld l,(ix+DY2)
    ld h,(ix+DY2H)
    ld e,(ix+DY1)
    ld d,(ix+DY1H)
    or a
    sbc hl,de
    jp c,illegal
    call rectangle_regs
    ld l,(ix+8)
    ld h,(ix+9)
    ld (ix+NX),l
    ld (ix+NX+1),h
    ld l,(ix+10)
    ld h,(ix+11)
    ld (ix+NY),l
    ld (ix+NY+1),h
    call compute_vectors
    ld a,(ix+SPAGE)
    cp (ix+DPAGE)
    jr nz,copy_transform
    call copy_identity
    jp z,copy_in_place
    call copy_disjoint
copy_transform:
    call compute_origin
    ld a,(ix+SX1)
    ld (ix+19),a
    ld a,(ix+SX1H)
    ld (ix+20),a
    ld a,(ix+SY1)
    ld (ix+21),a
    ld a,(ix+SPAGE)
    or (ix+SY1H)
    ld (ix+22),a
    ld a,(ix+SPAGE)
    or (ix+SY2H)
    ld (ix+26),a
    ld a,(ix+SX2)
    ld (ix+23),a
    ld a,(ix+SX2H)
    ld (ix+24),a
    ld a,(ix+SY2)
    ld (ix+25),a
    ld a,(ix+14)
    and 15
    or $30                  ; LRMM。転送元ウィンドウの範囲外は色0として扱う。
    ld (ix+14),a
copy_submit:
    call submit_command
    call wait_vdp           ; 次のBASIC文へ進む前にCOPYを完了させる。
    call pattern_clear_argument
    jp restore_text

get_copy_logic:
    cp TOK_FUNCTION
    jr z,copy_tand
    cp TOK_TO
    jr z,copy_tor
    ld b,0
    cp 'T'
    jr nz,copy_logic_base
    ld b,8
    inc hl
    call skip_space
copy_logic_base:
    cp TOK_PSET
    jr z,copy_logic_pset
    cp TOK_PRESET
    jr z,copy_logic_preset
    sub TOK_AND
    jp c,syntax_error
    cp 3
    jp nc,syntax_error
    inc a
    jr copy_logic_token
copy_logic_pset:
    xor a
    jr copy_logic_token
copy_logic_preset:
    ld a,4
copy_logic_token:
    inc hl
    or b
copy_logic_store:
    ld (ix+14),a
    ret
copy_tand:
    ; 標準BASICはTANDをTAN + D、TORをTO + Rにトークン化する。
    inc hl
    ld a,TOK_TAN
    call expect
    ld a,'D'
    call expect
    ld a,9
    jr copy_logic_store
copy_tor:
    inc hl
    ld a,'R'
    call expect
    ld a,10
    jr copy_logic_store

; 拡縮・回転がなく、転送元と転送先が同じサイズならZを立てる。
copy_identity:
    ld a,(ix+VX)
    or (ix+VY)
    or (ix+VY+1)
    ret nz
    ld a,(ix+VX+1)
    dec a
    ret nz
    ld l,(ix+SX2)
    ld h,(ix+SX2H)
    ld e,(ix+SX1)
    ld d,(ix+SX1H)
    or a
    sbc hl,de
    inc hl
    ld e,(ix+NX)
    ld d,(ix+NX+1)
    or a
    sbc hl,de
    ret nz
    ld l,(ix+SY2)
    ld h,(ix+SY2H)
    ld e,(ix+SY1)
    ld d,(ix+SY1H)
    or a
    sbc hl,de
    inc hl
    ld e,(ix+NY)
    ld d,(ix+NY+1)
    or a
    sbc hl,de
    ret

; 変形コピーでは転送元が転送先の矩形と重なってはいけない。
copy_disjoint:
    ld l,(ix+SX2)
    ld h,(ix+SX2H)
    ld e,(ix+DX1)
    ld d,(ix+DX1H)
    or a
    sbc hl,de
    ret c
    ld l,(ix+DX2)
    ld h,(ix+DX2H)
    ld e,(ix+SX1)
    ld d,(ix+SX1H)
    or a
    sbc hl,de
    ret c
    ld l,(ix+SY2)
    ld h,(ix+SY2H)
    ld e,(ix+DY1)
    ld d,(ix+DY1H)
    or a
    sbc hl,de
    ret c
    ld l,(ix+DY2)
    ld h,(ix+DY2H)
    ld e,(ix+SY1)
    ld d,(ix+SY1H)
    or a
    sbc hl,de
    ret c
    jp illegal

; LMMMでは未読の転送元ピクセルを上書きしない方向に各軸を走査し、バッファを使わない。
copy_in_place:
    ld l,(ix+SX1)
    ld h,(ix+SX1H)
    ld e,(ix+DX1)
    ld d,(ix+DX1H)
    or a
    sbc hl,de
    ld l,(ix+SX1)
    ld h,(ix+SX1H)
    jr nc,copy_in_place_x
    set 2,(ix+13)
    ld l,(ix+SX2)
    ld h,(ix+SX2H)
    ld e,(ix+DX2)
    ld d,(ix+DX2H)
copy_in_place_x:
    ld (ix+0),l
    ld (ix+1),h
    ld (ix+4),e
    ld (ix+5),d
    ld l,(ix+SY1)
    ld h,(ix+SY1H)
    ld e,(ix+DY1)
    ld d,(ix+DY1H)
    or a
    sbc hl,de
    ld l,(ix+SY1)
    ld h,(ix+SY1H)
    jr nc,copy_in_place_y
    set 3,(ix+13)
    ld l,(ix+SY2)
    ld h,(ix+SY2H)
    ld e,(ix+DY2)
    ld d,(ix+DY2H)
copy_in_place_y:
    ld (ix+2),l
    ld a,(ix+SPAGE)
    or h
    ld (ix+3),a
    ld (ix+6),e
    ld a,(ix+DPAGE)
    or d
    ld (ix+7),a
    ld a,(ix+14)
    and 15
    or $90
    ld (ix+14),a
    jp copy_submit
; 倍率を一度だけ評価し、その後BASICで256 / <数値トークン>を評価する。
; DACと数値リテラルのデータは同じBCD表現を使う。整数の場合は
; DAC+2に値がある。BASICの整数・単精度・倍精度を受け付ける。
get_inverse_scale:
    push ix
    ld ix,FRMEVL
    call CALBAS
    pop ix
    push hl
    push ix
    pop hl
    ld de,64
    add hl,de
    push hl
    ld (hl),$1c
    inc hl
    ld (hl),0
    inc hl
    ld (hl),1
    inc hl
    ld (hl),$f4             ; 除算トークン。
    inc hl
    ld a,(VALTYP)
    cp 2
    jr z,scale_integer
    cp 4
    jr z,scale_single
    cp 8
    jr z,scale_double
    ld e,13
    jp basic_error
scale_double:
    ld b,8
    ld a,$1f
    jr scale_float
scale_single:
    ld b,4
    ld a,$1d
scale_float:
    ld de,DAC
    jr scale_payload
scale_integer:
    ld b,2
    ld a,$1c
    ld de,DAC+2
scale_payload:
    ld (hl),a
    inc hl
scale_payload_loop:
    ld a,(de)
    ld (hl),a
    inc de
    inc hl
    djnz scale_payload_loop
    ld (hl),0
    pop hl
    call get_int
    ld a,d
    or a
    jr nz,scale_check_high
    ld a,e
    cp 64
    jp c,illegal
scale_check_high:
    ld a,d
    cp 4
    jp c,scale_valid
    jp nz,illegal
    ld a,e
    or a
    jp nz,illegal
scale_valid:
    ld (ix+INV),e
    ld (ix+INV+1),d
    pop hl
    ret

compute_vectors:
    ld l,(ix+ANGLE)
    ld h,(ix+ANGLE+1)
angle_negative:
    bit 7,h
    jr z,angle_positive
    ld de,360
    add hl,de
    jr angle_negative
angle_positive:
    ld de,360
    or a
    sbc hl,de
    jr nc,angle_positive
    add hl,de
    ld (ix+ANGLE),l
    ld (ix+ANGLE+1),h
    call sine_lookup
    ld e,(ix+INV)
    ld d,(ix+INV+1)
    call multiply_q8
    call negate_hl          ; 正の角度では画面上で時計回りに回転する。
    ld (ix+VY),l
    ld (ix+VY+1),h
    ld (ix+17),l
    ld (ix+18),h
    ld l,(ix+ANGLE)
    ld h,(ix+ANGLE+1)
    ld de,90
    add hl,de
    ld de,360
    or a
    sbc hl,de
    jr nc,cosine_index
    add hl,de
cosine_index:
    call sine_lookup
    ld e,(ix+INV)
    ld d,(ix+INV+1)
    call multiply_q8
    ld (ix+VX),l
    ld (ix+VX+1),h
    ld (ix+15),l
    ld (ix+16),h
    ret
sine_lookup:
    add hl,hl
    ld de,sine_table
    add hl,de
    ld e,(hl)
    inc hl
    ld d,(hl)
    ex de,hl
    ret

; 転送先矩形の中心を転送元矩形の中心に対応させる。
; LRMMの転送元開始位置は整数なので、開始ピクセルの小数部分は切り捨てる。
compute_origin:
    ld l,(ix+SX2)
    ld h,(ix+SX2H)
    ld e,(ix+SX1)
    ld d,(ix+SX1H)
    or a
    sbc hl,de
    inc hl
    srl h
    rr l
    ld e,(ix+SX1)
    ld d,(ix+SX1H)
    add hl,de
    ld (ix+0),l
    ld (ix+1),h
    ld l,(ix+SY2)
    ld h,(ix+SY2H)
    ld e,(ix+SY1)
    ld d,(ix+SY1H)
    or a
    sbc hl,de
    inc hl
    srl h
    rr l
    ld e,(ix+SY1)
    ld a,(ix+SPAGE)
    or (ix+SY1H)
    ld d,a
    add hl,de
    ld (ix+2),l
    ld (ix+3),h

    call half_nx
    ld l,(ix+VX)
    ld h,(ix+VX+1)
    call multiply_q8
    ex de,hl
    ld l,(ix+0)
    ld h,(ix+1)
    or a
    sbc hl,de
    ld (ix+0),l
    ld (ix+1),h
    call half_ny
    ld l,(ix+VY)
    ld h,(ix+VY+1)
    call multiply_q8
    ld e,(ix+0)
    ld d,(ix+1)
    add hl,de
    ld (ix+0),l
    ld (ix+1),h

    call half_nx
    ld l,(ix+VY)
    ld h,(ix+VY+1)
    call multiply_q8
    ex de,hl
    ld l,(ix+2)
    ld h,(ix+3)
    or a
    sbc hl,de
    ld (ix+2),l
    ld (ix+3),h
    call half_ny
    ld l,(ix+VX)
    ld h,(ix+VX+1)
    call multiply_q8
    ex de,hl
    ld l,(ix+2)
    ld h,(ix+3)
    or a
    sbc hl,de
    ld (ix+2),l
    ld (ix+3),h
    ret
half_nx:
    ld e,(ix+NX)
    ld d,(ix+NX+1)
    srl d
    rr e
    ret
half_ny:
    ld e,(ix+NY)
    ld d,(ix+NY+1)
    srl d
    rr e
    ret

; HL = 符号付きHL * 符号なしDE / 256。端数はゼロ方向に丸める。
multiply_q8:
    ld a,h
    and $80
    push af
    call nz,negate_hl
    ld b,h
    ld c,l
    ld hl,0
    ld a,16
multiply_loop:
    add hl,hl
    rl e
    rl d
    jr nc,multiply_no_add
    add hl,bc
    jr nc,multiply_no_add
    inc de
multiply_no_add:
    dec a
    jr nz,multiply_loop
    ld l,h
    ld h,e
    pop af
    ret z
negate_hl:
    xor a
    sub l
    ld l,a
    sbc a,a
    sub h
    ld h,a
    ret
