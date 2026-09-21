; CIRCLEは今回のCALLの既存フレームだけを使う。64..127はラスタライズの状態、
; 128..136は数値トークン、144..191は式バッファ、
; 192..200 / 208..216は保存した角度リテラル（BASICデータへのポインターではない）。
defc CI_CX = 64
defc CI_CY = 66
defc CI_R = 68
defc CI_FX = 70
defc CI_FY = 72
defc CI_START = 74          ; 開始角・終了角のリテラル長。
defc CI_END = 76
defc CI_SX = 78
defc CI_SY = 80
defc CI_EX = 82
defc CI_EY = 84
; フラグ: 半径線、優弧/全周/ゼロ角の弧、S/Eの指定有無、明示的な色指定。
defc CI_FLAGS = 86
defc CI_LITERAL_SIZE = 87
defc CI_X = 88
defc CI_Y = 90
defc CI_ERROR = 92
defc CI_PX = 96
defc CI_PY = 98
defc CI_OUTX = 100
defc CI_OUTY = 102
defc CI_MAXX = 104
defc CI_MAXY = 106
defc CI_POSITION = 108     ; STEP、空の外接矩形、ページ外の中心を示す。
defc CI_LIMIT = 112
defc CI_RAY = 115
defc CI_STEPX = 116
defc CI_STEPY = 117
defc CI_MINOR = 118
defc CI_MAJOR = 120
defc CI_COUNT = 122
defc CI_ACCUM = 124
defc CI_OCTANT = 126

; 検証後はコマンドイメージ/描画ワークを再利用する（ARG、COLOR、
; DPAGE、PATTERN_CONTEXT、TEXTPTRを除く）。再利用後はBASICの式評価を行わない。
defc CI_FULLMASK = 0
defc CI_SMASK = 1
defc CI_EMASK = 2
defc CI_SAME = 3
defc CI_SCROSS = 4
defc CI_SA = 8
defc CI_SB = 10
defc CI_ECROSS = 14
defc CI_EA = 18
defc CI_EB = 20
defc CI_MASK = 22
defc CI_SCALE_AXIS = 23
defc CI_RATIO = 24
defc CI_XINT = 27
defc CI_XFRAC = 29
defc CI_YINT = 32
defc CI_YFRAC = 34
defc CI_XSP = 36
defc CI_XSM = 38
defc CI_XBP = 44
defc CI_XBM = 46
defc CI_YST = 48
defc CI_YSB = 50
defc CI_YBT = 52
defc CI_YBB = 54

cmd_circle_step:
    set 0,(ix+CI_POSITION)
cmd_circle:
    call pattern_begin
    call open_args
    call circle_coordinate
    ld (ix+CI_CX),e
    ld (ix+CI_CX+1),d
    call comma
    call circle_coordinate
    ld (ix+CI_CY),e
    ld (ix+CI_CY+1),d
    call close_args
    bit 0,(ix+CI_POSITION)
    call nz,circle_relative
    call comma
    call get_int
    bit 7,d
    jp nz,illegal
    ld (ix+CI_R),e
    ld (ix+CI_R+1),d
    ld a,(FORCLR)
    call mask_draw_color
    ld (ix+COLOR),a
    push hl
    push ix
    pop hl
    ld de,192
    add hl,de
    ld (hl),$11            ; 整数0を表す標準トークン。
    ld (ix+CI_START),1
    ld de,16
    add hl,de
    ex de,hl
    ld hl,circle_tau_token
    ld bc,9
    ldir
    ld (ix+CI_END),9
    pop hl
    ld (ix+CI_SX+1),$40
    ld (ix+CI_EX+1),$40
    call skip_space
    cp ','
    jp nz,circle_parsed
    call comma
    call empty_field
    jr z,circle_start_field
    call get_draw_color
    ld (ix+COLOR),a
    set 7,(ix+CI_FLAGS)
circle_start_field:
    call skip_space
    cp ','
    jp nz,circle_parsed
    call comma
    call empty_field
    jr z,circle_end_field
    call circle_angle
    ld a,(ix+CI_RAY)
    or $20
    or (ix+CI_FLAGS)
    ld (ix+CI_FLAGS),a
    ld e,(ix+CI_OUTX)
    ld d,(ix+CI_OUTX+1)
    ld (ix+CI_SX),e
    ld (ix+CI_SX+1),d
    ld e,(ix+CI_OUTY)
    ld d,(ix+CI_OUTY+1)
    ld (ix+CI_SY),e
    ld (ix+CI_SY+1),d
    ld a,(ix+CI_LITERAL_SIZE)
    ld (ix+CI_START),a
    ld de,192
    call circle_remember_angle
circle_end_field:
    call skip_space
    cp ','
    jp nz,circle_parsed
    call comma
    call empty_field
    jr z,circle_aspect_field
    call circle_angle
    ld a,(ix+CI_RAY)
    add a,a
    or (ix+CI_FLAGS)
    or $40
    ld (ix+CI_FLAGS),a
    ld e,(ix+CI_OUTX)
    ld d,(ix+CI_OUTX+1)
    ld (ix+CI_EX),e
    ld (ix+CI_EX+1),d
    ld e,(ix+CI_OUTY)
    ld d,(ix+CI_OUTY+1)
    ld (ix+CI_EY),e
    ld (ix+CI_EY+1),d
    ld a,(ix+CI_LITERAL_SIZE)
    ld (ix+CI_END),a
    ld de,208
    call circle_remember_angle
circle_aspect_field:
    call skip_space
    cp ','
    jr nz,circle_parsed
    call comma
    call empty_field
    jr z,circle_parsed
    call circle_number
    push hl
    call circle_aspect
    pop hl
    ld (ix+STYLE),1
circle_parsed:
    call end_statement
    ; 符号付きの中心座標はVDP座標ではない。共通の厳密な範囲チェック用の
    ; 座標欄は0のままにし、すべてのUSR実行後に現在のモードを検証する。
    call require_graphics
    ld a,(ix+STYLE)
    or a
    call z,circle_default_aspect
    ld a,(ix+COLOR)
    call mask_draw_color
    bit 7,(ix+CI_FLAGS)
    jr z,circle_color_ready
    cp (ix+COLOR)
    jp nz,illegal
circle_color_ready:
    ld (ix+COLOR),a
    call save_text
    call drawing_active_page
    ld (ix+DPAGE),a
    call circle_bounds
    bit 1,(ix+CI_POSITION)
    call z,check_sprite_destination
    call circle_arc_flags
    ; Q14の分解能未満の劣弧で、同一直線上の反対側の点を選ばない。
    ld a,(ix+CI_FLAGS)
    and $1c
    jr nz,circle_arc_ready
    ld a,(ix+CI_SX)
    cp (ix+CI_EX)
    jr nz,circle_arc_ready
    ld a,(ix+CI_SX+1)
    cp (ix+CI_EX+1)
    jr nz,circle_arc_ready
    ld a,(ix+CI_SY)
    cp (ix+CI_EY)
    jr nz,circle_arc_ready
    ld a,(ix+CI_SY+1)
    cp (ix+CI_EY+1)
    jr nz,circle_arc_ready
    set 4,(ix+CI_FLAGS)
circle_arc_ready:
    ; ここから先ではBASICの式評価や、エラーで拒否する検証を行わない。
    ld l,(ix+CI_CX)
    ld h,(ix+CI_CX+1)
    ld (GRPACX),hl
    ld l,(ix+CI_CY)
    ld h,(ix+CI_CY+1)
    ld (GRPACY),hl
    bit 1,(ix+CI_POSITION)
    jp nz,restore_text
    call circle_prepare_raster
    call circle_prepare_vdp
    bit 4,(ix+CI_FLAGS)
    jp nz,circle_endpoints
    ld l,(ix+CI_R)
    ld h,(ix+CI_R+1)
    ld (ix+CI_Y),l
    ld (ix+CI_Y+1),h
    ex de,hl
    ld hl,1
    or a
    sbc hl,de
    ld (ix+CI_ERROR),l
    ld (ix+CI_ERROR+1),h
    ld a,h
    add a,a
    sbc a,a
    ld (ix+CI_ERROR+2),a
    ld (ix+CI_ERROR+3),a
circle_loop:
    ld l,(ix+CI_LIMIT)
    ld h,(ix+CI_LIMIT+1)
    ld e,(ix+CI_X)
    ld d,(ix+CI_X+1)
    or a
    sbc hl,de
    jp c,circle_endpoints
    ld l,(ix+CI_Y)
    ld h,(ix+CI_Y+1)
    or a
    sbc hl,de
    jp c,circle_endpoints
    call circle_raster_mask
    or a
    jr z,circle_next
    ld (ix+CI_MASK),a
    call circle_coordinates
    call circle_points
circle_next:
    ld l,(ix+CI_X)
    ld h,(ix+CI_X+1)
    inc hl
    ld (ix+CI_X),l
    ld (ix+CI_X+1),h
    push hl
    call circle_step_x
    pop hl
    ld e,(ix+CI_Y)
    ld d,(ix+CI_Y+1)
    ex de,hl
    or a
    sbc hl,de
    jp c,circle_endpoints
    ex de,hl
    add hl,hl
    inc hl
    push hl
    bit 7,(ix+CI_ERROR+3)
    jr nz,circle_error_x
    ld l,(ix+CI_Y)
    ld h,(ix+CI_Y+1)
    dec hl
    ld (ix+CI_Y),l
    ld (ix+CI_Y+1),h
    push hl
    call circle_step_y
    pop hl
    add hl,hl
    ex de,hl
    ld l,(ix+CI_ERROR)
    ld h,(ix+CI_ERROR+1)
    or a
    sbc hl,de
    ld (ix+CI_ERROR),l
    ld (ix+CI_ERROR+1),h
    ld l,(ix+CI_ERROR+2)
    ld h,(ix+CI_ERROR+3)
    ld de,0
    sbc hl,de
    ld (ix+CI_ERROR+2),l
    ld (ix+CI_ERROR+3),h
circle_error_x:
    pop de
    ld l,(ix+CI_ERROR)
    ld h,(ix+CI_ERROR+1)
    add hl,de
    ld (ix+CI_ERROR),l
    ld (ix+CI_ERROR+1),h
    jp nc,circle_loop
    inc (ix+CI_ERROR+2)
    jp nz,circle_loop
    inc (ix+CI_ERROR+3)
    jp circle_loop
circle_endpoints:
    bit 3,(ix+CI_FLAGS)
    jr nz,circle_radii
    ld (ix+CI_RAY),0
    call circle_endpoint
    ld (ix+CI_RAY),1
    call circle_endpoint
circle_radii:
    bit 0,(ix+CI_FLAGS)
    jr z,circle_end_radius
    ld (ix+CI_RAY),0
    call circle_radius
circle_end_radius:
    bit 1,(ix+CI_FLAGS)
    jr z,circle_done
    ld (ix+CI_RAY),1
    call circle_radius
circle_done:
    call pattern_finish
    jp restore_text

; FRMQNTは符号なしワードも受け付ける。整数以外はCINTトークン経由で変換し、
; CALBASでMath-Packが依存するページ1も正しく切り替えられるようにする。
circle_coordinate:
    call skip_space
    push ix
    ld ix,FRMEVL
    call CALBAS
    pop ix
    ld a,(VALTYP)
    cp 2
    jr nz,circle_coordinate_convert
    ld de,(DAC+2)
    jp skip_space
circle_coordinate_convert:
    push hl
    call circle_store_number
    ld de,circle_cint_expr
    call circle_eval
    pop hl
    jp skip_space

circle_relative:
    push hl
    ; 標準のSTEPと同様、両方の座標式を評価した後の現在位置を使い、
    ; 加算結果は符号付き16ビット座標として折り返す。
    ld hl,(GRPACX)
    ld e,(ix+CI_CX)
    ld d,(ix+CI_CX+1)
    add hl,de
    ld (ix+CI_CX),l
    ld (ix+CI_CX+1),h
    ld hl,(GRPACY)
    ld e,(ix+CI_CY)
    ld d,(ix+CI_CY+1)
    add hl,de
    ld (ix+CI_CY),l
    ld (ix+CI_CY+1),h
    pop hl
    ret

; ユーザーの各式は一度だけ評価し、BASIC管理のポインターではなく数値トークンを
; コピーする。リテラルへの置き換えではUSR/RNDの副作用が繰り返されない。
circle_number:
    push ix
    ld ix,FRMEVL
    call CALBAS
    pop ix
    push hl
    call circle_store_number
    pop hl
    jp skip_space
circle_store_number:
    ld a,(VALTYP)
    cp 2
    jr z,circle_integer_token
    cp 4
    jr z,circle_single_token
    cp 8
    jr z,circle_double_token
    ld e,13
    jp basic_error
circle_double_token:
    ld bc,8
    ld a,$1f
    jr circle_float_token
circle_single_token:
    ld bc,4
    ld a,$1d
circle_float_token:
    ld de,DAC
    jr circle_token_copy
circle_integer_token:
    ld bc,2
    ld a,$1c
    ld de,DAC+2
circle_token_copy:
    push ix
    pop hl
    push de
    ld de,128
    add hl,de
    pop de
    ld (hl),a
    inc hl
    ld a,c
    inc a
    ld (ix+CI_LITERAL_SIZE),a
    ex de,hl
    ldir
    ret

; テンプレートは01=現在値、02=開始値、03=終了値を使い、展開後48バイト以内に収める。
circle_expression:
    push ix
    pop hl
    ld bc,144
    add hl,bc
circle_expression_loop:
    ld a,(de)
    inc de
    or a
    jr z,circle_expression_char
    cp 4
    jr c,circle_insert_number
circle_expression_char:
    ld (hl),a
    inc hl
    or a
    jr nz,circle_expression_loop
    push ix
    pop hl
    ld de,144
    add hl,de
    ret
circle_insert_number:
    push de
    ld bc,128
    ld e,(ix+CI_LITERAL_SIZE)
    cp 1
    jr z,circle_insert_source
    ld bc,192
    ld e,(ix+CI_START)
    cp 2
    jr z,circle_insert_source
    ld bc,208
    ld e,(ix+CI_END)
circle_insert_source:
    ld a,e
    ex de,hl
    push ix
    pop hl
    add hl,bc
    ld c,a
    ld b,0
    ldir
    ex de,hl
    pop de
    jr circle_expression_loop
circle_eval:
    call circle_expression
    jp get_int

circle_angle:
    call circle_number
    push hl
    ld de,circle_angle_invalid
    call circle_eval
    ld a,d
    or e
    jp nz,illegal
    ld de,circle_negative
    call circle_eval
    ld a,e
    and 1
    ld (ix+CI_RAY),a
    ld de,circle_cos_expr
    call circle_eval
    ld (ix+CI_OUTX),e
    ld (ix+CI_OUTX+1),d
    ld de,circle_sin_expr
    call circle_eval
    ld (ix+CI_OUTY),e
    ld (ix+CI_OUTY+1),d
    pop hl
    ret

circle_remember_angle:
    push hl
    push ix
    pop hl
    add hl,de
    ex de,hl
    push ix
    pop hl
    ld bc,128
    add hl,bc
    ld bc,9
    ldir
    pop hl
    ret

circle_default_aspect:
    push hl
    bit 7,(ix+13)
    jr z,circle_native_aspect
    ld (ix+CI_FX+1),$40
    ld (ix+CI_FY+1),$40
    pop hl
    ret
circle_native_aspect:
    ld hl,($f40d)           ; 標準CIRCLEの縦横比の分子。256 * 比率。
    ld (DAC+2),hl
    ld a,2
    ld (VALTYP),a
    call circle_store_number
    ld de,circle_default_narrow
circle_default_fil:
    ld a,(RG21SAV)
    bit 6,a
    jr z,circle_default_eval
    ; 対になるテンプレートは通常のテンプレートの直後に置かれている。
circle_default_next:
    ld a,(de)
    inc de
    or a
    jr nz,circle_default_next
circle_default_eval:
    call circle_expression
    push ix
    ld ix,FRMEVL
    call CALBAS
    pop ix
    call circle_store_number
    call circle_aspect
    pop hl
    ret
circle_aspect:
    ld de,circle_nonpositive
    call circle_eval
    ld a,d
    or e
    jp nz,illegal
    ld (ix+CI_FX),0
    ld (ix+CI_FX+1),$40
    ld (ix+CI_FY),0
    ld (ix+CI_FY+1),$40
    ld de,circle_gt_one
    call circle_eval
    ld a,d
    or e
    jr nz,circle_tall
    ld de,circle_ratio_expr
    call circle_eval
    ld (ix+CI_FY),e
    ld (ix+CI_FY+1),d
    ret
circle_tall:
    ld de,circle_inverse_expr
    call circle_eval
    ld (ix+CI_FX),e
    ld (ix+CI_FX+1),d
    ret

circle_bounds:
    ld (ix+CI_MAXX),255
    ld (ix+CI_MAXY),255
    call drawing_mode
    cp 6
    jr z,circle_bounds_wide
    cp 7
    jr nz,circle_bounds_y
circle_bounds_wide:
    ld (ix+CI_MAXX+1),1
circle_bounds_y:
    bit 7,(ix+13)
    jr nz,circle_bounds_radius
    ld a,(RG21SAV)
    bit 6,a
    jr z,circle_bounds_radius
    ld (ix+CI_MAXY+1),1
circle_bounds_radius:
    ld a,(ix+CI_MAXX+1)
    cp (ix+CI_CX+1)
    jr c,circle_centre_outside
    ld a,(ix+CI_MAXY+1)
    cp (ix+CI_CY+1)
    jr nc,circle_bounds_limit
circle_centre_outside:
    set 2,(ix+CI_POSITION)
circle_bounds_limit:
    ld (ix+CI_LIMIT),255
    ld (ix+CI_LIMIT+1),255
    ld a,(ix+CI_FX+1)
    cp $40
    jr nz,circle_limit_y
    ld l,(ix+CI_CX)
    ld h,(ix+CI_CX+1)
    ld c,(ix+CI_MAXX)
    ld b,(ix+CI_MAXX+1)
    call circle_axis_limit
    ld (ix+CI_LIMIT),l
    ld (ix+CI_LIMIT+1),h
circle_limit_y:
    ld a,(ix+CI_FY+1)
    cp $40
    jr nz,circle_bounds_x
    ld l,(ix+CI_CY)
    ld h,(ix+CI_CY+1)
    ld c,(ix+CI_MAXY)
    ld b,(ix+CI_MAXY+1)
    call circle_axis_limit
    ld e,(ix+CI_LIMIT)
    ld d,(ix+CI_LIMIT+1)
    or a
    sbc hl,de
    jr nc,circle_bounds_x
    add hl,de
    ld (ix+CI_LIMIT),l
    ld (ix+CI_LIMIT+1),h
circle_bounds_x:
    ld l,(ix+CI_R)
    ld h,(ix+CI_R+1)
    ld e,(ix+CI_FX)
    ld d,(ix+CI_FX+1)
    call circle_scale
    ex de,hl
    ld l,(ix+CI_CX)
    ld h,(ix+CI_CX+1)
    ld c,(ix+CI_MAXX)
    ld b,(ix+CI_MAXX+1)
    call circle_axis_bounds
    jr c,circle_bounds_empty
    ld l,(ix+CI_R)
    ld h,(ix+CI_R+1)
    ld e,(ix+CI_FY)
    ld d,(ix+CI_FY+1)
    call circle_scale
    ex de,hl
    ld l,(ix+CI_CY)
    ld h,(ix+CI_CY+1)
    ld c,(ix+CI_MAXY)
    ld b,(ix+CI_MAXY+1)
    call circle_axis_bounds
    jr c,circle_bounds_empty
    ld (ix+DY1),l
    ld (ix+DY1H),h
    ld (ix+DY2),e
    ld (ix+DY2H),d
    ret
circle_bounds_empty:
    set 1,(ix+CI_POSITION)
    ret

; 拡縮しない軸では、各オクタントの距離は中点アルゴリズムのX以上になる。
; 中心がページ内なら従来のページサイズ上限を使い、ページ外なら上限を拡張する。
circle_axis_limit:
    bit 7,h
    jr z,circle_limit_positive
    call negate_hl
    add hl,bc
    ret
circle_limit_positive:
    ld a,b
    cp h
    ret c
    ld h,b
    ld l,c
    ret

; 符号付き中心HL +/- 非負の半径DEの範囲と、0..BC（xxFFh）の共通部分を求める。
; 切り詰めた下限をHL、上限をDEに返す。共通部分がなければキャリーを立てる。
; VRAM保護用の符号なし境界を作る前に、符号付き演算のオーバーフローを防ぐ。
circle_axis_bounds:
    bit 7,h
    jr nz,circle_axis_negative
    push hl
    or a
    sbc hl,de
    jr nc,circle_axis_low
    ld hl,0
circle_axis_low:
    ld a,b
    cp h
    jr c,circle_axis_empty
    ex (sp),hl
    add hl,de
    jr circle_axis_high
circle_axis_empty:
    pop hl
    scf
    ret
circle_axis_negative:
    call negate_hl
    ex de,hl
    or a
    sbc hl,de
    ret c
    ld de,0
    push de
circle_axis_high:
    ld a,b
    cp h
    jr nc,circle_axis_ready
    ld h,b
    ld l,c
circle_axis_ready:
    ex de,hl
    pop hl
    or a
    ret

circle_arc_flags:
    ld a,(ix+CI_FLAGS)
    and $60
    jr z,circle_full_arc
    ld de,circle_span_zero
    call circle_eval
    ld a,e
    or a
    jr nz,circle_zero_arc
    ld de,circle_span_full
    call circle_eval
    ld a,e
    or a
    jr nz,circle_full_arc
    ld de,circle_span_major
    call circle_eval
    ld a,e
    or a
    jr nz,circle_major_arc
    ld de,circle_span_negative
    call circle_eval
    ld a,e
    or a
    ret z
    ld de,circle_span_wrap_zero
    call circle_eval
    ld a,e
    or a
    jr nz,circle_zero_arc
    ld de,circle_span_wrap_major
    call circle_eval
    ld a,e
    or a
    ret z
circle_major_arc:
    set 2,(ix+CI_FLAGS)
    ret
circle_full_arc:
    set 3,(ix+CI_FLAGS)
    ret
circle_zero_arc:
    set 4,(ix+CI_FLAGS)
    ret

circle_prepare_raster:
    xor a
    ld (ix+CI_FULLMASK),a
    ld (ix+CI_SAME),a
    ld (ix+CI_SCALE_AXIS),a
    ld (ix+CI_XINT),a
    ld (ix+CI_XINT+1),a
    ld (ix+CI_XFRAC),a
    ld (ix+CI_XFRAC+1),a
    call circle_prepare_scale
    bit 3,(ix+CI_FLAGS)
    ret nz
    bit 4,(ix+CI_FLAGS)
    ret nz
    ld l,(ix+CI_SX)
    ld h,(ix+CI_SX+1)
    ld e,(ix+CI_SY)
    ld d,(ix+CI_SY+1)
    call circle_boundary
    ld (ix+CI_SMASK),a
    ld (ix+CI_SA),l
    ld (ix+CI_SA+1),h
    ld (ix+CI_SB),e
    ld (ix+CI_SB+1),d
    ex de,hl
    ld e,(ix+CI_R)
    ld d,(ix+CI_R+1)
    call circle_multiply_signed
    ld (ix+CI_SCROSS),l
    ld (ix+CI_SCROSS+1),h
    ld (ix+CI_SCROSS+2),e
    ld (ix+CI_SCROSS+3),d
    ld l,(ix+CI_EX)
    ld h,(ix+CI_EX+1)
    ld e,(ix+CI_EY)
    ld d,(ix+CI_EY+1)
    call circle_boundary
    ld (ix+CI_EMASK),a
    ld (ix+CI_EA),l
    ld (ix+CI_EA+1),h
    ld (ix+CI_EB),e
    ld (ix+CI_EB+1),d
    ex de,hl
    ld e,(ix+CI_R)
    ld d,(ix+CI_R+1)
    call circle_multiply_signed
    ld (ix+CI_ECROSS),l
    ld (ix+CI_ECROSS+1),h
    ld (ix+CI_ECROSS+2),e
    ld (ix+CI_ECROSS+3),d
    ld a,(ix+CI_SMASK)
    ld c,a
    cp (ix+CI_EMASK)
    jr z,circle_same_octant
    ld b,(ix+CI_EMASK)
    ld d,0
circle_inside_octants:
    ld a,c
    rlca
    ld c,a
    cp b
    jr z,circle_inside_ready
    or d
    ld d,a
    jr circle_inside_octants
circle_inside_ready:
    ld (ix+CI_FULLMASK),d
    ret
circle_same_octant:
    ld (ix+CI_SAME),1
    bit 2,(ix+CI_FLAGS)
    ret z
    cpl
    ld (ix+CI_FULLMASK),a
    ret

; 弧の境界は1つのオクタントに属する。その点での外積cross(vector,point)は
; A*X+B*Yとなる。初回だけ計算し、以降はX++でAを加え、Y--でBを引く。
; オクタントのビットをレジスタAに、係数AをHL、係数BをDEに返す。
circle_boundary:
    ld (ix+CI_PX),l
    ld (ix+CI_PX+1),h
    ld (ix+CI_PY),e
    ld (ix+CI_PY+1),d
    ld b,0
    bit 7,h
    jr z,circle_boundary_x
    set 1,b
    call negate_hl
circle_boundary_x:
    ex de,hl
    bit 7,h
    jr z,circle_boundary_y
    set 2,b
    call negate_hl
circle_boundary_y:
    ex de,hl
    or a
    sbc hl,de
    jr nc,circle_boundary_flags
    set 0,b
circle_boundary_flags:
    ld l,(ix+CI_PX)
    ld h,(ix+CI_PX+1)
    bit 2,b
    call nz,negate_hl
    ld e,(ix+CI_PY)
    ld d,(ix+CI_PY+1)
    ex de,hl
    bit 1,b
    call z,negate_hl
    bit 0,b
    jr nz,circle_boundary_coefficients
    ex de,hl
circle_boundary_coefficients:
    push hl
    push de
    ld e,b
    ld d,0
    ld hl,circle_boundary_bits
    add hl,de
    ld a,(hl)
    pop de
    pop hl
    ret

circle_raster_mask:
    bit 3,(ix+CI_FLAGS)
    ld a,255
    ret nz
    ld b,0
    bit 7,(ix+CI_SCROSS+3)
    jr nz,circle_mask_end
    ld b,(ix+CI_SMASK)
circle_mask_end:
    ld c,0
    bit 7,(ix+CI_ECROSS+3)
    jr nz,circle_end_inside
    ld a,(ix+CI_ECROSS)
    or (ix+CI_ECROSS+1)
    or (ix+CI_ECROSS+2)
    or (ix+CI_ECROSS+3)
    jr nz,circle_mask_combine
circle_end_inside:
    ld c,(ix+CI_EMASK)
circle_mask_combine:
    ld a,(ix+CI_SAME)
    or a
    jr z,circle_mask_union
    bit 2,(ix+CI_FLAGS)
    jr nz,circle_mask_union
    ld a,b
    and c
    ret
circle_mask_union:
    ld a,b
    or c
    or (ix+CI_FULLMASK)
    ret

circle_prepare_scale:
    ld a,(ix+CI_FX+1)
    cp $40
    ld e,(ix+CI_FX)
    ld d,(ix+CI_FX+1)
    ld a,2
    jr nz,circle_scale_selected
    ld e,(ix+CI_FY)
    ld d,(ix+CI_FY+1)
    ld a,d
    cp $40
    ret z
    ld a,1
circle_scale_selected:
    ld (ix+CI_SCALE_AXIS),a
    ld (ix+CI_RATIO),e
    ld (ix+CI_RATIO+1),d
    ld (ix+CI_XFRAC+1),$20
    ld l,(ix+CI_R)
    ld h,(ix+CI_R+1)
    call circle_multiply
    ld bc,8192
    add hl,bc
    jr nc,circle_scale_initial
    inc de
circle_scale_initial:
    ld (ix+CI_YFRAC),l
    ld a,h
    and $3f
    ld (ix+CI_YFRAC+1),a
    add hl,hl
    rl e
    rl d
    add hl,hl
    rl e
    rl d
    ld (ix+CI_YINT),e
    ld (ix+CI_YINT+1),d
    ret

circle_step_x:
    ld a,(ix+CI_SCALE_AXIS)
    or a
    jr z,circle_step_x_arc
    ld l,(ix+CI_XFRAC)
    ld h,(ix+CI_XFRAC+1)
    ld e,(ix+CI_RATIO)
    ld d,(ix+CI_RATIO+1)
    add hl,de
    bit 6,h
    jr z,circle_step_x_fraction
    res 6,h
    inc (ix+CI_XINT)
    jr nz,circle_step_x_fraction
    inc (ix+CI_XINT+1)
circle_step_x_fraction:
    ld (ix+CI_XFRAC),l
    ld (ix+CI_XFRAC+1),h
circle_step_x_arc:
    bit 3,(ix+CI_FLAGS)
    ret nz
    ld e,(ix+CI_SA)
    ld d,(ix+CI_SA+1)
    push ix
    pop hl
    ld bc,CI_SCROSS
    add hl,bc
    call circle_add_cross
    ld e,(ix+CI_EA)
    ld d,(ix+CI_EA+1)
    push ix
    pop hl
    ld bc,CI_ECROSS
    add hl,bc
    jp circle_add_cross

circle_step_y:
    ld a,(ix+CI_SCALE_AXIS)
    or a
    jr z,circle_step_y_arc
    ld l,(ix+CI_YFRAC)
    ld h,(ix+CI_YFRAC+1)
    ld e,(ix+CI_RATIO)
    ld d,(ix+CI_RATIO+1)
    or a
    sbc hl,de
    jr nc,circle_step_y_fraction
    ld de,$4000
    add hl,de
    ld e,(ix+CI_YINT)
    ld d,(ix+CI_YINT+1)
    dec de
    ld (ix+CI_YINT),e
    ld (ix+CI_YINT+1),d
circle_step_y_fraction:
    ld (ix+CI_YFRAC),l
    ld (ix+CI_YFRAC+1),h
circle_step_y_arc:
    bit 3,(ix+CI_FLAGS)
    ret nz
    ld l,(ix+CI_SB)
    ld h,(ix+CI_SB+1)
    call negate_hl
    ex de,hl
    push ix
    pop hl
    ld bc,CI_SCROSS
    add hl,bc
    call circle_add_cross
    ld l,(ix+CI_EB)
    ld h,(ix+CI_EB+1)
    call negate_hl
    ex de,hl
    push ix
    pop hl
    ld bc,CI_ECROSS
    add hl,bc
circle_add_cross:
    ld a,d
    add a,a
    sbc a,a
    ld b,a
    ld a,(hl)
    add a,e
    ld (hl),a
    inc hl
    ld a,(hl)
    adc a,d
    ld (hl),a
    inc hl
    ld a,(hl)
    adc a,b
    ld (hl),a
    inc hl
    ld a,(hl)
    adc a,b
    ld (hl),a
    ret

; 4つの距離から対称な8点すべてを求める。拡縮では圧縮する軸の
; 14ビット小数部を逐次更新するだけにする。
circle_coordinates:
    ld l,(ix+CI_X)
    ld h,(ix+CI_X+1)
    ld e,(ix+CI_Y)
    ld d,(ix+CI_Y+1)
    ld a,(ix+CI_SCALE_AXIS)
    cp 2
    jr nz,circle_x_distances
    ld l,(ix+CI_XINT)
    ld h,(ix+CI_XINT+1)
    ld e,(ix+CI_YINT)
    ld d,(ix+CI_YINT+1)
circle_x_distances:
    ld b,d
    ld c,e
    ex de,hl
    ld l,(ix+CI_CX)
    ld h,(ix+CI_CX+1)
    add hl,de
    ld (ix+CI_XSP),l
    ld (ix+CI_XSP+1),h
    or a
    sbc hl,de
    or a
    sbc hl,de
    jp po,circle_x_small_ready
    ld hl,$8000
circle_x_small_ready:
    ld (ix+CI_XSM),l
    ld (ix+CI_XSM+1),h
    ld l,(ix+CI_CX)
    ld h,(ix+CI_CX+1)
    add hl,bc
    ld (ix+CI_XBP),l
    ld (ix+CI_XBP+1),h
    or a
    sbc hl,bc
    or a
    sbc hl,bc
    jp po,circle_x_big_ready
    ld hl,$8000
circle_x_big_ready:
    ld (ix+CI_XBM),l
    ld (ix+CI_XBM+1),h
    ld l,(ix+CI_X)
    ld h,(ix+CI_X+1)
    ld e,(ix+CI_Y)
    ld d,(ix+CI_Y+1)
    ld a,(ix+CI_SCALE_AXIS)
    cp 1
    jr nz,circle_y_distances
    ld l,(ix+CI_XINT)
    ld h,(ix+CI_XINT+1)
    ld e,(ix+CI_YINT)
    ld d,(ix+CI_YINT+1)
circle_y_distances:
    ld b,d
    ld c,e
    ex de,hl
    ld l,(ix+CI_CY)
    ld h,(ix+CI_CY+1)
    add hl,de
    ld (ix+CI_YSB),l
    ld (ix+CI_YSB+1),h
    or a
    sbc hl,de
    or a
    sbc hl,de
    jp po,circle_y_small_ready
    ld hl,$8000
circle_y_small_ready:
    ld (ix+CI_YST),l
    ld (ix+CI_YST+1),h
    ld l,(ix+CI_CY)
    ld h,(ix+CI_CY+1)
    add hl,bc
    ld (ix+CI_YBB),l
    ld (ix+CI_YBB+1),h
    or a
    sbc hl,bc
    or a
    sbc hl,bc
    jp po,circle_y_big_ready
    ld hl,$8000
circle_y_big_ready:
    ld (ix+CI_YBT),l
    ld (ix+CI_YBT+1),h
    ret

circle_points:
    bit 0,(ix+CI_MASK)
    jr z,circle_point_1
    ld l,(ix+CI_XBP)
    ld h,(ix+CI_XBP+1)
    ld e,(ix+CI_YST)
    ld d,(ix+CI_YST+1)
    call circle_plot_xy
circle_point_1:
    bit 1,(ix+CI_MASK)
    jr z,circle_point_2
    ld l,(ix+CI_XSP)
    ld h,(ix+CI_XSP+1)
    ld e,(ix+CI_YBT)
    ld d,(ix+CI_YBT+1)
    call circle_plot_xy
circle_point_2:
    bit 2,(ix+CI_MASK)
    jr z,circle_point_3
    ld l,(ix+CI_XSM)
    ld h,(ix+CI_XSM+1)
    ld e,(ix+CI_YBT)
    ld d,(ix+CI_YBT+1)
    call circle_plot_xy
circle_point_3:
    bit 3,(ix+CI_MASK)
    jr z,circle_point_4
    ld l,(ix+CI_XBM)
    ld h,(ix+CI_XBM+1)
    ld e,(ix+CI_YST)
    ld d,(ix+CI_YST+1)
    call circle_plot_xy
circle_point_4:
    bit 4,(ix+CI_MASK)
    jr z,circle_point_5
    ld l,(ix+CI_XBM)
    ld h,(ix+CI_XBM+1)
    ld e,(ix+CI_YSB)
    ld d,(ix+CI_YSB+1)
    call circle_plot_xy
circle_point_5:
    bit 5,(ix+CI_MASK)
    jr z,circle_point_6
    ld l,(ix+CI_XSM)
    ld h,(ix+CI_XSM+1)
    ld e,(ix+CI_YBB)
    ld d,(ix+CI_YBB+1)
    call circle_plot_xy
circle_point_6:
    bit 6,(ix+CI_MASK)
    jr z,circle_point_7
    ld l,(ix+CI_XSP)
    ld h,(ix+CI_XSP+1)
    ld e,(ix+CI_YBB)
    ld d,(ix+CI_YBB+1)
    call circle_plot_xy
circle_point_7:
    bit 7,(ix+CI_MASK)
    ret z
    ld l,(ix+CI_XBP)
    ld h,(ix+CI_XBP+1)
    ld e,(ix+CI_YSB)
    ld d,(ix+CI_YSB+1)
    jp circle_plot_xy

circle_plot_scaled:
    ld l,(ix+CI_PX)
    ld h,(ix+CI_PX+1)
    ld e,(ix+CI_FX)
    ld d,(ix+CI_FX+1)
    call circle_scale
    ld e,(ix+CI_CX)
    ld d,(ix+CI_CX+1)
    or a
    adc hl,de
    jp po,circle_endpoint_x_ready
    ld hl,$8000
circle_endpoint_x_ready:
    ld (ix+CI_OUTX),l
    ld (ix+CI_OUTX+1),h
    ld l,(ix+CI_PY)
    ld h,(ix+CI_PY+1)
    ld e,(ix+CI_FY)
    ld d,(ix+CI_FY+1)
    call circle_scale
    ex de,hl
    ld l,(ix+CI_CY)
    ld h,(ix+CI_CY+1)
    or a
    sbc hl,de
    jp po,circle_endpoint_y_ready
    ld hl,$8000
circle_endpoint_y_ready:
    ld (ix+CI_OUTY),l
    ld (ix+CI_OUTY+1),h
    jp circle_plot

; 可視範囲の212/424行だけでなく、描画ページ全体を境界として切り詰める。
circle_plot:
    ld l,(ix+CI_OUTX)
    ld h,(ix+CI_OUTX+1)
    ld e,(ix+CI_OUTY)
    ld d,(ix+CI_OUTY+1)
circle_plot_xy:
    ; 各軸の上限はxxFFh。上位バイトの確認で負の座標も除外できる。
    ld a,(ix+CI_MAXX+1)
    cp h
    ret c
    ld a,(ix+CI_MAXY+1)
    cp d
    ret c
    call wait_vdp
    ; 点描画用レジスタだけを使い、共通のコマンド発行処理は変更しない。
    di
    ld a,36
    out ($99),a
    ld a,$91
    out ($99),a
    ld a,l
    out ($9b),a
    ld a,h
    out ($9b),a
    ld a,e
    out ($9b),a
    ld a,d
    or (ix+DPAGE)
    out ($9b),a
    ld a,$50
    out ($99),a
    ld a,$ae
    out ($99),a
    ei
    or a                    ; キャリーは点が描画範囲外だった場合だけ立てる。
    ret

circle_prepare_vdp:
    call wait_vdp
    di
    ld a,44
    out ($99),a
    ld a,$91
    out ($99),a
    ld a,(ix+COLOR)
    out ($9b),a
    ld a,(ix+13)
    out ($9b),a
    ei
    ret

; 符号なし16x16ビットの積をDE:HLに返す。続く処理で符号とQ14の丸めに対応する。
circle_multiply:
    ld b,h
    ld c,l
    ld hl,0
    ld a,16
circle_multiply_loop:
    add hl,hl
    rl e
    rl d
    jr nc,circle_multiply_next
    add hl,bc
    jr nc,circle_multiply_next
    inc de
circle_multiply_next:
    dec a
    jr nz,circle_multiply_loop
    ret
circle_multiply_signed:
    ld a,h
    xor d
    push af
    bit 7,h
    call nz,negate_hl
    ex de,hl
    bit 7,h
    call nz,negate_hl
    ex de,hl
    call circle_multiply
    pop af
    or a
    ret p
    xor a
    sub l
    ld l,a
    ld a,0
    sbc a,h
    ld h,a
    ld a,0
    sbc a,e
    ld e,a
    ld a,0
    sbc a,d
    ld d,a
    ret
circle_scale:
    ld a,d
    cp $40
    jr nz,circle_scale_product
    ld a,e
    or a
    ret z
circle_scale_product:
    ld a,h
    push af
    bit 7,h
    call nz,negate_hl
    call circle_multiply
    ld bc,8192
    add hl,bc
    jr nc,circle_scale_shift
    inc de
circle_scale_shift:
    add hl,hl
    rl e
    rl d
    add hl,hl
    rl e
    rl d
    ex de,hl
    pop af
    or a
    ret p
    jp negate_hl

circle_endpoint_xy:
    ld a,(ix+CI_RAY)
    add a,a
    add a,a
    add a,CI_SX
    ld e,a
    ld d,0
    push ix
    pop hl
    add hl,de
    push hl
    ld e,(hl)
    inc hl
    ld d,(hl)
    ex de,hl
    ld e,(ix+CI_R)
    ld d,(ix+CI_R+1)
    call circle_scale
    ld (ix+CI_PX),l
    ld (ix+CI_PX+1),h
    pop hl
    inc hl
    inc hl
    ld e,(hl)
    inc hl
    ld d,(hl)
    ex de,hl
    ld e,(ix+CI_R)
    ld d,(ix+CI_R+1)
    call circle_scale
    ld (ix+CI_PY),l
    ld (ix+CI_PY+1),h
    ret
circle_endpoint:
    call circle_endpoint_xy
    jp circle_plot_scaled

; 主軸方向の整数ステップで、中心から端点までの線分を範囲内に切り詰めて描く。
; 中点描画で使い終わったワークを、差分・方向・回数・誤差の保存に再利用する。
circle_radius:
    call circle_endpoint_xy
    ld l,(ix+CI_PX)
    ld h,(ix+CI_PX+1)
    ld e,(ix+CI_FX)
    ld d,(ix+CI_FX+1)
    call circle_scale
    ld (ix+CI_STEPX),1
    bit 7,h
    jr z,circle_radius_x
    ld (ix+CI_STEPX),255
    call negate_hl
circle_radius_x:
    ld (ix+CI_X),l
    ld (ix+CI_X+1),h
    ld l,(ix+CI_PY)
    ld h,(ix+CI_PY+1)
    ld e,(ix+CI_FY)
    ld d,(ix+CI_FY+1)
    call circle_scale
    ld (ix+CI_STEPY),255
    bit 7,h
    jr z,circle_radius_y
    ld (ix+CI_STEPY),1
    call negate_hl
circle_radius_y:
    ld (ix+CI_Y),l
    ld (ix+CI_Y+1),h
    ld e,(ix+CI_X)
    ld d,(ix+CI_X+1)
    or a
    sbc hl,de
    ld (ix+CI_OCTANT),0
    jr c,circle_radius_horizontal
    ld (ix+CI_OCTANT),1
    ld l,(ix+CI_Y)
    ld h,(ix+CI_Y+1)
    jr circle_radius_axes
circle_radius_horizontal:
    ex de,hl
    ld e,(ix+CI_Y)
    ld d,(ix+CI_Y+1)
circle_radius_axes:
    ld (ix+CI_MAJOR),l
    ld (ix+CI_MAJOR+1),h
    ld (ix+CI_COUNT),l
    ld (ix+CI_COUNT+1),h
    ld (ix+CI_MINOR),e
    ld (ix+CI_MINOR+1),d
    srl h
    rr l
    ld (ix+CI_ACCUM),l
    ld (ix+CI_ACCUM+1),h
    ld l,(ix+CI_CX)
    ld h,(ix+CI_CX+1)
    ld (ix+CI_OUTX),l
    ld (ix+CI_OUTX+1),h
    ld l,(ix+CI_CY)
    ld h,(ix+CI_CY+1)
    ld (ix+CI_OUTY),l
    ld (ix+CI_OUTY+1),h
    bit 2,(ix+CI_POSITION)
    jr z,circle_radius_loop
    call circle_clip_radius
    ret c
circle_radius_loop:
    call circle_plot
    jr nc,circle_radius_continue
    bit 2,(ix+CI_POSITION)
    ret z                   ; ページ内の中心から伸びる半直線が、画面外から再び入ることはない。
circle_radius_continue:
    ld l,(ix+CI_COUNT)
    ld h,(ix+CI_COUNT+1)
    ld a,h
    or l
    ret z
    dec hl
    ld (ix+CI_COUNT),l
    ld (ix+CI_COUNT+1),h
    ld l,(ix+CI_ACCUM)
    ld h,(ix+CI_ACCUM+1)
    ld e,(ix+CI_MINOR)
    ld d,(ix+CI_MINOR+1)
    add hl,de
    ld e,(ix+CI_MAJOR)
    ld d,(ix+CI_MAJOR+1)
    or a
    sbc hl,de
    jr nc,circle_radius_minor
    add hl,de
    ld (ix+CI_ACCUM),l
    ld (ix+CI_ACCUM+1),h
    jr circle_radius_major
circle_radius_minor:
    ld (ix+CI_ACCUM),l
    ld (ix+CI_ACCUM+1),h
    ld a,(ix+CI_OCTANT)
    xor 1
    call circle_radius_step
circle_radius_major:
    ld a,(ix+CI_OCTANT)
    call circle_radius_step
    jr circle_radius_loop
circle_radius_step:
    or a
    jr nz,circle_radius_step_y
    ld l,(ix+CI_OUTX)
    ld h,(ix+CI_OUTX+1)
    ld a,(ix+CI_STEPX)
    call circle_step
    ld (ix+CI_OUTX),l
    ld (ix+CI_OUTX+1),h
    ret
circle_radius_step_y:
    ld l,(ix+CI_OUTY)
    ld h,(ix+CI_OUTY+1)
    ld a,(ix+CI_STEPY)
    call circle_step
    ld (ix+CI_OUTY),l
    ld (ix+CI_OUTY+1),h
    ret
circle_step:
    inc hl
    cp 1
    ret z
    dec hl
    dec hl
    ret

; Bresenham法の誤差状態を保ち、主軸の座標をページ内の最初の位置まで進める。
; 中心がページ外の場合だけ使う。この後のループは最大512点となる。
circle_clip_radius:
    ld l,(ix+CI_CX)
    ld h,(ix+CI_CX+1)
    ld c,(ix+CI_MAXX)
    ld b,(ix+CI_MAXX+1)
    ld a,(ix+CI_STEPX)
    bit 0,(ix+CI_OCTANT)
    jr z,circle_clip_major
    ld l,(ix+CI_CY)
    ld h,(ix+CI_CY+1)
    ld c,(ix+CI_MAXY)
    ld b,(ix+CI_MAXY+1)
    ld a,(ix+CI_STEPY)
circle_clip_major:
    ld (ix+CI_MASK),a
    ld (ix+CI_PX),c
    ld (ix+CI_PX+1),b
    ld de,0
    bit 7,h
    jr nz,circle_clip_negative
    ld a,b
    cp h
    jr nc,circle_clip_start
    ld a,(ix+CI_MASK)
    cp 1
    jr z,circle_clip_miss
    or a
    sbc hl,bc
    ex de,hl
    ld h,b
    ld l,c
    jr circle_clip_start
circle_clip_negative:
    cp 1
    jr nz,circle_clip_miss
    call negate_hl
    ex de,hl
circle_clip_start:
    ld (ix+CI_PY),l
    ld (ix+CI_PY+1),h
    ld (ix+CI_LIMIT),e
    ld (ix+CI_LIMIT+1),d
    ld l,(ix+CI_MAJOR)
    ld h,(ix+CI_MAJOR+1)
    or a
    sbc hl,de
    ret c
    ld b,h
    ld c,l                 ; 元の端点までの残りステップ数。
    ld e,(ix+CI_PY)
    ld d,(ix+CI_PY+1)
    ld a,(ix+CI_MASK)
    cp 1
    jr nz,circle_clip_decreasing
    ld l,(ix+CI_PX)
    ld h,(ix+CI_PX+1)
    or a
    sbc hl,de
    jr circle_clip_count
circle_clip_decreasing:
    ld h,d
    ld l,e
circle_clip_count:
    or a
    sbc hl,bc
    jr nc,circle_clip_count_ready
    add hl,bc
    ld b,h
    ld c,l
circle_clip_count_ready:
    ld (ix+CI_COUNT),c
    ld (ix+CI_COUNT+1),b
    bit 0,(ix+CI_OCTANT)
    jr nz,circle_clip_start_y
    ld (ix+CI_OUTX),e
    ld (ix+CI_OUTX+1),d
    jr circle_clip_phase
circle_clip_miss:
    scf
    ret
circle_clip_start_y:
    ld (ix+CI_OUTY),e
    ld (ix+CI_OUTY+1),d
circle_clip_phase:
    ld l,(ix+CI_LIMIT)
    ld h,(ix+CI_LIMIT+1)
    ld a,h
    or l
    jr z,circle_clip_minor
    ld e,(ix+CI_MINOR)
    ld d,(ix+CI_MINOR+1)
    call circle_multiply
    ld c,(ix+CI_ACCUM)
    ld b,(ix+CI_ACCUM+1)
    add hl,bc
    jr nc,circle_clip_divide
    inc de
circle_clip_divide:
    ld c,(ix+CI_MAJOR)
    ld b,(ix+CI_MAJOR+1)
    call circle_divide
    ld (ix+CI_ACCUM),e
    ld (ix+CI_ACCUM+1),d
circle_clip_minor:
    ; HLは従軸の移動量（主軸のスキップ距離が0なら0）。
    ld e,(ix+CI_CY)
    ld d,(ix+CI_CY+1)
    ld c,(ix+CI_MAXY)
    ld b,(ix+CI_MAXY+1)
    ld a,(ix+CI_STEPY)
    bit 0,(ix+CI_OCTANT)
    jr z,circle_clip_minor_axis
    ld e,(ix+CI_CX)
    ld d,(ix+CI_CX+1)
    ld c,(ix+CI_MAXX)
    ld b,(ix+CI_MAXX+1)
    ld a,(ix+CI_STEPX)
circle_clip_minor_axis:
    ld (ix+CI_MASK),a
    cp 1
    call nz,negate_hl
    or a
    adc hl,de
    jp pe,circle_clip_miss
    bit 7,h
    jr nz,circle_clip_minor_negative
    ld a,b
    cp h
    jr nc,circle_clip_minor_store
    ld a,(ix+CI_MASK)
    cp 1
    jr z,circle_clip_miss
    jr circle_clip_minor_store
circle_clip_minor_negative:
    ld a,(ix+CI_MASK)
    cp 1
    jr nz,circle_clip_miss
circle_clip_minor_store:
    bit 0,(ix+CI_OCTANT)
    jr nz,circle_clip_minor_x
    ld (ix+CI_OUTY),l
    ld (ix+CI_OUTY+1),h
    or a
    ret
circle_clip_minor_x:
    ld (ix+CI_OUTX),l
    ld (ix+CI_OUTX+1),h
    or a
    ret

; DE:HL / BCの商をHL、余りをDEに返す。上位ワード < 除数 <=32767。
circle_divide:
    ld a,16
circle_divide_loop:
    add hl,hl
    rl e
    rl d
    ex de,hl
    or a
    sbc hl,bc
    jr nc,circle_divide_bit
    add hl,bc
    jr circle_divide_next
circle_divide_bit:
    inc de
circle_divide_next:
    ex de,hl
    dec a
    jr nz,circle_divide_loop
    ret

circle_boundary_bits:
    defb 1,2,8,4,128,64,16,32
circle_cint_expr:
    defb $ff,$9e,'(',1,')',0
circle_angle_invalid:
    defb $ff,$86,'(',1,')',$ee,"6.2831853071796",0
circle_negative:
    defb '(',1,')',$f0,'0',0
circle_nonpositive:
    defb '(',1,')',$f0,$ef,'0',0
circle_gt_one:
    defb '(',1,')',$ee,'1',0
circle_cos_expr:
    defb $ff,$8c,'(',$ff,$86,'(',1,')',')',$f3,"16384",0
circle_sin_expr:
    defb $ff,$89,'(',$ff,$86,'(',1,')',')',$f3,"16384",0
circle_ratio_expr:
    defb '(',1,')',$f3,"16384",0
circle_inverse_expr:
    defb "16384",$f4,'(',1,')',0
circle_default_narrow:
    defb 1,$f4,"256",0
    defb 1,$f4,"128",0
circle_tau_token:
    defb $1f,$41,$62,$83,$18,$53,$07,$17,$96
circle_span_zero:
    defb $ff,$86,'(',3,')',$ef,$ff,$86,'(',2,')',0
circle_span_full:
    defb $ff,$86,'(',3,')',$f2,$ff,$86,'(',2,')',$ee,$ef,"6.2831853071796",0
circle_span_major:
    defb $ff,$86,'(',3,')',$f2,$ff,$86,'(',2,')',$ee,"3.1415926535898",0
circle_span_negative:
    defb $ff,$86,'(',3,')',$f0,$ff,$86,'(',2,')',0
circle_span_wrap_zero:
    defb $ff,$86,'(',3,')',$f2,$ff,$86,'(',2,')',$f0,$ef,$f2,"6.2831853071796",0
circle_span_wrap_zero_end:
    assert circle_span_wrap_zero_end-circle_span_wrap_zero+16 <= 48
circle_span_wrap_major:
    defb $ff,$86,'(',3,')',$f2,$ff,$86,'(',2,')',$ee,$f2,"3.1415926535898",0
