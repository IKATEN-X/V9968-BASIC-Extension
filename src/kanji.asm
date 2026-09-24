; FONT(3): Shift-JISをGRP:へ出力する。字形は漢字ROMから1文字ずつ読み、
; 既存フォント予約領域の先頭32バイトをLFMMの転送元として使う。
defc KANJI_LEAD = 1
defc KANJI_OWNER = 2
defc KANJI_LEVEL = 30
defc KANJI_RAW = FONT_BUFFER+32

; 未導入時にはRAM内容を参照しない。ポインターは所有者比較だけに使う。
kanji_reset:
    push af
    push bc
    push de
    push hl
    call font_state
    bit 0,l
    jr nz,kanji_reset_done
    inc hl
    ld (hl),0
kanji_reset_done:
    pop hl
    pop de
    pop bc
    pop af
    ret

; 第1水準の斜線字形と、第2水準の標準検査用8バイトの和で検出する。
; フックと選択状態を変更する前に実施し、ROMなしならERR=5とする。
kanji_detect:
    di
    xor a
    out ($d8),a
    ld a,2
    out ($d9),a
    ld b,8
    ld c,0
    ld d,$80
kanji_detect_l1:
    in a,($d9)
    xor c
    jr nz,kanji_detect_absent
    ld c,d
    srl c
    ld d,c
    djnz kanji_detect_l1
    ld (ix+INV),1
    ld a,$3e
    out ($da),a
    ld a,$35
    out ($db),a
    ld b,8
    ld c,0
kanji_detect_l2:
    in a,($db)
    add a,c
    ld c,a
    djnz kanji_detect_l2
    cp $95
    jr nz,kanji_detect_done
    inc (ix+INV)
kanji_detect_done:
    ei
    ret
kanji_detect_absent:
    ei
    jp illegal

; 入力A。戻りCY=0は標準出力、CY=1/Z=1は処理済み、
; CY=1/Z=0はDEのコードを描画する。D=0は半角、D!=0はShift-JIS先行バイト。
kanji_decode:
    ld b,a
    call font_state
    inc hl
    ld e,(hl)
    ld (hl),0
    inc hl
    ld a,(PTRFIL)
    cp (hl)
    jr nz,kanji_decode_owner
    inc hl
    ld a,(PTRFIL+1)
    cp (hl)
    jr z,kanji_decode_owned
kanji_decode_owner:
    ld e,0
kanji_decode_owned:
    ld a,b
    cp 32
    jp c,kanji_control
    ld a,(GRPHED)
    or a
    jr z,kanji_decode_pair
    xor a
    ld (GRPHED),a
    ld a,b
    sub 64
    cp 32
    jr c,kanji_decode_half
    ld e,0
kanji_decode_pair:
    ld a,e
    or a
    jr z,kanji_decode_first
    ld a,b
    cp $40
    jr c,kanji_decode_first
    cp $7f
    jr z,kanji_decode_first
    cp $fd
    jr nc,kanji_decode_first
    ld d,e
    ld e,b
    or 1
    scf
    ret
kanji_decode_first:
    ld a,b
    cp $81
    jr c,kanji_decode_half
    cp $a0
    jr c,kanji_decode_lead
    cp $e0
    jr c,kanji_decode_half
    cp $f0
    jr nc,kanji_decode_half
kanji_decode_lead:
    call font_state
    inc hl
    ld (hl),b
    inc hl
    ld de,(PTRFIL)
    ld (hl),e
    inc hl
    ld (hl),d
    xor a
    scf
    ret
kanji_decode_half:
    ld e,a
    ld d,0
    or 1
    scf
    ret

kanji_control:
    cp 10
    jr z,kanji_lf
    cp 13
    jr z,kanji_cr
    cp 8
    jr z,kanji_bs
    cp 9
    jr z,kanji_tab
    or a
    ret
kanji_cr:
    ld hl,0
    ld (GRPACX),hl
    jr kanji_control_done
kanji_lf:
    ld hl,(GRPACY)
    ld de,16
    add hl,de
    ld (GRPACY),hl
    jr kanji_control_done
kanji_bs:
    ld hl,(GRPACX)
    ld de,8
    or a
    sbc hl,de
    jr nc,kanji_control_x
    ld hl,0
    jr kanji_control_x
kanji_tab:
    ld hl,(GRPACX)
    ld a,l
    and $c0
    ld l,a
    ld de,64
    add hl,de
    ld a,h
    or a
    jr z,kanji_control_x
    call kanji_lf
    ld hl,0
kanji_control_x:
    ld (GRPACX),hl
kanji_control_done:
    xor a
    scf
    ret

kanji_draw:
    ld (ix+STYLE),1
    ld a,(ix+TEMP+1)
    or a
    jr nz,kanji_full
    ld a,(ix+TEMP)
    cp 32
    jp c,kanji_graph
    cp $80
    jr c,kanji_ascii
    cp $a1
    jr c,kanji_question
    cp $e0
    jr nc,kanji_question
    ld l,a
    ld h,0
    ld de,704             ; 半角カナは区9の8x16字形（インデックス864以降）。
    add hl,de
    jp kanji_level1
kanji_question:
    ld a,'?'
kanji_ascii:
    sub 32
    ld l,a
    ld h,0
    jp kanji_level1

kanji_full:
    ; Shift-JISの奇数行・偶数行を区点へ変換する。
    cp $a0
    jr c,kanji_row_low
    sub $40
kanji_row_low:
    sub $81
    add a,a
    inc a
    ld d,a
    ld a,(ix+TEMP)
    cp $9f
    jr c,kanji_odd_row
    inc d
    sub $9e
    jr kanji_column
kanji_odd_row:
    cp $7f
    jr c,kanji_odd_low
    dec a
kanji_odd_low:
    sub $3f
kanji_column:
    ld e,a
    ld a,d
    cp 85
    jr nc,kanji_question
    cp 11
    jr c,kanji_row_valid
    cp 16
    jr c,kanji_question
kanji_row_valid:
    cp 84
    jr nz,kanji_row_supported
    ld a,e
    cp 7
    jr nc,kanji_question
    ld a,d
kanji_row_supported:
    ld (ix+STYLE),2
    ld c,$d9
    cp 48
    jr c,kanji_index_l1
    push de
    call font_state
    ld de,KANJI_LEVEL
    add hl,de
    ld a,(hl)
    pop de
    cp 2
    jr nc,kanji_index_l2
    ld (ix+STYLE),1
    jr kanji_question
kanji_index_l2:
    ld a,d
    sub 48
    ld d,a
    ld c,$db
kanji_index_l1:
    ld l,d
    ld h,0
    add hl,hl
    ld b,h
    ld a,l
    add hl,hl
    ld d,b
    ld b,a
    ld a,e
    ld e,b
    add hl,de             ; 区番号*6。続く4回の倍算で区番号*96。
    add hl,hl
    add hl,hl
    add hl,hl
    add hl,hl
    ld e,a
    ld d,0
    add hl,de
    ld a,c
    cp $db
    jr z,kanji_read
    ld a,h
    cp 6                  ; 第1水準の区16以降は512文字分の空隙を詰める。
    jr c,kanji_read
    dec h
    dec h
    jr kanji_read
kanji_level1:
    ld c,$d9
kanji_read:
    ld a,l
    and $3f
    dec c
    di
    out (c),a
    inc c
    add hl,hl
    add hl,hl
    ld a,h
    out (c),a
    push ix
    pop hl
    ld de,KANJI_RAW
    add hl,de
    ld b,32
    inir
    ei
    jr kanji_position

; MSXのCHR$(1)による図形文字だけは、BIOSの8x8を縦2倍にして互換性を保つ。
kanji_graph:
    ld l,a
    ld h,0
    add hl,hl
    add hl,hl
    add hl,hl
    ld de,(CGPNT+1)
    add hl,de
    ld b,8
    push ix
    pop de
    push hl
    ld hl,KANJI_RAW
    add hl,de
    ex de,hl
    pop hl
kanji_graph_row:
    push bc
    push de
    push hl
    ld a,(CGPNT)
    call RDSLT
    ei
    pop hl
    pop de
    pop bc
    ld (de),a
    inc de
    ld (de),a
    inc de
    inc hl
    ld a,b
    cp 5
    jr nz,kanji_graph_next
    push hl
    ld hl,8
    add hl,de
    ex de,hl
    pop hl
kanji_graph_next:
    djnz kanji_graph_row

kanji_position:
    ld hl,(GRPACX)
    ld a,h
    or a
    jp nz,kanji_advance
    ld (CLOC),hl
    ld (ix+4),l
    ld hl,(GRPACY)
    ld a,h
    or a
    jp nz,kanji_advance
    ld a,l
    cp 212
    jp nc,kanji_advance
    ld (CMASK),a
    ld (ix+6),a
    ld a,212
    sub l
    cp 16
    jr c,kanji_height
    ld a,16
kanji_height:
    ld (ix+10),a
    ld a,(ACPAGE)
    and 7
    ld (ix+7),a
    ; ROMの8x8四分割を、LFMMの左列/右列へ並べ替える。
    ; 下端で切れる場合も、NYに合わせて右列を直後へ詰める。
    push ix
    pop hl
    ld de,FONT_BUFFER
    add hl,de
    ex de,hl
    ld a,KANJI_RAW
    call kanji_pack_column
    ld a,(ix+STYLE)
    cp 2
    jr nz,kanji_upload
    ld a,KANJI_RAW+8
    call kanji_pack_column
kanji_upload:
    call wait_vdp
    di
    ld a,13
    out ($99),a
    ld a,$8e
    out ($99),a
    xor a
    out ($99),a
    ld a,$76
    out ($99),a
    push ix
    pop hl
    ld de,FONT_BUFFER
    add hl,de
    ld a,(ix+10)
    ld b,a
    ld a,(ix+STYLE)
    cp 2
    jr nz,kanji_upload_count
    sla b
kanji_upload_count:
    ld c,$98
    otir
    call sprite_vram_done
    ld (ix+0),0
    ld (ix+1),$76
    ld (ix+2),3
    ld a,(ix+STYLE)
    ld (ix+8),a
    ld a,(FORCLR)
    and 15
    ld (ix+12),a
    ld a,(LOGOPR)
    and 15
    or $10
    ld (ix+14),a
    ld a,(BAKCLR)
    and 15
    ld c,12
    call write_reg
    call submit_command
    call wait_vdp
    ld a,(RG12SAV)
    ld c,12
    call write_reg
kanji_advance:
    ld a,(ix+STYLE)
    add a,a
    add a,a
    add a,a
    ld e,a
    ld d,0
    ld hl,(GRPACX)
    add hl,de
    ld a,h
    or a
    jr z,kanji_advance_x
    call kanji_lf
    ld hl,0
kanji_advance_x:
    ld (GRPACX),hl
    ret

kanji_pack_column:
    push de
    ld e,a
    ld d,0
    push ix
    pop hl
    add hl,de
    pop de
    ld b,(ix+10)
    ld c,8
kanji_pack_row:
    ld a,(hl)
    ld (de),a
    inc hl
    inc de
    dec c
    jr nz,kanji_pack_next
    ld a,l
    add a,8
    ld l,a
    jr nc,kanji_pack_next
    inc h
kanji_pack_next:
    djnz kanji_pack_row
    ret
