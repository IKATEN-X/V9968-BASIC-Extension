cmd_cls:
    call pattern_begin
    call skip_space
    ld a,(BAKCLR)
    call mask_draw_color
    ld (ix+COLOR),a
    ld a,(hl)
    cp '('
    jr nz,cls_no_arg
    call open_args
    call get_draw_color
    ld (ix+COLOR),a
    call close_args
cls_no_arg:
    call end_statement
    call require_graphics
    call save_text
    call drawing_active_page
    ld (ix+DPAGE),a
    ld (ix+DX2),255
    ld (ix+DY2),255
    call drawing_mode
    cp 6
    jr z,cls_wide
    cp 7
    jr nz,cls_height
cls_wide:
    ld (ix+DX2H),1
cls_height:
    bit 7,(ix+13)
    jr nz,cls_check_reservation
    ld a,(RG21SAV)
    bit 6,a
    jr z,cls_check_reservation
    ld (ix+DY2H),1
cls_check_reservation:
    call reserved_drawing_page
    jr nz,cls_page_ready
    call font_active
    jr z,cls_sprite_reservation
    ld (ix+DY2),FONT_TOP-1
    ld (ix+DY2H),0
    jr cls_page_ready
cls_sprite_reservation:
    ld a,(RG20SAV)
    bit 3,a
    jr z,cls_page_ready
    ld (ix+DY2),251          ; スプライトモード3の属性テーブルを保護する。
    ld (ix+DY2H),0
cls_page_ready:
    call rectangle_regs
    ld (ix+14),$80
    jp drawing_submit

cmd_pset:
    call pattern_begin
    call get_point
    ld (ix+DX1H),b
    ld (ix+DY1H),a
    ld (ix+DY2H),a
    ld (ix+DX1),d
    ld (ix+DY1),e
    ld (ix+DY2),e
    call parse_draw_color
    call end_statement
    call require_graphics
    call save_text
    call drawing_regs
    ld (ix+14),$50
    jp drawing_submit

cmd_line:
    call pattern_begin
    call get_point
    ld (ix+DX1H),b
    ld (ix+DY1H),a
    ld (ix+DX1),d
    ld (ix+DY1),e
    ld a,TOK_MINUS
    call expect
    call get_point
    ld (ix+DX2H),b
    ld (ix+DY2H),a
    ld (ix+DX2),d
    ld (ix+DY2),e
    call parse_draw_color
    call skip_space
    cp ','
    jr nz,line_parsed
    call comma
    ld a,'B'
    call expect
    ld (ix+STYLE),1
    cp 'F'
    jr nz,line_parsed
    inc hl
    ld (ix+STYLE),2
line_parsed:
    call end_statement
    call require_graphics
    call save_text
    ld a,(ix+STYLE)
    or a
    jp z,line_segment
    call normalize_rectangle
    call drawing_active_page
    ld (ix+DPAGE),a
    call rectangle_regs
    ld (ix+14),$80
    ld a,(ix+STYLE)
    cp 2
    jp z,drawing_submit
    ; 元の縦横サイズを保ち、太さ1ピクセルの矩形4本で枠を描く。
    ld a,(ix+10)
    ld (ix+TEMP),a
    ld a,(ix+11)
    ld (ix+TEMP+1),a
    ld (ix+10),1
    ld (ix+11),0
    call submit_command
    ld a,(ix+DY2)
    ld (ix+6),a
    ld a,(ix+DPAGE)
    or (ix+DY2H)
    ld (ix+7),a
    call submit_command
    ld a,(ix+DY1)
    ld (ix+6),a
    ld a,(ix+DPAGE)
    or (ix+DY1H)
    ld (ix+7),a
    ld a,(ix+TEMP)
    ld (ix+10),a
    ld a,(ix+TEMP+1)
    ld (ix+11),a
    ld (ix+8),1
    ld (ix+9),0
    call submit_command
    ld a,(ix+DX2)
    ld (ix+4),a
    ld a,(ix+DX2H)
    ld (ix+5),a
    jp drawing_submit

drawing_submit:
    call submit_command
    call pattern_finish
    jp restore_text

parse_draw_color:
    call skip_space
    ld a,(FORCLR)
    call mask_draw_color
    ld (ix+COLOR),a
    ld a,(hl)
    cp ','
    ret nz
    call comma
    call get_draw_color
    ld (ix+COLOR),a
    ret

drawing_regs:
    call drawing_active_page
    ld (ix+DPAGE),a
    call check_sprite_destination
    ld a,(ix+DPAGE)
    or (ix+DY1H)
    ld (ix+7),a
    ld a,(ix+DX1)
    ld (ix+4),a
    ld a,(ix+DX1H)
    ld (ix+5),a
    ld a,(ix+DY1)
    ld (ix+6),a
    ld a,(ix+COLOR)
    ld (ix+12),a
    ret

line_segment:
    call drawing_regs
    ld l,(ix+DX2)
    ld h,(ix+DX2H)
    ld e,(ix+DX1)
    ld d,(ix+DX1H)
    or a
    sbc hl,de
    jr nc,line_x_positive
    call negate_hl
    set 2,(ix+13)
line_x_positive:
    ld c,l
    ld b,h
    ld l,(ix+DY2)
    ld h,(ix+DY2H)
    ld e,(ix+DY1)
    ld d,(ix+DY1H)
    or a
    sbc hl,de
    jr nc,line_y_positive
    call negate_hl
    set 3,(ix+13)
line_y_positive:
    ld d,h
    ld e,l
    or a
    sbc hl,bc
    jr c,line_x_major
    set 0,(ix+13)
    ld (ix+8),e
    ld (ix+9),d
    ld (ix+10),c
    ld (ix+11),b
    jr line_issue
line_x_major:
    ld (ix+8),c
    ld (ix+9),b
    ld (ix+10),e
    ld (ix+11),d
line_issue:
    ld (ix+14),$70
    jp drawing_submit

normalize_rectangle:
    ld l,(ix+DX2)
    ld h,(ix+DX2H)
    ld e,(ix+DX1)
    ld d,(ix+DX1H)
    or a
    sbc hl,de
    jr nc,rectangle_x_sorted
    ld a,(ix+DX2)
    ld (ix+DX1),a
    ld a,(ix+DX2H)
    ld (ix+DX1H),a
    ld (ix+DX2),e
    ld (ix+DX2H),d
rectangle_x_sorted:
    ld l,(ix+DY2)
    ld h,(ix+DY2H)
    ld e,(ix+DY1)
    ld d,(ix+DY1H)
    or a
    sbc hl,de
    ret nc
    ld a,(ix+DY2)
    ld (ix+DY1),a
    ld a,(ix+DY2H)
    ld (ix+DY1H),a
    ld (ix+DY2),e
    ld (ix+DY2H),d
    ret

rectangle_regs:
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
    ld a,(ix+COLOR)
    ld (ix+12),a
    ld l,(ix+DX2)
    ld h,(ix+DX2H)
    ld e,(ix+DX1)
    ld d,(ix+DX1H)
    or a
    sbc hl,de
    inc hl
    ld (ix+8),l
    ld (ix+9),h
    ld l,(ix+DY2)
    ld h,(ix+DY2H)
    ld e,(ix+DY1)
    ld d,(ix+DY1H)
    or a
    sbc hl,de
    inc hl
    ld (ix+10),l
    ld (ix+11),h
    ret

; 物理アドレス37600h..37fffhを含む256行ページならZを立てる。
; SCREEN 7/8では標準ページ2の第2プレーン内の同じY範囲に相当する。
reserved_drawing_page:
    call drawing_mode
    cp 7
    jr z,reserved_wide_page
    cp 8
    jr z,reserved_wide_page
    ld a,(ix+DPAGE)
    cp 6
    ret
reserved_wide_page:
    ld a,(ix+DPAGE)
    cp 2
    ret
