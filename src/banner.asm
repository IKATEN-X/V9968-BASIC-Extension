; 既存32バイト予約の空き領域を使い、最初のREADYで起動表示を一度だけ行う。
; 他のROMが後から呼び継ぐ場合もあるため、表示後も保存フックを破棄しない。
    assert BANNER_PENDING + 1 <= PATTERN_STATE

banner_install:
    call font_state
    res 0,l
    ld de,BANNER_OLD
    add hl,de
    ex de,hl
    ld a,i
    push af
    di
    push bc
    ld hl,H_READ
    ld bc,5
    ldir
    pop bc
    ld a,$c9
    ld (de),a
    inc de
    ld a,1
    ld (de),a
    ld a,$f7
    ld (H_READ),a
    ld a,c
    ld (H_READ+1),a
    ld hl,banner_ready
    ld (H_READ+2),hl
    ld a,$c9
    ld (H_READ+4),a
    pop af
    ret po
    ei
    ret

; 最初のREADYより先にRUN/CLEARへ進んだ場合、後日のBREAKで起動表示を出さない。
; HLとCはfont_stateから受け取る。既存のフック保存領域は呼び継ぎ用に残す。
banner_cancel:
    res 0,l
    ld de,BANNER_PENDING
    add hl,de
    ld a,(hl)
    or a
    ret z
    ld (hl),0
    jp banner_unhook

banner_ready:
    push hl
    push de
    push bc
    push af
    push ix
    push iy
    ex af,af'
    push af
    ex af,af'
    exx
    push bc
    push de
    push hl
    exx
    ld a,i
    push af
    call font_state
    res 0,l
    ld de,BANNER_PENDING
    add hl,de
    ld a,(hl)
    or a
    jr z,banner_chain
    ld (hl),0
    call banner_unhook
banner_print:
    ld hl,banner_text
    ; Disk BASICでは既に改行されている。行の途中の場合だけ先頭のCR/LFを出す。
    ld a,(CSRX)
    dec a
    jr nz,banner_character
    inc hl
    inc hl
banner_character:
    ld a,(hl)
    or a
    jr z,banner_chain
    inc hl
    push hl
    call CHPUT
    pop hl
    jr banner_character
banner_chain:
    call font_state
    res 0,l
    ld de,BANNER_OLD
    add hl,de
    pop af
    di
    jp po,banner_restore
    ei
banner_restore:
    exx
    pop hl
    pop de
    pop bc
    exx
    ex af,af'
    pop af
    ex af,af'
    pop iy
    pop ix
    pop af
    pop bc
    pop de
    ex (sp),hl
    ret

; Cは自スロットID。後から設置されたフックを上書きせず、呼び継ぎを維持する。
banner_unhook:
    ld a,i
    push af
    di
    ld a,(H_READ)
    cp $f7
    jr nz,banner_unhook_done
    ld a,(H_READ+1)
    cp c
    jr nz,banner_unhook_done
    ld hl,(H_READ+2)
    ld de,banner_ready
    or a
    sbc hl,de
    jr nz,banner_unhook_done
    ld a,(H_READ+4)
    cp $c9
    jr nz,banner_unhook_done
    call font_state
    res 0,l
    ld de,BANNER_OLD
    add hl,de
    ld de,H_READ
    ld bc,5
    ldir
banner_unhook_done:
    pop af
    ret po
    ei
    ret

banner_text:
    defb 13,10
    defm "V9968 BASIC Extension 0.1"
    defb 13,10,0
