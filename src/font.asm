; VRAM 37600h..37DFFh（ページ6、Y=236..251）に8x8・256文字のフォントを1組置く。
; H.OUTDはGRP:出力の印字可能な文字だけを処理する。制御コード・式の書式整形・
; グラフィックカーソルはBASICが管理する。システムROMは書き換えない。
; FONT(3)の日本語出力は同じ予約領域を一文字の作業用に使用する（kanji.asm）。
defc FONT_TOP = 236
defc FONT_BUFFER = 64
defc FONT_RAM_SIZE = 32
defc FONT_STUB = 4
defc FONT_OLD = FONT_STUB + font_stub_old - font_stub
defc BANNER_OLD = 23
defc BANNER_PENDING = 29

; Disk BASICが固定ワーク領域を確保する前にHIMEMを下げてはいけない。
; この単体ROMでは、自スロットのSLTWRK全8バイトを使用する。
; +0..5は元のH.CLEAとRET、+6..7はフォントポインター（ビット0 = 未導入）。
font_boot:
    call font_slot_work
    ; BIOSはリセット時にSLTWRKを消去する。ミラーされたヘッダーからINITが2回呼ばれる場合がある。
    ; 後から別のROMがフックを追加していても、最初に作ったフックの呼び出し連鎖を保持する。
    ld a,(hl)
    inc hl
    or (hl)
    dec hl
    ret nz
    ld (hl),1
    inc hl
    ld (hl),0
    dec hl
    ld de,-6
    add hl,de
    ex de,hl
    ld hl,H_CLEA
    push bc
    ld bc,5
    ldir
    pop bc
    ld a,$c9
    ld (de),a
    di
    ld (H_CLEA+4),a
    ld a,c
    ld (H_CLEA+1),a
    ld hl,font_clear_hook
    ld (H_CLEA+2),hl
    ld a,$f7
    ld (H_CLEA),a
    ei
    ret

; ROM初期化後の最初のCLEARは、ディスク初期化が終わった後に実行される。
; 以降のCLEAR/NEW/RUNではレジスタを保持し、元のフックを呼び出すだけにする。
font_clear_hook:
    push hl
    push de
    push bc
    push af
    call font_state
    ld a,h
    or a
    jr nz,font_clear_existing
    call font_allocate
    jr font_clear_reset
font_clear_existing:
    call banner_cancel
font_clear_reset:
    call kanji_reset
    call pattern_off
    call font_slot_work
    ld de,-6
    add hl,de
    pop af
    pop bc
    pop de
    ex (sp),hl
    ret

font_allocate:
    call font_slot_work
    push hl
    ld hl,(HIMEM)
    ld b,h
    ld c,l
    ld de,-FONT_RAM_SIZE-1
    add hl,de
    set 0,l
    push hl
    or a
    sbc hl,bc
    ld b,h
    ld c,l
    pop hl
    call font_reserve_ram
    ld hl,(HIMEM)
    inc hl
    set 0,l
    ex de,hl
    pop hl
    ld (hl),e
    inc hl
    ld (hl),d
    ex de,hl
    res 0,l
    ld de,PATTERN_STATE
    add hl,de
    ld (hl),0
    jp banner_install

; BC = 確保サイズの負数。使用中のスタックからHIMEMまでを、ファイルバッファも含めて
; 移動し、各バッファの絶対ポインターを補正する。起動時専用。
font_reserve_ram:
    push bc
    ld hl,0
    add hl,sp
    ld d,h
    ld e,l
    add hl,bc
    push hl
    ld hl,(HIMEM)
    or a
    sbc hl,de
    ld b,h
    ld c,l
    inc bc
    pop hl
    ld sp,hl
    ex de,hl
    ldir
    pop bc
    ld hl,(HIMEM)
    add hl,bc
    ld (HIMEM),hl
    ld hl,(MEMSIZ)
    add hl,bc
    ld (MEMSIZ),hl
    ld hl,(STKTOP)
    add hl,bc
    ld (STKTOP),hl
    ld hl,(SAVSTK)
    add hl,bc
    ld (SAVSTK),hl
    ld hl,(NULBUF)
    add hl,bc
    ld (NULBUF),hl
    ld hl,(FILTAB)
    add hl,bc
    ld (FILTAB),hl
    ld a,(MAXFIL)
    inc a
font_relocate_fcb:
    ld e,(hl)
    inc hl
    ld d,(hl)
    ex de,hl
    add hl,bc
    ex de,hl
    ld (hl),d
    dec hl
    ld (hl),e
    inc hl
    inc hl
    dec a
    jr nz,font_relocate_fcb
    ret

; HL = 自スロットのSLTWRK+6にあるフォントポインター、C = 拡張スロット情報を含むスロットID。
font_slot_work:
    call RSLREG
    rrca
    rrca
    and 3
    ld e,a
    ld d,0
    ld hl,EXPTBL
    add hl,de
    ld a,(hl)
    and $80
    or e
    ld c,a
    bit 7,a
    jr z,font_slot_primary
    ld hl,SLTTBL
    add hl,de
    ld a,(hl)
    and $0c
    or c
    ld c,a
font_slot_primary:
    ld a,e
    rlca
    rlca
    rlca
    rlca
    rlca
    ld e,a
    ld a,c
    and $0c
    add a,a
    add a,e
    ld e,a
    ld hl,SLTWRK+6
    add hl,de
    ret
font_state:
    call font_slot_work
    ld e,(hl)
    inc hl
    ld d,(hl)
    ex de,hl
    ret

; 共通のVRAM予約領域チェックで使うため、呼び出し元のレジスタを保持する。
font_active:
    push bc
    push de
    push hl
    call font_state
    xor a
    bit 0,l
    jr nz,font_active_done
    ld a,(hl)
font_active_done:
    pop hl
    pop de
    pop bc
    or a
    ret
font_off:
    push bc
    push de
    push hl
    call font_state
    bit 0,l
    jr nz,font_off_done
    ld (hl),0
font_off_done:
    call kanji_reset
    pop hl
    pop de
    pop bc
    ret

cmd_font:
    call open_args
    call get_byte
    ld (ix+STYLE),a
    call close_args
    cp $ef
    jp z,cmd_font_pattern  ; CALLはPROCNMから「$」を除く。「=」で代入を判別する。
    call end_statement
    ld a,(ix+STYLE)
    cp 4
    jp nc,illegal
    or a
    jp z,font_off
    call require_normal_graphics
    call save_text
    ld a,(ix+STYLE)
    cp 3
    call z,kanji_detect
    call font_install
    call kanji_reset
    ld a,(ix+STYLE)
    cp 3
    call nz,font_upload
    call font_state
    ld a,(ix+STYLE)
    ld (hl),a
    cp 3
    jr nz,font_selected
    ld de,KANJI_LEVEL
    add hl,de
    ld a,(ix+INV)
    ld (hl),a
font_selected:
    jp restore_text

font_install:
    call font_state
    ld a,h
    or a
    jp z,illegal           ; フォント使用前にH.CLEAでRAMが予約されている必要がある。
    bit 0,l
    ret z
    res 0,l
    push hl
    push bc
    ld d,h
    ld e,l
    inc de
    ld (hl),0
    ld bc,BANNER_OLD-1    ; 起動表示フックと独立したパターン描画の状態を保持する。
    ldir
    pop bc
    pop hl
    push hl
    ld de,FONT_STUB
    add hl,de
    ex de,hl
    ld hl,font_stub
    push bc
    ld bc,font_stub_end-font_stub
    ldir
    pop bc
    pop hl
    push hl
    inc hl
    inc hl
    inc hl
    inc hl
    inc hl
    inc hl
    ld (hl),c             ; RAM上の中継コードで使うCALLFのスロット指定バイト。
    pop hl
    push hl
    ld de,FONT_OLD
    add hl,de
    ex de,hl
    ld hl,H_OUTD
    ld bc,5
    ldir
    pop hl
    push hl
    ld de,FONT_STUB
    add hl,de
    di
    ld (H_OUTD+1),hl
    ld a,$c3
    ld (H_OUTD),a
    ei
    call font_slot_work
    res 0,(hl)
    pop hl
    ret

; OUTDOはCALL H.OUTDの前にAFを保存している。文字を処理した場合は、
; CALLFがカートリッジスロットを復元した後、そのCALLの戻り先と保存AFを飛ばして戻る。
font_stub:
    push af
    rst $30
    defb 0
    defw font_output
    jr nc,font_stub_pass
    pop af
    inc sp
    inc sp
    pop af
    ret
font_stub_pass:
    pop af
font_stub_old:
    defs 5,$c9
    ret
font_stub_end:
    assert FONT_STUB + font_stub_end - font_stub <= BANNER_OLD

font_upload:
    ld hl,(CGPNT+1)
    ld (ix+TEMP),0
font_upload_character:
    push ix
    pop de
    ld bc,FONT_BUFFER
    ex de,hl
    add hl,bc
    ex de,hl
    ld b,8
font_upload_row:
    push bc
    push de
    push hl
    ld a,(CGPNT)
    call RDSLT
    ei
    pop hl
    pop de
    pop bc
    ld c,a
    ld a,(ix+STYLE)
    cp 2
    ld a,c
    jr nz,font_upload_normal
    srl a
    or c
font_upload_normal:
    ld (de),a
    inc de
    inc hl
    djnz font_upload_row
    push hl
    push ix
    pop hl
    ld de,FONT_BUFFER
    add hl,de
    call font_write_glyph
    pop hl
    inc (ix+TEMP)
    jr nz,font_upload_character
    ret

cmd_font_pattern:
    ld a,(ix+STYLE)
    ld (ix+TEMP),a
    ld a,$ef                ; CALL命令名の引数に続く、トークン化された「=」。
    call expect
    push ix
    ld ix,FRMEVL
    call CALBAS
    pop ix
    call end_statement
    call save_text
    push ix
    ld ix,FRESTR
    call CALBAS
    pop ix
    ld a,(hl)
    cp 8
    jp nz,illegal
    inc hl
    ld e,(hl)
    inc hl
    ld d,(hl)
    ex de,hl
    push ix
    pop de
    ld bc,FONT_BUFFER
    ex de,hl
    add hl,bc
    ex de,hl
    ld bc,8
    ldir
    call font_active
    jp z,illegal
    cp 3
    jp z,illegal
    call require_normal_graphics
    push ix
    pop hl
    ld de,FONT_BUFFER
    add hl,de
    call font_write_glyph
    jp restore_text

; HLは転送元の8バイトを指す。IX+TEMP = 字形番号。
font_write_glyph:
    call wait_vdp
    push hl
    ld l,(ix+TEMP)
    ld h,0
    add hl,hl
    add hl,hl
    add hl,hl
    ld de,$3600
    add hl,de
    di
    ld a,13
    out ($99),a
    ld a,$8e
    out ($99),a
    ld a,l
    out ($99),a
    ld a,h
    or $40
    out ($99),a
    pop hl
    ld bc,$0898
    otir
    jp sprite_vram_done

font_output:
    push bc
    push de
    push hl
    push ix
    push af
    call font_active
    jp z,font_output_inactive
    ld c,a
    ld a,(SCRMOD)
    cp 5
    jp nz,font_output_native
    ld a,(RG21SAV)
    and $41                ; V58互換モード、またはフラットインターレースでは標準出力へ戻す。
    jp nz,font_output_native
    ld hl,(PTRFIL)
    ld a,h
    or l
    jp z,font_output_native
    ld de,4
    add hl,de
    ld a,(hl)
    cp $fc                 ; CRT:/LPT:/ディスクファイルではなく、組み込みのGRP:デバイス。
    jp nz,font_output_native
    ld a,c
    cp 3
    jr nz,font_output_regular
    pop af
    call kanji_decode
    jp nc,font_output_pass
    jr z,font_output_skip
    jr font_output_draw_code
font_output_regular:
    pop af
    ld b,a
    ld a,(GRPHED)
    or a
    ld a,b
    jr z,font_output_code
    xor a
    ld (GRPHED),a
    ld a,b
    sub 64
    cp 32
    jr c,font_output_draw
    ld a,b
font_output_code:
    cp 32
    jr c,font_output_pass
font_output_draw:
    ld e,a
    ld d,0
font_output_draw_code:
    ; 確保前にフレーム256バイトと呼び出し・割り込み余裕256バイトを検査する。
font_stack_check:
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
font_frame_allocate:
    ld hl,-256
    add hl,sp
    ld sp,hl
    push hl
    pop ix
    push de
    ld d,h
    ld e,l
    inc de
    ld (hl),0
    ld bc,255
    ldir
    pop de
    ld (ix+TEMP),e
    ld (ix+TEMP+1),d
    call font_active
    cp 3
    jr z,font_output_kanji
    call font_draw
    jr font_output_free
font_output_kanji:
    call kanji_draw
font_output_free:
    ld hl,256
    add hl,sp
    ld sp,hl
font_output_skip:
    scf
    jr font_output_return
font_output_native:
    ld a,c
    cp 3
    call z,kanji_reset
font_output_inactive:
    pop af
font_output_pass:
    or a
font_output_return:
    pop ix
    pop hl
    pop de
    pop bc
    ret

font_draw:
    ld hl,(GRPACX)
    ld a,h
    or a
    jp nz,font_advance
    ld (CLOC),hl
    ld (ix+4),l
    ld hl,(GRPACY)
    ld a,h
    or a
    jp nz,font_advance
    ld a,l
    cp 212
    jp nc,font_advance
    ld (CMASK),a
    ld (ix+6),a
    ld a,212
    sub l
    cp 8
    jr c,font_draw_height
    ld a,8
font_draw_height:
    ld (ix+10),a
    ld a,(ACPAGE)
    and 7
    ld (ix+7),a
    ld l,(ix+TEMP)
    ld h,0
    add hl,hl
    add hl,hl
    add hl,hl
    ld de,$7600
    add hl,de
    ld (ix+0),l
    ld (ix+1),h
    ld (ix+2),3
    ld (ix+8),1            ; LFMMのNXはピクセル数ではなく、幅8ピクセルの文字数。
    ld a,(FORCLR)
    and 15
    ld (ix+12),a
    ld a,(LOGOPR)
    and 15
    or $10
    ld (ix+14),a
    call wait_vdp
    ld a,(BAKCLR)
    and 15
    ld c,12
    call write_reg
    call submit_command
    call wait_vdp
    ld a,(RG12SAV)
    ld c,12
    call write_reg
font_advance:
    ld hl,(GRPACX)
    ld de,8
    add hl,de
    ld a,h
    or a
    jr z,font_advance_x
    ld hl,(GRPACY)
    add hl,de
    ld (GRPACY),hl
    ld hl,0
font_advance_x:
    ld (GRPACX),hl
    ret

check_font_destination:
    call reserved_drawing_page
    ret nz
    call font_active
    ret z
    ld a,(ix+DY1H)
    or a
    jr nz,font_destination_high
    ld a,(ix+DY1)
    cp 252
    jr nc,font_destination_high
    ld a,(ix+DY2)
    cp FONT_TOP
    jp nc,illegal
    ld a,(ix+DY2H)
    or a
    jp nz,illegal
    ld a,(ix+DY1)
    cp FONT_TOP
    jp nc,illegal
    ret
font_destination_high:
    ld a,(ix+DY2H)
    or a
    ret nz
    ld a,(ix+DY2)
    cp 252
    ret nc
    jp illegal
