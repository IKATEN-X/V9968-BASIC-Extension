skip_space:
    ld a,(hl)
    cp ' '
    ret nz
    inc hl
    jr skip_space
expect:
    ld b,a
    call skip_space
    cp b
    jp nz,syntax_error
    inc hl
    jp skip_space
open_args:
    ld a,'('
    jp expect
close_args:
    ld a,')'
    jp expect
comma:
    ld a,','
    jp expect
empty_field:
    call skip_space
    or a
    ret z
    cp ':'
    ret z
    cp ','
    ret
end_statement:
    call skip_space
    or a
    ret z
    cp ':'
    ret z
syntax_error:
    ld e,2
    jr basic_error
illegal:
    ld e,5
    jr basic_error
out_of_memory:
    ld e,7
basic_error:
    ld ix,ERROR
    jp CALBAS

get_int:
    call skip_space
    push ix
    ld ix,FRMQNT
    call CALBAS
    pop ix
    jp skip_space
get_byte:
    call get_int
    ld a,d
    or a
    jp nz,illegal
    ld a,e
    ret
get_page:
    call get_byte
    bit 7,(ix+13)
    jr nz,validate_page_range
    ld b,a
    ld a,(RG21SAV)
    bit 6,a
    ld a,b
    jr z,page_native
    cp 4
    jp nc,illegal
    add a,a                ; FILの1ページは標準の256行ページ2枚分。
page_native:
validate_page_range:
    ld b,a
    call drawing_mode
    cp 7
    jr z,page_wide
    cp 8
    jr z,page_wide
    ld a,b
    cp 8
    jp nc,illegal
    ret
page_wide:
    ld a,b
    cp 4
    jp nc,illegal
    ret
validate_drawing_page:
    call validate_page_range
    bit 7,(ix+13)
    ret nz
    ld b,a
    ld a,(RG21SAV)
    bit 6,a
    ld a,b
    ret z
    bit 0,a
    jp nz,illegal          ; 標準SET PAGEによるFILページの途中からの指定を拒否する。
    ret
get_color:
    call get_byte
color_16:
    cp 16
    jp nc,illegal
    ret

get_draw_color:
    call get_byte
    call drawing_mode
    cp 6
    jr z,color_4
    cp 8
    ld a,e
    ret z
    jr color_16
color_4:
    ld a,e
    cp 4
    jp nc,illegal
    ret

mask_draw_color:
    ld b,a
    call drawing_mode
    cp 6
    jr z,mask_color_4
    cp 8
    ld a,b
    ret z
    and 15
    ret
mask_color_4:
    ld a,b
    and 3
    ret

; Xの下位をD、上位をBに、Yの下位をE、上位をAに返す。
get_point:
    call open_args
    call get_int
    ld a,d
    call validate_x_high
    push de
    call comma
    call get_int
    ld a,d
    or a
    jr z,point_y_valid
    cp 1
    jp nz,illegal
    bit 7,(ix+13)
    jp nz,illegal
    ld a,(RG21SAV)
    bit 6,a
    jp z,illegal
point_y_valid:
    push de
    call close_args
    pop bc
    pop de
    ld a,b
    ld b,d
    ld d,e
    ld e,c
    ret

validate_x_high:
    or a
    ret z
    cp 1
    jp nz,illegal
    call drawing_mode
    cp 6
    ret z
    cp 7
    jp nz,illegal
    ret

match_word:
    call skip_space
match_word_loop:
    ld a,(de)
    or a
    ret z
    cp (hl)
    jp nz,syntax_error
    inc de
    inc hl
    jr match_word_loop

save_text:
    ld (ix+TEXTPTR),l
    ld (ix+TEXTPTR+1),h
    ret
restore_text:
    ld l,(ix+TEXTPTR)
    ld h,(ix+TEXTPTR+1)
    ret
